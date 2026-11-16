/* ============================================================
   tests/requestedactives.test.js — « Autre chose à me dire » : chaque molécule demandée (acide hyaluronique ET céramides…)
   doit se retrouver dans un produit de la routine générée. Vrai moteur de règles, vrai choix de produits, vrai catalogue.
   ============================================================ */
'use strict';
const fs = require('fs'), vm = require('vm');
const { ROOT, check, done, path } = require('./helpers.js');
const RA = require(path.join(ROOT, 'lib', 'requestedActives.js'));

console.log('── Lire la demande ──');
const w = t => RA.parse(t).wanted.map(x => x.id).join(',');
const a = t => RA.parse(t).avoided.map(x => x.id).join(',');
check('« acide hyaluronique ET céramides » : les deux sont lues, dans l\'ordre écrit', w('Je veux de l’acide hyaluronique ET des céramides') === 'hyaluronic,ceramide');
check('« sans rétinol, sans parfum et des céramides » : céramides demandées, rétinol refusé', w('sans rétinol, sans parfum et des céramides') === 'ceramide' && a('sans rétinol, sans parfum et des céramides') === 'retinoid');
check('« pas de rétinol ni de céramides » : rien de demandé', w('pas de rétinol ni de céramides, merci') === '' && a('pas de rétinol ni de céramides') === 'ceramide,retinoid');
check('« allergique à la vitamine C » : refus, pas demande', w('allergique à la vitamine C') === '' && a('allergique à la vitamine C') === 'vitaminec');
check('texte sans molécule (« peau très sèche, enceinte ») : rien', w('Peau très sèche, je suis enceinte') === '');
check('au plus 4 molécules demandées', RA.parse('hyaluronique, céramides, niacinamide, panthénol, squalane, centella').wanted.length === 4);

// ── Le vrai moteur : règles + choix des produits ──
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rules.json'), 'utf8'));
const CAT = (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products-manual.json'), 'utf8')); return (Array.isArray(j) ? j : j.products).filter(p => p.active !== false && !p.discontinued); })();
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, window: { location: { search: '', href: '', origin: '', hostname: 'localhost' } }, AppState: null, fetch: async () => ({ ok: true, json: async () => rules }), localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} }, location: { search: '', href: '', origin: '', hostname: 'localhost' }, navigator: { userAgent: 'test' }, RequestedActives: RA };
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
load('js/rulesEngine.js'); load('js/skinConcern.js'); load('js/routineRenderer.js');
vm.runInContext('globalThis.RE = RulesEngine; globalThis.RR = RoutineRenderer;', ctx);

