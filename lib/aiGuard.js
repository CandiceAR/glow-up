/* ============================================================
   lib/aiGuard.js — Protège le serveur contre les abus et les factures surprises.
   Trois protections, appliquées à CHAQUE appel à l'IA :
     1. Limite par adresse IP (par heure et par route) — l'IP n'est jamais stockée, seulement une empreinte.
     2. Plafond de coût GLOBAL par jour (3 € par défaut) : le coût réel est calculé après chaque appel
        (tokens × tarif du modèle). Plafond atteint → l'IA est coupée jusqu'au lendemain (heure de Paris).
     3. Quotas PAR COMPTE pour « Trouver son dupe » :
          - Gratuit 5 dupes/mois · Premium 15/mois · Premium+ illimité ;
          - un dupe n'est décompté que si au moins un résultat s'affiche (et une seule fois par recherche) ;
          - limite interne : 10 recherches de produit inconnu par jour et par compte.
   Réglages modifiables SANS redéployer : document Firestore  serverConfig/limits  (champs ci-dessous, tous facultatifs).
   Compteurs : collections rateLimits, costs (1 document par jour), usage (1 document par compte).
   Sans Firestore (clé absente) : limites par IP gardées en mémoire (par instance), pas de quotas de compte.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const fb = require('./fb.js');

// ─── Réglages par défaut ─────────────────────────────────────
const DEFAULTS = {
  dailyCapEur: 3,                 // plafond de coût global par jour (€)
  usdToEur: 0.92,                 // taux de change utilisé pour convertir les tarifs en dollars
  ipPerHour: {                    // appels autorisés par IP et par heure, par route
    inci: 60, inciPhoto: 8, queue: 20, dupeMatch: 40, identify: 20, coach: 40,
    faceVision: 12, skinInsights: 12, analyzeRoutine: 10, admin: 60, makeupRender: 4, checkout: 10, default: 20
  },
  quotas: { free: 5, glow: 15, glowplus: null },   // dupes par mois (null = illimité)
  unknownPerDay: 10,              // recherches de produit inconnu par jour et par compte
  webPrice: true,                 // false = plus de relevé automatique des prix (coupe-circuit sans redéployer)
  webPricePerSearch: 4,           // produits proposés dont le prix est cherché sur le web, par recherche de dupe
  webSearch: true,               // false = plus de recherche web de composition (niveaux 2 et 3) : coupe-circuit sans redéployer
  incidecoder: true               // false = INCIDecoder n'est plus interrogé (le garder de côté en attendant leur réponse)
};
// Tarif des modèles : [€ par million de tokens en entrée, en sortie] en dollars
const PRICE_USD = { 'claude-haiku-4-5-20251001': [1, 5], 'claude-sonnet-4-6': [3, 15] };
const UNKNOWN_MODEL_PRICE = [15, 75];     // modèle non listé : tarif le plus cher (prudence)

// ─── Dates (heure de Paris) ──────────────────────────────────
const parisDay = (d) => (d || new Date()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ
const parisMonth = () => parisDay().slice(0, 7);

// ─── Configuration (cache 60 s) ──────────────────────────────
function merge(base, over) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  Object.keys(over || {}).forEach(k => {
    out[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base && typeof base[k] === 'object' && base[k] !== null)
      ? merge(base[k], over[k]) : over[k];
  });
  return out;
}
let _cfg = null, _cfgAt = 0;
async function config() {
  if (_cfg && Date.now() - _cfgAt < 60000) return _cfg;
  let over = {};
  const db = fb.getDb();
  // Collection « serverConfig » (et non « config ») : tes règles Firestore laissent « config » lisible par tout le monde.
  // « serverConfig » n'a aucune règle → fermée à tous les visiteurs, lisible seulement par le serveur.
  if (db) { try { const d = await db.collection('serverConfig').doc('limits').get(); if (d.exists) over = d.data() || {}; } catch (e) { /* défauts */ } }
  _cfg = merge(DEFAULTS, over); _cfgAt = Date.now();
  return _cfg;
}

// ─── 1. Limite par IP ────────────────────────────────────────
function clientIp(req) {
  const h = (req && req.headers) || {};
  const xf = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(h['x-real-ip'] || '') || (req && req.socket && req.socket.remoteAddress) || 'inconnue';
}
const ipHash = (ip) => crypto.createHash('sha256').update(String(ip) + (process.env.GUARD_SALT || 'glowup')).digest('hex').slice(0, 16);

