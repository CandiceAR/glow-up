// tests/guard.test.js — limite par IP, plafond de coût, quotas par compte (fausse base en mémoire, aucun réseau)
// Tests des protections (limite IP, plafond de coût, quotas) avec une fausse base Firestore en mémoire.
const R = require('path').join(__dirname, '..', 'lib') + '/';
const fb = require(R + 'fb.js');

// ── fausse base ──
const store = new Map();   // "collection/id" → objet
const FV = { increment: n => ({ __inc: n }) };
function apply(target, src) {
  Object.keys(src).forEach(k => {
    const v = src[k];
    if (v && typeof v === 'object' && '__inc' in v) target[k] = (target[k] || 0) + v.__inc;
    else if (v instanceof Date) target[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) { target[k] = target[k] && typeof target[k] === 'object' ? target[k] : {}; apply(target[k], v); }
    else target[k] = v;
  });
  return target;
}
const snap = (key) => ({ exists: store.has(key), data: () => JSON.parse(JSON.stringify(store.get(key) || {})) });
const ref = (col, id) => ({ _k: col + '/' + id,
  get: async () => snap(col + '/' + id),
  set: async (d, o) => { const k = col + '/' + id; if (o && o.merge) { store.set(k, apply(store.get(k) || {}, d)); } else { store.set(k, apply({}, d)); } } });
const db = { collection: (c) => ({ doc: (id) => ref(c, id) }),
  runTransaction: async (fn) => { const t = { get: async (r) => snap(r._k), set: (r, d, o) => { const k = r._k; store.set(k, o && o.merge ? apply(store.get(k) || {}, d) : apply({}, d)); } }; return fn(t); } };
const tokens = { 'tok-alice': 'alice', 'tok-bob': 'bob' };
const auth = { verifyIdToken: async (t) => { if (!tokens[t]) throw new Error('bad'); return { uid: tokens[t] }; } };
fb._set({ db, auth, FieldValue: FV });

const G = require(R + 'aiGuard.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'OK   ' : 'ÉCHEC ') + name + (extra ? '  → ' + extra : '')); };
const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; } }; return r; };
const req = (ip, body) => ({ headers: { 'x-forwarded-for': ip }, body: body || {} });

