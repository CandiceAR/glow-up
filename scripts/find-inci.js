/* ============================================================
   scripts/find-inci.js — PHASE 2 : cherche la composition (INCI) des produits du catalogue qui n'en ont pas.
   Sources, dans l'ordre : 1) Open Beauty Facts  2) INCIDecoder.
   N'INVENTE RIEN et NE FUSIONNE RIEN : le résultat est écrit dans un fichier à part
   (data/inci-candidates.json) que Candice valide avant toute fusion dans products-manual.json.

   Pour chaque produit trouvé : liste INCI telle que publiée, adresse de la page source, date, titre du produit
   trouvé, score de correspondance du nom et niveau de confiance :
     - élevée  : score ≥ 0,85, marque identique, mêmes pourcentages d'actif dans les noms
     - moyenne : score ≥ 0,70, marque identique, mêmes pourcentages
     - faible  : en dessous (ou pourcentages différents) → listé à part, NON compté comme « trouvé »

   Usage : node scripts/find-inci.js [--limit N] [--ids id1,id2]
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'inci-candidates.json');
const UA = 'Mozilla/5.0 (compatible; GlowUpCatalogBot/1.0; +https://www.glowupskin.app/contact/)';
const TODAY = new Date().toISOString().slice(0, 10);
const ZW = /[​-‏‪-‮⁠﻿­]/g;

const args = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LIMIT = parseInt(argVal('--limit') || '0', 10) || 0;
const IDS = (argVal('--ids') || '').split(',').filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      return { code: r.status, body: await r.text() };
    } catch (e) { await sleep(1000 * (i + 1)); }
  }
  return { code: 0, body: '' };
}

const dec = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#x2F;/g, '/').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d)\s*%/g, '$1% ').replace(/&/g, ' and ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const NOISE = new Set(['the', 'de', 'la', 'le', 'les', 'du', 'des', 'et', 'and', 'pour', 'for', 'ml', 'g', 'gr', 'oz', 'fl', 'new', 'nouveau', 'with', 'avec', 'a', 'au', 'aux', 'en']);
// Mots génériques français du catalogue -> équivalent anglais des fiches INCIDecoder / Open Beauty Facts
const FR2EN = { creme: 'cream', serum: 'serum', tonique: 'toner', masque: 'mask', nuit: 'night', jour: 'day', yeux: 'eye', contour: 'eye', solaire: 'sunscreen',
  baume: 'balm', levres: 'lip', hydratant: 'moisturizing', hydratante: 'moisturizing', legere: 'light', eclaircissant: 'brightening', eclaircissante: 'brightening',
  nettoyant: 'cleanser', nettoyante: 'cleanser', mousse: 'foam', huile: 'oil', lait: 'milk', eau: 'water', micellaire: 'micellar', apaisant: 'soothing', apaisante: 'soothing',
  fluide: 'fluid', visage: 'face', anti: 'anti', rides: 'wrinkle', poches: 'puffiness', cernes: 'dark circles', rougeurs: 'redness', imperfections: 'blemish',
  eclat: 'glow', fermete: 'firming', reparatrice: 'repair', exfoliant: 'exfoliant', gommage: 'scrub', brume: 'mist', essence: 'essence', ampoule: 'ampoule' };
const tokens = s => norm(s).split(' ').flatMap(t => (FR2EN[t] || t).split(' '))
  .filter(t => t && !NOISE.has(t) && !/^\d+(ml|g|gr|oz|l)$/.test(t) && (!/^\d+$/.test(t) || false) || /%$/.test(t));
const pcts = s => [...new Set((norm(s).match(/\d+(?:\s?\d+)?%/g) || []))].sort().join(',');

function dice(a, b) {
  const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0;
  let i = 0; A.forEach(x => { if (B.has(x)) i++; });
  return 2 * i / (A.size + B.size);
}
function brandOk(brand, candTokens) {
  const bt = tokens(brand); if (!bt.length) return true;
  const C = new Set(candTokens); let hit = 0; bt.forEach(t => { if (C.has(t)) hit++; });
  return hit / bt.length >= 0.6;
}
function grade(p, candTitle) {
  const q = tokens(p.brand + ' ' + p.name), c = tokens(candTitle);
  const score = Math.round(dice(q, c) * 100) / 100;
  const pctSame = pcts(p.name) === pcts(candTitle);
  const brand = brandOk(p.brand, c);
  let confidence = 'faible';
  if (brand && pctSame && score >= 0.85) confidence = 'élevée';
  else if (brand && pctSame && score >= 0.70) confidence = 'moyenne';
  return { score, confidence, brandMatch: brand, percentMatch: pctSame };
}

// Découpe « a, b (c, d), e » sans casser les parenthèses
function splitInci(text) {
  let t = String(text || '').replace(ZW, '').replace(/^\s*(ingr[ée]dients?|ingredients?|inci)\s*:?\s*/i, '').replace(/\.\s*$/, '');
  const out = []; let depth = 0, cur = '';
  for (const ch of t) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '•' || ch === ';' || ch === '\n') && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(x => x.replace(/\s{2,}/g, ' ')).filter(x => x.length > 1 && x.length < 90);
}

// ── Source 1 : Open Beauty Facts ─────────────────────────────
async function fromOBF(p) {
  const q = (p.brand + ' ' + p.name).replace(/\b\d+\s?(ml|g)\b/gi, '').trim();
  const url = 'https://world.openbeautyfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=8&fields=code,product_name,brands,ingredients_text,ingredients_text_fr';
  const r = await get(url);
  let j; try { j = JSON.parse(r.body); } catch (e) { return null; }
  let best = null;
  for (const c of (j.products || [])) {
    const text = ((c.ingredients_text_fr || '').trim() || (c.ingredients_text || '').trim());
    if (!text) continue;
    const list = splitInci(text); if (list.length < 5) continue;
    const title = ((c.brands || '') + ' ' + (c.product_name || '')).trim();
    const g = grade(p, title);
    if (!best || g.score > best.score) best = { ...g, type: 'openbeautyfacts', url: 'https://world.openbeautyfacts.org/product/' + c.code, matchedTitle: title, inci: list, inciRaw: text.replace(ZW, '') };
  }
  return best;
}

