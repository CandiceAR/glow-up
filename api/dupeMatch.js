/* ============================================================
   api/dupeMatch.js — Classe les dupes d'un produit parmi NOTRE catalogue.
   Entrée : {
     product: { brand, name, category, productType, inciList, inciConfidence, catalogInci, catalogTags },
     candidates: [{ id, brand, name, category, price, ingredientTags, inciNormalized, ... }],
     userSkin: { skinType, sensitivity, concerns }
   }
   + idToken (jeton Firebase : compte obligatoire), searchId (identifiant de la recherche, pour ne décompter qu'une fois),
     product.refPrice / volumeMl / netWeightG (prix et contenance de la référence, facultatifs)
   Sortie : {
     status: 'ok' | 'unverified' | 'no-shared-active' | 'none' | 'makeup-soon',
     trueDupeExists (au moins un dupe fiable ou similaire), noDupeMessage,
     results: [{ id, level: 'reliable' | 'similar' | 'other', unitPrice, similarity (interne), commonPoints[],
                 differences[], why, role, skinFit (null si l'IA n'a pas répondu), skinNote, formula (bool),
                 compositionNote, mainActive }]  ← dupes d'abord, puis « autres options » du même actif
                 (du moins cher au plus cher à l'unité), même si l'IA est indisponible,
     quota: { plan, limit, used, remaining }, externalResults: [] (toujours vide), bestSkinAlternativeId, selfDupe: null
   }
   Erreurs : 401 (compte requis) · 429 (limite par IP, ou quota du mois épuisé : error 'quota') · 503 (plafond de coût)

   RÈGLES (phase 1 — plus rien d'inventé) :
   - AUCUN dupe hors catalogue proposé de mémoire par l'IA (externalResults toujours vide) ;
   - AUCUN « ce produit est lui-même un dupe de… » issu de la mémoire de l'IA (selfDupe toujours null) ;
   - un dupe partage l'ACTIF PRINCIPAL de la référence (lib/mainActive.js : nom > INCI vérifiée > fiche
     catalogue) ; si on ne sait pas dire quel est cet actif, on ne propose aucun dupe ;
   - la composition de la référence n'est utilisée que si elle est VÉRIFIÉE (code-barres → Open Beauty Facts) ;
   - les phrases « points communs / différences » viennent de modèles fixes + données vérifiées, jamais de
     la prose de l'IA ; l'IA ne sert qu'à ordonner et à noter l'adéquation à la peau.
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Protection : limite par IP, plafond de coût global, quotas par compte (lib/aiGuard.js)
const AI = require('../lib/aiGuard.js');

// Similarité de FORMULE déterministe (familles d'actifs, dérivés, position, concentration,
// règle éliminatoire) — utilisée quand l'INCI structuré du candidat est disponible.
const _sim = require('../lib/inciSim.js');
const { similarity: _formulaSim } = _sim;
// Un produit n'est jamais son propre dupe (accents / tailles / variantes ignorés)
const SameProduct = require('../lib/sameProduct.js');
// Type d'usage (pads ≠ peeling à rincer ≠ sérum…) et règle de concentration des exfoliants / rétinoïdes
const UsageType = require('../lib/usageType.js');
// Rang (position INCI) du 1er exfoliant / rétinoïde dans une composition : plus petit = plus concentré
function _ranks(list) {
  const out = {};
  if (!Array.isArray(list) || list.length < 3) return out;
  try {
    _sim.analyze(list).actives.forEach(a => {
      if (UsageType.FAMILIES.indexOf(a.family) >= 0 && (out[a.family] == null || a.position < out[a.family])) out[a.family] = a.position;
    });
  } catch (e) { /* composition illisible : on ne compare pas les rangs */ }
  return out;
}
// Règle Glow Up : un dupe partage l'ACTIF PRINCIPAL de la référence (nom > INCI vérifiée > fiche catalogue)
const MainActive = require('../lib/mainActive.js');

