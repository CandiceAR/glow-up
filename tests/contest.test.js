/* ============================================================
   tests/contest.test.js — Jeu concours Instagram (30/10 → 08/11/2026, heure de Paris) : toutes les règles, côté serveur.
   ============================================================ */
'use strict';
const { ROOT, fb, makeFake, check, done, call, path } = require('./helpers.js');
const Contest = require(path.join(ROOT, 'lib', 'contest.js'));
const accountDelete = require(path.join(ROOT, 'lib', 'accountDelete.js'));
const handler = require(path.join(ROOT, 'api', 'saveProducts.js'));

const fake = makeFake(); fake.install();
// jetons de test : 3 comptes + une administratrice (e-mail confirmé) + un faux administrateur (e-mail non confirmé)
const USERS = { 'tok-alice': { uid: 'alice', email: 'alice@example.com', email_verified: true }, 'tok-bob': { uid: 'bob', email: 'bob@example.com', email_verified: true },
  'tok-cara': { uid: 'cara', email: 'cara@example.com', email_verified: true }, 'tok-admin': { uid: 'admin', email: 'admin@example.com', email_verified: true },
  'tok-fakeadmin': { uid: 'fa', email: 'admin@example.com', email_verified: false } };
fb._set({ db: fake.db, FieldValue: fake.FV, auth: { verifyIdToken: async t => { if (!USERS[t]) throw new Error('jeton invalide'); return USERS[t]; } } });

const at = iso => Contest._setNow(() => new Date(iso));
const OPEN = '2026-11-02T10:00:00Z', CLOSED = '2026-11-12T10:00:00Z';
let n = 0;
const api = (body, ip) => call(handler, body, '198.51.100.' + ((ip || ++n) % 250 + 1));
const routine = seed => ({ profile: { completed: true, savedAt: '2026-11-01T10:00:00Z', routine: { ruleApplied: 'R1', seed, matin: [{ step: 'Nettoyant' }, { step: 'SPF' }], soir: [{ step: 'Crème' }] } } });