// ── Source 2 : INCIDecoder ───────────────────────────────────
async function fromIncidecoder(p) {
  const q = (p.brand + ' ' + p.name).replace(/\b\d+\s?(ml|g)\b/gi, '').trim();
  const find = async query => {
    const r = await get('https://incidecoder.com/search?query=' + encodeURIComponent(query));
    return [...new Set([...r.body.matchAll(/href="(\/products\/[a-z0-9-]+)"/g)].map(m => m[1]))].filter(l => !/create/.test(l)).slice(0, 8);
  };
  let links = await find(q);
  const rank = ls => ls.map(l => ({ l, s: dice(tokens(p.brand + ' ' + p.name), tokens(l.replace('/products/', '').replace(/-/g, ' '))) })).sort((a, b) => b.s - a.s).slice(0, 2);
  let ranked = rank(links);
  // 2e essai : mots génériques français traduits (« crème » -> « cream »…)
  if (!ranked.length || ranked[0].s < 0.4) {
    await sleep(250);
    const links2 = await find(tokens(p.brand + ' ' + p.name).join(' '));
    ranked = rank([...new Set([...links, ...links2])]);
  }
  let best = null;
  for (const { l, s } of ranked) {
    if (s < 0.4) continue;
    const pr = await get('https://incidecoder.com' + l);
    const h = pr.body; if (!h) continue;
    const title = dec((/<title>([^<]*)<\/title>/.exec(h) || [])[1] || '').replace(/\s*[-–|]\s*INCIDecoder.*$/i, '').replace(/\s*ingredients\s*\(explained\).*$/i, '').replace(/\s*Ingredients explained.*$/i, '').replace(ZW, '').trim();
    const list = [...h.matchAll(/<a[^>]*class="[^"]*product-long-ingred-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g)]
      .map(m => dec(m[1].replace(/<[^>]+>/g, '')).replace(ZW, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (list.length < 5) continue;
    const g = grade(p, title || l.replace('/products/', '').replace(/-/g, ' '));
    if (!best || g.score > best.score) best = { ...g, type: 'incidecoder', url: 'https://incidecoder.com' + l, matchedTitle: title, inci: list, inciRaw: list.join(', ') };
    await sleep(250);
  }
  return best;
}

const RANK = { 'élevée': 3, 'moyenne': 2, 'faible': 1 };
async function findOne(p) {
  const cands = [];
  const o = await fromOBF(p); if (o) cands.push(o);
  if (!o || RANK[o.confidence] < 2) { await sleep(250); const d = await fromIncidecoder(p); if (d) cands.push(d); }
  cands.sort((a, b) => (RANK[b.confidence] - RANK[a.confidence]) || (b.score - a.score));
  const b = cands[0];
  const base = { id: p.id, brand: p.brand, name: p.name, category: p.category };
  if (!b) return { ...base, status: 'introuvable' };
  const found = RANK[b.confidence] >= 2;
  return { ...base, status: found ? 'trouvé' : 'faible',
    source: { type: b.type, url: b.url, matchedTitle: b.matchedTitle }, matchScore: b.score, confidence: b.confidence,
    brandMatch: b.brandMatch, percentMatch: b.percentMatch, retrievedAt: TODAY, inci: b.inci, inciRaw: b.inciRaw };
}

(async () => {
  const all = require(path.join(ROOT, 'data', 'products-manual.json')).products.filter(p => p.active !== false);
  let todo = all.filter(p => !(p.inciNormalized && p.inciNormalized.length));
  if (IDS.length) todo = todo.filter(p => IDS.includes(p.id));
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`${todo.length} produits sans composition à chercher (sur ${all.length} produits actifs)`);

  const items = []; let done = 0;
  // --resume : reprend un fichier déjà commencé (les produits déjà traités ne sont pas refaits)
  if (args.includes('--resume') && fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || [];
    const seen = new Set(prev.map(i => i.id));
    prev.forEach(i => items.push(i));
    todo = todo.filter(p => !seen.has(p.id));
    console.log(`reprise : ${prev.length} déjà traités, ${todo.length} restants`);
  }
  const totalTodo = todo.length + items.length;
  const save = () => {
    const stats = {};
    items.forEach(i => { stats[i.status] = (stats[i.status] || 0) + 1; });
    const bySrc = {}; items.filter(i => i.status === 'trouvé').forEach(i => { const k = i.source.type + ' / ' + i.confidence; bySrc[k] = (bySrc[k] || 0) + 1; });
    fs.writeFileSync(OUT, JSON.stringify({ _note: 'PHASE 2 — candidats de composition, NON fusionnés dans le catalogue. À valider par Candice.', generatedAt: new Date().toISOString(), searched: totalTodo, processed: items.length, stats, foundBySource: bySrc, items }, null, 1));
  };
  const queue = todo.slice();
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      try { items.push(await findOne(p)); } catch (e) { items.push({ id: p.id, brand: p.brand, name: p.name, category: p.category, status: 'erreur', error: e.message }); }
      done++; if (done % 10 === 0) { save(); console.log(`  ${done}/${todo.length}`); }
      await sleep(300);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  save();
  const st = {}; items.forEach(i => { st[i.status] = (st[i.status] || 0) + 1; });
  console.log('Terminé :', JSON.stringify(st));
})();
