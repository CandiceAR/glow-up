/* ============================================================
   lib/inciLookup.js — Trouve la composition (liste INCI) de N'IMPORTE QUEL produit, sans rien inventer.
   Sources, dans l'ordre (on s'arrête à la première qui est SÛRE) :
     1. Nos propres fiches vérifiées (catalogue + fiches de référence)
     2. Le cache (compositions déjà trouvées, valables 90 jours)
     3. Open Beauty Facts — par code-barres (même produit à coup sûr), puis par nom
     4. INCIDecoder — recherche par nom + lecture de la page produit
   Chaque résultat garde : la page source (URL), la date, le titre du produit trouvé, et un niveau de confiance.
     • 'high'   : code-barres, nos fiches, ou nom identique (marque + pourcentages + titre) → utilisable tel quel
     • 'medium' : nom proche mais pas identique → l'utilisatrice doit CONFIRMER que c'est bien son produit
     • 'none'   : rien de fiable → l'appli demande la photo de la liste d'ingrédients
   L'IA n'intervient jamais ici : uniquement ce que les pages publient.
   Dépend de lib/sameProduct.js. Double usage : fonctions serveur (Vercel) et tests Node.
   ============================================================ */
'use strict';

const SameProduct = require('./sameProduct.js');

const UA = 'Mozilla/5.0 (compatible; GlowUpBot/1.0; +https://www.glowupskin.app/contact/)';
const OBF_UA = 'GlowUp/1.0 (skincare dupe finder; contact@glowupskin.app)';
const CACHE_DAYS = 90;
// espaces et caractères invisibles que certaines pages insèrent dans les noms
const ZW = /[​-‏‪-‮⁠﻿­]/g;

const today = () => new Date().toISOString().slice(0, 10);

async function getText(url, headers, timeoutMs) {
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs || 9000) });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

// ─── Comparaison de noms (même logique que scripts/find-inci.js, validée sur 130 produits) ───
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ').replace(/&#x2F;/g, '/').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d)\s*%/g, '$1% ').replace(/&/g, ' and ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const NOISE = new Set(['the', 'de', 'la', 'le', 'les', 'du', 'des', 'et', 'and', 'pour', 'for', 'ml', 'g', 'gr', 'oz', 'fl', 'new', 'nouveau', 'with', 'avec', 'a', 'au', 'aux', 'en']);
// mots courants du catalogue français → équivalent anglais des fiches INCIDecoder / Open Beauty Facts
const FR2EN = { creme: 'cream', serum: 'serum', tonique: 'toner', masque: 'mask', nuit: 'night', jour: 'day', yeux: 'eye', contour: 'eye', solaire: 'sunscreen',
  baume: 'balm', levres: 'lip', hydratant: 'moisturizing', hydratante: 'moisturizing', legere: 'light', eclaircissant: 'brightening', eclaircissante: 'brightening',
  nettoyant: 'cleanser', nettoyante: 'cleanser', mousse: 'foam', huile: 'oil', lait: 'milk', eau: 'water', micellaire: 'micellar', apaisant: 'soothing', apaisante: 'soothing',
  fluide: 'fluid', visage: 'face', rides: 'wrinkle', poches: 'puffiness', cernes: 'dark circles', rougeurs: 'redness', imperfections: 'blemish',
  eclat: 'glow', fermete: 'firming', reparatrice: 'repair', gommage: 'scrub', brume: 'mist' };
const tokens = s => norm(s).split(' ').flatMap(t => (FR2EN[t] || t).split(' '))
  .filter(t => t && !NOISE.has(t) && !/^\d+(ml|g|gr|oz|l)$/.test(t) && (!/^\d+$/.test(t)) || /%$/.test(t));
const pcts = s => [...new Set((norm(s).match(/\d+(?:\s?\d+)?%/g) || []))].sort().join(',');

