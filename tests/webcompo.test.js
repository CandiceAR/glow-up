/* ============================================================
   tests/webcompo.test.js — Niveaux 2 et 3 de « Trouver son dupe » (aucun réseau, aucune clé).
   Niveau 2 : l'IA cherche la composition sur le web ; la page est re-téléchargée et vérifiée (jamais crue sur parole).
   Niveau 3 : sans page vérifiée, seulement un actif PROBABLE → au mieux « dupe probable », jamais « fiable ».
   ============================================================ */
'use strict';
const { ROOT, makeFake, check, done, call, path } = require('./helpers.js');
const WebCompo = require(path.join(ROOT, 'lib', 'webCompo.js'));
const L = require(path.join(ROOT, 'lib', 'inciLookup.js'));

const fake = makeFake(); fake.install();
fake.store.set('users/alice', { subscription: { plan: 'glowplus' } });

// ── Fausses réponses de l'IA (recherche web) et fausses pages ──
const INGR = ['Aqua', 'Glycerin', 'Niacinamide', 'Panthenol', 'Sodium Hyaluronate', 'Propanediol', 'Allantoin', 'Zinc PCA', 'Xanthan Gum', 'Phenoxyethanol'];
const PAGE = `<html><head><title>Sérum Éclat 10% - Marque Test | Sephora</title></head><body><h1>Marque Test Sérum Éclat 10%</h1>
  <div>Ingrédients : ${INGR.join(', ')}.</div></body></html>`;
const URL_OK = 'https://www.sephora.fr/p/marque-test-serum-eclat.html';
const aiAnswer = (j, urls) => ({ ok: true, status: 200, json: async () => ({
  content: [
    { type: 'server_tool_use', name: 'web_search' },
    { type: 'web_search_tool_result', content: (urls || [URL_OK]).map(u => ({ type: 'web_search_result', url: u, title: 'x' })) },
    { type: 'text', text: 'Voici : ' + JSON.stringify(j) }
  ], usage: { input_tokens: 9000, output_tokens: 400, server_tool_use: { web_search_requests: 2 } } }) });
const answer = (over) => Object.assign({ found: true, pageUrl: URL_OK, pageTitle: 'Sérum Éclat', ingredients: INGR, mainFamily: 'niacinamide' }, over || {});
const run = (ai, page, brand, name) => WebCompo.find(brand || 'Marque Test', name || 'Sérum Éclat 10%', { anthropic: async () => ai, fetchPage: async () => page });

