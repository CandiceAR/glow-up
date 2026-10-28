/* ============================================================
   lib/contest.js — Jeu concours Instagram Glow Up (30/10/2026 00:00 → 08/11/2026 23:59, heure de Paris ; tirage le 12/11/2026).
   Tout se passe CÔTÉ SERVEUR (l'appli n'écrit jamais dans ces collections : aucune règle Firestore ne les ouvre) :
     contestEntries/{uid}      une participation par COMPTE  { user_id, instagram_handle, routine_id, consent, created_at }
     contestHandles/{pseudo}   une participation par PSEUDO  (un document par pseudo : sa simple existence garantit l'unicité)
     contestDraws/{id}         historique des tirages        { instagram_handle, drawn_at, status, reason… }
   Appelé par api/saveProducts.js avec un mode « contest… » (Vercel est limité à 12 fonctions : pas de nouvelle route).
   Modes utilisatrice (compte requis) : contestStatus · contestJoin
   Modes administratrice (lib/adminAuth.js) : contestAdminStats · contestAdminExport · contestAdminDraw · contestAdminPurge
   La participation n'est acceptée que si une routine complète est enregistrée sur le compte (users/{uid}.profile) :
   son identifiant (routine.seed, propre à chaque génération) est enregistré avec la participation.
   ============================================================ */
'use strict';

const crypto = require('crypto');
const fb = require('./fb.js');
const AI = require('./aiGuard.js');

const CFG = {
  start: '2026-10-30 00:00:00',       // heure de Paris
  end:   '2026-11-08 23:59:59',
  drawLabel: '12 novembre'
};

let _now = () => new Date();
const parisNow = () => _now().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });   // « 2026-10-30 00:00:00 »
const parisOf = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });

function phase() {
  const n = parisNow();
  return n < CFG.start ? 'before' : (n <= CFG.end ? 'open' : 'closed');
}

// Pseudo Instagram : @ ajouté s'il manque, minuscules, lettres / chiffres / points / underscores, 30 caractères au plus
function normHandle(raw) {
  let h = String(raw == null ? '' : raw).trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(h) || !/[a-z0-9]/.test(h)) return null;
  return '@' + h;
}

// Une routine COMPLÈTE est-elle enregistrée sur le compte ? Retourne son identifiant (routine.seed) ou null.
function routineIdOf(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const r = profile.routine || (profile.skincare && profile.skincare.routine);
  const steps = r && (Array.isArray(r.matin) ? r.matin.length : 0) + (Array.isArray(r.soir) ? r.soir.length : 0);
  if (r && r.ruleApplied && steps > 0) return String(r.seed || ('r-' + (profile.savedAt || 'inconnue'))).slice(0, 80);
  return null;
}

async function loadRoutineId(db, uid) {
  try {
    const d = await db.collection('users').doc(uid).get();
    return d.exists ? routineIdOf((d.data() || {}).profile) : null;
  } catch (e) { return null; }
}

const J = (res, status, o) => res.status(status).json(o);

// ── Utilisatrice ─────────────────────────────────────────────
async function status(res, user, db) {
  const snap = await db.collection('contestEntries').doc(user.uid).get();
  const e = snap.exists ? snap.data() : null;
  return J(res, 200, {
    phase: phase(), drawLabel: CFG.drawLabel,
    entry: e ? { instagram_handle: e.instagram_handle, created_at: e.created_at } : null,
    hasRoutine: !!(await loadRoutineId(db, user.uid))
  });
}

async function join(res, user, db, body) {
  const ph = phase();
  if (ph === 'before') return J(res, 403, { error: 'before', message: 'Le concours n\'a pas encore commencé.' });
  if (ph === 'closed') return J(res, 403, { error: 'closed', message: 'Concours terminé, tirage le ' + CFG.drawLabel + '.' });
  if (body.consent !== true) return J(res, 400, { error: 'consent', message: 'Coche la case pour accepter le règlement.' });
  const handle = normHandle(body.handle);
  if (!handle) return J(res, 400, { error: 'invalid-handle', message: 'Pseudo invalide : lettres, chiffres, points et underscores uniquement (30 caractères au maximum).' });

  // la routine est vérifiée ICI, sur le compte (pas seulement dans l'interface)
  const routineId = await loadRoutineId(db, user.uid);
  if (!routineId) return J(res, 403, { error: 'no-routine', message: 'Génère d\'abord ta routine personnalisée pour participer.' });

  const nowIso = _now().toISOString();
  try {
    await db.runTransaction(async t => {
      const eRef = db.collection('contestEntries').doc(user.uid);
      const hRef = db.collection('contestHandles').doc(handle.slice(1));
      const [e, h] = await Promise.all([t.get(eRef), t.get(hRef)]);
      if (e.exists) { const err = new Error('already'); err.code = 'already'; err.handle = e.data().instagram_handle; throw err; }
      if (h.exists) { const err = new Error('taken'); err.code = 'handle-taken'; throw err; }
      t.set(eRef, { user_id: user.uid, instagram_handle: handle, routine_id: routineId, consent: true, created_at: nowIso });
      t.set(hRef, { user_id: user.uid, created_at: nowIso });
    });
  } catch (err) {
    if (err && err.code === 'already') return J(res, 409, { error: 'already', handle: err.handle, message: 'Tu participes déjà avec ' + err.handle + '.' });
    if (err && err.code === 'handle-taken') return J(res, 409, { error: 'handle-taken', message: 'Ce pseudo participe déjà avec un autre compte.' });
    console.error('[contest] join :', err && err.message);
    return J(res, 500, { error: 'server', message: 'Un souci est survenu, réessaie dans un instant.' });
  }
  return J(res, 200, { ok: true, entry: { instagram_handle: handle, created_at: nowIso }, drawLabel: CFG.drawLabel });
}