(async () => {
  console.log('── Les dates (heure de Paris) ──');
  const ph = iso => { at(iso); return Contest.phase(); };
  check('29/10 à 23h59 (Paris) : pas encore commencé', ph('2026-10-29T22:59:59Z') === 'before');
  check('30/10 à 00h00 (Paris) : ouvert', ph('2026-10-29T23:00:00Z') === 'open');
  check('08/11 à 23h59 (Paris) : encore ouvert', ph('2026-11-08T22:59:59Z') === 'open');
  check('09/11 à 00h00 (Paris) : terminé', ph('2026-11-08T23:00:00Z') === 'closed');

  console.log('\n── Le pseudo Instagram ──');
  const H = Contest.normHandle;
  check('« @ » ajouté s\'il manque, minuscules : « Lea.Skin_9 » → @lea.skin_9', H('Lea.Skin_9') === '@lea.skin_9' && H('@LEA') === '@lea');
  check('espaces, accents, tirets, symboles, vide : refusés', [' ', 'lea skin', 'léa', 'lea-skin', 'lea!', '', '@', '...'].every(x => H(x) === null));
  check('30 caractères au plus', H('a'.repeat(30)) === '@' + 'a'.repeat(30) && H('a'.repeat(31)) === null);

  console.log('\n── Participer ──');
  at(OPEN);
  let r = await api({ mode: 'contestStatus' });
  check('sans compte : refusé (401)', r.code === 401);
  r = await api({ mode: 'contestStatus', idToken: 'tok-alice' });
  check('compte sans routine : « hasRoutine » = false, pas de participation', r.code === 200 && r.o.hasRoutine === false && r.o.entry === null && r.o.phase === 'open');
  r = await api({ mode: 'contestJoin', idToken: 'tok-alice', handle: '@alice_ig', consent: true });
  check('SANS routine générée : participation refusée par le serveur', r.code === 403 && r.o.error === 'no-routine');
  fake.store.set('users/alice', routine('seed-A'));
  fake.store.set('users/bob', { profile: { completed: true, routine: { ruleApplied: 'R1', matin: [], soir: [] } } });   // routine vide = pas une routine
  fake.store.set('users/cara', routine('seed-C'));
  r = await api({ mode: 'contestJoin', idToken: 'tok-bob', handle: '@bob_ig', consent: true });
  check('routine vide (aucune étape) : refusé', r.code === 403 && r.o.error === 'no-routine');
  r = await api({ mode: 'contestJoin', idToken: 'tok-alice', handle: '@alice_ig', consent: false });
  check('sans accepter le règlement : refusé', r.code === 400 && r.o.error === 'consent');
  r = await api({ mode: 'contestJoin', idToken: 'tok-alice', handle: 'alice ig!', consent: true });
  check('pseudo invalide : refusé', r.code === 400 && r.o.error === 'invalid-handle');
  r = await api({ mode: 'contestJoin', idToken: 'tok-alice', handle: 'Alice_IG', consent: true });
  check('routine + pseudo + règlement : participation enregistrée (@ ajouté, minuscules)', r.code === 200 && r.o.ok && r.o.entry.instagram_handle === '@alice_ig', JSON.stringify(r.o));
  const stored = fake.store.get('contestEntries/alice');
  check('enregistré : user_id, pseudo, identifiant de la routine, consentement, date', stored && stored.user_id === 'alice' && stored.instagram_handle === '@alice_ig' && stored.routine_id === 'seed-A' && stored.consent === true && !!stored.created_at, JSON.stringify(stored));
  r = await api({ mode: 'contestJoin', idToken: 'tok-alice', handle: '@autre_pseudo', consent: true });
  check('retenter avec le même compte : refusé (« Tu participes déjà avec @alice_ig »)', r.code === 409 && r.o.error === 'already' && r.o.handle === '@alice_ig' && /Tu participes déjà avec @alice_ig/.test(r.o.message));
  r = await api({ mode: 'contestJoin', idToken: 'tok-cara', handle: '@ALICE_ig', consent: true });
  check('pseudo déjà pris par un autre compte (même en majuscules) : refusé', r.code === 409 && r.o.error === 'handle-taken');
  check('… et rien n\'a été enregistré pour ce second compte', !fake.store.has('contestEntries/cara'));
  r = await api({ mode: 'contestStatus', idToken: 'tok-alice' });
  check('le statut montre SA participation', r.o.entry && r.o.entry.instagram_handle === '@alice_ig' && r.o.hasRoutine === true);
  r = await api({ mode: 'contestStatus', idToken: 'tok-cara' });
  check('une autre utilisatrice ne voit JAMAIS la participation d\'une autre', r.o.entry === null && !/alice/.test(JSON.stringify(r.o)));
  r = await api({ mode: 'contestJoin', idToken: 'tok-cara', handle: '@cara.skin', consent: true });
  check('une 2e utilisatrice participe normalement', r.code === 200);

  console.log('\n── Hors dates ──');
  at('2026-10-29T10:00:00Z');
  r = await api({ mode: 'contestJoin', idToken: 'tok-bob', handle: '@bob', consent: true });
  check('avant le 30/10 : refusé', r.code === 403 && r.o.error === 'before');
  at(CLOSED);
  r = await api({ mode: 'contestJoin', idToken: 'tok-bob', handle: '@bob', consent: true });
  check('après le 08/11 : « Concours terminé, tirage le 12 novembre »', r.code === 403 && r.o.error === 'closed' && /Concours terminé, tirage le 12 novembre/.test(r.o.message));

  console.log('\n── Le tirage (administratrice seulement) ──');
  delete process.env.ADMIN_EMAILS;
  r = await api({ mode: 'contestAdminStats', idToken: 'tok-admin' });
  check('sans ADMIN_EMAILS configurée : tout est fermé (503)', r.code === 503);
  process.env.ADMIN_EMAILS = 'admin@example.com';
  r = await api({ mode: 'contestAdminStats', idToken: 'tok-alice' });
  check('une utilisatrice ordinaire ne peut rien voir (403)', r.code === 403);
  r = await api({ mode: 'contestAdminStats', idToken: 'tok-fakeadmin' });
  check('e-mail administrateur NON confirmé : refusé (403)', r.code === 403);
  r = await api({ mode: 'contestAdminStats' });
  check('sans connexion : refusé (401)', r.code === 401);
  r = await api({ mode: 'contestAdminStats', idToken: 'tok-admin' });
  check('l\'administratrice voit le nombre de participations (2)', r.code === 200 && r.o.count === 2 && Array.isArray(r.o.draws));
  r = await api({ mode: 'contestAdminExport', idToken: 'tok-admin' });
  const lines = (r.o.csv || '').trim().split('\r\n');
  check('export CSV : en-tête « pseudo,date » + une ligne par participation (pseudo, date)', lines[0] === 'pseudo,date' && lines.length === 3 && /^"@alice_ig","2026-11-02 \d\d:\d\d:\d\d"$/.test(lines[1]), lines.join(' | '));
  at(OPEN);
  r = await api({ mode: 'contestAdminDraw', idToken: 'tok-admin' });
  check('tirage impossible pendant le concours', r.code === 400 && r.o.error === 'too-early');
  at(CLOSED);
  r = await api({ mode: 'contestAdminDraw', idToken: 'tok-alice' });
  check('une utilisatrice ne peut pas lancer un tirage', r.code === 403);
  r = await api({ mode: 'contestAdminDraw', idToken: 'tok-admin' });
  const w1 = r.o.winner;
  check('1er tirage : un pseudo est tiré parmi les participantes, avec la date', r.code === 200 && ['@alice_ig', '@cara.skin'].includes(w1) && r.o.number === 1 && !!r.o.drawn_at_paris && r.o.eligible === 2, JSON.stringify(r.o));
  r = await api({ mode: 'contestAdminDraw', idToken: 'tok-admin' });
  check('relancer sans raison : refusé (la gagnante est conservée)', r.code === 400 && r.o.error === 'reason');
  r = await api({ mode: 'contestAdminDraw', idToken: 'tok-admin', reason: 'pas abonnée au compte' });
  check('relance avec raison : une AUTRE gagnante est tirée (jamais la même)', r.code === 200 && r.o.number === 2 && r.o.winner !== w1 && ['@alice_ig', '@cara.skin'].includes(r.o.winner), JSON.stringify(r.o));
  r = await api({ mode: 'contestAdminStats', idToken: 'tok-admin' });
  const d = r.o.draws;
  check('historique conservé : tirage 1 « écartée » (avec sa raison), tirage 2 « gagnante »', d.length === 2 && d[0].status === 'écartée' && d[0].reason === 'pas abonnée au compte' && d[1].status === 'gagnante' && d[0].instagram_handle === w1);
  r = await api({ mode: 'contestAdminDraw', idToken: 'tok-admin', reason: 'sans réponse sous 72 h' });
  check('plus aucune participation à tirer : message clair', r.code === 400 && r.o.error === 'empty');

  console.log('\n── Données personnelles ──');
  r = await accountDelete.handle({ idToken: 'tok-cara' });
  check('suppression d\'un compte : sa participation et son pseudo sont effacés', r.status === 200 && !fake.store.has('contestEntries/cara') && !fake.store.has('contestHandles/cara.skin'));
  r = await api({ mode: 'contestAdminPurge', idToken: 'tok-admin' });
  check('purge sans confirmation : refusée', r.code === 400);
  r = await api({ mode: 'contestAdminPurge', idToken: 'tok-admin', confirm: 'SUPPRIMER' });
  check('purge après le concours : participations et pseudos effacés', r.code === 200 && !fake.store.has('contestEntries/alice') && !fake.store.has('contestHandles/alice_ig'));
  r = await api({ mode: 'contestAdminStats', idToken: 'tok-admin' });
  check('… et l\'historique des tirages est anonymisé', r.o.count === 0 && r.o.draws.every(x => x.instagram_handle === '(supprimé)'));
  check('rien du concours n\'est lisible par l\'appli : seules des routes serveur existent', !/contest/.test(require('fs').readFileSync(path.join(ROOT, 'js', 'firestoreProfile.js'), 'utf8')));

  Contest._setNow();
  done('jeu concours Instagram');
})().catch(e => { console.error(e); process.exit(1); });
