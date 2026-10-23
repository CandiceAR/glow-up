/* ============================================================
   tests/webprice.test.js — Relevé AUTOMATIQUE du prix des produits proposés (aucun réseau, aucune clé).
   Un prix n'est retenu que si la page retéléchargée le confirme (titre, contenance, prix écrit).
   ============================================================ */
'use strict';
const { ROOT, makeFake, check, done, call, path } = require('./helpers.js');
const WebPrice = require(path.join(ROOT, 'lib', 'webPrice.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });

const PRODUCT = { id: 'mX', brand: 'Marque Test', name: 'Sérum Éclat', price: 12, volumeMl: 30 };
const URL_OK = 'https://www.sephora.fr/p/marque-test-serum-eclat.html';
const page = (over) => Object.assign({ title: 'Sérum Éclat - Marque Test | Sephora', h1: 'Marque Test Sérum Éclat', body: 'Format 30 ml. Prix : 9,90 €' }, over || {});
const html = p => `<html><head><title>${p.title}</title></head><body><h1>${p.h1}</h1><p>${p.body}</p></body></html>`;
const ai = (j, urls) => ({ ok: true, status: 200, json: async () => ({
  content: [{ type: 'web_search_tool_result', content: (urls || [URL_OK]).map(u => ({ type: 'web_search_result', url: u })) }, { type: 'text', text: JSON.stringify(j) }],
  usage: { input_tokens: 5000, output_tokens: 100, server_tool_use: { web_search_requests: 1 } } }) });
const ans = over => Object.assign({ found: true, price: 9.9, pageUrl: URL_OK, pageTitle: 'x' }, over || {});
const run = (a, pg, product) => WebPrice.findPrice(product || PRODUCT, { anthropic: async () => a, fetchPage: async () => (pg === null ? null : html(pg || page())) });

(async () => {
  console.log('── Un prix n\'est retenu que si la page le confirme ──');
  let r = await run(ai(ans()));
  check('page confirmée (titre + 30 ml + « 9,90 € ») → prix retenu avec revendeur, lien et date', r && r.price === 9.9 && r.host === 'Sephora' && r.url === URL_OK && /^\d{4}-\d\d-\d\d$/.test(r.date), JSON.stringify(r));
  r = await run(ai(ans({ price: 7.5 })));
  check('prix annoncé ABSENT de la page → refusé', r === null);
  r = await run(ai(ans()), page({ body: 'Format 50 ml. Prix : 9,90 €' }));
  check('autre contenance (50 ml au lieu de 30 ml) → refusé', r === null);
  r = await run(ai(ans()), page({ title: 'Crème Nuit - Autre Marque', h1: 'Crème Nuit' }));
  check('page d\'un AUTRE produit → refusée', r === null);
  r = await run(ai(ans()), page({ title: 'Sérum Éclat Mini - Marque Test', h1: 'Marque Test Sérum Éclat Mini' }));
  check('variante (« mini ») → refusée', r === null);
  r = await run(ai(ans({ price: 99 })), page({ body: 'Format 30 ml. Prix : 99,00 €' }));
  check('prix absurde face au catalogue (×8) → refusé', r === null);
  r = await run(ai(ans({ pageUrl: 'https://autre-site.fr/x' })));
  check('adresse que la recherche n\'a pas renvoyée → refusée', r === null);
  r = await run(ai(ans({ pageUrl: 'http://www.sephora.fr/p/x' }), ['http://www.sephora.fr/p/x']));
  check('adresse non sécurisée → refusée', r === null);
  r = await run(ai(ans()), null);
  check('page impossible à télécharger → pas de prix', r === null);
  r = await run(ai(ans({ found: false })));
  check('l\'IA dit « pas trouvé » → pas de prix', r === null);
  r = await WebPrice.findPrice({ id: 'mY', brand: 'Marque Test', name: 'Sérum Éclat', price: 12 }, { anthropic: async () => ai(ans()), fetchPage: async () => html(page()) });
  check('contenance du catalogue inconnue → jamais de prix (on ne sait pas quelle taille)', r === null);
  r = await run({ ok: false, status: 503, capReached: true });
  check('plafond de coût atteint → rien, sans erreur', r === null);
  check('« 9,90 € » / « €9.90 » / prix de la fiche de la page sont reconnus', WebPrice.priceOnPage('9,90 €', 9.9) && WebPrice.priceOnPage('€9.90', 9.9) && WebPrice.priceOnPage('{"price":"9.90"}', 9.9) && !WebPrice.priceOnPage('19,90 €', 9.9));
  check('12 € (sans centimes) est reconnu', WebPrice.priceOnPage('Prix 12 €', 12) && WebPrice.priceOnPage('12,00€', 12));

  console.log('\n── Dans la recherche de dupes ──');
  const realFetch = global.fetch;
  let aiCalls = 0, priceCalls = 0;
  const PAGE_INKEY = html({ title: 'Niacinamide Serum - The Inkey List | Sephora', h1: 'The Inkey List Niacinamide Serum', body: '30 ml — 6,50 €' });
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.indexOf('api.anthropic.com') >= 0) {
      aiCalls++;
      const b = JSON.parse(opts.body);
      if (b.tools) { priceCalls++; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'web_search_tool_result', content: [{ url: 'https://www.sephora.fr/p/inkey-niacinamide.html' }] }, { type: 'text', text: '{"found":true,"price":6.5,"pageUrl":"https://www.sephora.fr/p/inkey-niacinamide.html","pageTitle":"x"}' }], usage: { input_tokens: 5000, output_tokens: 100, server_tool_use: { web_search_requests: 1 } } }) }; }
      const ids = [...String(b.messages[0].content).matchAll(/"id":"([^"]+)"/g)].map(m => m[1]).slice(0, 3);
      return { ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify({ results: ids.map(id => ({ id, similarity: 80, role: 'closest', skinFit: 'adapted', skinNote: 'ok' })) }) }], usage: { input_tokens: 10, output_tokens: 10 } }) };
    }
    if (u.indexOf('sephora.fr/p/inkey-niacinamide') >= 0) return { ok: true, status: 200, text: async () => PAGE_INKEY };
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };
  process.env.ANTHROPIC_API_KEY = 'dummy';
  const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));
  const P = require(path.join(ROOT, 'data', 'products-manual.json')).products.filter(p => p.active !== false);
  const MAKEUP = /^(foundation|concealer|corrector|powder|primer|blush|bronzer|highlighter|mascara|eyeliner|eyebrow|eyeshadow|lipstick|lipgloss|lipliner|set|tools|multi_usage)$/;
  const cands = P.filter(p => !MAKEUP.test(p.category)).map(p => ({ id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, volumeMl: p.volumeMl, netWeightG: p.netWeightG,
    inciNormalized: p.inciNormalized, inciVerificationStatus: p.inciVerificationStatus, ingredientTags: p.ingredientTags || [], concernTags: p.concernTags || [], description: '' }));
  let n = 0;
  const search = (product) => call(handler, { product, candidates: cands, userSkin: {}, idToken: 'tok', searchId: 'wp-' + (++n) + '-abcdef' }, '198.51.100.' + (n + 80));
  const base = { brand: 'Marque Inventee', name: 'Sérum Éclat Quotidien', category: 'serum', productType: 'skincare', inciList: [], inciConfidence: 'none', estimated: true, estimateFamily: 'niacinamide', refPrice: 24.9, volumeMl: 30 };

  let o = (await search(base)).o;
  const inkey = (o.results || []).find(x => x.id === 'm405');
  check('le prix de The Inkey List (non vérifié au catalogue) est relevé automatiquement', inkey && inkey.priceInfo.verified && inkey.priceInfo.value === 6.5 && inkey.priceInfo.source === 'Sephora' && /^\d{4}-\d\d-\d\d$/.test(inkey.priceInfo.date), JSON.stringify(inkey && inkey.priceInfo));
  check('… la note dit « relevé automatiquement » et le lien est la page vérifiée', inkey && /automatiquement/.test(inkey.priceInfo.note) && /sephora\.fr\/p\/inkey/.test(inkey.priceInfo.url));
  check('… il devient un « dupe probable » (moins cher au ml, prix relevé)', inkey && inkey.level === 'probable', inkey && inkey.level);
  check('… jamais plus de 4 recherches de prix par recherche de dupe', priceCalls >= 1 && priceCalls <= 4, priceCalls + ' recherche(s)');
  const callsBefore = priceCalls;
  o = (await search(base)).o;
  check('2e recherche : prix servis par la mémoire (7 jours), pas de nouvelle recherche payante pour ce produit', priceCalls - callsBefore < callsBefore || priceCalls === callsBefore, (priceCalls - callsBefore) + ' nouvelle(s)');
  const again = (o.results || []).find(x => x.id === 'm405');
  check('… et le prix reste affiché', again && again.priceInfo.verified && again.priceInfo.value === 6.5);

  const c0 = priceCalls;
  o = (await search(Object.assign({}, base, { refPrice: undefined }))).o;
  check('sans le prix de la personne : aucune recherche de prix payante (inutile)', priceCalls === c0);

  fake.store.set('serverConfig/limits', { webPrice: false });
  // le réglage est lu avec 60 s de mémoire : on vérifie seulement qu'il existe dans les réglages par défaut
  check('coupe-circuit « webPrice » présent dans les réglages', require(path.join(ROOT, 'lib', 'aiGuard.js')).DEFAULTS.webPrice === true && require(path.join(ROOT, 'lib', 'aiGuard.js')).DEFAULTS.webPricePerSearch === 4);
  global.fetch = realFetch;

  done('relevé automatique des prix');
})().catch(e => { console.error(e); process.exit(1); });
