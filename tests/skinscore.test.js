/* ============================================================
   tests/skinscore.test.js — Score de peau : historique léger et comparaison « avant / après » (aucune photo, aucun réseau).
   ============================================================ */
'use strict';
const { ROOT, check, done, path } = require('./helpers.js');
const S = require(path.join(ROOT, 'lib', 'skinScore.js'));

const zones = (a) => ({ forehead: { score: a[0], pixels: [1, 2, 3] }, leftCheek: { score: a[1] }, rightCheek: { score: a[2] }, nose: { score: a[3] }, chin: { score: a[4] } });
const A1 = { globalScore: 66.4, zones: zones([70, 65, 64, 60, 72]) };
const A2 = { globalScore: 71.2, zones: zones([74, 70, 69, 66, 76]) };
const M1 = { hydratation: 60, rougeurs: 70, texture: 65, eclat: 55 }, M2 = { hydratation: 66, rougeurs: 68, texture: 65, eclat: 61 };

console.log('── Version légère d\'une analyse ──');
const s1 = S.snapshot(A1, M1, '2026-11-03');
check('score global arrondi, 5 zones, 4 critères, date', s1.globalScore === 66 && Object.keys(s1.zones).length === 5 && s1.metrics.eclat === 55 && s1.date === '2026-11-03', JSON.stringify(s1));
check('on ne garde jamais les pixels ni la photo', !JSON.stringify(s1).includes('pixels') && !('photo' in s1));
check('sans score global : moyenne des zones', S.snapshot({ zones: zones([60, 60, 60, 60, 60]) }).globalScore === 60);
check('analyse vide ou illisible : rien (pas d\'erreur)', S.snapshot(null) === null && S.snapshot({}) === null && S.snapshot({ zones: {} }) === null);

console.log('\n── Comparaison avec l\'ancien score ──');
const s2 = S.snapshot(A2, M2, '2026-11-09');
const c = S.compare(s1, s2);
check('évolution globale : 71 contre 66 = +5', c.global.next === 71 && c.global.prev === 66 && c.global.delta === 5 && c.hasPrev && c.prevDate === '2026-11-03', JSON.stringify(c.global));
check('détail par zone avec son évolution (front +4, nez +6)', c.zones.length === 5 && c.zones[0].delta === 4 && c.zones.find(z => z.key === 'nose').delta === 6 && c.zones[1].label === 'Joue gauche');
check('4 critères avec évolution (rougeurs −2, éclat +6)', c.metrics.length === 4 && c.metrics.find(m => m.key === 'rougeurs').delta === -2 && c.metrics.find(m => m.key === 'eclat').delta === 6);
check('« +5 », « −2 » (vrai signe moins), « 0 »', S.fmtDelta(5) === '+5' && S.fmtDelta(-2) === '−2' && S.fmtDelta(0) === '0' && S.fmtDelta(null) === '');

console.log('\n── Première analyse, ou ancien historique incomplet ──');
const first = S.compare(null, s2);
check('première analyse : pas d\'évolution inventée', !first.hasPrev && first.global.delta === null && first.zones.every(z => z.delta === null) && first.metrics.every(m => m.delta === null));
const old = S.compare({ globalScore: 60, zones: null, metrics: null, date: '2026-10-01' }, s2);
check('ancien score sans zones : évolution globale seulement, zones sans comparaison', old.global.delta === 11 && old.zones.every(z => z.delta === null) && old.metrics.every(m => m.delta === null));

console.log('\n── Phrases ──');
check('hausse → « s\'améliore »', /améliore/.test(S.verdict(5)));
check('baisse → message rassurant qui propose de refaire une photo', /moins bien/.test(S.verdict(-4)) && /photo/.test(S.verdict(-4)));
check('±2 → stable', /stable/.test(S.verdict(2)) && /stable/.test(S.verdict(-2)) && /stable/.test(S.verdict(0)));
check('première analyse → point de départ', /point de départ/.test(S.verdict(null)));

console.log('\n── Routine proposée : vraiment différente ? ──');
const R = (id, m, so) => ({ ruleApplied: id, matin: m, soir: so, seed: 'x', log: ['a'] });
check('même règle, mêmes étapes (seed et log ignorés) : identique', S.routineSignature(R('R1', ['a', 'b'], ['c'])) === S.routineSignature(Object.assign(R('R1', ['a', 'b'], ['c']), { seed: 'y', log: [] })));
check('même règle mais une étape en plus : différente', S.routineSignature(R('R1', ['a', 'b'], ['c'])) !== S.routineSignature(R('R1', ['a', 'b', 'z'], ['c'])));
check('autre règle : différente', S.routineSignature(R('R1', ['a'], ['c'])) !== S.routineSignature(R('R2', ['a'], ['c'])));

done('score de peau (historique et comparaison)');
