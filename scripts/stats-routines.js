/* ============================================================
   scripts/stats-routines.js — Point chiffré sur les routines et analyses de routine. LECTURE SEULE : aucune écriture.
   Il lit UNIQUEMENT la collection « users », et seulement les champs utiles (jamais e-mail, nom, photo ni analyse de peau).

   Usage :  node scripts/stats-routines.js "C:\chemin\vers\cle-compte-de-service.json"
        ou  définir GOOGLE_APPLICATION_CREDENTIALS (chemin du fichier) ou FIREBASE_SERVICE_ACCOUNT (le JSON) avant de lancer.
   La clé se télécharge dans la console Firebase : Paramètres du projet → Comptes de service → Générer une clé privée.
   Garde ce fichier HORS du dossier du projet (dépôt public) et supprime-le après usage.

   Ce que la base permet de savoir (voir le détail dans le rapport) :
     • users/{uid}.profile  : la routine ACTUELLE de chaque personne (écrasée à chaque nouvelle génération) ;
       sa date de génération est lue dans routine.seed (le seed se termine par l'horodatage en base 36) ;
     • users/{uid}.routineAnalysis : la DERNIÈRE analyse de routine (score + date) ;
     • aucun historique des routines générées, aucune provenance (blog / Instagram) n'est enregistrée.
   ============================================================ */
'use strict';

const SINCE = '2026-09-01';

// ── Date de génération d'une routine : le seed = (nombre au hasard en base 36) + (Date.now() en base 36, 8 caractères) ──
function seedDate(seed, now) {
  if (typeof seed !== 'string' || seed.length < 9) return null;
  const ms = parseInt(seed.slice(-8), 36);
  if (!isFinite(ms)) return null;
  const lo = Date.parse('2025-01-01T00:00:00Z'), hi = (now || Date.now()) + 86400000;
  return (ms >= lo && ms <= hi) ? new Date(ms) : null;
}

// Lundi (heure de Paris) de la semaine d'une date : « 2026-09-07 »
function weekStart(d) {
  const p = new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ à Paris
  const t = new Date(p + 'T12:00:00Z');
  const dow = (t.getUTCDay() + 6) % 7;                                                // lundi = 0
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

const toDate = v => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();                              // Timestamp Firestore
  const d = new Date(v); return isNaN(d) ? null : d;
};

const PROV_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'referrerUrl', 'referer', 'origin', 'source', 'landingPage', 'landing_page', 'pageOrigine'];

/** docs : [{ id, data }] (data = champs lus). Retourne tous les chiffres. */
function computeStats(docs, now, since) {
  now = now || Date.now(); since = since || SINCE;
  const out = { comptes: docs.length, avecRoutine: 0, routineDateConnue: 0, routineDateInconnue: 0, avecAnalyse: 0, analyseDateConnue: 0,
    compteursFree: 0, compteursMois: 0, parSemaineRoutines: {}, parSemaineAnalyses: {}, provenance: { documentsAvecInfo: 0, blog: 0, instagram: 0, autres: 0 } };
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
  docs.forEach(({ data }) => {
    const u = data || {}, prof = u.profile || {};
    const routine = (prof.skincare && prof.skincare.routine && prof.skincare.routine.ruleApplied) ? prof.skincare.routine
      : ((prof.routine && prof.routine.ruleApplied) ? prof.routine : null);
    if (routine) {
      out.avecRoutine++;
      const d = seedDate(routine.seed, now) || toDate(prof.savedAt);   // à défaut de seed lisible : dernière sauvegarde du profil
      const exact = !!seedDate(routine.seed, now);
      if (d) { out.routineDateConnue++; if (!exact) out.routineDateApprox = (out.routineDateApprox || 0) + 1; if (d.getTime() >= Date.parse(since + 'T00:00:00+02:00')) bump(out.parSemaineRoutines, weekStart(d)); }
      else out.routineDateInconnue++;
    }
    if (u.routineAnalysis && (typeof u.routineAnalysis.score === 'number' || u.routineAnalysis.updatedAt)) {
      out.avecAnalyse++;
      const d = toDate(u.routineAnalysis.updatedAt);
      if (d) { out.analyseDateConnue++; if (d.getTime() >= Date.parse(since + 'T00:00:00+02:00')) bump(out.parSemaineAnalyses, weekStart(d)); }
    }
    const sub = u.subscription || {};
    if (typeof sub.freeRoutineCount === 'number') out.compteursFree += sub.freeRoutineCount;
    if (sub.routineMonth && typeof sub.routineMonth.count === 'number') out.compteursMois += sub.routineMonth.count;
    // Provenance : champs de premier niveau (ou dans le profil) qui ressemblent à une origine de visite
    const found = [];
    [u, prof].forEach(o => PROV_KEYS.forEach(k => { if (typeof o[k] === 'string' && o[k]) found.push(o[k]); }));
    if (found.length) {
      out.provenance.documentsAvecInfo++;
      const t = found.join(' ').toLowerCase();
      if (/utm_source=instagram|instagram/.test(t)) out.provenance.instagram++;
      else if (/\/blog/.test(t)) out.provenance.blog++;
      else out.provenance.autres++;
    }
  });
  return out;
}

