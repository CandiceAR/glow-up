/* ============================================================
   lib/webPrice.js — Relevé AUTOMATIQUE du prix d'un produit du catalogue (« Prix relevé le … chez … »).
   Même principe que lib/webCompo.js : l'IA cherche, mais rien n'est cru sur parole.
   Le prix n'est retenu que si, sur la page citée (retéléchargée par NOTRE serveur) :
     • le titre correspond bien au produit (marque + nom, sans variante en trop) ;
     • la contenance du catalogue (« 30 ml ») figure sur la page : le prix est celui de CETTE taille ;
     • le prix annoncé y est écrit tel quel (« 5,79 € », « €5.79 » ou prix de la fiche de la page) ;
     • il reste plausible face au prix du catalogue (ni 5 fois plus, ni 5 fois moins).
   Sinon : aucun prix (le produit reste une « autre option », jamais un dupe).
   Résultats gardés dans Firestore (productPrices) : 7 jours si trouvé, 3 jours si introuvable → peu d'appels payants.

   findPrice(product, { anthropic, fetchPage }) → { price, url, host, source, date } | null.  Ne lève jamais d'erreur.
   ============================================================ */
'use strict';

const WebCompo = require('./webCompo.js');
const { safeUrl, titleMatches, pageTitle, pageH1, defaultFetchPage, norm, BLOCKED } = WebCompo;

const MODEL = 'claude-haiku-4-5-20251001';
const OK_DAYS = 7, NONE_DAYS = 3;

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const euro = n => String(Number(n).toFixed(2)).replace('.', ',') + ' €';

// « www.sephora.fr » → « Sephora »
function hostLabel(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const first = h.split('.')[0];
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : h;
  } catch (e) { return ''; }
}

// Expressions qui reconnaissent le prix écrit sur la page (texte visible ou données de la fiche)
function priceRegexes(price, flags) {
  const [int, dec] = Number(price).toFixed(2).split('.');
  const decPart = dec === '00' ? '(?:[.,]00)?' : '[.,]' + dec;
  const cur = '(?:€|&euro;|&#8364;|&#x20ac;|eur\\b)';
  return [
    new RegExp('(?<![\\d.,])' + int + decPart + '\\s*' + cur, flags),
    new RegExp(cur + '\\s*' + int + decPart + '(?![\\d])', flags),
    new RegExp('"price"\\s*:\\s*"?' + int + (dec === '00' ? '(?:\\.00)?' : '\\.' + dec) + '"?(?![\\d])', flags),
    new RegExp('price[^>]{0,80}content="' + int + (dec === '00' ? '(?:\\.00)?' : '\\.' + dec) + '"', flags)
  ];
}
// Le prix est-il écrit sur la page ?
function priceOnPage(html, price) {
  return priceRegexes(price, 'i').some(r => r.test(String(html || '')));
}
// Contenance inconnue : le prix et la contenance doivent être écrits TOUT PRÈS l'un de l'autre sur la page
// (sinon le prix pourrait être celui d'un autre format du même produit).
function sizeNearPrice(html, price, size, maxGap) {
  const h = String(html || ''); maxGap = maxGap || 600;
  const sz = new RegExp('(?<![0-9])' + size.value + ' ?' + (size.unit === 'g' ? 'g' : 'ml') + '(?![a-z])', 'gi');
  const at = [];
  let m; while ((m = sz.exec(h))) at.push(m.index);
  if (!at.length) return false;
  return priceRegexes(price, 'gi').some(re => {
    let x; re.lastIndex = 0;
    while ((x = re.exec(h))) { if (at.some(i => Math.abs(i - x.index) <= maxGap)) return true; if (x.index === re.lastIndex) re.lastIndex++; }
    return false;
  });
}