(async () => {
  console.log('── Niveau 2 : la page est re-téléchargée et vérifiée ──');
  let r = await run(aiAnswer(answer()), PAGE);
  check('page vérifiée → composition trouvée, à confirmer (« medium »), source web', r.compo && r.compo.confidence === 'medium' && r.compo.source === 'web' && r.compo.inciList.length === 10, r.compo && r.compo.sourceLabel);
  check('la source citée est la page vérifiée (lien + titre)', r.compo && r.compo.sourceUrl === URL_OK && /Sérum Éclat/.test(r.compo.matchedName));
  check('l\'actif probable accompagne la composition', r.estimate && r.estimate.family === 'niacinamide');

  r = await run(aiAnswer(answer({ ingredients: ['Aqua', 'Glycerin', 'Retinol', 'Squalane', 'Bisabolol', 'Tocopherol', 'Parfum', 'Linalool'] })), PAGE);
  check('ingrédients ABSENTS de la page (inventés) → composition refusée', r.compo === null);
  check('… mais l\'actif probable reste disponible (niveau 3)', r.estimate && r.estimate.family === 'niacinamide');

  r = await run(aiAnswer(answer({ pageUrl: 'https://www.exemple-inconnu.fr/autre' }), [URL_OK]), PAGE);
  check('adresse que la recherche n\'a pas renvoyée → refusée', r.compo === null);
  r = await run(aiAnswer(answer({ pageUrl: 'http://www.sephora.fr/p/x' }), ['http://www.sephora.fr/p/x']), PAGE);
  check('adresse non sécurisée (http) → refusée', r.compo === null);
  r = await run(aiAnswer(answer({ pageUrl: 'https://192.168.0.1/admin' }), ['https://192.168.0.1/admin']), PAGE);
  check('adresse interne (IP) → jamais téléchargée', r.compo === null);
  r = await run(aiAnswer(answer({ pageUrl: 'https://www.incidecoder.com/products/x' }), ['https://www.incidecoder.com/products/x']), PAGE);
  check('INKEEDecoder exclu (permission en attente)', r.compo === null);
  r = await run(aiAnswer(answer()), null);
  check('page impossible à télécharger → pas de composition, actif probable gardé', r.compo === null && r.estimate && r.estimate.family === 'niacinamide');
  r = await run(aiAnswer(answer()), PAGE.replace('Sérum Éclat 10% - Marque Test', 'Baby Crème Lavante - Autre Marque').replace('Marque Test Sérum Éclat 10%', 'Baby Crème Lavante'));
  check('page d\'un AUTRE produit → refusée', r.compo === null);
  r = await run(aiAnswer(answer()), PAGE.replace('Sérum Éclat 10% -', 'Sérum Éclat 10% Night -').replace('Marque Test Sérum Éclat 10%', 'Marque Test Sérum Éclat 10% Night'));
  check('variante (« night ») que la personne n\'a pas demandée → refusée', r.compo === null);
  r = await run(aiAnswer(answer({ found: false, ingredients: [] })), PAGE);
  check('l\'IA dit « pas trouvé » → pas de composition', r.compo === null);

  console.log('\n── Niveau 3 : l\'actif probable ne vient jamais d\'une composition inventée ──');
  r = await run(aiAnswer(answer({ found: false, ingredients: [], mainFamily: 'vitc' })), PAGE);
  check('famille connue → actif probable', r.estimate && r.estimate.family === 'vitc' && /vitamine C/.test(r.estimate.label));
  r = await run(aiAnswer(answer({ found: false, ingredients: [], mainFamily: 'poudre-de-perlimpinpin' })), PAGE);
  check('famille inventée → ignorée (aucun actif)', r.estimate && r.estimate.family === null);
  r = await run(aiAnswer(answer({ found: false, ingredients: [], mainFamily: null })), PAGE);
  check('« aucun actif vedette » → estimation vide mais présente (produit de base)', r.estimate && r.estimate.family === null);
  r = await WebCompo.find('Marque Test', 'Sérum', { anthropic: async () => ({ ok: false, status: 503 }) });
  check('IA indisponible (plafond de coût…) → rien, sans erreur', r.compo === null && r.estimate === null);
  let k = 0;
  r = await WebCompo.find('Marque Test', 'Sérum', { anthropic: async (route, body) => (++k === 1 ? { ok: false, status: 400 }
    : { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"mainFamily":"vitc"}' }] }) }) });
  check('recherche web indisponible (400) → repli : actif probable d\'après le nom, sans outil web', k === 2 && r.compo === null && r.estimate && r.estimate.family === 'vitc');
  r = await WebCompo.find('Marque Test', 'Sérum', { anthropic: async () => { throw new Error('réseau'); } });
  check('panne réseau → rien, sans erreur', r.compo === null && r.estimate === null);

  console.log('\n── Intégration dans la recherche de composition (cache, repli) ──');
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ products: [], count: 0 }), text: async () => '' });   // Open Beauty Facts / INKEEDecoder : rien
  let calls = 0;
  const web = async (b, n) => { calls++; return run(aiAnswer(answer({ found: false, ingredients: [], mainFamily: 'niacinamide' })), PAGE, b, n); };
  let lk = await L.lookup({ brand: 'Marque Inconnue', name: 'Sérum Fantôme' }, { useIncidecoder: false, web });
  check('rien dans les bases ouvertes → l\'actif probable est renvoyé', lk.found === false && lk.estimate && lk.estimate.family === 'niacinamide');
  lk = await L.lookup({ brand: 'Marque Inconnue', name: 'Sérum Fantôme' }, { useIncidecoder: false, web });
  check('2e demande du même produit : servie par la mémoire, sans nouvelle recherche payante', calls === 1 && lk.estimate && lk.estimate.family === 'niacinamide', calls + ' appel(s)');
  const web2 = async (b, n) => ({ compo: (await run(aiAnswer(answer()), PAGE, 'Marque Test', 'Sérum Éclat 10%')).compo, estimate: { family: 'niacinamide', label: 'niacinamide' } });
  lk = await L.lookup({ brand: 'Marque Test', name: 'Sérum Éclat 10%' }, { useIncidecoder: false, web: web2 });
  check('page vérifiée → composition « à confirmer »', lk.found && lk.confidence === 'medium' && lk.source === 'web' && lk.inciList.length === 10);
  lk = await L.lookup({ brand: 'Marque Test', name: 'Sérum Éclat 10%' }, { useIncidecoder: false });
  check('… et gardée en mémoire (sans web)', lk.found && lk.cached === true);
  lk = await L.lookup({ brand: 'Autre', name: 'Produit' }, { useIncidecoder: false });
  check('sans recherche web (coupe-circuit) : comportement d\'avant', lk.found === false && !lk.estimate);
  global.fetch = realFetch;

  console.log('\n── Recherche de dupes sans composition (« dupe probable ») ──');
  const handler = require(path.join(ROOT, 'api', 'dupeMatch.js'));
  // fausse IA de classement : note 82 % les 3 premiers candidats (une note de l'IA ne doit JAMAIS faire un « dupe similaire » sans formule comparée)
  global.fetch = async (url, opts) => {
    const text = JSON.parse(opts.body).messages[0].content;
    const ids = [...String(text).matchAll(/"id":"([^"]+)"/g)].map(m => m[1]).slice(0, 3);
    return { ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify({ results: ids.map(id => ({ id, similarity: 82, role: 'closest', skinFit: 'adapted', skinNote: 'ok' })) }) }], usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
  process.env.ANTHROPIC_API_KEY = 'dummy';
  const P = require(path.join(ROOT, 'data', 'products-manual.json')).products.filter(p => p.active !== false);
  const MAKEUP = /^(foundation|concealer|corrector|powder|primer|blush|bronzer|highlighter|mascara|eyeliner|eyebrow|eyeshadow|lipstick|lipgloss|lipliner|set|tools|multi_usage)$/;
  const cands = P.filter(p => !MAKEUP.test(p.category)).map(p => ({ id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price, volumeMl: p.volumeMl, netWeightG: p.netWeightG,
    inciNormalized: p.inciNormalized, inciVerificationStatus: p.inciVerificationStatus, ingredientTags: p.ingredientTags || [], concernTags: p.concernTags || [], description: '' }));
  let n = 0;
  const search = product => call(handler, { product, candidates: cands, userSkin: {}, idToken: 'tok', searchId: 'wc-' + (++n) + '-abcdef' }, '198.51.100.' + (n + 40));
  const base = { brand: 'Marque Inconnue', name: 'Sérum Fantôme Éclat', category: 'serum', productType: 'skincare', inciList: [], inciConfidence: 'none' };

  let o = (await search(base)).o;
  check('sans composition NI estimation : on ne devine pas (message honnête)', o.status === 'unverified' && o.results.length === 0);

  o = (await search(Object.assign({}, base, { estimated: true, estimateFamily: 'niacinamide' }))).o;
  check('actif probable (niacinamide) → des produits du même actif et du même usage', o.status === 'ok' && o.results.length > 0, o.status + ' · ' + o.results.length);
  check('… aucun n\'est « fiable » ni « similaire »', o.results.every(r => r.level === 'probable' || r.level === 'other'));
  check('… sans prix de la personne : aucun « dupe probable » (prix non prouvé)', o.results.every(r => r.level === 'other') && o.trueDupeExists === false && !o.probableDupeExists);
  check('… la note dit que la composition n\'est pas vérifiée', o.results.every(r => /non vérifiée/.test(r.compositionNote)));

  o = (await search(Object.assign({}, base, { estimated: true, estimateFamily: 'niacinamide', refPrice: 24.9, volumeMl: 30 }))).o;
  const prob = o.results.filter(r => r.level === 'probable');
  check('avec son prix : des « dupes probables » apparaissent (moins chers au ml, prix relevé)', prob.length > 0 && o.probableDupeExists === true, prob.map(r => r.id).join(','));
  check('… chacun repose sur un prix SOURCÉ et DATÉ', prob.every(r => r.priceInfo.verified && r.priceInfo.source && r.priceInfo.date));
  check('… et chacun est vraiment moins cher à l\'unité', prob.every(r => r.unitPrice && r.unitPrice.cand < r.unitPrice.ref));
  check('… jamais « dupe fiable » sans composition vérifiée', o.results.every(r => r.level !== 'reliable') && o.trueDupeExists === false);
  check('… dupes probables classés avant les autres options', (() => { const lv = o.results.map(r => r.level); const first = lv.indexOf('other'); return first < 0 || lv.slice(first).every(x => x === 'other'); })());
  check('… le texte parle d\'actif PROBABLE', prob.every(r => /probable/i.test(r.why)));

  o = (await search(Object.assign({}, base, { name: 'Crème Douce Du Quotidien', category: 'moisturizer', estimated: true, estimateFamily: '' }))).o;
  check('produit de base (aucun actif vedette) : pas de « rien trouvé »', o.status === 'ok' && o.results.length > 0, o.status + ' · ' + o.results.length);
  check('… jamais un actif vedette fort (rétinol, vitamine C, acides) proposé pour une crème de base', o.results.every(r => {
    const p = P.find(x => x.id === r.id); const m = require(path.join(ROOT, 'lib', 'mainActive.js')).resolve({ name: p.name, tags: p.ingredientTags });
    return !m || !require(path.join(ROOT, 'lib', 'mainActive.js')).isHero(m.family);
  }));

  o = (await search(Object.assign({}, base, { estimated: true, estimateFamily: 'retinoid', refPrice: 60, volumeMl: 30, category: 'serum' }))).o;
  check('actif probable rétinol : jamais plus concentré / jamais de produit sans rétinol', o.results.every(r => { const p = P.find(x => x.id === r.id); return /retin/i.test(p.name + ' ' + (p.ingredientTags || []).join(' ')); }), o.results.map(r => r.id).join(','));
  global.fetch = realFetch;

  console.log('\n── Nos sources ne sont jamais envoyées à l\'appli ──');
  const pv = require(path.join(ROOT, 'api', 'inci.js')).publicView;
  const ext = { found: true, source: 'incidecoder', sourceUrl: 'https://incidecoder.com/products/x', sourceLabel: 'INKEEDecoder (ex-INCIDecoder)', matchedName: 'Marque Sérum - Parapharmacie - VIDAL', inciList: ['aqua'] };
  let v = pv(ext);
  check('INKEEDecoder : ni nom, ni adresse envoyés à l\'appli', v.source === 'ext' && v.sourceUrl === '' && v.sourceLabel === '', JSON.stringify([v.source, v.sourceUrl, v.sourceLabel]));
  check('Open Beauty Facts et recherche web : pareil', ['openbeautyfacts', 'web'].every(x => { const o = pv(Object.assign({}, ext, { source: x })); return o.source === 'ext' && !o.sourceUrl && !o.sourceLabel; }));
  check('le titre de la page perd le nom du site (« - VIDAL »)', v.matchedName === 'Marque Sérum');
  v = pv({ found: true, source: 'glowup', sourceUrl: 'https://incidecoder.com/x', sourceLabel: 'INCIDecoder', matchedName: 'Notre fiche', inciList: ['aqua'] });
  check('nos propres fiches : adresse retirée aussi, libellé « fiche vérifiée par Glow Up »', v.source === 'glowup' && v.sourceUrl === '' && /Glow Up/.test(v.sourceLabel));
  check('aucune trace de ces noms dans la réponse complète', !/incidecoder|inkeedecoder|openbeautyfacts|vidal/i.test(JSON.stringify(pv(ext))));

  done('niveaux 2 et 3 (recherche web vérifiée, dupe probable)');
})().catch(e => { console.error(e); process.exit(1); });