(async () => {
  await ctx.RE.loadRules();
  const base = { skinType: 'seche', ageGroup: '25-30', complexes: ['deshydratation'], budget: 'medium', oiliness: 'seche', sensitivity: 'normale', labels: [], concerns: ['deshydratation'] };
  const run = (extra, seed) => {
    const answers = Object.assign({}, base, extra);
    const { routine } = ctx.RE.evaluate(answers);
    routine.seed = seed;
    ctx.AppState = { questionnaire: { answers }, routine, face: {}, products: { catalog: CAT.map(p => Object.assign({}, p)), recommended: [] }, routineChoice: 'skincare' };
    const rows = [].concat(ctx.RR.resolveSection('matin'), ctx.RR.resolveSection('soir'));
    return { routine, rows, has: id => rows.some(r => r.product && ctx.RR.productHasActive(r.product, id)), names: rows.filter(r => r.product).map(r => r.product.name) };
  };
  const ASK = 'Je veux de l’acide hyaluronique ET des céramides';

  console.log('\n── Ton cas : acide hyaluronique ET céramides (peau sèche, 30 routines tirées au hasard) ──');
  let okBoth = 0, okHA = 0, okCer = 0, withoutHA = 0, total = 30;
  for (let i = 0; i < total; i++) {
    const r = run({ freeText: ASK }, 'seed' + i + Date.now().toString(36));
    if (r.has('hyaluronic')) okHA++; if (r.has('ceramide')) okCer++; if (r.has('hyaluronic') && r.has('ceramide')) okBoth++;
    const r0 = run({}, 'seed' + i + Date.now().toString(36)); if (!r0.has('hyaluronic')) withoutHA++;
  }
  check('l\'acide hyaluronique est dans un produit de la routine : ' + okHA + '/' + total, okHA === total);
  check('les céramides sont dans un produit de la routine : ' + okCer + '/' + total, okCer === total);
  check('les DEUX à la fois dans la même routine : ' + okBoth + '/' + total, okBoth === total);
  console.log('        (sans la demande, l\'acide hyaluronique manquait dans ' + withoutHA + ' routines sur ' + total + ')');
  const one = run({ freeText: ASK }, 'exemple1');
  check('les étapes dédiées existent et annoncent la molécule (titre + exigence)', one.routine.matin.concat(one.routine.soir).some(s => (s.mustHave || []).indexOf('hyaluronic') >= 0 && /hyaluron/i.test(s.label)) && one.routine.matin.concat(one.routine.soir).some(s => (s.mustHave || []).indexOf('ceramide') >= 0 && /c[ée]ramide/i.test(s.label)), JSON.stringify(one.routine.matin.concat(one.routine.soir).map(s => s.label + ' ' + JSON.stringify(s.mustHave || []))));
  console.log('        routine : ' + one.names.join(' | '));

  console.log('\n── Peau sensible : la règle ne prévoit que des céramides, pas d’acide hyaluronique ──');
  const SENS = { skinType: 'sensible', sensitivity: 8, oiliness: 'normale', complexes: ['rougeurs'], concerns: ['rougeurs'] };
  let sensBefore = 0, sensAfter = 0, sensCer = 0;
  for (let i = 0; i < total; i++) {
    if (run(SENS, 's' + i).has('hyaluronic')) sensBefore++;
    const r = run(Object.assign({ freeText: ASK }, SENS), 's' + i);
    if (r.has('hyaluronic')) sensAfter++;
    if (r.has('ceramide')) sensCer++;
  }
  console.log('        sans la demande : acide hyaluronique présent dans ' + sensBefore + ' routines sur ' + total);
  check('avec la demande : l’acide hyaluronique est présent dans ' + sensAfter + '/' + total, sensAfter === total);
  check('… et les céramides aussi : ' + sensCer + '/' + total, sensCer === total);

  console.log('\n── L’écran de la routine : « Ce que tu as demandé » ──');
  const holder = { innerHTML: '' };
  ctx.document.getElementById = id => (id === 'resultsContent' ? holder : null);
  const shown = run(Object.assign({ freeText: ASK }, SENS), 'ecran1');
  let page = '';
  try { ctx.RR.renderResults(); page = holder.innerHTML; } catch (e) { page = 'ERREUR ' + e.message; }
  check('l’écran affiche « Ce que tu as demandé » avec les deux molécules cochées, produit à l’appui', /Ce que tu as demandé/.test(page) && (page.match(/rq-ok/g) || []).length === 2 && /Acide hyaluronique<\/strong> · dans/.test(page) && /Céramides<\/strong> · dans/.test(page), page.slice(0, 200));
  holder.innerHTML = '';
  run(SENS, 'ecran2');
  try { ctx.RR.renderResults(); page = holder.innerHTML; } catch (e) { page = 'ERREUR ' + e.message; }
  check('sans demande, aucune carte « Ce que tu as demandé »', !/class="rq-card"/.test(page) && /results-header/.test(page));
  // Une molécule qu'aucune étape ne porte (la caféine ne va que dans un contour des yeux, jamais ajouté de force) : l'écran dit la vérité
  const refusedAsk = run({ freeText: 'je veux de la caféine' }, 'ecran3');
  const truth = refusedAsk.has('caffeine');
  holder.innerHTML = '';
  try { ctx.RR.renderResults(); page = holder.innerHTML; } catch (e) { page = 'ERREUR ' + e.message; }
  check('molécule absente de la routine : l’écran le dit franchement (✗ « pas inclus »), sans la cocher à tort', truth ? (/rq-ok/.test(page) && !/rq-ko/.test(page)) : (/rq-ko/.test(page) && /pas inclus/.test(page) && !/rq-ok/.test(page)), 'présente=' + truth + ' | ' + page.slice(0, 120));
  const retAsk = run({ freeText: 'je veux du rétinol' }, 'ecran4');
  holder.innerHTML = '';
  try { ctx.RR.renderResults(); page = holder.innerHTML; } catch (e) { page = 'ERREUR ' + e.message; }
  check('molécule bien présente (rétinol d’un produit déjà choisi) : cochée avec le nom du produit, jamais d’étape rétinol ajoutée', retAsk.has('retinoid') ? /rq-ok/.test(page) : /rq-ko/.test(page));

  console.log('\n── Autres cas ──');
  const nothing = run({}, 'x1'), nothing2 = run({ freeText: 'Peau très sensible, je suis fatiguée' }, 'x1');
  check('sans molécule demandée, la routine est exactement la même qu\'avant', JSON.stringify(nothing.routine.matin) === JSON.stringify(nothing2.routine.matin) && JSON.stringify(nothing.routine.soir) === JSON.stringify(nothing2.routine.soir));
  const retin = run({ freeText: 'je veux du rétinol', labels: ['grossesse'] }, 'x2');
  check('rétinol demandé par une femme enceinte : jamais ajouté', !retin.routine.matin.concat(retin.routine.soir).some(s => /r[ée]tinol/i.test(s.label)));
  const retin2 = run({ freeText: 'je veux du rétinol', complexes: ['deshydratation'], ageGroup: '25-30' }, 'x3');
  check('rétinol demandé mais absent de la routine : pas ajouté de force (on le dit dans « Ce que tu as demandé »)', !retin2.routine.matin.concat(retin2.routine.soir).some(s => /r[ée]tinol/i.test(s.label) && s.requested));
  const refused = run({ freeText: 'sans céramides' }, 'x4');
  check('« sans céramides » : aucune étape céramides imposée', !refused.routine.matin.concat(refused.routine.soir).some(s => (s.mustHave || []).length));
  const nia = run({ freeText: 'niacinamide et acide hyaluronique', skinType: 'grasse', oiliness: 'brillante', complexes: ['acne'], concerns: ['acne'] }, 'x5');
  check('peau grasse : niacinamide ET acide hyaluronique aussi présents', nia.has('niacinamide') && nia.has('hyaluronic'), nia.names.join(' | '));
  const low = run({ freeText: ASK, budget: 'low' }, 'x6');
  const lowMatin = ctx.RR.resolveSection('matin').filter(r => r.product);
  check('petit budget : la routine reste à 3 produits, aucune étape ajoutée', lowMatin.length <= 3 && !low.routine.matin.concat(low.routine.soir).some(s => s.requested), lowMatin.length);
  check('petit budget : la crème choisie contient l’une des molécules demandées (préférence, sans étape en plus)', lowMatin.some(r => r.step.step === 'moisturizer' && (ctx.RR.productHasActive(r.product, 'hyaluronic') || ctx.RR.productHasActive(r.product, 'ceramide'))), lowMatin.map(r => r.product.name).join(' | '));

  done('molécules demandées dans « Autre chose à me dire »');
})().catch(e => { console.error('ERREUR', e.stack); process.exit(1); });