// La contenance du catalogue est-elle écrite sur la page ? (« 30 ml », « 30ml », « 50 g »)
function amountOnPage(html, product) {
  const text = norm(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '));
  const v = Number(product.volumeMl), w = Number(product.netWeightG);
  if (v > 0) return new RegExp('(?<![0-9])' + v + ' ?ml(?![a-z])').test(text);
  if (w > 0) return new RegExp('(?<![0-9])' + w + ' ?g(?![a-z])').test(text);
  return false;
}

function parseJson(text) {
  const t = String(text || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

async function findPrice(product, deps) {
  deps = deps || {};
  if (!deps.anthropic || !product) return null;
  const brand = String(product.brand || '').trim(), name = String(product.name || '').trim();
  const amount = Number(product.volumeMl) > 0 ? product.volumeMl + ' ml' : (Number(product.netWeightG) > 0 ? product.netWeightG + ' g' : '');
  const wantSize = !amount;      // contenance inconnue du catalogue : on la lit sur la page, avec le prix
  if ((brand + name).length < 3) return null;
  try {
    const label = `« ${name}${norm(name).indexOf(norm(brand)) === 0 ? '' : ' ' + brand} »`;
    const ask = wantSize
      ? `Trouve le format le plus courant (en ml ou en g) et son prix actuel, en euros, du produit ${label}, sur un site de vente en ligne en France (Sephora, Nocibé, Marionnaud, Lookfantastic, Atida, pharmacie en ligne, site officiel de la marque…).
RÈGLES IMPÉRATIVES :
- Le prix doit être celui du format indiqué dans "size", pas d'un autre format, pas d'un coffret, pas d'un prix barré.`
      : `Trouve le prix actuel, en euros, du produit ${label} en format ${amount}, sur un site de vente en ligne en France (Sephora, Nocibé, Marionnaud, Lookfantastic, Atida, pharmacie en ligne, site officiel de la marque…).
RÈGLES IMPÉRATIVES :
- Le prix doit être celui du format ${amount} exactement, pas d'un autre format, pas d'un coffret, pas d'un prix barré.`;
    const resp = await deps.anthropic('priceWeb', {
      model: MODEL, max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2, blocked_domains: BLOCKED }],
      messages: [{ role: 'user', content: ask + `
- Ne donne jamais un prix de mémoire : seulement celui que tu as lu sur la page.
- "pageUrl" est l'adresse exacte de la page où tu as lu ce prix.
Réponds UNIQUEMENT avec ce JSON : { "found": true|false, "price": 12.9, ${wantSize ? '"size": { "value": 30, "unit": "ml" }, ' : ''}"pageUrl": "https://…", "pageTitle": "titre de la page" }` }]
    });
    if (!resp || !resp.ok) return null;
    const data = await resp.json();
    const blocks = Array.isArray(data && data.content) ? data.content : [];
    const text = blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
    const seen = new Set();
    blocks.filter(b => b && b.type === 'web_search_tool_result' && Array.isArray(b.content)).forEach(b => b.content.forEach(c => { if (c && c.url) seen.add(c.url); }));
    const j = parseJson(text);
    if (!j || j.found !== true) return null;
    const price = Number(j.price), url = safeUrl(j.pageUrl);
    if (!(price >= 0.5 && price <= 500) || !url || (seen.size && !seen.has(j.pageUrl))) return null;
    // plausible face au prix connu du catalogue (une erreur de lecture, un autre format…)
    const known = Number(product.price);
    if (known > 0 && (price > known * 5 || price < known / 5)) return null;
    const html = await (deps.fetchPage || defaultFetchPage)(url);
    if (!html) return null;
    if (!titleMatches(brand, name, pageTitle(html) + ' ' + pageH1(html))) return null;
    if (!priceOnPage(html, price)) return null;
    const out = { price: Math.round(price * 100) / 100, url, host: hostLabel(url), source: 'web', date: today() };
    if (!wantSize) return amountOnPage(html, product) ? out : null;
    // contenance lue sur la page : valeur plausible, écrite sur la page, et collée au prix
    const sv = Number(j.size && j.size.value), su = j.size && (j.size.unit === 'g' || j.size.unit === 'ml') ? j.size.unit : '';
    if (!su || !(sv >= 3 && sv <= 1000) || sv !== Math.round(sv * 10) / 10) return null;
    if (!sizeNearPrice(html, price, { value: sv, unit: su })) return null;
    return Object.assign(out, { volumeFrom: 'page du revendeur' }, su === 'ml' ? { volumeMl: sv } : { netWeightG: sv });
  } catch (e) { return null; }
}

// ── Mémoire (Firestore : collection productPrices, fermée aux visiteurs) ──
const getDb = () => require('./fb.js').getDb();
async function cacheGet(id) {
  const db = getDb(); if (!db || !id) return undefined;
  try {
    const d = await db.collection('productPrices').doc(String(id)).get();
    if (!d.exists) return undefined;
    const v = d.data();
    const age = Date.now() - Date.parse(v.fetchedAt || 0);
    if (v.none) return age < NONE_DAYS * 86400000 ? null : undefined;       // null = « déjà cherché, introuvable »
    if (age > OK_DAYS * 86400000 || !(v.price > 0) || !v.url) return undefined;
    return { price: v.price, url: v.url, host: v.host || '', source: 'web', date: v.date || '', volumeMl: v.volumeMl || null, netWeightG: v.netWeightG || null, volumeFrom: v.volumeFrom || '' };
  } catch (e) { return undefined; }
}
async function cacheSet(product, r) {
  const db = getDb(); if (!db || !product || !product.id) return;
  try {
    await db.collection('productPrices').doc(String(product.id)).set(r
      ? { price: r.price, url: r.url, host: r.host, date: r.date, volumeMl: r.volumeMl || product.volumeMl || null, netWeightG: r.netWeightG || product.netWeightG || null,
          volumeFrom: r.volumeFrom || '', fetchedAt: new Date().toISOString() }
      : { none: true, fetchedAt: new Date().toISOString() });
  } catch (e) { /* la mémoire est un confort */ }
}

module.exports = { findPrice, cacheGet, cacheSet, priceOnPage, sizeNearPrice, amountOnPage, hostLabel, euro };
