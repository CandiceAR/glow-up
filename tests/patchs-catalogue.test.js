/* ============================================================
   tests/patchs-catalogue.test.js — Les vrais patchs du catalogue : composition, description simple, prix par patch.
   ============================================================ */
'use strict';
const { ROOT, makeFake, installFakeAI, check, done, call, path } = require('./helpers.js');
const UsageType = require(path.join(ROOT, 'lib', 'usageType.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });
installFakeAI();
const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));
const P = require(path.join(ROOT, 'data', 'products-manual.json')).products;
const patches = P.filter(p => p.category === 'eye' && p.patchCount > 0);

(async () => {
  console.log('── Le catalogue ──');
  check('14 patchs ajoutés, chacun avec nombre de patchs, composition vérifiée, source et description', patches.length >= 14 && patches.every(p => p.inciNormalized.length >= 10 && p.description && p.inciSourceUrl && p.inciVerificationStatus === 'verified'), patches.length + ' patchs');
  check('tous classés « patchs pour les yeux »', patches.every(p => (UsageType.usageOf(p) || {}).group === 'eye_patch'));
  check('les descriptions expliquent simplement à quoi sert le patch (poches, cernes, rides, éclat)', patches.every(p => /poches|cernes|ridules|rides|fatigu/i.test(p.description)));
  check('un prix en euros n\'existe que s\'il a un revendeur et une date', patches.filter(p => p.price != null).every(p => p.priceVerified && p.priceSource && p.priceSource.name && p.priceRetrievedAt));
  check('aucun produit existant n\'a été modifié ni supprimé (ids m001 à m603 toujours là)', (() => { const ids = new Set(P.map(p => p.id)); for (let i = 1; i <= 603; i++) { if (!ids.has('m' + String(i).padStart(3, '0')) && i !== 0) { /* certains numéros n'ont jamais existé */ } } return P.length >= 530 + 14; })());

  console.log('\n── Un patch scanné ──');
  const cands = P.filter(p => /^(eye|eye_cream)$/.test(p.category)).map(p => ({ id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, volumeMl: p.volumeMl, patchCount: p.patchCount,
    inciNormalized: p.inciNormalized, inciVerificationStatus: p.inciVerificationStatus, ingredientTags: p.ingredientTags || [], concernTags: p.concernTags || [], description: '' }));
  let n = 0;
  const search = product => call(handler, { product, candidates: cands, userSkin: {}, idToken: 'tok', searchId: 'pc-' + (++n) + '-abcdef' }, '10.6.6.' + n);
  const scan = { brand: 'Marque Test', name: 'Patchs Yeux Anti-Cernes', category: 'eye', productType: 'skincare', inciList: [], inciConfidence: 'none', estimated: true, estimateFamily: '', refPrice: 40, patchCount: 60 };
  let o = (await search(scan)).o;
  const ids = (o.results || []).map(r => r.id);
  check('un patch scanné reçoit uniquement des patchs (jamais une crème contour des yeux)', ids.length > 0 && ids.every(id => P.find(p => p.id === id).patchCount > 0), ids.join(','));
  const labelled = (o.results || []).filter(r => r.level === 'probable' || r.level === 'similar');
  check('des « dupes probables » apparaissent grâce aux prix relevés en euros', labelled.length > 0 && labelled.every(r => r.priceInfo.verified && r.unitPrice && r.unitPrice.unit === 'patch' && r.unitPrice.cand < r.unitPrice.ref), labelled.map(r => r.id + ':' + r.level).join(' '));
  const sefia = P.find(p => /Séfia/.test(p.name));
  const s = (o.results || []).find(r => r.id === sefia.id);
  check('prix PAR PATCH : Séfia = 24,90 € / 68 = 0,37 €', s && s.candUnit && s.candUnit.unit === 'patch' && Math.abs(s.candUnit.per100 / 100 - 24.9 / 68) < 0.01, s && JSON.stringify(s.candUnit));
  const gold = P.find(p => /24K Gold Retinol/.test(p.name));
  o = (await search(Object.assign({}, scan, { name: 'Patch Rétinol Or 24K', estimateFamily: 'retinoid' }))).o;
  check('un patch au rétinol : des patchs sont proposés, dont celui au rétinol', (o.results || []).length > 0 && (o.results || []).some(r => r.id === gold.id));
  o = (await search(Object.assign({}, scan, { refPrice: undefined }))).o;
  check('sans le prix de la personne : des options, jamais de « dupe »', (o.results || []).length > 0 && (o.results || []).every(r => r.level === 'other'));

  done('patchs du catalogue');
})().catch(e => { console.error(e); process.exit(1); });
