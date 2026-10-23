/* ============================================================
   tests/routes.test.js — Chaque route du dossier api/ : qui peut l'appeler sans être identifié ?
   Une demande ANONYME ne doit jamais atteindre un service payant (IA, images, paiement, GitHub).
   Aucun réseau : les appels sortants sont comptés par une fausse « fetch ».
   ============================================================ */
'use strict';
const { ROOT, fb, makeFake, check, done, call, path } = require('./helpers.js');

const fake = makeFake();
fb._set({ db: fake.db, FieldValue: fake.FV, auth: { verifyIdToken: async t => { if (t !== 'tok') throw new Error('x'); return { uid: 'alice', email: 'alice@exemple.test', email_verified: true }; } } });
process.env.ANTHROPIC_API_KEY = 'dummy'; process.env.REPLICATE_API_TOKEN = 'dummy'; process.env.GITHUB_TOKEN = 'dummy';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'; process.env.ADMIN_EMAILS = 'admin@exemple.test';

let outgoing = 0, lastAnthropic = null;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (/anthropic|replicate|github|stripe|openbeautyfacts|incidecoder/.test(u)) { outgoing++; if (/anthropic/.test(u)) { try { lastAnthropic = JSON.parse(opts.body); } catch (e) {} } return { ok: false, status: 500, json: async () => ({}), text: async () => '' }; }
  return realFetch(url, opts);
};
const R = n => require(path.join(ROOT, 'api', n + '.js'));
let n = 0; const ip = () => '198.51.100.' + (++n % 250 + 1);

(async () => {
  const anon = [
    ['coach',           { model: 'claude-opus-4-5', max_tokens: 64000, messages: [{ role: 'user', content: 'bonjour' }] }, 'IA (messages) — pas de compte requis : limite IP + plafond de coût'],
    ['identifyProduct', { photo: 'data:image/jpeg;base64,AAAA' },                                                          'IA (vision) — idem'],
    ['faceVision',      { photo: 'data:image/jpeg;base64,AAAA' },                                                          'IA (vision) — idem'],
    ['skinInsights',    { analysisData: { score: 60 } },                                                                   'IA (texte) — idem'],
    ['analyzeRoutine',  { products: [{ ref: 0, name: 'x' }] },                                                             'IA (texte) — idem']
  ];
  console.log('── Routes IA sans compte : elles doivent rester limitées par IP et par plafond de coût ──');
  for (const [name, body] of anon) {
    const r = await call(R(name), body, ip());
    if (name === 'coach') {
      // on vérifie ce qui PART vers l'IA : modèle imposé et longueur bornée, même si la demande réclame le plus cher
      check('coach : modèle très cher + 64 000 tokens demandés → Haiku et 600 tokens envoyés à l\'IA',
        !!lastAnthropic && lastAnthropic.model === 'claude-haiku-4-5-20251001' && lastAnthropic.max_tokens === 600,
        lastAnthropic && (lastAnthropic.model + ' / ' + lastAnthropic.max_tokens));
    } else {
      check(name + ' : répond sans erreur serveur (la protection ne casse pas l\'appli)', r.code < 500 || r.code === 502, 'code ' + r.code);
    }
  }

  console.log('\n── Routes qui exigent un compte (une demande anonyme = 401, aucun appel sortant) ──');
  const before = outgoing;
  const needAccount = [
    ['dupeMatch',      { product: { name: 'x' }, candidates: [] }],
    ['inci',           { brand: 'A', name: 'B' }],
    ['makeupRender',   { image: 'data:image/jpeg;base64,AAAA', mask: 'data:image/png;base64,AAAA', prompt: 'rouge à lèvres' }],
    ['createCheckout', { priceKey: 'premium_monthly', uid: 'quelqu-un-d-autre', email: 'x@y.z' }],
    ['createCheckout', { mode: 'deleteAccount' }]
  ];
  for (const [name, body] of needAccount) {
    const r = await call(R(name), body, ip());
    const expected = (name === 'createCheckout' && body.mode === 'deleteAccount') ? 400 : 401;
    check(name + (body.mode ? ' (' + body.mode + ')' : '') + ' anonyme → ' + expected, r.code === expected, 'code ' + r.code);
  }
  check('aucun appel payant n\'est parti pour ces demandes anonymes', outgoing === before, outgoing - before + ' appel(s)');

  console.log('\n── Routes d\'administration (administratrice seulement) ──');
  for (const [name, body] of [['saveProducts', { products: [] }], ['uploadImage', { filename: 'a.jpg', contentBase64: 'AAAA' }]]) {
    const anonR = await call(R(name), body, ip());
    const userR = await call(R(name), Object.assign({ idToken: 'tok' }, body), ip());
    check(name + ' : anonyme → 401, utilisatrice ordinaire → 403', anonR.code === 401 && userR.code === 403, anonR.code + ' / ' + userR.code);
  }

  console.log('\n── Limites ──');
  let blocked = 0;
  for (let i = 1; i <= 8; i++) { const r = await call(R('makeupRender'), { idToken: 'tok', image: 'x', mask: 'x', prompt: 'x' }, '203.0.113.5'); if (r.code === 429) { blocked = i; break; } }
  check('makeupRender : bloqué par IP après 4 appels par heure', blocked === 5, 'bloqué à l\'appel n°' + blocked);
  const coachBad = await call(R('coach'), { messages: [] }, ip());
  check('coach : demande invalide refusée (400)', coachBad.code === 400);

  global.fetch = realFetch;
  done('chaque route d\'api/');
})();