// ── Administratrice ──────────────────────────────────────────
async function allEntries(db) {
  const snap = await db.collection('contestEntries').get();
  return snap.docs.map(d => d.data()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}
async function allDraws(db) {
  const snap = await db.collection('contestDraws').get();
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.number || 0) - (b.number || 0));
}

async function adminStats(res, db) {
  const [entries, draws] = await Promise.all([allEntries(db), allDraws(db)]);
  return J(res, 200, { count: entries.length, phase: phase(), now_paris: parisNow(), draws, window: { start: CFG.start, end: CFG.end } });
}

const csvCell = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
async function adminExport(res, db) {
  const entries = await allEntries(db);
  const csv = ['pseudo,date'].concat(entries.map(e => csvCell(e.instagram_handle) + ',' + csvCell(parisOf(e.created_at)))).join('\r\n') + '\r\n';
  return J(res, 200, { csv, count: entries.length });
}

// Tire un pseudo au hasard parmi les participations qui n'ont jamais été tirées (relance : la gagnante précédente est « écartée » avec sa raison)
async function adminDraw(res, db, body, admin) {
  if (phase() !== 'closed') return J(res, 400, { error: 'too-early', message: 'Le tirage n\'est possible qu\'après la fin du concours (8 novembre 23h59).' });
  const draws = await allDraws(db);
  const last = draws.length ? draws[draws.length - 1] : null;
  if (last && last.status === 'gagnante') {
    const reason = String(body.reason || '').trim().slice(0, 200);
    if (!reason) return J(res, 400, { error: 'reason', message: 'Une gagnante est déjà tirée. Pour relancer, indique la raison (non abonnée, sans réponse sous 72 h…).' });
    await db.collection('contestDraws').doc(last.id).set({ status: 'écartée', reason, rejected_at: _now().toISOString() }, { merge: true });
  }
  const used = new Set(draws.map(d => d.instagram_handle));
  const pool = (await allEntries(db)).filter(e => !used.has(e.instagram_handle));
  if (!pool.length) return J(res, 400, { error: 'empty', message: 'Plus aucune participation à tirer.' });
  const winner = pool[crypto.randomInt(pool.length)];
  const number = draws.length + 1, nowIso = _now().toISOString();
  await db.collection('contestDraws').doc('t' + String(number).padStart(3, '0')).set({
    number, instagram_handle: winner.instagram_handle, drawn_at: nowIso, drawn_at_paris: parisOf(nowIso),
    status: 'gagnante', eligible: pool.length, drawn_by: admin.email
  });
  return J(res, 200, { ok: true, number, winner: winner.instagram_handle, drawn_at_paris: parisOf(nowIso), eligible: pool.length });
}

// Suppression des données du concours (à faire après la remise du lot) : participations et pseudos effacés ; l'historique des tirages est anonymisé
async function adminPurge(res, db, body) {
  if (body.confirm !== 'SUPPRIMER') return J(res, 400, { error: 'confirm', message: 'Confirmation manquante.' });
  let n = 0;
  for (const coll of ['contestEntries', 'contestHandles']) {
    const snap = await db.collection(coll).get();
    for (const d of snap.docs) { await db.collection(coll).doc(d.id).delete(); n++; }
  }
  for (const d of await allDraws(db)) await db.collection('contestDraws').doc(d.id).set({ instagram_handle: '(supprimé)' }, { merge: true });
  return J(res, 200, { ok: true, deleted: n });
}

// ── Point d'entrée ───────────────────────────────────────────
const USER_MODES = { contestStatus: status, contestJoin: join };
const ADMIN_MODES = { contestAdminStats: adminStats, contestAdminExport: adminExport, contestAdminDraw: adminDraw, contestAdminPurge: adminPurge };

async function handle(req, res) {
  const body = req.body || {}, mode = body.mode;
  const db = fb.getDb();
  if (USER_MODES[mode]) {
    const G = await AI.guard(req, res, 'contest', { auth: true });
    if (!G) return;
    if (!db) return J(res, 503, { error: 'unavailable', message: 'Service indisponible pour le moment.' });
    return USER_MODES[mode](res, G.user, db, body);
  }
  if (ADMIN_MODES[mode]) {
    const { requireAdmin } = require('./adminAuth.js');
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!db) return J(res, 503, { error: 'unavailable', message: 'Base indisponible.' });
    return ADMIN_MODES[mode](res, db, body, admin);
  }
  return J(res, 400, { error: 'mode', message: 'Mode inconnu.' });
}

module.exports = { handle, normHandle, routineIdOf, phase, CFG, _setNow(fn) { _now = fn || (() => new Date()); } };