// Toutes les semaines (lundis) depuis `since` jusqu'à aujourd'hui, même à 0
function weeksFrom(since, now) {
  const list = []; let w = weekStart(new Date(since + 'T12:00:00Z'));
  const last = weekStart(new Date(now));
  while (w <= last) { list.push(w); const t = new Date(w + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 7); w = t.toISOString().slice(0, 10); }
  return list;
}

function report(s, now, since) {
  now = now || Date.now(); since = since || SINCE;
  const L = [];
  L.push('POINT CHIFFRÉ GLOW UP — routines et analyses de routine (lecture seule, ' + new Date(now).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) + ')', '');
  L.push('| Indicateur | Valeur |', '|---|---|');
  L.push('| Comptes (documents « users ») | ' + s.comptes + ' |');
  L.push('| Utilisatrices uniques avec au moins une routine générée | ' + s.avecRoutine + ' |');
  L.push('| Routines générées depuis le début (total exact) | non disponible : seule la routine actuelle de chaque personne est gardée |');
  L.push('| Routines actuelles (une par utilisatrice) | ' + s.avecRoutine + ' |');
  L.push('| Utilisatrices ayant terminé « Analyser ma routine » (dernière analyse) | ' + s.avecAnalyse + ' |');
  L.push('| Compteurs « routines gratuites » (somme) / « routines du mois » (somme) | ' + s.compteursFree + ' / ' + s.compteursMois + ' (restent à 0 tant que tout est gratuit) |');
  L.push('', 'Routines par semaine depuis le ' + since.split('-').reverse().join('/') + ' (selon la date de la DERNIÈRE génération de chaque personne)', '');
  L.push('| Semaine du (lundi) | Routines | Analyses de routine |', '|---|---|---|');
  weeksFrom(since, now).forEach(w => L.push('| ' + w.split('-').reverse().join('/') + ' | ' + (s.parSemaineRoutines[w] || 0) + ' | ' + (s.parSemaineAnalyses[w] || 0) + ' |'));
  L.push('', 'Provenance (blog / Instagram) :', '');
  L.push('| Information enregistrée dans les comptes | Valeur |', '|---|---|');
  L.push('| Comptes avec une provenance (referrer, utm_source, page d\u2019origine) | ' + s.provenance.documentsAvecInfo + ' |');
  L.push('| … venus d\u2019Instagram | ' + s.provenance.instagram + ' |');
  L.push('| … venus du blog | ' + s.provenance.blog + ' |');
  L.push('| … autres | ' + s.provenance.autres + ' |');
  if (s.routineDateInconnue) L.push('', 'Routines sans date lisible : ' + s.routineDateInconnue);
  if (s.routineDateApprox) L.push('Routines datées par la dernière sauvegarde du profil (seed illisible) : ' + s.routineDateApprox);
  return L.join('\n');
}

async function main() {
  const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const arg = process.argv[2];
  let cred;
  if (arg) cred = cert(JSON.parse(require('fs').readFileSync(arg, 'utf8')));
  else if (process.env.FIREBASE_SERVICE_ACCOUNT) cred = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) cred = applicationDefault();
  else { console.error('Aucune clé de compte de service : voir l\u2019en-tête de scripts/stats-routines.js.'); process.exit(2); }
  initializeApp({ credential: cred });
  const db = getFirestore();
  // LECTURE SEULE : un seul .get() sur « users », champs limités (ni e-mail, ni nom, ni photo)
  const snap = await db.collection('users').select(
    'profile.routine.ruleApplied', 'profile.routine.seed', 'profile.skincare.routine.ruleApplied', 'profile.skincare.routine.seed', 'profile.savedAt',
    'routineAnalysis.score', 'routineAnalysis.updatedAt', 'subscription.freeRoutineCount', 'subscription.routineMonth',
    ...PROV_KEYS, ...PROV_KEYS.map(k => 'profile.' + k)).get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  console.log(report(computeStats(docs)));
}

module.exports = { seedDate, weekStart, computeStats, weeksFrom, report };
if (require.main === module) main().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
