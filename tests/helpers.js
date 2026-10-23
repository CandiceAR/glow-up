/* ============================================================
   tests/helpers.js — Outils communs des tests automatiques (aucun accès réseau, aucune clé).
   • fausse base Firestore en mémoire + fausse authentification (jeton « tok » → compte « alice »)
   • fausse IA : « classe » les 3 premiers candidats, comme le ferait Claude
   • petit système de vérifications avec compte des échecs
   Lancer tous les tests :  npm test   (ou  node tests/run.js)
   ============================================================ */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const fb = require(path.join(ROOT, 'lib', 'fb.js'));

function makeFake() {
  const store = new Map();
  const FV = { increment: n => ({ __inc: n }) };
  const apply = (t, s) => {
    Object.keys(s).forEach(k => {
      const v = s[k];
      if (v && typeof v === 'object' && '__inc' in v) t[k] = (t[k] || 0) + v.__inc;
      else if (v instanceof Date) t[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) { t[k] = (t[k] && typeof t[k] === 'object') ? t[k] : {}; apply(t[k], v); }
      else t[k] = v;
    });
    return t;
  };
  const snap = k => ({ exists: store.has(k), data: () => JSON.parse(JSON.stringify(store.get(k) || {})) });
  const ref = (c, id) => ({
    _k: c + '/' + id,
    get: async () => snap(c + '/' + id),
    set: async (d, o) => { const k = c + '/' + id; store.set(k, o && o.merge ? apply(store.get(k) || {}, d) : apply({}, d)); }
  });
  const db = {
    collection: c => ({ doc: id => ref(c, id) }),
    runTransaction: async fn => fn({
      get: async r => snap(r._k),
      set: (r, d, o) => { store.set(r._k, o && o.merge ? apply(store.get(r._k) || {}, d) : apply({}, d)); }
    })
  };
  const tokens = { tok: 'alice', 'tok-bob': 'bob' };
  const auth = { verifyIdToken: async t => { if (!tokens[t]) throw new Error('jeton invalide'); return { uid: tokens[t] }; } };
  return { store, db, FV, auth, install() { fb._set({ db, auth, FieldValue: FV }); } };
}

// Fausse IA : renvoie les 3 premiers candidats du prompt (ce que Claude ferait, sans inventer)
function installFakeAI() {
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).indexOf('api.anthropic.com') < 0) return realFetch(url, opts);
    const text = JSON.parse(opts.body).messages[0].content;
    const ids = [...String(Array.isArray(text) ? '' : text).matchAll(/"id":"([^"]+)"/g)].map(m => m[1]).slice(0, 3);
    return { ok: true, status: 200, json: async () => ({
      content: [{ text: JSON.stringify({ trueDupeExists: ids.length > 0,
        results: ids.map((id, i) => ({ id, similarity: 82 - i * 6, role: 'closest', skinFit: 'adapted', skinNote: 'ok' })), bestSkinAlternativeId: null }) }],
      usage: { input_tokens: 4000, output_tokens: 300 } }) };
  };
  process.env.ANTHROPIC_API_KEY = 'dummy';
  return () => { global.fetch = realFetch; };
}

let fails = 0, total = 0;
function check(name, cond, extra) {
  total++;
  if (!cond) fails++;
  console.log((cond ? 'OK     ' : 'ÉCHEC  ') + name + (extra ? '  → ' + extra : ''));
}
function done(label) {
  console.log('\n' + (fails ? '❌ ' + fails + ' échec(s) sur ' + total + ' — ' + label : '✅ ' + total + ' vérifications réussies — ' + label));
  process.exit(fails ? 1 : 0);
}

// Appelle une route comme Vercel (req/res simulés)
function call(handler, body, ip) {
  return new Promise(resolve => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, o }); }, end() { resolve({ code: this.code, o: null }); } };
    handler({ method: 'POST', headers: { 'x-forwarded-for': ip || '203.0.113.9' }, body }, res);
  });
}

module.exports = { ROOT, fb, makeFake, installFakeAI, check, done, call, path };