(async () => {
  // ── coût ──
  const cfg = await G.config();
  const c1 = G.costEur('claude-haiku-4-5-20251001', { input_tokens: 1000, output_tokens: 500 }, cfg);
  ok('coût Haiku 1000 entrée + 500 sortie ≈ 0,0032 €', Math.abs(c1 - 0.00322) < 1e-5, c1.toFixed(5));
  const c2 = G.costEur('claude-sonnet-4-6', { input_tokens: 5000, output_tokens: 900 }, cfg);
  ok('coût Sonnet 5000 entrée + 900 sortie ≈ 0,0262 €', Math.abs(c2 - 0.026220) < 1e-4, c2.toFixed(5));
  ok('modèle inconnu = tarif le plus cher', G.costEur('opus-truc', { input_tokens: 1000, output_tokens: 1000 }, cfg) > c1 * 10);

  // ── limite par IP ──
  G._reset();
  let last;
  const LIM = G.DEFAULTS.ipPerHour.inci;   // limite par heure de la route /inci (lue dans les réglages)
  for (let i = 1; i <= LIM + 1; i++) { const res = mkRes(); const g = await G.guard(req('1.2.3.4'), res, 'inci', { ai: false }); last = { g, res, i }; if (!g) break; }
  ok('IP : la demande n°' + (LIM + 1) + ' /inci en une heure est refusée (429)', last.i === LIM + 1 && last.g === null && last.res.code === 429, 'bloquée à la demande n°' + last.i);
  const resOther = mkRes();
  ok('IP : une autre adresse n\'est pas touchée', !!(await G.guard(req('9.9.9.9'), resOther, 'inci', {})));
  const resPhoto = mkRes(); let blockedAt = 0;
  for (let i = 1; i <= 10; i++) { const r2 = mkRes(); if (!(await G.guard(req('5.5.5.5'), r2, 'inciPhoto', {}))) { blockedAt = i; break; } }
  ok('IP : lecture de photo limitée à 8 par heure', blockedAt === 9, 'bloquée à ' + blockedAt);
  const keys = [...store.keys()].filter(k => k.startsWith('rateLimits/'));
  ok('IP : l\'adresse n\'est pas stockée en clair', keys.length > 0 && keys.every(k => !k.includes('1.2.3.4')), keys[0]);

  // ── plafond de coût ──
  G._reset(); store.clear();
  const aiRes = mkRes();
  ok('plafond : ouvert au départ', !!(await G.guard(req('7.7.7.7'), aiRes, 'dupeMatch', { ai: true })));
  for (let i = 0; i < 120; i++) await G.addCost('dupeMatch', 'claude-sonnet-4-6', { input_tokens: 5000, output_tokens: 900 });   // ≈ 3,1 €
  const day = store.get('costs/' + G.parisDay());
  ok('plafond : le coût du jour est enregistré', day && day.eur > 3 && day.calls === 120, 'jour = ' + (day && day.eur.toFixed(2)) + ' € sur ' + (day && day.calls) + ' appels');
  ok('plafond : détail par route enregistré', day.byRoute && day.byRoute.dupeMatch && day.byRoute.dupeMatch.calls === 120);
  G._reset();
  const capRes = mkRes();
  const gc = await G.guard(req('7.7.7.7'), capRes, 'dupeMatch', { ai: true });
  ok('plafond : atteint → l\'IA est coupée (503, message doux)', gc === null && capRes.code === 503 && capRes.body.error === 'cap' && /demain/.test(capRes.body.message));
  const nonAi = mkRes();
  ok('plafond : les routes sans IA restent ouvertes', !!(await G.guard(req('7.7.7.7'), nonAi, 'queue', { ai: false })));
  // modifiable sans redéployer
  G._reset(); store.set('serverConfig/limits', { dailyCapEur: 50 });
  const capRes2 = mkRes();
  ok('plafond : modifiable dans serverConfig/limits (50 € → rouvert)', !!(await G.guard(req('7.7.7.7'), capRes2, 'dupeMatch', { ai: true })));

  // ── wrapper Anthropic : coupe avant l'appel quand le plafond est atteint ──
  G._reset(); store.clear(); store.set('costs/' + G.parisDay(), { eur: 3.5 });
  let called = false; const realFetch = global.fetch; global.fetch = async () => { called = true; return { ok: true, json: async () => ({ usage: {} }) }; };
  const out = await G.anthropic('inci', 'k', { model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [] });
  ok('wrapper : plafond atteint → aucun appel envoyé à l\'IA', out.ok === false && out.capReached === true && called === false);
  G._reset(); store.clear();
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ text: '{}' }], usage: { input_tokens: 2000, output_tokens: 300 } }) });
  const out2 = await G.anthropic('dupeMatch', 'k', { model: 'claude-sonnet-4-6', max_tokens: 10, messages: [] });
  const d2 = store.get('costs/' + G.parisDay());
  ok('wrapper : appel réussi → coût réel enregistré', out2.ok && d2 && d2.eur > 0.009 && d2.byRoute.dupeMatch.calls === 1, 'coût = ' + (d2 && d2.eur.toFixed(4)) + ' €');
  global.fetch = realFetch;

  // ── compte requis ──
  G._reset(); store.clear();
  const noTok = mkRes();
  ok('compte : sans jeton → 401', (await G.guard(req('1.1.1.1', {}), noTok, 'dupeMatch', { auth: true })) === null && noTok.code === 401);
  const badTok = mkRes();
  ok('compte : faux jeton → 401', (await G.guard(req('1.1.1.1', { idToken: 'faux' }), badTok, 'dupeMatch', { auth: true })) === null && badTok.code === 401);
  const goodTok = mkRes(); const gg = await G.guard(req('1.1.1.1', { idToken: 'tok-alice' }), goodTok, 'dupeMatch', { auth: true });
  ok('compte : bon jeton → identifié', gg && gg.user.uid === 'alice');

  // ── quotas ──
  G._reset(); store.clear();
  let s = await G.quotaStatus('alice', cfg);
  ok('quota : gratuit = 5 par mois, 0 utilisé', s.plan === 'free' && s.limit === 5 && s.used === 0 && s.remaining === 5);
  for (let i = 1; i <= 5; i++) await G.consumeDupe('alice', 'recherche-' + i + 'xxxx', cfg);
  s = await G.quotaStatus('alice', cfg);
  ok('quota : 5 recherches comptées → il en reste 0', s.used === 5 && s.remaining === 0);
  const again = await G.consumeDupe('alice', 'recherche-3xxxx', cfg);
  s = await G.quotaStatus('alice', cfg);
  ok('quota : la même recherche (recalcul du prix) n\'est comptée qu\'une fois', again.counted === false && s.used === 5);
  s = await G.quotaStatus('alice', cfg, 'recherche-3xxxx');
  ok('quota : une recherche déjà comptée est reconnue', s.alreadyCounted === true);
  s = await G.quotaStatus('bob', cfg);
  ok('quota : par compte (Bob garde ses 5)', s.used === 0 && s.remaining === 5);
  store.set('users/bob', { subscription: { plan: 'glow' } });
  s = await G.quotaStatus('bob', cfg);
  ok('quota : Premium = 15 par mois', s.plan === 'glow' && s.limit === 15);
  store.set('users/carol', { subscription: { plan: 'glowplus' } });
  s = await G.quotaStatus('carol', cfg);
  ok('quota : Premium+ = illimité', s.limit === null && s.remaining === null);
  store.set('usage/dave', { month: '2000-01', dupes: 5, dupeIds: ['old1xxxx'] });
  s = await G.quotaStatus('dave', cfg);
  ok('quota : le compteur repart à 0 un nouveau mois', s.used === 0 && s.remaining === 5);
  const bad = await G.consumeDupe('alice', 'x', cfg);
  ok('quota : identifiant de recherche invalide → rien n\'est compté', bad.counted === false);

  // ── limite interne : produits inconnus par jour ──
  G._reset(); store.clear();
  let allowed = 0;
  for (let i = 1; i <= 12; i++) if (await G.gateUnknown('erin', 'inconnu-' + i + 'xxxx', cfg)) allowed++;
  ok('inconnus : 10 par jour et par compte', allowed === 10, allowed + ' acceptés sur 12');
  ok('inconnus : même recherche = pas recomptée', (await G.gateUnknown('erin', 'inconnu-1xxxx', cfg)) === true);

  // ── sans Firestore : mode dégradé ──
  fb._set({ db: null, auth: null, FieldValue: null }); G._reset();
  let b = 0; for (let i = 1; i <= LIM + 5; i++) { const r = mkRes(); if (!(await G.guard(req('3.3.3.3'), r, 'inci', {}))) { b = i; break; } }
  ok('sans base : limite par IP gardée en mémoire', b === LIM + 1, 'bloquée à ' + b);
  const noDbCap = mkRes();
  ok('sans base : le plafond ne bloque pas par erreur', !!(await G.guard(req('4.4.4.4'), noDbCap, 'dupeMatch', { ai: true })));
  const noDbAuth = mkRes();
  ok('sans base : les routes à compte refusent (401) plutôt que de laisser passer', (await G.guard(req('4.4.4.4', { idToken: 'tok-alice' }), noDbAuth, 'dupeMatch', { auth: true })) === null && noDbAuth.code === 401);

  console.log(fails ? '\n' + fails + ' ÉCHEC(S)' : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})();
