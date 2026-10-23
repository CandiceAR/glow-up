/* ============================================================
   tests/dupes.test.js — « Trouver son dupe » : cas réels signalés par Candice, sans accès réseau.
   • Medicube Zero Pore Pad 2.0  : jamais lui-même (pluriel, 2.0, contenance), jamais un peeling à rincer
     (The Ordinary AHA 30 % + BHA 2 %), pads et lotion = « format différent » → au mieux « autre option »
   • Drunk Elephant C-Firma      : composition trouvée dans nos fiches, dupes fiables prouvés au millilitre
   • noms : Reedle Shot 100 ≠ 300, C10 ≠ C12, Teinté ≠ classique, Cream ≠ Toner
   ============================================================ */
'use strict';
const { ROOT, fb, makeFake, installFakeAI, check, done, call, path } = require('./helpers.js');
const SameProduct = require(path.join(ROOT, 'lib', 'sameProduct.js'));
const UsageType = require(path.join(ROOT, 'lib', 'usageType.js'));
const L = require(path.join(ROOT, 'lib', 'inciLookup.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });   // ces tests enchaînent beaucoup de recherches : compte illimité
installFakeAI();
const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));

const P = require(path.join(ROOT, 'data', 'products-manual.json')).products.filter(p => p.active !== false);
const g = id => P.find(p => p.id === id);
const MAKEUP = /^(foundation|concealer|corrector|powder|primer|blush|bronzer|highlighter|mascara|eyeliner|eyebrow|eyeshadow|lipstick|lipgloss|lipliner|set|tools|multi_usage)$/;
// comme le client : tout le catalogue de soin est envoyé en candidats, le serveur applique les règles
const cands = P.filter(p => !MAKEUP.test(p.category)).map(p => ({
  id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, volumeMl: p.volumeMl, netWeightG: p.netWeightG,
  inciNormalized: p.inciNormalized, inciVerificationStatus: p.inciVerificationStatus, ingredientTags: p.ingredientTags || [],
  concernTags: p.concernTags || [], description: p.description || ''
}));
let n = 0;
const search = (product, extra) => call(handler, Object.assign({ product, candidates: cands, userSkin: {}, idToken: 'tok', searchId: 'test-' + (++n) + '-abcdef' }, extra), '198.51.100.' + (n % 200 + 1));
const ids = o => (o.results || []).map(r => r.id);

