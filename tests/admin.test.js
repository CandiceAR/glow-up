/* ============================================================
   tests/admin.test.js — Seule l'administratrice identifiée peut modifier le catalogue ou déposer des images.
   (lib/adminAuth.js, api/saveProducts.js, api/uploadImage.js) — aucun réseau, aucune clé.
   ============================================================ */
'use strict';
const { ROOT, fb, makeFake, check, done, call, path } = require('./helpers.js');

const fake = makeFake();
const ADMIN = 'admin@exemple.test';
// jetons de test : admin vérifié, admin non vérifié, simple utilisatrice, usurpatrice qui a le même e-mail non confirmé
const users = {
  'tok-admin':      { uid: 'u1', email: ADMIN, email_verified: true },
  'tok-admin-nv':   { uid: 'u2', email: ADMIN, email_verified: false },
  'tok-user':       { uid: 'u3', email: 'madame@exemple.test', email_verified: true },
  'tok-admin-MAJ':  { uid: 'u4', email: ADMIN.toUpperCase(), email_verified: true }
};
fb._set({ db: fake.db, FieldValue: fake.FV, auth: { verifyIdToken: async t => { if (!users[t]) throw new Error('jeton invalide'); return users[t]; } } });

// Le serveur ne doit appeler GitHub que pour l'administratrice
let githubCalls = 0;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).indexOf('api.github.com') >= 0) {
    githubCalls++;
    const put = opts && opts.method === 'PUT';
    return { ok: true, status: put ? 201 : 404, json: async () => (put ? { commit: { sha: 'abc123' } } : { message: 'Not Found' }) };
  }
  return realFetch(url, opts);
};
process.env.GITHUB_TOKEN = 'ghp_test';

const save = require(path.join(ROOT, 'api', 'saveProducts.js'));
const upload = require(path.join(ROOT, 'api', 'uploadImage.js'));
let ipn = 0;
const ip = () => '198.51.100.' + (++ipn % 250 + 1);

(async () => {
  console.log('── Variable ADMIN_EMAILS absente : tout est fermé ──');
  delete process.env.ADMIN_EMAILS;
  let r = await call(save, { mode: 'whoami', idToken: 'tok-admin' }, ip());
  check('saveProducts : refusé (503) tant que l\'administratrice n\'est pas configurée', r.code === 503 && r.o.error === 'admin-not-configured');
  r = await call(upload, { filename: 'a.jpg', contentBase64: 'AAAA', idToken: 'tok-admin' }, ip());
  check('uploadImage : refusé (503) aussi', r.code === 503);

  console.log('\n── ADMIN_EMAILS configurée ──');
  process.env.ADMIN_EMAILS = ADMIN;
  r = await call(save, { products: [{ id: 'x' }] }, ip());
  check('saveProducts sans identification → 401 (avant : acceptée !)', r.code === 401);
  r = await call(save, { products: [{ id: 'x' }], idToken: 'faux' }, ip());
  check('saveProducts avec un faux jeton → 401', r.code === 401);
  r = await call(save, { products: [{ id: 'x' }], idToken: 'tok-user' }, ip());
  check('saveProducts avec une utilisatrice connectée mais pas administratrice → 403', r.code === 403);
  r = await call(save, { products: [{ id: 'x' }], idToken: 'tok-admin-nv' }, ip());
  check('saveProducts avec l\'e-mail admin NON confirmé → 403 (usurpation impossible)', r.code === 403);
  check('… et GitHub n\'a jamais été contacté pour ces refus', githubCalls === 0);
  r = await call(save, { mode: 'whoami', idToken: 'tok-admin' }, ip());
  check('l\'administratrice est reconnue (« whoami »)', r.code === 200 && r.o.ok === true);
  r = await call(save, { mode: 'whoami', idToken: 'tok-admin-MAJ' }, ip());
  check('majuscules dans l\'e-mail : reconnue aussi', r.code === 200);
  r = await call(save, { products: [{ id: 'm1', name: 'Test' }], idToken: 'tok-admin' }, ip());
  check('saveProducts par l\'administratrice : enregistre dans GitHub', r.code === 200 && r.o.ok && githubCalls >= 1, 'appels GitHub : ' + githubCalls);

  console.log('\n── uploadImage ──');
  const before = githubCalls;
  r = await call(upload, { filename: 'photo.jpg', contentBase64: 'AAAA' }, ip());
  check('uploadImage sans identification → 401', r.code === 401 && githubCalls === before);
  r = await call(upload, { filename: 'photo.jpg', contentBase64: 'AAAA', idToken: 'tok-user' }, ip());
  check('uploadImage par une simple utilisatrice → 403', r.code === 403 && githubCalls === before);
  r = await call(upload, { filename: 'virus.html', contentBase64: 'AAAA', idToken: 'tok-admin' }, ip());
  check('uploadImage : un fichier .html est refusé même par l\'administratrice (400)', r.code === 400 && githubCalls === before);
  r = await call(upload, { filename: 'prod uit.JPG', contentBase64: 'AAAA', idToken: 'tok-admin' }, ip());
  check('uploadImage par l\'administratrice : image acceptée', r.code === 200 && r.o.path === 'assets/prod-uit.JPG', r.o.path);

  console.log('\n── Trop de tentatives ──');
  const same = '203.0.113.77'; let blocked = 0;
  for (let i = 1; i <= 70; i++) { const x = await call(save, { mode: 'whoami', idToken: 'faux' }, same); if (x.code === 429) { blocked = i; break; } }
  check('limite par IP : bloqué après 60 essais par heure', blocked === 61, 'bloqué à l\'essai n°' + blocked);

  global.fetch = realFetch;
  done('administration protégée');
})();
