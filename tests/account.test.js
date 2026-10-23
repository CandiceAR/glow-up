/* ============================================================
   tests/account.test.js — Suppression de compte (Apple 5.1.1), côté serveur (lib/accountDelete.js).
   Vérifie : profil et compteurs SUPPRIMÉS, scans et produits ajoutés DÉTACHÉS de la personne (et jamais ceux des autres).
   ============================================================ */
'use strict';
const { ROOT, fb, check, done, path } = require('./helpers.js');
const { handle } = require(path.join(ROOT, 'lib', 'accountDelete.js'));

// fausse base : documents en mémoire, requêtes where/limit, lots d'écritures, suppression
const store = new Map();
const DEL = { __del: true };
const FV = { delete: () => DEL, increment: n => ({ __inc: n }) };
const ref = (c, id) => ({ _k: c + '/' + id, get: async () => ({ exists: store.has(c + '/' + id), data: () => store.get(c + '/' + id) }),
  delete: async () => { store.delete(c + '/' + id); } });
const db = {
  collection: c => ({
    doc: id => ref(c, id),
    where: (f, op, v) => ({ limit: n => ({ get: async () => {
      const docs = [...store.entries()].filter(([k, d]) => k.startsWith(c + '/') && d[f] === v).slice(0, n).map(([k, d]) => ({ ref: { _k: k }, data: () => d }));
      return { empty: !docs.length, size: docs.length, docs };
    } }) })
  }),
  batch: () => { const ops = []; return { update: (r, d) => ops.push([r._k, d]), commit: async () => ops.forEach(([k, d]) => {
    const cur = store.get(k) || {};
    Object.keys(d).forEach(x => { if (d[x] === DEL) delete cur[x]; else cur[x] = d[x]; });
    store.set(k, cur);
  }) }; }
};
fb._set({ db, FieldValue: FV, auth: { verifyIdToken: async t => { if (t !== 'tok-alice') throw new Error('x'); return { uid: 'alice', email: 'alice@exemple.test' }; } } });

store.set('users/alice', { profile: { answers: {} }, skinJourney: { entries: [{ thumb: 'data:...' }] } });
store.set('users/bob', { profile: {} });
store.set('usage/alice', { month: '2026-10', dupes: 3 });
store.set('scannedProducts/s1', { brand: 'A', name: 'x', uid: 'alice' });
store.set('scannedProducts/s2', { brand: 'B', name: 'y', email: 'alice@exemple.test' });          // ancien scan, avec e-mail
store.set('scannedProducts/s3', { brand: 'C', name: 'z', uid: 'bob' });
store.set('userProducts/u1', { brand: 'D', name: 'w', uid: 'alice' });

(async () => {
  let r = await handle({});
  check('sans jeton → 400', r.status === 400);
  r = await handle({ idToken: 'faux' });
  check('faux jeton → 401, rien n\'est supprimé', r.status === 401 && store.has('users/alice'));

  r = await handle({ idToken: 'tok-alice' });
  check('suppression acceptée (200)', r.status === 200 && r.json.ok === true);
  check('le profil, la routine et le suivi (users/alice) sont SUPPRIMÉS', !store.has('users/alice'));
  check('les compteurs d\'usage (usage/alice) sont supprimés', !store.has('usage/alice'));
  check('le profil d\'une autre personne reste intact', store.has('users/bob'));
  check('un scan de la personne est détaché (uid vidé)', store.get('scannedProducts/s1').uid === null && store.get('scannedProducts/s1').brand === 'A');
  check('un ancien scan avec e-mail : e-mail supprimé et détaché', !('email' in store.get('scannedProducts/s2')) && store.get('scannedProducts/s2').uid === null);
  check('un produit ajouté par la personne est détaché', store.get('userProducts/u1').uid === null);
  check('le scan d\'une autre personne n\'est pas touché', store.get('scannedProducts/s3').uid === 'bob');
  r = await handle({ idToken: 'tok-alice' });
  check('on peut relancer sans risque (idempotent)', r.status === 200);
  done('suppression de compte');
})();