(async () => {
  console.log('── Noms : le même produit, ou pas ──');
  check('« Zero Pore Pad 2.0 » = « Zero Pore Pads 2.0 » (pluriel)', SameProduct.same({ brand: 'Medicube', name: 'Zero Pore Pad 2.0' }, { brand: 'Medicube', name: 'Zero Pore Pads 2.0' }));
  check('majuscules, quantité « (70 pads) » et contenance ignorées', SameProduct.same({ brand: 'MEDICUBE', name: 'ZERO PORE PADS 2.0 (70 pads) 155ml' }, { brand: 'Medicube', name: 'Zero Pore Pad 2.0' }));
  check('nom qui répète la marque', SameProduct.same({ brand: 'Medicube', name: 'Medicube Zero Pore Pad 2.0' }, { brand: 'Medicube', name: 'Zero Pore Pads 2.0' }));
  const l485 = g('m485').inciNormalized, l356 = g('m356').inciNormalized;
  check('« 2.0 » absent d\'un côté : même marque + même composition → même produit', SameProduct.sameWithCompo({ brand: 'Medicube', name: 'Zero Pore Pad' }, { brand: 'Medicube', name: 'Zero Pore Pad 2.0' }, l485, l485));
  check('… mais compositions sans rapport → produits différents', !SameProduct.sameWithCompo({ brand: 'Medicube', name: 'Zero Pore Pad' }, { brand: 'Medicube', name: 'Zero Pore Pad 2.0' }, l485, g('m598').inciNormalized));
  check('les 2 fiches Medicube du catalogue (m356 / m485) = le même produit', SameProduct.sameWithCompo(g('m485'), g('m356'), l485, l356));
  check('Reedle Shot 100 ≠ Reedle Shot 300 (même composition)', !SameProduct.sameWithCompo(g('m497'), g('m498'), g('m497').inciNormalized, g('m498').inciNormalized));
  check('La Roche-Posay Vitamin C10 ≠ C12 (même composition)', !SameProduct.sameWithCompo(g('m256'), g('m001'), g('m256').inciNormalized, g('m001').inciNormalized));
  check('SPF50 ≠ SPF50 Teinté', !SameProduct.sameWithCompo(g('m465'), g('m466'), g('m465').inciNormalized, g('m466').inciNormalized));
  check('Torriden Cream ≠ Toner', !SameProduct.sameWithCompo(g('m538'), g('m540'), g('m538').inciNormalized, g('m540').inciNormalized));
  check('Zero Pore Pad 2.0 ≠ Zero Pore Pad 3.0', !SameProduct.same({ brand: 'Medicube', name: 'Zero Pore Pad 2.0' }, { brand: 'Medicube', name: 'Zero Pore Pad 3.0' }));

  console.log('\n── Type d\'usage et concentration ──');
  const grp = id => (UsageType.usageOf(g(id)) || {}).group;
  check('Medicube Zero Pore Pad 2.0 = pads (sans rinçage)', grp('m485') === 'pad_lotion' && UsageType.usageOf(g('m485')).format === 'pad');
  check('The Ordinary AHA 30 % + BHA 2 % Peeling Solution = peeling à rincer', grp('m400') === 'peeling');
  check('pads et peeling ne sont PAS compatibles', !UsageType.compatible(UsageType.usageOf(g('m485')), UsageType.usageOf(g('m400'))).ok);
  check('pads et lotion : compatibles mais « format différent »', (() => { const c = UsageType.compatible(UsageType.usageOf(g('m485')), UsageType.usageOf(g('m401'))); return c.ok && c.formatDiff; })());
  check('sérum ≠ crème ≠ masque à rincer', grp('m395') === 'serum' && grp('m402') === 'serum' && !UsageType.compatible(UsageType.usageOf(g('m402')), UsageType.usageOf(g('m355'))).ok);
  check('AHA 30 % bien plus concentré qu\'un soin quotidien', !!UsageType.tooStrong({ name: 'Medicube Zero Pore Pad 2.0' }, { name: 'AHA 30% + BHA 2% Peeling Solution' }));
  check('AHA 7 % vs AHA 10 % : pas « nettement plus concentré »', !UsageType.tooStrong({ name: 'Acide glycolique 10%' }, { name: 'Glycolic Acid 7% Toning Solution' }));
  check('rétinol 1 % vs rétinol 0,3 % : trop concentré', !!UsageType.tooStrong({ name: 'Retinol 0.3% Serum' }, { name: 'Retinol 1% Serum' }));

  console.log('\n── Cas réel n°1 : Medicube Zero Pore Pad 2.0 (sans prix) ──');
  const med = await L.lookup({ brand: 'Medicube', name: 'Zero Pore Pad 2.0' });
  check('composition trouvée dans nos fiches (sans réseau)', med.found && med.source === 'glowup' && med.inciList.length >= 8, med.inciList.length + ' ingrédients');
  const base = { brand: 'Medicube', name: 'Zero Pore Pad 2.0', category: 'toner', productType: 'skincare', inciList: med.inciList, inciConfidence: med.confidence };
  let { code, o } = await search(base);
  check('la recherche répond', code === 200 && (o.status === 'ok' || o.status === 'no-same-usage'), o.status + ' · ' + ids(o).join(' '));
  check('POINT 1 — le produit lui-même n\'est jamais proposé (m356 « Zero Pore Pads 2.0 », m485)', !ids(o).includes('m356') && !ids(o).includes('m485'));
  check('POINT 2 — le peeling The Ordinary AHA 30 % + BHA 2 % (m400) n\'est jamais proposé', !ids(o).includes('m400'));
  check('POINT 2 — seuls des pads / lotions sans rinçage sont proposés', (o.results || []).every(r => (UsageType.usageOf(g(r.id)) || {}).group === 'pad_lotion'), (o.results || []).map(r => (UsageType.usageOf(g(r.id)) || {}).group).join(','));
  check('POINT 2 — aucun exfoliant nettement plus concentré', (o.results || []).every(r => !UsageType.tooStrong(base, g(r.id), {})));
  check('POINT 3 — sans prix de la personne : aucun « dupe » (tout est « autre option »)', (o.results || []).every(r => r.level === 'other') && o.trueDupeExists === false);
  const lotions = (o.results || []).filter(r => UsageType.usageOf(g(r.id)).format === 'lotion');
  check('POINT 4 — pads vs lotion : « Format différent », jamais comparé au millilitre', lotions.every(r => r.formatDiff === true && r.unitPrice === null && r.level === 'other' && r.differences.some(d => /Format différent/.test(d))), lotions.length + ' lotion(s)');
  const withPrice = await search(base, {}).then(() => search(Object.assign({}, base, { refPrice: 19.9, volumeMl: 155 })));
  check('avec le prix de la personne : un format différent reste « autre option »', (withPrice.o.results || []).filter(r => r.formatDiff).every(r => r.level === 'other' && r.unitPrice === null));
  check('avec le prix : le produit lui-même est toujours exclu', !ids(withPrice.o).includes('m356') && !ids(withPrice.o).includes('m485'));

  console.log('\n── Cas réel n°2 : Drunk Elephant C-Firma (avec prix) ──');
  const cf = await L.lookup({ brand: 'Drunk Elephant', name: 'C-Firma Fresh Day Serum' });
  check('composition + contenance trouvées dans nos fiches (sans réseau)', cf.found && cf.source === 'glowup' && cf.volumeMl === 28, cf.source + ' · ' + cf.volumeMl + ' ml');
  const cfBase = { brand: 'Drunk Elephant', name: 'C-Firma Fresh Day Serum', category: 'serum', productType: 'skincare', inciList: cf.inciList, inciConfidence: cf.confidence };
  let r1 = await search(cfBase);
  check('sans prix : résultats utiles mais aucun « dupe »', r1.o.status === 'ok' && r1.o.results.length > 0 && r1.o.results.every(r => r.level === 'other'));
  r1 = await search(Object.assign({}, cfBase, { refPrice: 81, volumeMl: 28 }));
  check('avec 81 € / 28 ml : des dupes fiables, prouvés moins chers au millilitre', r1.o.trueDupeExists && r1.o.results.filter(r => r.level === 'reliable').length >= 1 && r1.o.results.filter(r => r.level !== 'other').every(r => r.unitPrice && r.unitPrice.cand < r.unitPrice.ref), r1.o.results.map(r => r.level[0] + ':' + r.id).join(' '));
  check('ne propose que des sérums (même usage)', r1.o.results.every(r => (UsageType.usageOf(g(r.id)) || {}).group === 'serum'));

  console.log('\n── Produit plus vendu, prix sourcés et raison de chaque « Autre option » (cas C-Firma) ──');
  check('La Roche-Posay Pure Vitamin C10 (plus vendu) n\'est JAMAIS proposé', !ids(r1.o).includes('m256') && g('m256').discontinued === true);
  check('C10 exclu aussi quand le navigateur ne le signale pas comme « plus vendu » (le serveur a le dernier mot)', !ids(r1.o).includes('m256'));
  const dupesOnly = r1.o.results.filter(r => r.level !== 'other');
  check('tout « dupe fiable / similaire » repose sur un prix sourcé et daté', dupesOnly.length > 0 && dupesOnly.every(r => r.priceInfo && r.priceInfo.verified && r.priceInfo.source && /^\d{4}-\d{2}-\d{2}$/.test(r.priceInfo.date)));
  const byId = id => r1.o.results.find(r => r.id === id);
  check('The Ordinary Vitamin C 23 % : 9,79 € relevé chez Redcare le 2026-10-20', byId('m402') && byId('m402').priceInfo.value === 9.79 && byId('m402').priceInfo.source === 'Redcare' && byId('m402').priceInfo.date === '2026-10-20');
  check('La Roche-Posay Pure Vitamin C12 : 39,90 € relevé chez Soin et Nature le 2026-10-20', byId('m001') && byId('m001').priceInfo.value === 39.9 && byId('m001').priceInfo.source === 'Soin et Nature');
  const nat = byId('m429');
  check('Naturium (0,67 €/ml mais prix non sourcé) : « Autre option » avec la VRAIE raison', nat && nat.level === 'other' && nat.reasons[0] === 'cand_price_unverified', nat && nat.reasons.join(', '));
  check('chaque « Autre option » donne au moins une raison', r1.o.results.filter(r => r.level === 'other').every(r => Array.isArray(r.reasons) && r.reasons.length > 0));
  // un navigateur qui tricherait (prix très bas, « vérifié ») ne peut pas fabriquer un dupe
  const cheat = cands.map(c => c.id === 'm429' ? Object.assign({}, c, { price: 0.5, priceVerified: true, priceSource: { name: 'Faux' }, priceRetrievedAt: '2026-10-23' }) : c);
  const rc = await call(handler, { product: Object.assign({}, cfBase, { refPrice: 81, volumeMl: 28 }), candidates: cheat, userSkin: {}, idToken: 'tok', searchId: 'test-cheat-abcdef' }, '198.51.100.250');
  check('prix « vérifié » envoyé par le navigateur : ignoré (le catalogue du serveur fait foi)', rc.o.results.find(r => r.id === 'm429').level === 'other');
  const rm = await search(Object.assign({}, base));
  check('Medicube : les lotions sont « Autre option » pour la raison « Format différent »', rm.o.results.filter(r => r.formatDiff).every(r => r.reasons[0] === 'format'));
  const rnp = await search(cfBase);
  check('sans prix de la personne : la raison est « prix de ton produit non renseigné »', rnp.o.results.every(r => r.reasons.indexOf('ref_price') >= 0));
  const lk2 = await L.lookup({ brand: 'Drunk Elephant', name: 'C-Firma Fresh Day Serum' });
  check('C-Firma : prix de référence 81 € relevé chez Sephora le 2026-10-20, repris automatiquement', lk2.refPrice === 81 && lk2.refPriceSource.name === 'Sephora' && lk2.refPriceDate === '2026-10-20');
  check('chaque résultat donne son prix à l\'unité (contenance connue)', r1.o.results.filter(r => g(r.id).volumeMl).every(r => r.candUnit && r.candUnit.per100 > 0));

  done('Trouver son dupe');
})();
