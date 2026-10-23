/* ============================================================
   lib/webCompo.js — Niveaux 2 et 3 de « Trouver son dupe » : l'utilisatrice n'a RIEN à faire.

   Niveau 2 : l'IA (Claude + recherche web) cherche la liste d'ingrédients du produit sur le site de la marque
              ou d'un revendeur. Rien n'est cru sur parole : on RETÉLÉCHARGE la page citée et on vérifie que
              les ingrédients y figurent vraiment, et que le titre de la page correspond au produit.
              Résultat : confiance « medium » (l'utilisatrice confirme que c'est bien son produit, un seul appui).
   Niveau 3 : si aucune page n'a pu être vérifiée, l'IA donne seulement l'ACTIF PRINCIPAL PROBABLE (une des familles
              de lib/mainActive.js, ou « aucun actif héros »). Jamais de composition inventée : l'écran dit « probable ».

   find(brand, name, { anthropic, fetchPage }) → { compo: {…} | null, estimate: { family, label } | null }
   Ne lève jamais d'erreur. incidecoder.com / inkeedecoder.com sont exclus des recherches (permission en attente).
   ============================================================ */
'use strict';

const MainActive = require('./mainActive.js');
const { tokens, VARIANT, cleanList } = require('./inciLookup.js');

const MODEL = 'claude-haiku-4-5-20251001';
const UA = 'Mozilla/5.0 (compatible; GlowUpBot/1.0; +https://www.glowupskin.app/contact/)';
const BLOCKED = ['incidecoder.com', 'inkeedecoder.com', 'amazon.fr', 'amazon.com', 'pinterest.com', 'youtube.com', 'reddit.com'];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Adresse publique en https uniquement (jamais d'adresse interne : la page est téléchargée par NOTRE serveur)
function safeUrl(u) {
  try {
    const x = new URL(String(u));
    if (x.protocol !== 'https:') return null;
    const h = x.hostname.toLowerCase();
    if (!h.includes('.') || /^\d+(\.\d+){3}$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal|lan)$/.test(h)) return null;
    if (BLOCKED.some(b => h === b || h.endsWith('.' + b))) return null;
    return x.toString();
  } catch (e) { return null; }
}