const _mem = new Map();     // secours sans Firestore : « route|empreinte|heure » → nombre
async function ipLimit(req, route, cfg) {
  const max = (cfg.ipPerHour && (cfg.ipPerHour[route] || cfg.ipPerHour.default)) || 20;
  const bucket = Math.floor(Date.now() / 3600000);
  const h = ipHash(clientIp(req)), key = `${route}__${h}__${bucket}`;
  const db = fb.getDb(), FV = fb.getFV();
  if (db && FV) {
    try {
      const ref = db.collection('rateLimits').doc(key);
      let n = 0;
      await db.runTransaction(async t => {
        const d = await t.get(ref);
        n = (d.exists ? (d.data().n || 0) : 0) + 1;
        t.set(ref, { n, route, expireAt: new Date((bucket + 2) * 3600000) });   // expireAt : suppression automatique possible (règle TTL)
      });
      return { ok: n <= max, n, max };
    } catch (e) { /* Firestore indisponible : on bascule sur la mémoire */ }
  }
  const k = `${route}|${h}|${bucket}`;
  const n = (_mem.get(k) || 0) + 1;
  _mem.set(k, n);
  if (_mem.size > 5000) { for (const x of _mem.keys()) { if (!x.endsWith('|' + bucket)) _mem.delete(x); } }
  return { ok: n <= max, n, max };
}

// ─── 2. Plafond de coût global ───────────────────────────────
let _capCache = null, _localSpent = 0;
async function capStatus() {
  const cfg = await config(), day = parisDay();
  if (_capCache && _capCache.day === day && Date.now() - _capCache.at < 15000) {
    const spent = _capCache.spent + _localSpent;
    return { spent, cap: cfg.dailyCapEur, reached: spent >= cfg.dailyCapEur };
  }
  let spent = 0;
  const db = fb.getDb();
  if (db) { try { const d = await db.collection('costs').doc(day).get(); spent = d.exists ? (d.data().eur || 0) : 0; } catch (e) { /* 0 */ } }
  _capCache = { day, at: Date.now(), spent }; _localSpent = 0;
  return { spent, cap: cfg.dailyCapEur, reached: spent >= cfg.dailyCapEur };
}

function costEur(model, usage, cfg) {
  const p = PRICE_USD[model] || UNKNOWN_MODEL_PRICE;
  const u = usage || {};
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1;
  // recherche web de l'IA : 10 $ pour 1 000 recherches, facturées en plus des mots lus
  const searches = ((u.server_tool_use && u.server_tool_use.web_search_requests) || 0) * 0.01;
  return ((input * p[0] + (u.output_tokens || 0) * p[1]) / 1e6 + searches) * ((cfg && cfg.usdToEur) || DEFAULTS.usdToEur);
}

async function addCost(route, model, usage) {
  const cfg = await config();
  return addCostEur(route, String(model), costEur(model, usage, cfg));
}

// Enregistre un coût déjà connu en euros (ex. un service d'images facturé à l'unité)
async function addCostEur(route, model, eur) {
  _localSpent += eur;
  const db = fb.getDb(), FV = fb.getFV();
  if (!db || !FV) return eur;
  try {
    await db.collection('costs').doc(parisDay()).set({
      eur: FV.increment(eur), calls: FV.increment(1),
      byRoute: { [route]: { eur: FV.increment(eur), calls: FV.increment(1) } },
      byModel: { [String(model).replace(/[.\/]/g, '_')]: { eur: FV.increment(eur), calls: FV.increment(1) } }
    }, { merge: true });
  } catch (e) { console.error('[aiGuard] coût non enregistré :', e.message); }
  return eur;
}

// Appel à l'IA avec contrôle du plafond et enregistrement du coût réel. Renvoie un objet « façon fetch ».
async function anthropic(route, apiKey, body) {
  const cap = await capStatus();
  if (cap.reached) return { ok: false, status: 503, capReached: true, json: async () => ({ error: { message: 'cap' } }) };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  });
  let data = null;
  try { data = await resp.json(); } catch (e) { data = null; }
  if (data && data.usage) await addCost(route, body.model, data.usage);
  return { ok: resp.ok, status: resp.status, json: async () => (data == null ? {} : data) };
}

// ─── Identité (jeton Firebase envoyé dans le corps : body.idToken) ──
async function verifyToken(idToken) {
  const auth = fb.getAuth();
  if (!auth || !idToken || typeof idToken !== 'string' || idToken.length > 4000) return null;
  try { const d = await auth.verifyIdToken(idToken); return { uid: d.uid, email: d.email || null }; } catch (e) { return null; }
}

// ─── 3. Quotas par compte ────────────────────────────────────
async function planOf(uid) {
  const db = fb.getDb();
  if (!db) return 'free';
  try {
    const d = await db.collection('users').doc(uid).get();
    const p = d.exists && d.data() && d.data().subscription && d.data().subscription.plan;
    return ['free', 'glow', 'glowplus'].indexOf(p) >= 0 ? p : 'free';
  } catch (e) { return 'free'; }
}
const limitOf = (plan, cfg) => { const q = cfg.quotas || {}; return q[plan] === undefined ? q.free : q[plan]; };   // null = illimité
const safeId = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(s)) ? s : null;