function dice(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0; A.forEach(x => { if (B.has(x)) i++; });
  return 2 * i / (A.size + B.size);
}
function brandOk(brand, candTokens) {
  const bt = tokens(brand);
  if (!bt.length) return true;
  const C = new Set(candTokens);
  let hit = 0; bt.forEach(t => { if (C.has(t)) hit++; });
  return hit / bt.length >= 0.6;
}
// Mots qui désignent une VARIANTE d'un produit (une version « baby » n'est pas la version classique).
// S'ils sont d'un seul côté, on ne se fie pas à la correspondance : l'utilisatrice doit confirmer.
const VARIANT = new Set(['baby', 'kids', 'kid', 'junior', 'travel', 'mini', 'tinted', 'teinte', 'night', 'day', 'spf', 'men', 'homme',
  'refill', 'recharge', 'set', 'kit', 'duo', 'trio', 'sample', 'echantillon', 'rich', 'riche', 'light', 'intense', 'intensive',
  'sensitive', 'sensible', 'extra', 'max', 'plus', 'pro']);
// Mots sans importance dans le titre d'une page (année de reformulation, etc.)
const IGNORE_CAND = t => /^(19|20)\d\d$/.test(t) || ['reformulation', 'formula', 'formulation', 'version', 'original', 'classic', 'new'].indexOf(t) >= 0;

// Niveau de confiance d'une correspondance de nom : 'high' (utilisable seul) / 'medium' (à confirmer) / 'low' (rejetée)
function grade(brand, name, candTitle) {
  const q = tokens(brand + ' ' + name), c = tokens(candTitle).filter(t => !IGNORE_CAND(t));
  const score = Math.round(dice(q, c) * 100) / 100;
  const pctSame = pcts(name) === pcts(candTitle);
  const bOk = brandOk(brand, c);
  const Q = new Set(q), C = new Set(c);
  const variantDiff = [...C].some(t => VARIANT.has(t) && !Q.has(t)) || [...Q].some(t => VARIANT.has(t) && !C.has(t));
  let confidence = 'low';
  if (bOk && pctSame && score >= 0.90 && !variantDiff) confidence = 'high';
  else if (bOk && pctSame && score >= 0.70) confidence = 'medium';
  return { score, confidence, variantDiff };
}
// « Marque Nom » sans répéter la marque quand le nom la contient déjà
const fullName = (brand, name) => (norm(name).indexOf(norm(brand)) === 0 ? name : (brand + ' ' + name)).trim();

// Découpe « a, b (c, d), e » sans casser les parenthèses
function splitInci(text) {
  const t = String(text || '').replace(ZW, '').replace(/^\s*(ingr[ée]dients?|ingredients?|inci)\s*:?\s*/i, '').replace(/\.\s*$/, '');
  const out = []; let depth = 0, cur = '';
  for (const ch of t) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '•' || ch === ';' || ch === '\n') && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(x => x.replace(/\s{2,}/g, ' ')).filter(x => x.length > 1 && x.length < 90);
}
// liste « propre » pour le moteur de formule : minuscules, sans pourcentages entre parenthèses
const cleanList = list => list.map(x => x.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim().toLowerCase())
  .filter(x => x.length > 1 && x.length < 60).slice(0, 80);

