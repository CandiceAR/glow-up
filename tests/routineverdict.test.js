/* ============================================================
   tests/routineverdict.test.js — « Analyser ma routine » puis « Créer ma nouvelle routine » ne doivent jamais se contredire :
   un produit « Peu adapté » n'est jamais « Tu la gardes » ni « Validée par ton analyse de routine ».
   Cas réel : La Roche-Posay Effaclar Mat+ (score de la routine du matin : 32/100).
   ============================================================ */
'use strict';
const fs = require('fs'), vm = require('vm');
const { ROOT, makeFake, check, done, call, path } = require('./helpers.js');
const RV = require(path.join(ROOT, 'lib', 'routineVerdict.js'));

const EFF = { id: 'm271', brand: 'La Roche-Posay', name: 'La Roche-Posay Effaclar Mat+ Hydratant Sébo-Régulateur 40ml', category: 'moisturizer', fromCatalog: true };
const GEL = { id: 'm321', brand: 'La Roche-Posay', name: 'La Roche-Posay Effaclar Gel Nettoyant Purifiant 400ml', category: 'cleanser', fromCatalog: true };
const WHY = 'Ta peau a besoin de plus d’hydratation que de matité. Ce soin matifie beaucoup et peut dessécher.';
// Analyse enregistrée, avec l'ANCIENNE liste « à garder » qui contenait à tort l'Effaclar Mat+ (ce que l'IA avait renvoyé)
const RA = () => ({ score: 32, moment: 'matin',
  result: { score: 32, products: [{ ref: 0, verdict: 'weak', why: WHY }, { ref: 1, verdict: 'adapted', why: 'Nettoie sans agresser.' }], optimized: { keep: [0, 1] } },
  products: [EFF, GEL], keepProducts: [EFF, GEL] });
const entry = (p, extra) => Object.assign({ _key: 'k' + p.id, id: p.id, brand: p.brand, name: p.name, category: p.category, fromCatalog: true, loved: true, forceKeep: true }, extra || {});

console.log('── La règle unique ──');
check('« à garder » = uniquement les produits « Adapté » (la liste de l\'IA ne compte plus)', JSON.stringify(RV.keepRefs(RA().result)) === '[1]');
check('libellés : Adapté à ta peau / Peu adapté / Déconseillé', RV.LABEL.adapted === 'Adapté à ta peau' && RV.LABEL.weak === 'Peu adapté' && RV.LABEL.discouraged === 'Déconseillé');
check('retrouve le verdict d\'un produit (même fiche, ou même nom sans accents)', RV.verdictOf(RA(), { id: 'm271' }).verdict === 'weak' && RV.verdictOf(RA(), { name: 'la roche-posay effaclar mat+ hydratant sebo-regulateur 40ml' }).verdict === 'weak' && RV.verdictOf(RA(), { name: 'Autre produit' }) === null);
const why = RV.reasonFor({ verdict: 'weak', why: WHY });
check('la raison tient en une phrase simple, tirée de l\'analyse', why === 'Ta peau a besoin de plus d’hydratation que de matité.', why);
check('sans explication dans l\'analyse : phrase par défaut', /Peu adapté à ta peau/.test(RV.reasonFor({ verdict: 'weak', why: '' })) && /Déconseillé/.test(RV.reasonFor({ verdict: 'discouraged' })));
check('« Garde ton Effaclar Mat+ » parle bien de ce produit, pas d\'« Effaclar Duo+M »', RV.mentions('Garde ton Effaclar Mat+ le matin', EFF) && !RV.mentions('Garde ton Effaclar Duo+M', EFF));

console.log('\n── Dans l\'appli : « Ta routine actuelle » et la nouvelle routine (vrai code) ──');
const ctx = { AppState: null, window: {}, localStorage: { getItem: () => null }, RoutineVerdict: RV, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'currentRoutine.js'), 'utf8') + '\nglobalThis.__CR = CurrentRoutine;', ctx);
const CR = ctx.__CR;
const setState = (ra, list) => { ctx.AppState = { routineAnalysis: ra, face: {}, products: { catalog: [] }, questionnaire: { answers: { skinType: 'seche', currentRoutine: list } } }; };

const eff = entry(EFF), gel = entry(GEL);
setState(RA(), [eff, gel]);
const ev = CR.evaluate(eff);
check('Effaclar Mat+ (« Peu adapté ») : verdict « à remplacer », jamais « gardée »', ev.verdict === 'replace', JSON.stringify(ev));
check('… et JAMAIS « Validée par ton analyse de routine »', !/Valid/.test(ev.reason), ev.reason);
check('… avec la raison en une phrase : « Ta peau a besoin de plus d\'hydratation que de matité »', /Ta peau a besoin de plus d’hydratation que de matité\./.test(ev.reason) && /option mieux adaptée/.test(ev.reason), ev.reason);
check('étape crème : rien n\'est « gardé »', CR.getKeptForStep('moisturizer', new Set()) === null);
check('étape crème : le produit est signalé « à la place de… » (la nouvelle routine en propose un mieux adapté)', (CR.getReplacedForStep('moisturizer', new Set()) || {}).id === 'm271');
check('le produit adapté (nettoyant) reste « Tu la gardes » + « Validée par ton analyse de routine ✓ »', CR.getKeptForStep('cleanser', new Set()).id === 'm321' && CR.evaluate(gel).reason === 'Validée par ton analyse de routine ✓');
const card = CR.renderKeptCard(gel);
check('la carte « ✓ Tu la gardes » n\'existe que pour les produits adaptés', /Tu la gardes/.test(card) && /Validée/.test(card));
const recap = CR.renderRecapBlock();
const rowEff = recap.split('cr-recap-row').find(s => /Effaclar Mat/.test(s)) || '';
check('récap « Ta routine actuelle » : Effaclar Mat+ en « → remplacer », sans « Validée »', /cr-replace/.test(rowEff) && !/Valid/.test(rowEff), rowEff.slice(0, 160));