// Messages affichés quand on ne peut pas (ou ne doit pas) proposer de dupe
const MSG_UNVERIFIED = "Nous n'avons pas pu vérifier la composition de ce produit ni identifier son actif principal. Nous préférons ne pas te proposer de dupe plutôt que de te donner une information non vérifiée.";
const msgNoShared = (label) => `Aucun produit de notre sélection ne partage l'actif principal de ce produit (${label}). Nous préférons ne pas te proposer une alternative qui ne ferait pas la même chose.`;
const msgNoUsage = (usageLabel) => `Des produits de notre sélection ont le même actif principal, mais ils ne s'utilisent pas de la même façon que le tien${usageLabel ? ' (' + usageLabel + ')' : ''}, ou sont nettement plus concentrés. Nous ne te les proposons pas : ils pourraient irriter ta peau.`;
const MSG_MAKEUP = 'Les dupes maquillage arrivent bientôt.';
const MAKEUP_CATS = new Set(['foundation', 'concealer', 'corrector', 'powder', 'primer', 'blush', 'bronzer', 'highlighter',
  'mascara', 'eyeliner', 'eyebrow', 'eyeshadow', 'lipstick', 'lipgloss', 'lipliner']);
const NOTE_UNVERIFIED = "Composition non vérifiée : les formules n'ont pas été comparées. L'actif principal indiqué est celui annoncé sur la fiche du produit.";
const NOTE_VERIFIED = 'Compositions comparées (liste de ton produit trouvée sur une page source, liste de ce produit issue de notre catalogue).';
const NOTE_PHOTO = "Compositions comparées. La liste de ton produit a été lue sur ta photo : à vérifier. Celle de ce produit vient de notre catalogue.";

// ── Règle du prix au millilitre (ou au gramme pour les baumes) ──
// Un produit n'est « dupe » que s'il coûte moins cher à l'unité que la référence. Sans prix ou sans contenance
// des deux côtés, on ne peut pas le prouver : « autre option ».
const STRONG = new Set(['retinoid', 'retinoid_like', 'vitc', 'aha', 'bha', 'pha', 'brightening', 'peptide', 'pdrn_nad', 'collagen', 'niacinamide']);
function _unit(price, volumeMl, weightG) {
  const p = Number(price), v = Number(volumeMl), w = Number(weightG);
  if (!(p > 0 && p < 5000)) return null;
  if (v > 0 && v < 5000) return { unit: 'ml', per100: p / v * 100 };
  if (w > 0 && w < 5000) return { unit: 'g', per100: p / w * 100 };
  return null;
}
// Niveaux (seuils à valider avec Candice) :
//   reliable = actif fort partagé + formule proche (≥ 70) + les 2 compositions vérifiées + moins cher à l'unité prouvé
//   similar  = moins cher à l'unité prouvé, mais formule moyenne, composition non vérifiée ou actif de soutien
//   other    = pas prouvé moins cher (prix ou contenance manquants, ou plus cher) → jamais appelé « dupe »
function _level(o) {
  if (!o.cheaper) return 'other';
  if (o.sim >= 70 && o.refVerified && o.candVerified && STRONG.has(o.family)) return 'reliable';
  return 'similar';
}

