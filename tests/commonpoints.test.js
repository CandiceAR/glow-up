/* ============================================================
   tests/commonpoints.test.js — « Points communs » / « Différences » : uniquement des ingrédients LUS dans les deux listes INCI.
   Pas d'exemples de catégorie, pas de déduction depuis un extrait de plante, source et date des listes affichées.
   ============================================================ */
'use strict';
const { ROOT, makeFake, installFakeAI, check, done, call, path } = require('./helpers.js');
const Actifs = require(path.join(ROOT, 'lib', 'actifs.js'));
const MainActive = require(path.join(ROOT, 'lib', 'mainActive.js'));
const InciInfo = require(path.join(ROOT, 'lib', 'inciInfo.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });
installFakeAI();
const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));
const P = require(path.join(ROOT, 'data', 'products-manual.json')).products;
let n = 0;
const run = async (product, candidate) => {
  const r = await call(handler, { product, candidates: [candidate], userSkin: {}, idToken: 'tok', searchId: 'cp-' + (++n) + '-abcdef' }, '10.7.7.' + n);
  return (r.o.results || []).find(x => x.id === candidate.id);
};
const refBase = ['Aqua', 'Glycerin', 'Panthenol', 'Dimethicone', 'Cetearyl Alcohol', 'Phenoxyethanol', 'Carbomer', 'Sodium Hydroxide', 'Parfum'];

