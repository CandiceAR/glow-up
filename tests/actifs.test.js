/* ============================================================
   tests/actifs.test.js — Table des actifs clés : même actif = point commun, même sous un autre nom INCI.
   Les noms affichés sont toujours des noms simples en français, jamais des noms INCI.
   ============================================================ */
'use strict';
const { ROOT, makeFake, installFakeAI, check, done, call, path } = require('./helpers.js');
const Actifs = require(path.join(ROOT, 'lib', 'actifs.js'));
const L = require(path.join(ROOT, 'lib', 'inciLookup.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });
installFakeAI();
const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));
const P = require(path.join(ROOT, 'data', 'products-manual.json')).products;
const cand = id => { const p = P.find(x => x.id === id); return { id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, volumeMl: p.volumeMl, netWeightG: p.netWeightG,
  inciNormalized: p.inciNormalized, inciVerificationStatus: p.inciVerificationStatus, ingredientTags: p.ingredientTags || [], concernTags: [], description: '' }; };
let n = 0;
const compare = async (brand, name, cat, candId) => {
  const lk = await L.lookup({ brand, name }, { useIncidecoder: false });
  const prod = { brand, name, category: cat, productType: 'skincare', inciList: lk.inciList, inciConfidence: 'high' };
  const r = await call(handler, { product: prod, candidates: [cand(candId)], userSkin: {}, idToken: 'tok', searchId: 'ac-' + (++n) + '-abcdef' }, '10.9.9.' + n);
  return { lk, r: (r.o.results || []).find(x => x.id === candId), o: r.o };
};