// ─── INCI candidats + recouvrement de composition (B-3, déterministe) ──
const OBF_UA = 'GlowUp/1.0 (dupe finder)';
// Ingrédients ultra-courants (base/technique) : ne comptent PAS dans le recouvrement
const COMMON_INCI = new Set([
  'water','glycerin','phenoxyethanol','parfum','fragrance','citric acid','sodium hydroxide',
  'tocopherol','disodium edta','tetrasodium edta','ethylhexylglycerin','xanthan gum','caprylyl glycol',
  'sodium benzoate','potassium sorbate','sodium chloride','butylene glycol','pentylene glycol','propanediol',
  '1,2-hexanediol','sodium citrate','benzyl alcohol','dehydroacetic acid','chlorphenesin','carbomer',
  'triethanolamine','tromethamine','polysorbate 20','polysorbate 60','peg-40 hydrogenated castor oil'
]);
function _canon(x) {
  x = (x || '').toLowerCase().trim();
  const syn = { 'aqua':'water','eau':'water','aqua/water':'water','aqua/water/eau':'water','water/aqua':'water',
    'aoua/water/eau':'water','glycerine':'glycerin' };
  return syn[x] || x;
}
async function _fetchCandInci(barcode) {
  try {
    const code = (barcode || '').replace(/\D/g, '');
    if (code.length < 8) return null;
    const r = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${code}.json?fields=ingredients_text,ingredients_text_fr`, { headers: { 'User-Agent': OBF_UA } });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const p = d && d.product;
    const t = p ? ((p.ingredients_text_fr || '').trim() || (p.ingredients_text || '').trim()) : '';
    if (!t) return null;
    return t.replace(/\([^)]*\)/g, ' ').replace(/['’‘]/g, ',').split(/[,•\n;]+/)
      .map(s => _canon(s.replace(/\.$/, '').replace(/\s{2,}/g, ' ')))
      .filter(s => s.length > 1 && s.length < 60).slice(0, 80);
  } catch (e) { return null; }
}
// Recouvrement pondéré par le rang INCI (les 1ers ingrédients pèsent plus), hors base/technique
function _overlap(refList, candList) {
  if (!refList || !refList.length || !candList || !candList.length) return null;
  const cand = new Set(candList.map(_canon));
  let num = 0, den = 0;
  refList.forEach((raw, i) => {
    const ing = _canon(raw);
    if (COMMON_INCI.has(ing)) return;
    const w = 1 / Math.sqrt(i + 1);
    den += w;
    if (cand.has(ing)) num += w;
  });
  if (den <= 0) return null;
  return Math.round(num / den * 100);
}

// Quota tel que l'appli peut l'afficher (« Il te reste N dupes ce mois-ci »)
const _pub = (q) => q ? { plan: q.plan, limit: q.limit, used: q.used, remaining: q.remaining } : null;

const _none = (res, status, message, quota) => res.status(200).json({
  status, trueDupeExists: false, noDupeMessage: message,
  results: [], externalResults: [], bestSkinAlternativeId: null, selfDupe: null, quota: _pub(quota)
});

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// mois suivant (le numéro du mois courant, de 1 à 12, est l'indice du mois d'après)
const _nextMonthLabel = () => MONTHS[parseInt(AI.parisMonth().slice(5, 7), 10) % 12];

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  // Protection : limite par IP, plafond de coût global, compte obligatoire (voir lib/aiGuard.js)
  const G = await AI.guard(req, res, 'dupeMatch', { ai: true, auth: true });
  if (!G) return;
  const uid = G.user.uid;

  const { product, candidates, userSkin, ageConstraint } = req.body || {};
  if (!product) return res.status(400).json({ error: 'product manquant' });
  const searchId = AI.safeId(req.body && req.body.searchId);
  // Maquillage : pas d'actif principal, donc pas de dupe pour l'instant (phase 6 du plan) — l'IA n'est pas appelée
  if (product.productType === 'makeup' || MAKEUP_CATS.has(product.category)) return _none(res, 'makeup-soon', MSG_MAKEUP);

  // Quota du mois : vérifié AVANT de travailler ; un dupe n'est décompté que lorsqu'au moins un résultat s'affiche
  const quota = await AI.quotaStatus(uid, G.cfg, searchId);
  if (quota.remaining === 0 && !quota.alreadyCounted) {
    return res.status(429).json({
      error: 'quota', quota: _pub(quota),
      message: `Tu as utilisé tes ${quota.limit} recherches de dupes ce mois-ci. Elles reviennent le 1er ${_nextMonthLabel()}.`
    });
  }

  const ageBlock = (ageConstraint && ageConstraint.age)
    ? `\n\nRÈGLE ÂGE (PRIORITAIRE) : utilisatrice de ${ageConstraint.age} ans (moins de 15). ${ageConstraint.guidance || ''} Ne propose JAMAIS un produit dont l'actif vedette est : ${(ageConstraint.restricted || []).join(', ')}. Privilégie des produits doux adaptés à une peau jeune.`
    : '';
  // On retire TOUJOURS des candidats le produit de la personne : même marque et nom proche (pluriel, « 2.0 », contenance,
  // format…), ou même marque + composition identique ou presque (au moins 90 % d'ingrédients en commun).
  const refListAny = (Array.isArray(product.inciList) && product.inciList.length >= 8) ? product.inciList
    : ((Array.isArray(product.catalogInci) && product.catalogInci.length >= 8) ? product.catalogInci : null);
  const cands0 = (Array.isArray(candidates) ? candidates : [])
    .filter(c => !SameProduct.sameWithCompo(product, c, refListAny, c.inciNormalized));

  // ── Composition de la RÉFÉRENCE ──
  //    • 'high'      : trouvée sur une page source (nos fiches, code-barres, nom identique) → vérifiée
  //    • 'confirmed' : trouvée sur une page au nom proche et CONFIRMÉE par l'utilisatrice → vérifiée
  //    • 'photo'     : lue sur la photo de l'utilisatrice → utilisée, mais jamais dite « vérifiée »
  //    Toute autre valeur (nom seulement, rien) : la composition n'est pas utilisée.
  const refConf = product.inciConfidence;
  const refTrusted = (refConf === 'high' || refConf === 'confirmed' || refConf === 'photo')
    && Array.isArray(product.inciList) && product.inciList.length >= 3;
  const refInciList = refTrusted ? product.inciList.slice(0, 40) : [];
  const refVerified = refTrusted && refConf !== 'photo';
  const ownInci = (Array.isArray(product.catalogInci) && product.catalogInci.length >= 3) ? product.catalogInci : null;

  // ── Actif principal de la référence (nom > INCI vérifiée > fiche catalogue) ──
  const refMain = MainActive.resolve({
    name: product.name,
    inci: refInciList.length ? refInciList : ownInci,
    tags: product.catalogTags
  }, _sim);
  if (!refMain) return _none(res, 'unverified', MSG_UNVERIFIED, quota);

  // ── Un dupe partage l'actif principal : on écarte tous les autres candidats AVANT toute IA ──
  const candMain = {};
  const candsActive = cands0.filter(c => {
    const trusted = Array.isArray(c.inciNormalized) && c.inciNormalized.length >= 3
      && (!c.inciVerificationStatus || c.inciVerificationStatus === 'verified');
    const m = MainActive.resolve({ name: c.name, inci: trusted ? c.inciNormalized : null, tags: c.ingredientTags }, _sim);
    if (m) candMain[c.id] = m;
    return m && m.family === refMain.family;
  });
  if (!candsActive.length) return _none(res, 'no-shared-active', msgNoShared(refMain.label), quota);

  // ── Même USAGE : pads / lotion avec pads / lotion, sérum avec sérum, crème avec crème, masque à rincer avec masque à
  //    rincer, peeling avec peeling. Un peeling concentré à rincer n'est pas une alternative à un pad quotidien. ──
  const refUsage = UsageType.usageOf(product);
  const refRank = _ranks(refListAny);
  const usageInfo = {};
  const candsUsage = candsActive.filter(c => {
    const comp = UsageType.compatible(refUsage, UsageType.usageOf(c));
    if (!comp.ok) return false;
    usageInfo[c.id] = { formatDiff: !!comp.formatDiff };
    return true;
  });
  // ── Concentration : jamais un exfoliant / rétinoïde nettement plus concentré que celui de la personne ──
  const cands = candsUsage.filter(c => !UsageType.tooStrong(product, c, {
    refGroup: refUsage && refUsage.group, refRank, candRank: _ranks(c.inciNormalized)
  }));
  if (!cands.length) return _none(res, 'no-same-usage', msgNoUsage(refUsage && refUsage.label), quota);

  // Limiter la charge : max 25 candidats, champs compacts
  const slim = cands.slice(0, 25).map(c => ({
    id: c.id, brand: c.brand, name: c.name, category: c.category,
    price: c.price, actives: (c.ingredientTags || []).slice(0, 8),
    concerns: (c.concernTags || []).slice(0, 8),
    desc: (c.description || '').slice(0, 160)
  }));

  // ── Similarité de FORMULE (déterministe) : seulement si la composition de la référence est utilisable
  //    ET que le candidat a un INCI structuré vérifié en catalogue. ──
  const formulaMap = {};   // id -> { sim, status, eliminated, cmp }
  if (refInciList.length) {
    cands.forEach(c => {
      const cInci = Array.isArray(c.inciNormalized) ? c.inciNormalized : null;
      if (!cInci || !cInci.length) return;
      const r = _formulaSim(refInciList, cInci);
      if (r.score == null) return;
      const s = slim.find(x => x.id === c.id);
      if (!s) return;
      s.formulaSim = r.score;
      s.inciStatus = c.inciVerificationStatus || 'verified';
      formulaMap[c.id] = { sim: r.score, status: s.inciStatus, eliminated: r.extraPotent.length > 0,
        cmp: MainActive.compare(refInciList, cInci, _sim) };
    });
  }

  // B-3 : à défaut d'INCI catalogue, INCI réel (Open Beauty Facts) des candidats ayant un code-barres
  const refCanon = refInciList.map(_canon);
  if (refCanon.length) {
    const withBar = cands.filter(c => c.barcode && !formulaMap[c.id]).slice(0, 12);
    await Promise.allSettled(withBar.map(async c => {
      const ci = await _fetchCandInci(c.barcode);
      if (ci && ci.length) {
        const s = slim.find(x => x.id === c.id);
        if (s) { s.overlapINCI = _overlap(refCanon, ci); }
      }
    }));
  }

  const validIds = new Set(slim.map(c => c.id));

  const prompt = `Tu aides à ordonner des produits de beauté de NOTRE catalogue qui ont TOUS le même actif principal que le produit de l'utilisatrice (${refMain.label}).

PRODUIT DE L'UTILISATRICE : ${JSON.stringify({ brand: product.brand, name: product.name, category: product.category, type: product.productType })}

PROFIL DE PEAU (info complémentaire uniquement) : ${JSON.stringify(userSkin || {})}

CANDIDATS (choisis UNIQUEMENT parmi ceux-ci, via leur "id") :
${JSON.stringify(slim)}

Ta mission : classer au maximum 3 candidats, du plus proche au moins proche, par catégorie, fonction et prix. Les champs "formulaSim" / "overlapINCI", quand ils existent, sont calculés sur de vraies compositions : ils font autorité (ta "similarity" reste à ±8 de formulaSim).${ageBlock}

RÈGLES IMPÉRATIVES :
- N'écris AUCUNE information sur la composition, le prix ou les actifs d'un produit qui ne figure pas dans les données ci-dessus. Pas de souvenirs, pas de supposition.
- Un candidat de catégorie très différente (ex. nettoyant vs sérum) n'est pas un dupe : ne l'inclus pas.
- Le profil de peau sert uniquement à remplir "skinFit"/"skinNote" ; la recherche part du produit.
- "skinFit" : "adapted" / "caution" / "unfit". "skinNote" : une phrase courte, sans citer d'ingrédient absent des données.
- "bestSkinAlternativeId" : parmi les candidats, celui qui est le mieux adapté à SA peau (id) ; null si identique au meilleur dupe ou aucun.
- Si aucun candidat ne convient, mets "trueDupeExists": false et "results": [].

Retourne UNIQUEMENT ce JSON, sans texte avant/après :
{
  "trueDupeExists": boolean,
  "results": [
    { "id": "id d'un candidat", "similarity": 0-100, "role": "closest | value | cheapest",
      "skinFit": "adapted | caution | unfit", "skinNote": "phrase courte" }
  ],
  "bestSkinAlternativeId": "id ou null"
}`;

  // ── Classement par l'IA (facultatif) : notes de peau + ordre des 3 meilleurs.
  //    Si elle est indisponible (panne, plafond de coût), on affiche quand même les options du même actif. ──
  let parsed = { results: [], bestSkinAlternativeId: null };
  try {
    const resp = await AI.anthropic('dupeMatch', apiKey, {
      model:      'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }]
    });
    if (resp.ok) {
      const aiData  = await resp.json();
      const rawText = aiData?.content?.[0]?.text?.trim() || '';
      try { parsed = JSON.parse(rawText); }
      catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { /* classement ignoré */ } }
      }
    } else {
      console.error('[dupeMatch] classement IA indisponible :', resp.status);
    }
  } catch (err) {
    console.error('[dupeMatch] classement IA en erreur :', err.message);
  }

  const FITS = ['adapted', 'caution', 'unfit'];
  const ROLES = ['closest', 'value', 'cheapest'];

  // Réconcilie la similarité de l'IA avec la similarité de FORMULE déterministe (fait autorité)
  const _reconcile = (id, aiSim) => {
    const f = formulaMap[id];
    if (!f) return aiSim;
    if (f.eliminated) return Math.min(aiSim, 20);
    let sim = Math.min(aiSim, f.sim + 8);
    if (f.status === 'partial') sim = Math.min(sim, 70);
    else if (f.status !== 'verified') sim = Math.min(sim, 50);
    return Math.max(0, Math.min(100, sim));
  };

  // Phrases à MODÈLE FIXE à partir de données vérifiées (jamais la prose de l'IA)
  const _templates = (id) => {
    const f = formulaMap[id];
    const common = [`Même actif principal : ${refMain.label}`];
    const diffs = [];
    if (f && f.cmp && !f.cmp.eliminated) {
      const c = f.cmp;
      if (c.common.length) common.push(`Actifs en commun dans la composition : ${c.common.join(', ')}`);
      if (c.onlyRef.length) diffs.push(`Présent dans ton produit mais pas dans celui-ci : ${c.onlyRef.join(', ')}`);
      if (c.onlyCand.length) diffs.push(`Présent dans celui-ci en plus : ${c.onlyCand.join(', ')}`);
      if (c.derivMismatch.length) diffs.push(`Forme de l'actif différente : ${c.derivMismatch.slice(0, 2).map(x => x.replace('≠', ' ≠ ')).join(' ; ')}`);
    }
    return { common: common.slice(0, 4), diffs: diffs.slice(0, 3), formula: !!(f && f.cmp && !f.cmp.eliminated) };
  };

  const refUnit = _unit(product.refPrice, product.volumeMl, product.netWeightG);
  const MIN_SIM = 55;   // en dessous, la formule est trop différente pour parler de « dupe »

  // Choix de l'IA (3 au plus)
  const picked = new Map();
  (Array.isArray(parsed.results) ? parsed.results : [])
    .filter(r => r && validIds.has(r.id)).slice(0, 3).forEach(r => picked.set(r.id, r));

  // Une fiche de résultat pour CHAQUE produit du même actif : les « dupes » (moins chers à l'unité, formule proche)
  // et les « autres options ». r = choix de l'IA ou null.
  const build = (c, r) => {
    const t = _templates(c.id), f = formulaMap[c.id];
    const sim = r
      ? _reconcile(c.id, Math.max(0, Math.min(100, parseInt(r.similarity, 10) || 0)))
      : (f ? (f.eliminated ? Math.min(f.sim, 20) : f.sim) : null);
    const cu = _unit(c.price, c.volumeMl, c.netWeightG);
    // Pads et lotion ne se comparent pas au millilitre : format différent → au mieux « autre option »
    const formatDiff = !!(usageInfo[c.id] && usageInfo[c.id].formatDiff);
    const cheaper = !formatDiff && !!(refUnit && cu && refUnit.unit === cu.unit && cu.per100 < refUnit.per100);
    const candVerified = !!(f && f.status === 'verified' && f.cmp && !f.cmp.eliminated);
    // Un dupe exige une formule connue et assez proche ; sinon c'est une « autre option »
    const level = (sim != null && sim >= MIN_SIM) ? _level({ cheaper, sim, refVerified, candVerified, family: refMain.family }) : 'other';
    const diffs = t.diffs.slice();
    if (formatDiff) {
      const cu2 = UsageType.usageOf(c);
      diffs.unshift(`Format différent : ${UsageType.FORMAT_LABEL[refUsage.format] || refUsage.format} (ton produit) / ${UsageType.FORMAT_LABEL[cu2.format] || cu2.format} (celui-ci)`);
    }
    return {
      id: c.id, level, formatDiff,
      unitPrice: (!formatDiff && refUnit && cu && refUnit.unit === cu.unit)
        ? { unit: refUnit.unit, ref: Math.round(refUnit.per100 * 100) / 100, cand: Math.round(cu.per100 * 100) / 100 } : null,
      candUnit: cu ? { unit: cu.unit, per100: Math.round(cu.per100 * 100) / 100 } : null,     // prix de ce produit à l'unité (affiché sur la carte)
      sortUnit: cu ? cu.per100 : null, sortPrice: Number(c.price) > 0 ? Number(c.price) : null,
      similarity: sim == null ? 0 : sim,
      commonPoints: t.common, differences: diffs.slice(0, 4),
      why: `Même actif principal que ton produit : ${refMain.label}.`,
      role: r && ROLES.includes(r.role) ? r.role : 'closest',
      skinFit: r && FITS.includes(r.skinFit) ? r.skinFit : null,        // null : l'IA ne s'est pas prononcée
      skinNote: r && typeof r.skinNote === 'string' ? r.skinNote.slice(0, 200) : '',
      source: 'catalog', formula: t.formula,
      compositionNote: t.formula ? (refVerified ? NOTE_VERIFIED : NOTE_PHOTO) : NOTE_UNVERIFIED,
      mainActive: refMain.label, confidence: t.formula ? 'high' : 'low'
    };
  };

  const all = cands.slice(0, 25).map(c => build(c, picked.get(c.id) || null));
  const LV = { reliable: 0, similar: 1, other: 2 };
  const INF = Number.POSITIVE_INFINITY;
  all.sort((a, b) => {
    if (LV[a.level] !== LV[b.level]) return LV[a.level] - LV[b.level];
    if (a.level !== 'other') return b.similarity - a.similarity;                 // dupes : formule la plus proche d'abord
    // autres options : du moins cher au plus cher à l'unité (au millilitre / gramme) quand on le sait, sinon au prix
    const ua = a.sortUnit == null ? INF : a.sortUnit, ub = b.sortUnit == null ? INF : b.sortUnit;
    if (ua !== ub) return ua - ub;
    return (a.sortPrice == null ? INF : a.sortPrice) - (b.sortPrice == null ? INF : b.sortPrice);
  });
  const dupes = all.filter(r => r.level !== 'other').slice(0, 6);
  const others = all.filter(r => r.level === 'other').slice(0, 6);
  const results = dupes.concat(others).map(r => { const o = Object.assign({}, r); delete o.sortUnit; delete o.sortPrice; return o; });

  const bestAlt = (parsed.bestSkinAlternativeId && validIds.has(parsed.bestSkinAlternativeId))
    ? parsed.bestSkinAlternativeId : null;

  // Un dupe est décompté (une seule fois par recherche) puisqu'au moins un résultat s'affiche
  let quotaOut = quota;
  if (results.length) {
    const c = await AI.consumeDupe(uid, searchId, G.cfg);
    if (c.counted) quotaOut = Object.assign({}, quota, { used: c.used, remaining: c.remaining });
  }

  return res.status(200).json({
    status: results.length ? 'ok' : 'none',
    trueDupeExists: dupes.length > 0,
    noDupeMessage: '',
    results, externalResults: [], bestSkinAlternativeId: bestAlt, selfDupe: null,
    quota: _pub(quotaOut)
  });
};
