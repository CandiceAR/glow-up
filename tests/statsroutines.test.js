/* ============================================================
   tests/statsroutines.test.js — Le script de point chiffré (scripts/stats-routines.js) : calculs justes et LECTURE SEULE.
   ============================================================ */
'use strict';
const fs = require('fs');
const { ROOT, check, done, path } = require('./helpers.js');
const S = require(path.join(ROOT, 'scripts', 'stats-routines.js'));

const mk = iso => 'x7k2p9q1' + Date.parse(iso).toString(36);           // même forme que le seed de l'appli (hasard + Date.now en base 36)
const routine = iso => ({ ruleApplied: 'R1', seed: mk(iso) });
const NOW = Date.parse('2026-11-16T10:00:00Z');

console.log('── Date lue dans le seed ──');
check('seed → date exacte de génération', S.seedDate(mk('2026-09-15T10:00:00Z'), NOW).toISOString() === '2026-09-15T10:00:00.000Z');
check('seed illisible ou absurde → pas de date', S.seedDate('abc', NOW) === null && S.seedDate(undefined, NOW) === null && S.seedDate('zzzzzzzzzzzzzzzz', NOW) === null);
check('lundi de la semaine (heure de Paris) : mardi 15/09 → lundi 14/09 ; dimanche 20/09 23h30 Paris → lundi 14/09', S.weekStart(new Date('2026-09-15T10:00:00Z')) === '2026-09-14' && S.weekStart(new Date('2026-09-20T21:30:00Z')) === '2026-09-14' && S.weekStart(new Date('2026-09-20T22:30:00Z')) === '2026-09-21');

console.log('\n── Comptage sur des comptes fictifs ──');
const docs = [
  { id: 'a', data: { profile: { routine: routine('2026-09-02T09:00:00Z') }, routineAnalysis: { score: 40, updatedAt: '2026-09-03T08:00:00Z' } } },
  { id: 'b', data: { profile: { skincare: { routine: routine('2026-09-15T09:00:00Z') }, routine: routine('2026-09-15T09:00:00Z') } } },
  { id: 'c', data: { profile: { routine: routine('2026-09-16T09:00:00Z') } } },
  { id: 'd', data: { profile: { routine: routine('2026-08-10T09:00:00Z') } } },                                 // avant le 1er septembre
  { id: 'e', data: { profile: { routine: { ruleApplied: 'R2', seed: 'court' }, savedAt: '2026-11-03T12:00:00Z' } } },   // seed illisible : date de sauvegarde
  { id: 'f', data: { profile: { routine: { ruleApplied: 'R2' } } } },                                         // aucune date
  { id: 'g', data: { email: 'x' } },                                                                           // compte sans routine
  { id: 'h', data: { profile: { answers: {} }, utm_source: 'instagram' } },
  { id: 'i', data: { profile: { routine: routine('2026-10-05T09:00:00Z') }, referrer: 'https://www.glowupskin.app/blog/peau-grasse/' } },
  { id: 'j', data: { subscription: { freeRoutineCount: 2, routineMonth: { month: '2026-11', count: 1 } } } }
];
const s = S.computeStats(docs, NOW);
check('comptes lus : 10', s.comptes === 10);
check('utilisatrices uniques avec une routine : 7 (a, b, c, d, e, f, i)', s.avecRoutine === 7, s.avecRoutine);
check('une seule routine comptée par personne, même si le profil la contient deux fois (b)', s.avecRoutine === 7);
check('routines sans date lisible : 1 (f) ; datées par la sauvegarde du profil : 1 (e)', s.routineDateInconnue === 1 && s.routineDateApprox === 1);
check('analyses de routine terminées : 1 (a)', s.avecAnalyse === 1 && s.parSemaineAnalyses['2026-08-31'] === 1);
check('par semaine depuis le 1er septembre : semaine du 31/08 → 1 (a), du 14/09 → 2 (b, c), du 05/10 → 1 (i), du 02/11 → 1 (e) ; d est avant le 1er septembre',
  s.parSemaineRoutines['2026-08-31'] === 1 && s.parSemaineRoutines['2026-09-14'] === 2 && s.parSemaineRoutines['2026-10-05'] === 1 && s.parSemaineRoutines['2026-11-02'] === 1 && Object.keys(s.parSemaineRoutines).length === 4, JSON.stringify(s.parSemaineRoutines));
check('compteurs d\'abonnement : 2 gratuites, 1 du mois', s.compteursFree === 2 && s.compteursMois === 1);
check('provenance : 2 comptes ont une info (Instagram 1, blog 1) ; les autres : rien', s.provenance.documentsAvecInfo === 2 && s.provenance.instagram === 1 && s.provenance.blog === 1 && s.provenance.autres === 0, JSON.stringify(s.provenance));
const empty = S.computeStats(docs.map(d => ({ id: d.id, data: { profile: d.data.profile } })).map(d => { delete d.data.utm_source; return d; }).slice(0, 7).map(d => ({ id: d.id, data: { profile: d.data.profile } })), NOW);
check('sans aucun champ de provenance : 0 partout (« non enregistrée »)', empty.provenance.documentsAvecInfo === 0);

console.log('\n── Le rapport ──');
const rep = S.report(s, NOW);
check('toutes les semaines depuis le 31/08 jusqu\'à la semaine du 16/11 apparaissent (même à 0)', S.weeksFrom('2026-09-01', NOW).length === 12 && /\| 31\/08\/2026 \| 1 \|/.test(rep) && /\| 21\/09\/2026 \| 0 \|/.test(rep) && /\| 16\/11\/2026 \|/.test(rep), S.weeksFrom('2026-09-01', NOW).length);
check('le rapport dit clairement que le total depuis le début n\'est pas disponible', /non disponible/.test(rep) && /seule la routine actuelle/.test(rep));
check('tableaux en français', /\| Indicateur \| Valeur \|/.test(rep) && /Utilisatrices uniques/.test(rep));

console.log('\n── Lecture seule ──');
const code = fs.readFileSync(path.join(ROOT, 'scripts', 'stats-routines.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('aucune instruction d\'écriture dans le script (set, update, delete, add, create, batch, transaction, FieldValue)', !/\.(set|update|delete|add|create|runTransaction|batch|bulkWriter|recursiveDelete)\s*\(/.test(code) && !/FieldValue/.test(code));
check('une seule lecture : la collection « users », champs limités (ni e-mail, ni nom, ni photo)', (code.match(/\.collection\(/g) || []).length === 1 && /collection\('users'\)\.select\(/.test(code) && !/'email'|'displayName'|photo/.test(code.split('select(')[1] || ''));

done('point chiffré des routines (lecture seule)');