(async () => {
  console.log('── Aucun ingrédient déduit d\'un extrait de plante ──');
  const d = l => Actifs.detect(l).map(a => a.fr);
  check('« Chamomilla Recutita (Matricaria) Flower Extract » seul : pas de bisabolol', d(['aqua', 'Chamomilla Recutita (Matricaria) Flower Extract']).length === 0);
  check('« Paullinia Cupana Seed Extract » (guarana) seul : pas de caféine', d(['aqua', 'Paullinia Cupana Seed Extract']).length === 0);
  check('« Caffeine » écrit dans la liste : caféine', d(['aqua', 'Caffeine'])[0] === 'Caféine');
  check('« Phytosphingosine » n\'est plus appelé « Céramides »', d(['aqua', 'Phytosphingosine']).join() === 'Phytosphingosine');
  check('« Bisabolol » écrit dans la liste : bisabolol', d(['aqua', 'Bisabolol'])[0] === 'Bisabolol');

  console.log('\n── Choix de l\'actif principal ──');
  const refHA = require(path.join(ROOT, 'data', 'reference-inci.json')).refs.find(x => x.key === 'skinceuticals-h-a-intensifier');
  const sim = require(path.join(ROOT, 'lib', 'inciSim.js'));
  check('« H.A. Intensifier » (SkinCeuticals) = acide hyaluronique, plus « acide salicylique (BHA) »', (MainActive.resolve({ name: refHA.hero.name, inci: refHA.inci, tags: [] }, sim) || {}).family === 'ha');
  check('« H.A. » ne confond pas d\'autres noms', MainActive.fromName('Pharma A. Cream') === null && MainActive.fromName('Rétinol 1%') === 'retinoid');

  console.log('\n── Libellé de l\'actif : plus d\'exemples de catégorie ──');
  check('« actif apaisant » sans « (centella, panthénol…) »', MainActive.label('soothing') === 'actif apaisant');
  check('aucun libellé d\'actif ne cite d\'exemples (« … ») ni « centella »', MainActive.FAMILIES.every(f => !/…|centella/.test(MainActive.label(f))));

  console.log('\n── Cas : crème apaisante, ni centella ni caféine dans les listes ──');
  const prod = { brand: 'Marque A', name: 'Cica Calming Cream', category: 'moisturizer', productType: 'skincare', inciList: refBase, inciConfidence: 'high',
    inciSource: 'incidecoder', inciSourceUrl: 'https://incidecoder.com/products/marque-a-cica', inciDate: '2026-10-21' };
  const cand1 = { id: 'zz-t1', brand: 'Marque B', name: 'Cica Repair Soin', category: 'moisturizer', price: 10, volumeMl: 50,
    inciNormalized: ['Aqua', 'Glycerin', 'Panthenol', 'Chamomilla Recutita (Matricaria) Flower Extract', 'Paullinia Cupana Seed Extract', 'Cetearyl Alcohol', 'Dimethicone', 'Carbomer', 'Phenoxyethanol', 'Parfum'],
    inciVerificationStatus: 'verified', ingredientTags: [], concernTags: [], description: '' };
  const r1 = await run(prod, cand1);
  const cp1 = r1 ? r1.commonPoints.join(' | ') : '', df1 = r1 ? r1.differences.join(' | ') : '';
  check('le produit est proposé', !!r1, JSON.stringify(r1 && r1.commonPoints));
  check('« Même actif principal : Panthénol (vitamine B5) » (nom courant, réellement dans les deux listes)', r1 && r1.commonPoints[0] === 'Même actif principal : Panthénol (vitamine B5)', cp1);
  check('aucune mention de centella, bisabolol, caféine dans les points communs ni les différences', !/centella|bisabolol|caf[eé]ine/i.test(cp1 + ' ' + df1), cp1 + ' // ' + df1);
  check('le panthénol n\'est cité qu\'une fois (pas de doublon)', (cp1.match(/Panthénol/g) || []).length === 1, cp1);
  check('« pourquoi » cite le même ingrédient', r1 && /Panthénol \(vitamine B5\)/.test(r1.why) && !/centella/i.test(r1.why), r1 && r1.why);

  console.log('\n── Cas : famille annoncée par le nom, mais l\'ingrédient n\'est pas dans les listes ──');
  const cand2 = Object.assign({}, cand1, { id: 'zz-t2', inciNormalized: ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'Dimethicone', 'Carbomer', 'Phenoxyethanol', 'Parfum', 'Sodium Hydroxide'] });
  const prod2 = Object.assign({}, prod, { inciList: ['Aqua', 'Glycerin', 'Cetearyl Alcohol', 'Dimethicone', 'Carbomer', 'Phenoxyethanol', 'Parfum', 'Sodium Hydroxide'] });
  const r2 = await run(prod2, cand2);
  const cp2 = r2 ? r2.commonPoints.join(' | ') : '';
  check('on ne dit pas « même actif principal » : on dit que la famille est seulement annoncée', r2 && /^Même famille d'actif annoncée : actif apaisant/.test(r2.commonPoints[0]) && !/^Même actif principal/.test(r2.commonPoints[0]), cp2);
  check('toujours aucun exemple d\'ingrédient cité', !/centella|panth|bisabolol/i.test(cp2), cp2);

  console.log('\n── Cas : même famille d\'actif, mais pas le même ingrédient ──');
  const aha = ['Aqua', 'Glycolic Acid', 'Glycerin', 'Sodium Hydroxide', 'Phenoxyethanol', 'Carbomer', 'Parfum', 'Dimethicone'];
  const prod3 = { brand: 'Marque A', name: 'Sérum AHA', category: 'serum', productType: 'skincare', inciList: aha, inciConfidence: 'high' };
  const cand3 = { id: 'zz-t3', brand: 'Marque B', name: 'Sérum AHA doux', category: 'serum', price: 12, volumeMl: 30, inciVerificationStatus: 'verified', ingredientTags: [], concernTags: [], description: '',
    inciNormalized: ['Aqua', 'Lactic Acid', 'Glycerin', 'Sodium Hydroxide', 'Phenoxyethanol', 'Carbomer', 'Parfum', 'Dimethicone'] };
  const r4 = await run(prod3, cand3);
  check('on dit quel ingrédient est chez qui (jamais « même actif principal » faux)', r4 && /Acide glycolique chez ton produit, Acide lactique chez celui-ci/.test(r4.commonPoints[0]) && !/^Même actif principal/.test(r4.commonPoints[0]), r4 && r4.commonPoints.join(' | '));

  console.log('\n── Cas : Clarins Total Eye Lift (catalogue) contre une liste sans caféine ──');
  const m445 = P.find(x => x.id === 'm445');
  check('la liste Clarins du catalogue contient bien « Caffeine » et « Tocopheryl Acetate »', m445.inciNormalized.some(x => /^caffeine$/i.test(x)) && m445.inciNormalized.some(x => /tocopheryl acetate/i.test(x)));
  const sis = { brand: 'Sisley', name: "Sisleÿa L'Intégral Yeux et Lèvres", category: 'eye', productType: 'skincare', inciList: ['Aqua', 'Glycerin', 'Panthenol', 'Tocopheryl Acetate', 'Dimethicone', 'Cetearyl Alcohol', 'Phenoxyethanol', 'Carbomer', 'Parfum'],
    inciConfidence: 'high', inciSource: 'web', inciSourceUrl: 'https://www.sisley-paris.com/fr-FR/soin/yeux', inciDate: '2026-11-03', volumeMl: 15, refPrice: 173 };
  const c445 = { id: 'm445', brand: m445.brand, name: m445.name, category: m445.category, price: m445.price, volumeMl: m445.volumeMl, inciNormalized: m445.inciNormalized,
    inciVerificationStatus: m445.inciVerificationStatus, ingredientTags: [], concernTags: [], description: '' };
  const r3 = await run(sis, c445);
  const cp3 = r3 ? r3.commonPoints.join(' | ') : '', df3 = r3 ? r3.differences.join(' | ') : '';
  check('Clarins proposé pour Sisley', !!r3);
  check('la caféine (absente chez Sisley) est une différence, pas un point commun', !/Caféine/.test(cp3) && /Caféine/.test(df3), cp3 + ' // ' + df3);
  check('la vitamine E (Tocopheryl Acetate) et le panthénol, présents dans les deux, sont des points communs', /Vitamine E/.test(cp3) && /Panthénol/.test(cp3), cp3);
  check('source et date des deux listes : ton produit = site officiel (03/11/2026), Clarins = fiche en ligne (20/10/2026)',
    r3 && r3.inciInfo && r3.inciInfo.ref.label === 'site officiel de la marque' && r3.inciInfo.ref.date === '2026-11-03'
    && r3.inciInfo.cand.label === 'fiche produit trouvée en ligne' && r3.inciInfo.cand.date === '2026-10-20', JSON.stringify(r3 && r3.inciInfo));
  check('le nom du site tiers (incidecoder) n\'apparaît nulle part dans ce qui est affiché', !/incidecoder|openbeautyfacts/i.test(JSON.stringify(r3 && r3.inciInfo)));

  console.log('\n── Source et date des listes ──');
  check('liste lue sur photo', InciInfo.describe({ photo: true, date: '2026-11-03' }).label === 'liste lue sur la photo');
  check('aucune source enregistrée : on le dit', InciInfo.describe({}).label === 'source non enregistrée');

  done('points communs et différences (listes INCI uniquement)');
})();