async function readUsage(uid) {
  const db = fb.getDb();
  if (!db) return {};
  try { const d = await db.collection('usage').doc(uid).get(); return d.exists ? (d.data() || {}) : {}; } catch (e) { return {}; }
}

// État du quota du mois : { plan, limit (null = illimité), used, remaining (null = illimité), alreadyCounted }
async function quotaStatus(uid, cfg, searchId) {
  const plan = await planOf(uid), limit = limitOf(plan, cfg), u = await readUsage(uid);
  const used = u.month === parisMonth() ? (u.dupes || 0) : 0;
  const already = !!(searchId && u.month === parisMonth() && (u.dupeIds || []).indexOf(searchId) >= 0);
  return { plan, limit, used, remaining: limit == null ? null : Math.max(0, limit - used), alreadyCounted: already };
}

// Décompte UN dupe (une fois par recherche) — à appeler seulement quand au moins un résultat s'affiche
async function consumeDupe(uid, searchId, cfg) {
  const db = fb.getDb();
  const id = safeId(searchId);
  if (!db || !id) return { counted: false };
  const plan = await planOf(uid), limit = limitOf(plan, cfg);
  let out = { counted: false };
  try {
    const ref = db.collection('usage').doc(uid), month = parisMonth();
    await db.runTransaction(async t => {
      const d = await t.get(ref);
      let u = d.exists ? (d.data() || {}) : {};
      if (u.month !== month) u = Object.assign({}, u, { month, dupes: 0, dupeIds: [] });
      if ((u.dupeIds || []).indexOf(id) >= 0) { out = { counted: false, used: u.dupes }; return; }
      u.dupes = (u.dupes || 0) + 1;
      u.dupeIds = (u.dupeIds || []).concat([id]).slice(-40);
      t.set(ref, u, { merge: true });
      out = { counted: true, used: u.dupes };
    });
  } catch (e) { console.error('[aiGuard] décompte impossible :', e.message); }
  const used = out.used != null ? out.used : undefined;
  return Object.assign(out, { limit, remaining: limit == null || used == null ? null : Math.max(0, limit - used) });
}

// Limite interne : recherches de produit INCONNU par jour et par compte (une fois par recherche)
async function gateUnknown(uid, searchId, cfg) {
  const db = fb.getDb();
  if (!db) return true;
  const id = safeId(searchId) || ('x' + crypto.randomBytes(6).toString('hex'));
  let ok = true;
  try {
    const ref = db.collection('usage').doc(uid), day = parisDay();
    await db.runTransaction(async t => {
      const d = await t.get(ref);
      let u = d.exists ? (d.data() || {}) : {};
      if (u.day !== day) u = Object.assign({}, u, { day, unknown: 0, unknownIds: [] });
      if ((u.unknownIds || []).indexOf(id) >= 0) return;
      if ((u.unknown || 0) >= cfg.unknownPerDay) { ok = false; return; }
      u.unknown = (u.unknown || 0) + 1;
      u.unknownIds = (u.unknownIds || []).concat([id]).slice(-30);
      t.set(ref, u, { merge: true });
    });
  } catch (e) { /* en cas de panne on laisse passer : la limite par IP et le plafond de coût restent actifs */ }
  return ok;
}

// ─── Porte d'entrée d'une route ──────────────────────────────
// opts : { ai: true (appelle l'IA → plafond de coût), auth: true (compte requis) }
// Retourne { cfg, user } ou null après avoir répondu à la requête (429 / 503 / 401).
async function guard(req, res, route, opts) {
  opts = opts || {};
  const cfg = await config();
  const ip = await ipLimit(req, route, cfg);
  if (!ip.ok) {
    res.status(429).json({ error: 'rate', message: 'Trop de demandes en peu de temps. Réessaie dans quelques minutes.' });
    return null;
  }
  if (opts.ai) {
    const cap = await capStatus();
    if (cap.reached) {
      res.status(503).json({ error: 'cap', message: 'Glow Up est très sollicité aujourd\'hui : cette fonction revient demain. Merci de ta patience 💛' });
      return null;
    }
  }
  let user = null;
  if (opts.auth) {
    user = await verifyToken(req.body && req.body.idToken);
    if (!user) { res.status(401).json({ error: 'login', message: 'Connecte-toi pour utiliser cette fonction.' }); return null; }
  }
  return { cfg, user };
}

module.exports = {
  DEFAULTS, config, guard, anthropic, verifyToken, quotaStatus, consumeDupe, gateUnknown, safeId,
  costEur, capStatus, addCost, addCostEur, ipLimit, parisDay, parisMonth,
  _reset() { _cfg = null; _capCache = null; _localSpent = 0; _mem.clear(); }     // tests uniquement
};