(async () => {
  console.log('── La table : plusieurs noms INCI = un seul actif ──');
  const d = l => Actifs.detect(l).map(a => a.fr);
  check('Tranexamic Acid et Cetyl Tranexamate Mesylate → « Acide tranexamique »', d(['aqua', 'Tranexamic Acid'])[0] === 'Acide tranexamique' && d(['aqua', 'Cetyl Tranexamate Mesylate'])[0] === 'Acide tranexamique' && d(['aqua', 'Cetyl Tranexamate HCl'])[0] === 'Acide tranexamique');
  check('Vitamine C : 7 formes reconnues', ['Ascorbic Acid', 'Ascorbyl Glucoside', 'Sodium Ascorbyl Phosphate', 'Magnesium Ascorbyl Phosphate', '3-O-Ethyl Ascorbic Acid', 'Tetrahexyldecyl Ascorbate', 'Ascorbyl Tetraisopalmitate'].every(x => d(['aqua', x])[0] === 'Vitamine C'));
  check('Rétinoïdes : Retinol, Retinal, Retinaldehyde, Retinyl Palmitate, HPR', ['Retinol', 'Retinal', 'Retinaldehyde', 'Retinyl Palmitate', 'Hydroxypinacolone Retinoate'].every(x => d(['aqua', x])[0] === 'Rétinoïdes'));
  check('Acide kojique, arbutine, hyaluronique, glycolique, salicylique, azélaïque, férulique, vitamine E',
    d(['aqua', 'Kojic Dipalmitate'])[0] === 'Acide kojique' && d(['aqua', 'Alpha-Arbutin'])[0] === 'Arbutine' && d(['aqua', 'Hydrolyzed Hyaluronic Acid'])[0] === 'Acide hyaluronique'
    && d(['aqua', 'Glycolic Acid'])[0] === 'Acide glycolique' && d(['aqua', 'Salicylic Acid'])[0] === 'Acide salicylique' && d(['aqua', 'Azelaic Acid'])[0] === 'Acide azélaïque'
    && d(['aqua', 'Ferulic Acid'])[0] === 'Acide férulique' && d(['aqua', 'Tocopherol'])[0] === 'Vitamine E');
  check('la vitamine E en simples traces (fin de liste) n\'est pas comptée', d([...Array(30).fill('x'), 'Tocopherol']).length === 0);
  check('ascorbyl ≠ rétinyl : pas de confusion', d(['aqua', 'Ascorbyl Glucoside']).join() === 'Vitamine C' && d(['aqua', 'Retinyl Palmitate']).join() === 'Rétinoïdes');
  const c1 = Actifs.compare(['aqua', 'Tranexamic Acid', 'Niacinamide'], ['aqua', 'Cetyl Tranexamate Mesylate', 'Niacinamide']);
  check('forme différente → « (sous une autre forme) » ; même forme → nom seul', c1.common.map(x => x.label).join('|') === 'Acide tranexamique (sous une autre forme)|Niacinamide (vitamine B3)', c1.common.map(x => x.label).join('|'));
  check('jamais le mot « identique »', !/identique/i.test(JSON.stringify(c1)));

  console.log('\n── Cas 1 : SkinCeuticals Discoloration Defense / Good Molecules Discoloration Correcting Serum ──');
  let x = await compare('SkinCeuticals', 'Discoloration Defense', 'serum', 'm428');
  check('composition SkinCeuticals trouvée dans nos fiches', x.lk.found && x.lk.source === 'glowup');
  check('« Acide tranexamique (sous une autre forme) » est un point commun', x.r && x.r.commonPoints.includes('Acide tranexamique (sous une autre forme)'), x.r && x.r.commonPoints.join(' | '));
  check('composition = liste publiée par la marque (14 ingrédients, avec Kojic Acid, sans Phenoxyethanol)', x.lk.inciList.length === 14 && x.lk.inciList.includes('kojic acid') && !x.lk.inciList.includes('phenoxyethanol'), x.lk.inciList.join(', '));
  check('« Serum » et « Sérum » ouvrent cette même fiche (pas un autre produit)', ['Discoloration Defense Serum', 'Discoloration Defense Sérum', 'Discoloration Defense Serum 30 ml'].every(n => { const o = L._internal.fromOwn('SkinCeuticals', n); return o && o.matchedName === 'SkinCeuticals Discoloration Defense' && o.inciList.includes('kojic acid'); }));
  check('un autre produit SkinCeuticals (C E Ferulic) garde sa propre fiche', (L._internal.fromOwn('SkinCeuticals', 'C E Ferulic') || {}).matchedName === 'SkinCeuticals C E Ferulic');
  check('« Acide kojique » apparaît (présent chez SkinCeuticals, absent chez Good Molecules)', x.r && x.r.differences.join(' ').includes('Acide kojique'), x.r && x.r.differences.join(' | '));
  check('plus de « centella » ni « panthénol » inventés dans les différences', x.r && !/centella|panth/i.test(x.r.commonPoints.concat(x.r.differences).join(' ')));
  check('l\'association de dupe de la fiche est inchangée (m253)', require(path.join(ROOT, 'data', 'reference-inci.json')).refs.find(r => r.key === 'skinceuticals-discoloration-defense').dupeId === 'm253');
  check('« Niacinamide (vitamine B3) » est un point commun', x.r && x.r.commonPoints.includes('Niacinamide (vitamine B3)'));
  check('aucun nom INCI à l\'écran', x.r && !/tranexam(ic|ate)|mesylate|ascorb|niacinamide$/i.test(x.r.commonPoints.concat(x.r.differences).join(' ').replace(/Niacinamide \(vitamine B3\)/g, '')));

  console.log('\n── Cas 2 : Drunk Elephant C-Firma / The Ordinary Vitamin C Suspension 23 % ──');
  x = await compare('Drunk Elephant', 'C-Firma Fresh Day Serum', 'serum', 'm402');
  check('« Vitamine C » est un point commun', x.r && x.r.commonPoints.includes('Vitamine C'), x.r && x.r.commonPoints.join(' | '));
  check('« Acide hyaluronique » est un point commun', x.r && x.r.commonPoints.includes('Acide hyaluronique'));
  check('les actifs de C-Firma absents chez The Ordinary sont dits en français', x.r && x.r.differences.join(' ').includes('Acide férulique'), x.r && x.r.differences.join(' | '));

  console.log('\n── Cas 3 : rétinol 1 % / The Ordinary Retinol 0,5 % in Squalane ──');
  const ref = ['Aqua', 'Glycerin', 'Retinol', 'Squalane', 'Tocopherol', 'Niacinamide', 'Peptides'];
  const prod = { brand: "Paula's Choice", name: 'Clinical 1% Retinol Treatment', category: 'serum', productType: 'skincare', inciList: ref.map(s => s.toLowerCase()), inciConfidence: 'high' };
  const r3 = await call(handler, { product: prod, candidates: [cand('m396')], userSkin: {}, idToken: 'tok', searchId: 'ac-r3-abcdef' }, '10.9.8.1');
  const y = (r3.o.results || []).find(z => z.id === 'm396');
  check('le rétinol 0,5 % est proposé pour un rétinol 1 % (le pourcentage des noms fait foi)', !!y, r3.o.status);
  check('« Rétinoïdes » est un point commun', y && y.commonPoints.includes('Rétinoïdes'), y && y.commonPoints.join(' | '));
  const r3b = await call(handler, { product: Object.assign({}, prod, { name: 'Retinol 0.3% Serum' }), candidates: [cand('m396')], userSkin: {}, idToken: 'tok', searchId: 'ac-r3b-abcdef' }, '10.9.8.2');
  check('… mais un rétinol 0,5 % n\'est PAS proposé pour un rétinol 0,3 % (trop concentré) — règle de sécurité gardée', !(r3b.o.results || []).some(z => z.level !== 'type' && z.id === 'm396'));

  done('table des actifs (points communs en français)');
})().catch(e => { console.error(e); process.exit(1); });