async function defaultFetchPage(url) {
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8' }, redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const txt = await r.text();
    return txt.length > 3000000 ? txt.slice(0, 3000000) : txt;
  } catch (e) { return null; }
}

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const pageText = html => norm(decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));
const pageTitle = html => decode(((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '')).replace(/\s+/g, ' ').trim();

const pageH1 = html => decode(((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Le titre de la page (souvent « Produit - Marque | Revendeur ») parle-t-il bien de CE produit ?
// Au moins 75 % des mots « marque + nom » doivent y figurer, et aucune VARIANTE (baby, nuit, mini…) ne doit y apparaître en plus.
function titleMatches(brand, name, title) {
  const q = tokens(brand + ' ' + name), c = new Set(tokens(title));
  if (!q.length || !c.size) return false;
  const hit = q.filter(t => c.has(t)).length;
  if (hit / q.length < 0.75) return false;
  const Q = new Set(q);
  return ![...c].some(t => VARIANT.has(t) && !Q.has(t));
}

// Les ingrédients annoncés par l'IA figurent-ils vraiment sur la page ? (au moins 80 % des 10 premiers, dans le texte)
function ingredientsOnPage(html, ingredients) {
  const text = ' ' + pageText(html) + ' ';
  const first = ingredients.slice(0, 10).map(x => norm(x.replace(/\([^)]*\)/g, ' '))).filter(x => x.length > 2);
  if (first.length < 5) return false;
  const hit = first.filter(x => text.indexOf(' ' + x + ' ') >= 0).length;
  return hit / first.length >= 0.8;
}

function parseJson(text) {
  const t = String(text || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

function familyList() {
  return MainActive.FAMILIES.map(f => `${f} = ${MainActive.label(f)}`).join(' ; ');
}

function buildPrompt(brand, name) {
  return `Produit de soin du visage ou du corps : « ${brand} ${name} ».

1) Cherche sur le web la liste d'ingrédients (INCI) de CE produit exact, sur le site de la marque ou d'un revendeur sérieux (Sephora, Nocibé, Marionnaud, Lookfantastic, Boots, Ulta, Cult Beauty, Doctipharma, Pharmacie en ligne…). Recopie la liste MOT POUR MOT, dans l'ordre de la page.
2) Donne aussi l'actif principal probable du produit, UNIQUEMENT parmi ces familles : ${familyList()}. Mets null si le produit n'a pas d'actif vedette clair (crème de base, huile, nettoyant simple…).

RÈGLES IMPÉRATIVES :
- N'écris jamais une composition de mémoire : si tu ne l'as pas lue sur une page, "found": false.
- La page doit concerner exactement ce produit (même nom, même gamme), pas une autre version (baby, nuit, mini…).
- "pageUrl" est l'adresse exacte de la page où tu as lu la liste.

Réponds UNIQUEMENT avec ce JSON :
{ "found": true|false, "pageUrl": "https://…", "pageTitle": "titre de la page", "ingredients": ["Aqua", "Glycerin", …], "mainFamily": "famille ou null" }`;
}

// Repli sans recherche web (service indisponible ou réponse illisible) : seulement l'actif principal probable, d'après le nom du produit
async function estimateOnly(brand, name, deps, out) {
  try {
    const resp = await deps.anthropic('inciWeb', {
      model: MODEL, max_tokens: 200,
      messages: [{ role: 'user', content: `Produit de soin : « ${brand} ${name} ».
Quel est son actif principal probable, UNIQUEMENT parmi ces familles : ${familyList()} ? Mets null si le produit n'a pas d'actif vedette clair (crème de base, huile, nettoyant simple…) ou si tu ne connais pas ce produit.
Réponds UNIQUEMENT avec ce JSON : { "mainFamily": "famille ou null" }` }]
    });
    if (!resp || !resp.ok) return out;
    const data = await resp.json();
    const text = (Array.isArray(data && data.content) ? data.content : []).filter(b => b && typeof b.text === 'string').map(b => b.text).join('\n');
    const j = parseJson(text);
    if (!j) return out;
    const fam = typeof j.mainFamily === 'string' && MainActive.FAMILIES.indexOf(j.mainFamily) >= 0 ? j.mainFamily : null;
    out.estimate = { family: fam, label: fam ? MainActive.label(fam) : '' };
  } catch (e) { /* pas d'estimation */ }
  return out;
}

async function find(brand, name, deps) {
  deps = deps || {};
  const out = { compo: null, estimate: null };
  brand = String(brand || '').trim(); name = String(name || '').trim();
  if (!deps.anthropic || (brand + name).length < 3) return out;
  try {
    const resp = await deps.anthropic('inciWeb', {
      model: MODEL, max_tokens: 2500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, blocked_domains: BLOCKED }],
      messages: [{ role: 'user', content: buildPrompt(brand, name) }]
    });
    if (!resp || !resp.ok) return resp && resp.capReached ? out : await estimateOnly(brand, name, deps, out);   // recherche web indisponible : on garde au moins l'actif probable
    const data = await resp.json();
    const blocks = Array.isArray(data && data.content) ? data.content : [];
    const text = blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
    // adresses réellement renvoyées par la recherche : l'IA ne peut pas citer une adresse sortie de nulle part
    const seen = new Set();
    blocks.filter(b => b && b.type === 'web_search_tool_result' && Array.isArray(b.content)).forEach(b => b.content.forEach(c => { if (c && c.url) seen.add(c.url); }));
    const j = parseJson(text);
    if (!j) return await estimateOnly(brand, name, deps, out);

    // Niveau 3 : actif principal probable (une famille connue, sinon rien)
    const fam = typeof j.mainFamily === 'string' && MainActive.FAMILIES.indexOf(j.mainFamily) >= 0 ? j.mainFamily : null;
    out.estimate = { family: fam, label: fam ? MainActive.label(fam) : '' };

    // Niveau 2 : la page est retéléchargée et vérifiée
    const url = safeUrl(j.pageUrl);
    const items = Array.isArray(j.ingredients) ? j.ingredients.filter(x => typeof x === 'string').map(x => x.trim()).filter(x => x.length > 1 && x.length < 90).slice(0, 80) : [];
    if (j.found !== true || !url || items.length < 8 || (seen.size && !seen.has(j.pageUrl))) return out;
    const html = await (deps.fetchPage || defaultFetchPage)(url);
    if (!html) return out;
    const title = pageTitle(html) || String(j.pageTitle || '');
    if (!titleMatches(brand, name, title + ' ' + pageH1(html))) return out;
    if (!ingredientsOnPage(html, items)) return out;
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* adresse déjà validée */ }
    out.compo = {
      found: true, inci: items.join(', '), inciList: cleanList(items), confidence: 'medium', source: 'web',
      sourceUrl: url, sourceLabel: host + ' (trouvée par recherche web)', retrievedAt: new Date().toISOString().slice(0, 10),
      matchedName: title.slice(0, 140), barcode: '', quantity: '', volumeMl: null
    };
    return out;
  } catch (e) { return out; }
}

module.exports = { find, safeUrl, titleMatches, pageTitle, pageH1, defaultFetchPage, norm, ingredientsOnPage, pageText, buildPrompt, _parseJson: parseJson, BLOCKED };
