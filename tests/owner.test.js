/* ============================================================
   tests/owner.test.js — Le compte de l'administratrice (variable ADMIN_EMAILS) a des dupes illimités ; personne d'autre.
   ============================================================ */
'use strict';
const { ROOT, fb, makeFake, check, done, path } = require('./helpers.js');
const AI = require(path.join(ROOT, 'lib', 'aiGuard.js'));

const fake = makeFake(); fake.install();
const USERS = {
  owner:  { uid: 'owner',  email: 'Admin@Example.com', emailVerified: true },
  unver:  { uid: 'unver',  email: 'admin@example.com', emailVerified: false },
  other:  { uid: 'other',  email: 'autre@example.com', emailVerified: true }
};
fb._set({ db: fake.db, FieldValue: fake.FV, auth: { getUser: async uid => { if (!USERS[uid]) throw new Error('inconnu'); return USERS[uid]; }, verifyIdToken: async () => { throw new Error('non'); } } });
const full = { dupes: 99, month: AI.parisMonth(), dupeIds: [] };      // quota du mois épuisé (5 pour un compte gratuit)
['owner', 'unver', 'other'].forEach(u => fake.store.set('usage/' + u, Object.assign({}, full)));

(async () => {
  const cfg = AI.DEFAULTS;
  delete process.env.ADMIN_EMAILS; AI._ownerCache.clear();
  let q = await AI.quotaStatus('owner', cfg, 'sid-aaaaaa');
  check('ADMIN_EMAILS absente : personne n\'est favorisé (compte gratuit, quota épuisé)', q.plan === 'free' && q.remaining === 0, JSON.stringify(q));

  process.env.ADMIN_EMAILS = 'admin@example.com, autre-chose@example.com'; AI._ownerCache.clear();
  q = await AI.quotaStatus('owner', cfg, 'sid-bbbbbb');
  check('l\'administratrice (e-mail confirmé, majuscules ignorées) : Glow+, dupes illimités', q.plan === 'glowplus' && q.limit === null && q.remaining === null, JSON.stringify(q));
  q = await AI.quotaStatus('unver', cfg, 'sid-cccccc');
  check('même adresse mais e-mail NON confirmé : aucun passe-droit', q.plan === 'free' && q.remaining === 0, JSON.stringify(q));
  q = await AI.quotaStatus('other', cfg, 'sid-dddddd');
  check('autre compte : quota normal, épuisé', q.plan === 'free' && q.remaining === 0, JSON.stringify(q));
  q = await AI.quotaStatus('inconnu', cfg, 'sid-eeeeee');
  check('compte introuvable : quota normal', q.plan === 'free', JSON.stringify(q));

  const c = await AI.consumeDupe('owner', 'sid-ffffff', cfg);
  check('chaque recherche est comptée mais jamais bloquée pour l\'administratrice', c.limit === null && c.remaining === null, JSON.stringify(c));
  check('recherches de produits inconnus : jamais bloquées pour l\'administratrice', (await AI.gateUnknown('owner', 'sid-gggggg', cfg)) === true);
  fake.store.set('usage/other', { day: AI.parisDay(), unknown: cfg.unknownPerDay, unknownIds: [] });
  check('… mais la limite du jour reste en place pour les autres', (await AI.gateUnknown('other', 'sid-hhhhhh', cfg)) === false);

  delete process.env.ADMIN_EMAILS;
  done('dupes illimités pour l\'administratrice');
})();
