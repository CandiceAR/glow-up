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

  console.log('\n── Cas d\'essai : une liste sans caféine contre Clarins Total Eye Lift (liste officielle du catalogue) ──');
  const m445 = P.find(x => x.id === 'm445');
  check('la liste Clarins du catalogue est la liste officielle (42 ingrédients, « Hydroxyacetophenone », plus d\'« Albizia »)', m445.inciNormalized.length === 42 && m445.inciNormalized.includes('hydroxyacetophenone') && !m445.inciNormalized.some(x => /albizia/.test(x)) && m445.inciSourceKind === 'official');
  check('… et contient bien « Caffeine » et « Tocopheryl Acetate »', m445.inciNormalized.some(x => /^caffeine$/i.test(x)) && m445.inciNormalized.some(x => /tocopheryl acetate/i.test(x)));
  const sis = { brand: 'Marque S', name: 'Crème Yeux Essai', category: 'eye', productType: 'skincare', inciList: ['Aqua', 'Glycerin', 'Panthenol', 'Tocopheryl Acetate', 'Dimethicone', 'Cetearyl Alcohol', 'Phenoxyethanol', 'Carbomer', 'Parfum'],
    inciConfidence: 'high', inciSource: 'web', inciSourceUrl: 'https://www.sisley-paris.com/fr-FR/soin/yeux', inciDate: '2026-11-03', volumeMl: 15, refPrice: 173 };
  const c445 = { id: 'm445', brand: m445.brand, name: m445.name, category: m445.category, price: m445.price, volumeMl: m445.volumeMl, inciNormalized: m445.inciNormalized,
    inciVerificationStatus: m445.inciVerificationStatus, ingredientTags: [], concernTags: [], description: '' };
  const r3 = await run(sis, c445);
  const cp3 = r3 ? r3.commonPoints.join(' | ') : '', df3 = r3 ? r3.differences.join(' | ') : '';
  check('Clarins proposé', !!r3);
  check('la caféine (absente de la liste d\'essai) est une différence, pas un point commun', !/Caféine/.test(cp3) && /Caféine/.test(df3), cp3 + ' // ' + df3);
  check('la vitamine E (Tocopheryl Acetate) et le panthénol, présents dans les deux, sont des points communs', /Vitamine E/.test(cp3) && /Panthénol/.test(cp3), cp3);
  check('source et date : liste d\'essai = fiche en ligne (03/11/2026), Clarins = site officiel de la marque (02/11/2026)',
    r3 && r3.inciInfo && r3.inciInfo.ref.label === 'fiche produit trouvée en ligne' && r3.inciInfo.ref.date === '2026-11-03'
    && r3.inciInfo.cand.label === 'site officiel de la marque' && r3.inciInfo.cand.date === '2026-11-02', JSON.stringify(r3 && r3.inciInfo));
  check('le nom d\'un site tiers (incidecoder…) n\'apparaît nulle part dans ce qui est affiché', !/incidecoder|openbeautyfacts/i.test(JSON.stringify(r3 && r3.inciInfo)));

  console.log('\n── Le vrai cas : Sisley (liste officielle) contre Clarins (liste officielle) ──');
  const L = require(path.join(ROOT, 'lib', 'inciLookup.js'));
  const lk = await L.lookup({ brand: 'Sisley', name: "Sisleÿa L'Intégral Yeux et Lèvres" }, { useIncidecoder: false });
  check('Sisley retrouvée dans nos fiches sous son nom court (liste officielle, date 02/11/2026)', lk.found && lk.source === 'glowup' && lk.sourceLabel === 'liste officielle de la marque' && lk.retrievedAt === '2026-11-02', JSON.stringify([lk.found, lk.source, lk.sourceLabel, (lk.inciList || []).length]));
  check('la liste Sisley officielle contient « caffeine » (en 15e position) et ne contient pas le code « IL#10A »', lk.inciList.indexOf('caffeine') === 14 && !/il#10a/i.test(lk.inci));
  const real = await run({ brand: 'Sisley', name: "Sisleÿa L'Intégral Yeux et Lèvres", category: 'eye', productType: 'skincare', inciList: lk.inciList, inciConfidence: lk.confidence,
    inciSource: lk.source, inciSourceLabel: lk.sourceLabel, inciSourceUrl: lk.sourceUrl, inciDate: lk.retrievedAt, volumeMl: 15, refPrice: 173 }, c445);
  const cp5 = real ? real.commonPoints.join(' | ') : '', df5 = real ? real.differences.join(' | ') : '';
  check('la caféine est un POINT COMMUN (elle est dans les deux listes officielles)', /Caféine/.test(cp5) && !/Caféine/.test(df5), cp5 + ' // ' + df5);
  check('panthénol, vitamine E et avoine… : seulement ce qui est écrit dans les deux listes', /Panthénol/.test(cp5) && /Vitamine E/.test(cp5), cp5);
  check('adénosine, bisabolol (chez Sisley seulement) sont des différences', /Adénosine/.test(df5) && /Bisabolol/.test(df5), df5);
  check('source et date : site officiel de la marque des deux côtés, 02/11/2026', real && real.inciInfo && real.inciInfo.ref.label === 'site officiel de la marque' && real.inciInfo.cand.label === 'site officiel de la marque' && real.inciInfo.ref.date === '2026-11-02' && real.inciInfo.cand.date === '2026-11-02', JSON.stringify(real && real.inciInfo));
  check('Clarins ne cite plus l\'ancien « Albizia » ni le « Paullinia » de l\'ancienne liste', !/albizia|paullinia/i.test(JSON.stringify(m445.inciNormalized)));

  console.log('\n── Relevé de prix : les produits à la formule proche sont cherchés en premier ──');
  const WebPrice = require(path.join(ROOT, 'lib', 'webPrice.js'));
  const searched = []; const realFind = WebPrice.findPrice; WebPrice.findPrice = async c => { searched.push(c.id); return null; };
  const cheap = i => ({ id: 'zz-cheap' + i, brand: 'Marque ' + i, name: 'Cica Eye Soin ' + i, category: 'eye', price: 12 + i, volumeMl: 15, ingredientTags: [], concernTags: [], description: '' });
  const close = { id: 'zz-close', brand: 'Marque Z', name: 'Cica Eye Soin Z', category: 'eye', price: 80, volumeMl: 15, inciNormalized: m445.inciNormalized, inciVerificationStatus: 'verified', ingredientTags: [], concernTags: [], description: '' };
  const refEye = { brand: 'Sisley', name: "Sisleÿa L'Intégral Yeux et Lèvres", category: 'eye', productType: 'skincare', inciList: lk.inciList, inciConfidence: lk.confidence, volumeMl: 15, refPrice: 173 };
  const rr = await call(handler, { product: refEye, candidates: [1, 2, 3, 4, 5, 6].map(cheap).concat([close]), userSkin: {}, idToken: 'tok', searchId: 'cp-order-abcdef' }, '10.6.6.6');
  WebPrice.findPrice = realFind;
  check('la recherche a abouti', rr.o.status === 'ok', JSON.stringify(rr.o).slice(0, 200));
  check('le produit à la formule proche (zz-close) est dans les 4 relevés de prix, bien qu\'il ne soit pas le moins cher', searched.slice(0, 4).includes('zz-close'), searched.join(', '));

  console.log('\n── Eight Hour Cream ──');
  check('plus d\'actif vedette « acide salicylique » pour Eight Hour Cream (baume nourrissant)', MainActive.resolve({ name: 'Eight Hour Cream', inci: require(path.join(ROOT, 'data', 'reference-inci.json')).refs.find(x => x.key === 'elizabeth-arden-eight-hour-cream').inci, tags: [] }, require(path.join(ROOT, 'lib', 'inciSim.js'))) === null);
  check('… mais un vrai produit à l\'acide salicylique garde son actif', (MainActive.resolve({ name: 'BHA 2% Liquid', inci: ['aqua', 'salicylic acid'], tags: [] }, require(path.join(ROOT, 'lib', 'inciSim.js'))) || {}).family === 'bha');

  console.log('\n── Source et date des listes ──');
  check('liste lue sur photo', InciInfo.describe({ photo: true, date: '2026-11-03' }).label === 'liste lue sur la photo');
  check('aucune source enregistrée : on le dit', InciInfo.describe({}).label === 'source non enregistrée');

  done('points communs et différences (listes INCI uniquement)');
})();
