/* ============================================================
   api/dupeMatch.js — Classe les dupes d'un produit parmi NOTRE catalogue.
   Entrée : {
     product: { brand, name, category, productType, inciList, inciConfidence, catalogInci, catalogTags },
     candidates: [{ id, brand, name, category, price, ingredientTags, inciNormalized, ... }],
     userSkin: { skinType, sensitivity, concerns }
   }
   Sortie : {
     status: 'ok' | 'unverified' | 'no-shared-active' | 'none',
     trueDupeExists, noDupeMessage,
     results: [{ id, similarity (interne, non affiché), commonPoints[], differences[], why, role,
                 skinFit, skinNote, formula (bool), compositionNote, mainActive }],
     externalResults: [] (toujours vide), bestSkinAlternativeId, selfDupe: null
   }

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

// Similarité de FORMULE déterministe (familles d'actifs, dérivés, position, concentration,
// règle éliminatoire) — utilisée quand l'INCI structuré du candidat est disponible.
const _sim = require('../lib/inciSim.js');
const { similarity: _formulaSim } = _sim;
// Un produit n'est jamais son propre dupe (accents / tailles / variantes ignorés)
const { same: _sameProduct } = require('../lib/sameProduct.js');
// Règle Glow Up : un dupe partage l'ACTIF PRINCIPAL de la référence (nom > INCI vérifiée > fiche catalogue)
const MainActive = require('../lib/mainActive.js');

// Messages affichés quand on ne peut pas (ou ne doit pas) proposer de dupe
const MSG_UNVERIFIED = "Nous n'avons pas pu vérifier la composition de ce produit ni identifier son actif principal. Nous préférons ne pas te proposer de dupe plutôt que de te donner une information non vérifiée.";
const msgNoShared = (label) => `Aucun produit de notre sélection ne partage l'actif principal de ce produit (${label}). Nous préférons ne pas te proposer une alternative qui ne ferait pas la même chose.`;
const NOTE_UNVERIFIED = "Composition non vérifiée : les formules n'ont pas été comparées. L'actif principal indiqué est celui annoncé sur la fiche du produit.";
const NOTE_VERIFIED = 'Compositions comparées (liste INCI de ton produit vérifiée sur Open Beauty Facts, liste de ce produit issue de notre catalogue).';

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

const _none = (res, status, message) => res.status(200).json({
  status, trueDupeExists: false, noDupeMessage: message,
  results: [], externalResults: [], bestSkinAlternativeId: null, selfDupe: null
});

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const { product, candidates, userSkin, ageConstraint } = req.body || {};
  if (!product) return res.status(400).json({ error: 'product manquant' });
  const ageBlock = (ageConstraint && ageConstraint.age)
    ? `\n\nRÈGLE ÂGE (PRIORITAIRE) : utilisatrice de ${ageConstraint.age} ans (moins de 15). ${ageConstraint.guidance || ''} Ne propose JAMAIS un produit dont l'actif vedette est : ${(ageConstraint.restricted || []).join(', ')}. Privilégie des produits doux adaptés à une peau jeune.`
    : '';
  // On retire des candidats tout produit qui EST le produit scanné (même fiche sous un autre nom)
  const cands0 = (Array.isArray(candidates) ? candidates : []).filter(c => !_sameProduct(product, c));

  // ── Composition de la RÉFÉRENCE : utilisée seulement si elle est VÉRIFIÉE ──
  //    (code-barres → Open Beauty Facts = confiance « high » ; une recherche par nom n'est pas assez sûre)
  const refInciList = (product.inciConfidence === 'high' && Array.isArray(product.inciList) && product.inciList.length >= 3)
    ? product.inciList.slice(0, 40) : [];
  const ownInci = (Array.isArray(product.catalogInci) && product.catalogInci.length >= 3) ? product.catalogInci : null;

  // ── Actif principal de la référence (nom > INCI vérifiée > fiche catalogue) ──
  const refMain = MainActive.resolve({
    name: product.name,
    inci: refInciList.length ? refInciList : ownInci,
    tags: product.catalogTags
  }, _sim);
  if (!refMain) return _none(res, 'unverified', MSG_UNVERIFIED);

  // ── Un dupe partage l'actif principal : on écarte tous les autres candidats AVANT toute IA ──
  const candMain = {};
  const cands = cands0.filter(c => {
    const trusted = Array.isArray(c.inciNormalized) && c.inciNormalized.length >= 3
      && (!c.inciVerificationStatus || c.inciVerificationStatus === 'verified');
    const m = MainActive.resolve({ name: c.name, inci: trusted ? c.inciNormalized : null, tags: c.ingredientTags }, _sim);
    if (m) candMain[c.id] = m;
    return m && m.family === refMain.family;
  });
  if (!cands.length) return _none(res, 'no-shared-active', msgNoShared(refMain.label));

  // Limiter la charge : max 25 candidats, champs compacts
  const slim = cands.slice(0, 25).map(c => ({
    id: c.id, brand: c.brand, name: c.name, category: c.category,
    price: c.price, actives: (c.ingredientTags || []).slice(0, 8),
    concerns: (c.concernTags || []).slice(0, 8),
    desc: (c.description || '').slice(0, 160)
  }));

  // ── Similarité de FORMULE (déterministe) : seulement si la composition de la référence est vérifiée
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

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error('[dupeMatch] API error:', resp.status, errData);
      return res.status(502).json({ error: 'API Anthropic indisponible' });
    }

    const aiData  = await resp.json();
    const rawText = aiData?.content?.[0]?.text?.trim() || '';
    let parsed;
    try { parsed = JSON.parse(rawText); }
    catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Réponse non parseable');
      parsed = JSON.parse(jsonMatch[0]);
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

    const results = Array.isArray(parsed.results) ? parsed.results
      .filter(r => r && validIds.has(r.id))
      .slice(0, 3)
      .map(r => {
        const t = _templates(r.id);
        return {
          id:              r.id,
          similarity:      _reconcile(r.id, Math.max(0, Math.min(100, parseInt(r.similarity, 10) || 0))),
          commonPoints:    t.common,
          differences:     t.diffs,
          why:             `Même actif principal que ton produit : ${refMain.label}.`,
          role:            ROLES.includes(r.role) ? r.role : 'closest',
          skinFit:         FITS.includes(r.skinFit) ? r.skinFit : 'caution',
          skinNote:        typeof r.skinNote === 'string' ? r.skinNote.slice(0, 200) : '',
          source:          'catalog',
          formula:         t.formula,
          compositionNote: t.formula ? NOTE_VERIFIED : NOTE_UNVERIFIED,
          mainActive:      refMain.label,
          confidence:      t.formula ? 'high' : 'low'
        };
      }) : [];

    results.sort((a, b) => b.similarity - a.similarity);

    // Seuil minimum : en dessous, ce n'est pas un vrai dupe → on ne le propose pas
    const MIN_SIM = 55;
    const strongCatalog = results.filter(r => r.similarity >= MIN_SIM);
    const trueDupeExists = Boolean(parsed.trueDupeExists) && strongCatalog.length > 0;
    const bestAlt = (parsed.bestSkinAlternativeId && validIds.has(parsed.bestSkinAlternativeId))
      ? parsed.bestSkinAlternativeId : null;

    return res.status(200).json({
      status: trueDupeExists ? 'ok' : 'none',
      trueDupeExists,
      noDupeMessage: trueDupeExists ? '' : "Les produits de notre sélection qui partagent l'actif principal de ton produit restent trop différents pour être de vrais dupes. Nous préférons ne pas t'en proposer un approximatif.",
      results: trueDupeExists ? strongCatalog : [],
      externalResults: [],
      bestSkinAlternativeId: bestAlt,
      selfDupe: null
    });

  } catch (err) {
    console.error('[dupeMatch] erreur:', err.message);
    return res.status(500).json({ error: 'Recherche de dupe IA échouée' });
  }
};