console.log('\n── Même verdict partout, même pour une ancienne analyse enregistrée ──');
setState(RA(), [eff, gel]);   // ancienne analyse : keepProducts contenait l'Effaclar → ne doit rien changer
const sync = RV.syncKeep(ctx.AppState.questionnaire.answers.currentRoutine, RA());
check('nettoyage d\'un ancien enregistrement : l\'Effaclar perd son marquage « gardé »', eff.forceKeep === undefined && eff.loved === false && sync.cleared.length === 1, JSON.stringify(sync));
check('… le nettoyant adapté garde le sien', gel.forceKeep === true);
const fresh = [];
RV.syncKeep(fresh, RA());
check('liste vide + analyse : seuls les produits « Adapté » sont ajoutés', fresh.length === 1 && fresh[0].id === 'm321' && fresh[0].forceKeep === true);
const manual = { _key: 'm1', id: null, brand: 'Marque', name: 'Mon produit', category: 'serum', fromCatalog: false, loved: false };
setState(RA(), [manual]);
check('un produit ajouté à la main et absent de l\'analyse : inchangé (on la garde), sans « Validée par ton analyse »', CR.evaluate(manual).verdict === 'keep' && !/Valid/.test(CR.evaluate(manual).reason));
setState(null, [entry(EFF)]);
check('sans aucune analyse : rien ne peut être dit « Validée par ton analyse de routine »', !/Valid/.test(CR.evaluate(entry(EFF)).reason));
setState(RA(), [eff, gel]);
const wasInList = CR.list().length;
check('rien n\'est supprimé : le produit reste dans « ma routine actuelle » (elle peut le remettre via « Modifier ma routine »)', wasInList === 2);

console.log('\n── Côté serveur : l\'IA ne peut plus se contredire ──');
const fake = makeFake(); fake.install();
const realFetch = global.fetch;
const AI_ANSWER = { score: 32, strengths: ['Nettoyant doux'], improvements: ['Plus d’hydratation'],
  priorityActions: [{ type: 'keep', text: 'Garde ton Effaclar Mat+ le matin' }, { type: 'replace', text: 'Choisis une crème plus hydratante' }, { type: 'add', text: 'Ajoute un SPF' }],
  products: [{ ref: 0, verdict: 'weak', why: WHY, goodIngredients: [], problemIngredients: [], redundantWith: null, missingNote: '' },
             { ref: 1, verdict: 'adapted', why: 'Doux.', goodIngredients: [], problemIngredients: [], redundantWith: null, missingNote: '' }],
  routine: { worksTogether: true, incompatibilities: [], duplicateActives: [], uselessProducts: [], missingSteps: [], amCoherent: false, pmCoherent: true, comment: 'ok' },
  optimized: { keep: [0, 1], replace: [], add: [] } };
global.fetch = async (url, opts) => String(url).indexOf('api.anthropic.com') < 0 ? realFetch(url, opts)
  : ({ ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify(AI_ANSWER) }], usage: { input_tokens: 3000, output_tokens: 600 } }) });
process.env.ANTHROPIC_API_KEY = 'dummy';
(async () => {
  const handler = require(path.join(ROOT, 'api', 'analyzeRoutine.js'));
  const r = await call(handler, { products: [{ brand: EFF.brand, name: EFF.name, category: EFF.category }, { brand: GEL.brand, name: GEL.name, category: GEL.category }], quiz: {}, skin: null, moment: 'matin' }, '10.2.2.2');
  const o = r.o || {};
  check('analyse reçue', Array.isArray(o.products) && o.products.length === 2, JSON.stringify(o).slice(0, 160));
  check('« à garder » = seulement le produit « Adapté » (l\'Effaclar « Peu adapté » en est retiré)', JSON.stringify(o.optimized.keep) === '[1]', JSON.stringify(o.optimized.keep));
  check('l\'Effaclar est ajouté à « à remplacer » avec la raison de l\'analyse', o.optimized.replace.some(x => x.ref === 0 && /hydratation/.test(x.reason)), JSON.stringify(o.optimized.replace));
  check('l\'action « Garde ton Effaclar Mat+ » est retirée (elle contredisait le verdict) ; les autres restent', !o.priorityActions.some(a => /Effaclar/.test(a.text)) && o.priorityActions.length === 2, JSON.stringify(o.priorityActions));
  check('le verdict affiché reste « weak » (Peu adapté) : même source partout', o.products[0].verdict === 'weak' && o.products[1].verdict === 'adapted');
  global.fetch = realFetch;
  done('analyse de routine et nouvelle routine : même verdict');
})();
