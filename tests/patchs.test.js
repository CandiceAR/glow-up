/* ============================================================
   tests/patchs.test.js — Patchs pour les yeux : un patch ne se compare qu'à un patch, prix PAR PATCH (une paire = 2 patchs).
   ============================================================ */
'use strict';
const { ROOT, makeFake, installFakeAI, check, done, call, path } = require('./helpers.js');
const UsageType = require(path.join(ROOT, 'lib', 'usageType.js'));
const WebPrice = require(path.join(ROOT, 'lib', 'webPrice.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });
installFakeAI();
const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));
const P = require(path.join(ROOT, 'data', 'products-manual.json')).products;

(async () => {
  console.log('── Type d\'usage « patchs pour les yeux » ──');
  const g = (name, category) => (UsageType.usageOf({ name, category }) || {}).group;
  check('« Patchs décongestionnants yeux », « Hydrogel Eye Patch », « Eye Mask Patches »', g('Patchs Décongestionnants Yeux', 'eye') === 'eye_patch' && g('Hydrogel Eye Patch', 'eye') === 'eye_patch' && g('Eye Mask Patches caféine', 'mask') === 'eye_patch');
  check('patch cernes / poches / under-eye', g('Patch Hydrogel Cernes', 'mask') === 'eye_patch' && g('Under Eye Patches', 'mask') === 'eye_patch');
  check('une crème contour des yeux reste « contour des yeux »', g('Eye Cream', 'eye_cream') === 'eye' && g('Crème Contour des Yeux', 'eye') === 'eye');
  check('un masque tissu du visage ou un patch anti-boutons restent des masques tissu', g('Mediheal Collagen Mask Sheet', 'mask') === 'sheet_mask' && g('Patchs anti-boutons', 'mask') === 'sheet_mask');
  const patch = UsageType.usageOf({ name: 'Eye Patch', category: 'eye' }), cream = UsageType.usageOf({ name: 'Eye Cream', category: 'eye_cream' });
  check('un patch n\'est PAS compatible avec une crème contour des yeux (et inversement)', !UsageType.compatible(patch, cream).ok && !UsageType.compatible(cream, patch).ok);
  check('patch ↔ patch : compatible, sans « format différent »', UsageType.compatible(patch, UsageType.usageOf({ name: 'Hydrogel Eye Patches', category: 'eye' })).ok);

  console.log('\n── Recherche de dupes ──');
  const cands = P.filter(p => /^(eye|eye_cream)$/.test(p.category)).map(p => ({ id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, volumeMl: p.volumeMl,
    inciNormalized: p.inciNormalized, ingredientTags: p.ingredientTags || [], concernTags: [], description: '' }));
  let n = 0;
  const search = (product, candidates) => call(handler, { product, candidates, userSkin: {}, idToken: 'tok', searchId: 'pa-' + (++n) + '-abcdef' }, '10.7.7.' + n);
  const refPatch = { brand: 'Marque Test', name: 'Patchs Décongestionnants Yeux', category: 'eye', productType: 'skincare', inciList: [], inciConfidence: 'none', estimated: true, estimateFamily: 'caffeine', refPrice: 24, patchCount: 60 };
  let o = (await search(refPatch, cands)).o;
  check('aucune crème contour des yeux n\'est proposée pour un patch (seulement des patchs)', (o.results || []).every(r => (P.find(x => x.id === r.id) || {}).patchCount > 0), o.status + ' · ' + (o.results || []).length);

  const fakePatch = id => ({ id, brand: 'Autre Marque', name: 'Hydrogel Eye Patches', category: 'eye', price: 12, patchCount: 60, ingredientTags: [], concernTags: [], description: '' });
  o = (await search(refPatch, [fakePatch('zz1')])).o;
  const r1 = (o.results || []).find(x => x.id === 'zz1');
  check('un patch est proposé pour un patch', !!r1, o.status);
  check('prix PAR PATCH : 0,20 € contre 0,40 €', r1 && r1.candUnit && r1.candUnit.unit === 'patch' && Math.abs(r1.candUnit.per100 / 100 - 0.2) < 1e-9 && r1.unitPrice && Math.abs(r1.unitPrice.ref / 100 - 0.4) < 1e-9, JSON.stringify(r1 && r1.unitPrice));
  check('prix non relevé chez un revendeur → jamais « dupe » (mais une option)', r1 && r1.level !== 'reliable' && r1.level !== 'similar' && r1.level !== 'probable', r1 && r1.level);
  check('la contenance affichée est un nombre de patchs', r1 && r1.amount && r1.amount.patchCount === 60 && !r1.amount.volumeMl);
  const noCount = Object.assign({}, refPatch); delete noCount.patchCount;
  o = (await search(noCount, [fakePatch('zz2')])).o;
  const r2 = (o.results || []).find(x => x.id === 'zz2');
  check('sans le nombre de patchs de la personne : « contenance non renseignée », jamais un dupe', r2 && r2.level === 'other' && r2.reasons.includes('ref_amount'), r2 && JSON.stringify(r2.reasons));

  console.log('\n── Relevé automatique du prix d\'un patch ──');
  const URL_P = 'https://www.sephora.fr/p/marque-test-patchs-yeux.html';
  const page = (body, title) => `<html><head><title>${title || 'Patchs Décongestionnants Yeux - Marque Test | Sephora'}</title></head><body><h1>Marque Test Patchs Décongestionnants Yeux</h1><p>${body}</p></body></html>`;
  const ai = (j) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'web_search_tool_result', content: [{ url: URL_P }] }, { type: 'text', text: JSON.stringify(j) }], usage: { input_tokens: 4000, output_tokens: 100 } }) });
  const find = (product, a, html) => WebPrice.findPrice(product, { anthropic: async () => a, fetchPage: async () => html });
  const base = { id: 'pX', brand: 'Marque Test', name: 'Patchs Décongestionnants Yeux', price: 15 };
  let r = await find(Object.assign({}, base, { patchCount: 60 }), ai({ found: true, price: 12.9, pageUrl: URL_P }), page('Boîte de 60 patchs — 12,90 €'));
  check('nombre de patchs connu : prix retenu si la page écrit « 60 patchs » et le prix', r && r.price === 12.9, JSON.stringify(r));
  r = await find(Object.assign({}, base, { patchCount: 60 }), ai({ found: true, price: 12.9, pageUrl: URL_P }), page('Boîte de 30 paires — 12,90 €'));
  check('« 30 paires » = 60 patchs : accepté', r && r.price === 12.9);
  r = await find(Object.assign({}, base, { patchCount: 60 }), ai({ found: true, price: 12.9, pageUrl: URL_P }), page('Boîte de 90 patchs — 12,90 €'));
  check('autre nombre de patchs sur la page → refusé', r === null);
  r = await find(base, ai({ found: true, price: 12.9, size: { value: 60, unit: 'patch' }, pageUrl: URL_P }), page('Boîte de 60 patchs — 12,90 €'));
  check('nombre de patchs inconnu : lu sur la page, collé au prix', r && r.patchCount === 60 && r.volumeFrom === 'page du revendeur', JSON.stringify(r));
  r = await find(base, ai({ found: true, price: 12.9, size: { value: 60, unit: 'patch' }, pageUrl: URL_P }), page('Boîte de 60 patchs. ' + 'x'.repeat(1500) + ' Prix 12,90 €'));
  check('… nombre de patchs et prix éloignés → refusé', r === null);
  r = await find(base, ai({ found: true, price: 12.9, size: { value: 30, unit: 'ml' }, pageUrl: URL_P }), page('30 ml — 12,90 €'));
  check('un patch ne peut pas être « en ml »', r === null);
  check('« 60 patchs » ou « 30 paires » reconnus ; « 60 patchworks » non', WebPrice.amountOnPage('Boîte de 60 patchs', { patchCount: 60 }) && WebPrice.amountOnPage('30 paires', { patchCount: 60 }) && !WebPrice.amountOnPage('60 patchworks', { patchCount: 60 }));

  done('patchs pour les yeux');
})().catch(e => { console.error(e); process.exit(1); });