// Contenance → ml (ml / cl / l). null si non exprimée en volume.
function parseMl(q) {
  const m = String(q || '').toLowerCase().replace(',', '.').match(/([\d.]+)\s*(ml|cl|l)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  return m[2] === 'l' ? Math.round(n * 1000) : m[2] === 'cl' ? Math.round(n * 10) : Math.round(n);
}

const found = (o, extra) => {
  const out = Object.assign({ found: true, source: '', sourceUrl: '', sourceLabel: '', retrievedAt: today(), matchedName: '', barcode: '', quantity: '', volumeMl: null }, o, extra || {});
  if (out.volumeMl == null && o && o.volumeMl != null) out.volumeMl = o.volumeMl;
  return out;
};
const EMPTY = { found: false, inci: '', inciList: [], source: null, sourceUrl: '', sourceLabel: '', retrievedAt: '', confidence: 'none', matchedName: '', barcode: '', quantity: '', volumeMl: null };

// ─── Source 1 : nos propres fiches vérifiées ─────────────────
// Prix vérifié (revendeur + date) d'un produit du catalogue qui correspond au nom demandé, sinon {}
function catalogPrice(q) {
  try {
    const p = (require('../data/products-manual.json').products || []).find(x => x.active !== false && x.priceVerified && x.price > 0 && SameProduct.same(q, x));
    return p ? { refPrice: p.price, refPriceSource: p.priceSource || null, refPriceDate: p.priceRetrievedAt || '', refPriceNote: p.priceNote || '', volumeMl: p.volumeMl || null } : {};
  } catch (e) { return {}; }
}

function fromOwn(brand, name) {
  const q = { brand, name };
  try {
    const refs = require('../data/reference-inci.json').refs || [];
    for (const r of refs) {
      // le nom de la fiche + ses autres noms connus (ex. nouveau nom commercial du même produit)
      const names = r.hero ? [r.hero.name].concat(Array.isArray(r.aliases) ? r.aliases : []) : [];
      if (r.hero && names.some(n => SameProduct.same(q, { brand: r.hero.brand, name: n })) && Array.isArray(r.inci) && r.inci.length >= 5) {
        return found({
          inci: r.inciRaw || r.inci.join(', '), inciList: cleanList(r.inci), confidence: 'high', source: 'glowup',
          sourceUrl: (r.source && r.source.url) || '', sourceLabel: 'fiche vérifiée par Glow Up', retrievedAt: r.retrievedAt || '',
          matchedName: fullName(r.hero.brand, r.hero.name), volumeMl: r.hero.volumeMl || (r.verified && r.verified.volumeMl) || null,
          // prix relevé, avec revendeur et date (lot 1) : seul un prix ainsi sourcé sert de référence sans que la personne le saisisse
          refPrice: (r.verified && r.verified.price) || null, refPriceSource: (r.verified && r.verified.priceSource) || null,
          refPriceDate: (r.verified && r.verified.priceRetrievedAt) || '', refPriceNote: (r.verified && r.verified.priceNote) || ''
        }, r.verified ? {} : catalogPrice(q));
      }
    }
  } catch (e) { /* fichier absent : on passe à la suite */ }
  try {
    const prods = require('../data/products-manual.json').products || [];
    for (const p of prods) {
      if (p.active === false || !Array.isArray(p.inciNormalized) || p.inciNormalized.length < 5) continue;
      if (p.inciVerificationStatus && p.inciVerificationStatus !== 'verified') continue;
      if (SameProduct.same(q, p)) {
        return found({
          inci: p.inciRaw || p.inciNormalized.join(', '), inciList: cleanList(p.inciNormalized), confidence: 'high', source: 'glowup',
          sourceUrl: p.inciSourceUrl || '', sourceLabel: 'fiche vérifiée par Glow Up', retrievedAt: p.inciLastVerifiedAt || '',
          matchedName: fullName(p.brand, p.name), volumeMl: p.volumeMl || null,
          refPrice: (p.priceVerified && p.price > 0) ? p.price : null, refPriceSource: p.priceVerified ? (p.priceSource || null) : null,
          refPriceDate: p.priceVerified ? (p.priceRetrievedAt || '') : '', refPriceNote: p.priceVerified ? (p.priceNote || '') : ''
        });
      }
    }
  } catch (e) { /* idem */ }
  return null;
}

// ─── Source 3 : Open Beauty Facts ────────────────────────────
const OBF_FIELDS = 'code,product_name,brands,ingredients_text,ingredients_text_fr,quantity';
const obfText = p => (p.ingredients_text_fr && p.ingredients_text_fr.trim()) || (p.ingredients_text && p.ingredients_text.trim()) || '';

async function fromObfBarcode(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (code.length < 8) return null;
  const txt = await getText(`https://world.openbeautyfacts.org/api/v2/product/${code}.json?fields=${OBF_FIELDS}`, { 'User-Agent': OBF_UA });
  let p; try { p = JSON.parse(txt).product; } catch (e) { return null; }
  const text = p ? obfText(p) : '';
  const list = splitInci(text);
  if (list.length < 3) return null;
  return found({
    inci: text.replace(ZW, ''), inciList: cleanList(list), confidence: 'high', source: 'openbeautyfacts',
    sourceUrl: 'https://world.openbeautyfacts.org/product/' + code, sourceLabel: 'Open Beauty Facts',
    matchedName: p.product_name || '', barcode: code, quantity: p.quantity || '', volumeMl: parseMl(p.quantity)
  });
}

async function fromObfName(brand, name) {
  const q = (brand + ' ' + name).replace(/\b\d+\s?(ml|g)\b/gi, '').trim();
  if (q.length < 3) return null;
  const txt = await getText(`https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=${OBF_FIELDS}`, { 'User-Agent': OBF_UA });
  let j; try { j = JSON.parse(txt); } catch (e) { return null; }
  let best = null;
  for (const c of (j.products || [])) {
    const text = obfText(c), list = splitInci(text);
    if (list.length < 5) continue;
    const title = ((c.brands || '') + ' ' + (c.product_name || '')).trim();
    const g = grade(brand, name, title);
    if (g.confidence === 'low') continue;
    if (!best || g.score > best.score) best = Object.assign({ g, score: g.score }, { c, text, list, title });
  }
  if (!best) return null;
  return found({
    inci: best.text.replace(ZW, ''), inciList: cleanList(best.list), confidence: best.g.confidence, source: 'openbeautyfacts',
    sourceUrl: 'https://world.openbeautyfacts.org/product/' + best.c.code, sourceLabel: 'Open Beauty Facts',
    matchedName: best.title, barcode: best.c.code || '', quantity: best.c.quantity || '', volumeMl: parseMl(best.c.quantity)
  });
}

// ─── Source 4 : INCIDecoder ──────────────────────────────────
async function incidecoderSlugs(query) {
  const html = await getText('https://incidecoder.com/search?query=' + encodeURIComponent(query), { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8' });
  if (!html) return [];
  return [...new Set([...html.matchAll(/href="(\/products\/[a-z0-9-]+)"/g)].map(m => m[1]))].filter(l => !/create/.test(l)).slice(0, 8);
}

async function fromIncidecoder(brand, name) {
  const base = (brand + ' ' + name).replace(/\b\d+\s?(ml|g)\b/gi, '').trim();
  if (base.length < 3) return null;
  const tk = tokens(base), bt = tokens(brand);
  const nameOnly = [...new Set(tokens(name).filter(t => !bt.includes(t)))].sort((a, b) => b.length - a.length).slice(0, 2);
  const queries = [...new Set([base, (brand + ' ' + nameOnly.join(' ')).trim()].filter(x => x && x.length > 3))];
  const lists = await Promise.all(queries.map(incidecoderSlugs));
  const slugs = [...new Set(lists.flat())];
  const ranked = slugs.map(l => ({ l, s: dice(tk, tokens(l.replace('/products/', '').replace(/-/g, ' '))) }))
    .sort((a, b) => b.s - a.s).filter(x => x.s >= 0.35).slice(0, 2);
  const pages = await Promise.all(ranked.map(async ({ l }) => {
    const h = await getText('https://incidecoder.com' + l, { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8' });
    return h ? { l, h } : null;
  }));
  let best = null;
  for (const pg of pages) {
    if (!pg) continue;
    const title = dec((/<title>([^<]*)<\/title>/.exec(pg.h) || [])[1] || '').replace(/\s*[-–|]\s*INCIDecoder.*$/i, '')
      .replace(/\s*ingredients\s*\(explained\).*$/i, '').replace(ZW, '').trim();
    const list = [...pg.h.matchAll(/<a[^>]*class="[^"]*product-long-ingred-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g)]
      .map(m => dec(m[1].replace(/<[^>]+>/g, '')).replace(ZW, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (list.length < 5) continue;
    const g = grade(brand, name, title);
    if (g.confidence === 'low') continue;
    if (!best || g.score > best.g.score) best = { g, l: pg.l, title, list };
  }
  if (!best) return null;
  return found({
    inci: best.list.join(', '), inciList: cleanList(best.list), confidence: best.g.confidence, source: 'incidecoder',
    sourceUrl: 'https://incidecoder.com' + best.l, sourceLabel: 'INKEEDecoder (ex-INCIDecoder)', matchedName: best.title
  });
}

// ─── Cache Firestore (90 jours) — facultatif : sans clé serveur, on s'en passe ───
const getDb = () => require('./fb.js').getDb();
const cacheKey = (brand, name) => (norm(brand) + '__' + norm(name)).replace(/[^a-z0-9_%]+/g, '-').slice(0, 140);

async function cacheGet(brand, name) {
  const db = getDb(); if (!db) return null;
  try {
    const d = await db.collection('productCompositions').doc(cacheKey(brand, name)).get();
    if (!d.exists) return null;
    const v = d.data();
    if (!v.fetchedAt || Date.now() - Date.parse(v.fetchedAt) > CACHE_DAYS * 86400000) return null;
    if (!Array.isArray(v.inciList) || v.inciList.length < 5) return null;
    return found(Object.assign({}, v.result, { cached: true }));
  } catch (e) { return null; }
}
async function cacheSet(brand, name, result) {
  const db = getDb(); if (!db) return;
  try {
    await db.collection('productCompositions').doc(cacheKey(brand, name)).set({
      brand: String(brand || '').slice(0, 80), name: String(name || '').slice(0, 120),     // jamais de données personnelles
      inciList: result.inciList, fetchedAt: new Date().toISOString(), result
    });
  } catch (e) { /* le cache est un confort */ }
}

// ─── La recherche complète ───────────────────────────────────
// { barcode?, brand?, name? } → résultat (voir en-tête). Ne lève jamais d'erreur.
// opts.gate() : fonction asynchrone appelée juste avant d'aller sur le web (pas pour nos fiches ni le cache) ;
//               si elle répond false (limite du compte atteinte), on s'arrête et on renvoie { limited: true }.
// opts.useIncidecoder : false → INCIDecoder n'est pas interrogé (réglage config/limits.incidecoder).
// Ordre : nos fiches → cache → Open Beauty Facts (code-barres, puis nom) → INCIDecoder en dernier recours.
async function lookup(input, opts) {
  opts = opts || {};
  const brand = String((input && input.brand) || '').trim().slice(0, 80);
  const name = String((input && input.name) || '').trim().slice(0, 120);
  const barcode = (input && input.barcode) || '';
  try {
    const own = (brand || name) ? fromOwn(brand, name) : null;
    if (own) return own;

    const hasName = (brand + name).length >= 3;
    const cached = hasName ? await cacheGet(brand, name) : null;
    if (cached) return cached;

    // à partir d'ici on interroge des sites externes : limite par compte
    if (opts.gate && !(await opts.gate())) return Object.assign({}, EMPTY, { limited: true });

    const bar = await fromObfBarcode(barcode);
    if (bar) return bar;
    if (!hasName) return Object.assign({}, EMPTY);

    // Open Beauty Facts d'abord (base ouverte, licence ODbL). INCIDecoder seulement si OBF n'a rien de sûr.
    const obf = await fromObfName(brand, name);
    if (obf && obf.confidence === 'high') { cacheSet(brand, name, obf); return obf; }
    const inc = opts.useIncidecoder === false ? null : await fromIncidecoder(brand, name);
    const rank = r => (r ? (r.confidence === 'high' ? 2 : 1) : 0);
    const best = rank(inc) > rank(obf) ? inc : (obf || inc);
    if (!best) return Object.assign({}, EMPTY);
    cacheSet(brand, name, best);
    return best;
  } catch (e) {
    return Object.assign({}, EMPTY);
  }
}

// Produit introuvable : on le garde de côté pour l'enrichir plus tard (aucune donnée personnelle : ni compte, ni IP)
async function queueProduct(brand, name, category, barcode, reason) {
  const db = getDb(), FV = (require('./fb.js')).getFV();
  brand = String(brand || '').trim().slice(0, 80); name = String(name || '').trim().slice(0, 120);
  if (!db || !FV || (brand + name).length < 3) return false;
  try {
    const ref = db.collection('productQueue').doc(cacheKey(brand, name));
    const now = new Date().toISOString();
    await db.runTransaction(async t => {
      const d = await t.get(ref);
      const base = { brand, name, category: String(category || '').slice(0, 30), barcode: String(barcode || '').replace(/\D/g, '').slice(0, 14),
        reason: String(reason || '').slice(0, 30), lastSeen: now, count: FV.increment(1) };
      if (!d.exists) { base.firstSeen = now; base.status = 'pending'; }
      t.set(ref, base, { merge: true });
    });
    return true;
  } catch (e) { return false; }
}

module.exports = { lookup, queueProduct, grade, tokens, splitInci, cleanList, parseMl, EMPTY, _internal: { fromOwn, cacheKey, norm } };
