/* ============================================================
   api/dupeMatch.js — Classe les meilleurs dupes d'un produit via Claude
   Entrée : {
     product: { brand, name, category, keyActives, texture, finish, coverage, shade, estPrice, productType },
     candidates: [{ id, brand, name, category, price, ingredientTags, concernTags, description }],
     userSkin: { skinType, sensitivity, concerns }
   }
   Sortie : {
     trueDupeExists, noDupeMessage,
     results: [{ id, similarity, commonPoints[], differences[], why, role, skinFit, skinNote }],
     bestSkinAlternativeId
   }
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const { product, candidates, userSkin, ageConstraint } = req.body || {};
  if (!product) return res.status(400).json({ error: 'product manquant' });
  const ageBlock = (ageConstraint && ageConstraint.age)
    ? `\n\nRÈGLE ÂGE (PRIORITAIRE) : utilisatrice de ${ageConstraint.age} ans (moins de 15). ${ageConstraint.guidance || ''} Ne propose JAMAIS, ni en dupe catalogue ni en dupe externe, un produit dont l'actif vedette est : ${(ageConstraint.restricted || []).join(', ')}. Privilégie des produits doux adaptés à une peau jeune.`
    : '';
  const cands = Array.isArray(candidates) ? candidates : [];

  // Composition INCI réelle de la référence (Open Beauty Facts), si disponible
  const refInciList = Array.isArray(product.inciList) ? product.inciList.slice(0, 40) : [];
  const refInci = refInciList.length
    ? `COMPOSITION RÉELLE (INCI) DE LA RÉFÉRENCE — source Open Beauty Facts (FIABLE, à privilégier), listée du plus concentré au moins concentré :\n${refInciList.join(', ')}`
    : `COMPOSITION INCI de la référence NON disponible — raisonne prudemment, ne suppose aucun ingrédient non listé.`;

  // Limiter la charge : max 25 candidats, champs compacts
  const slim = cands.slice(0, 25).map(c => ({
    id: c.id, brand: c.brand, name: c.name, category: c.category,
    price: c.price, actives: (c.ingredientTags || []).slice(0, 8),
    concerns: (c.concernTags || []).slice(0, 8),
    desc: (c.description || '').slice(0, 160)
  }));
  // B-3 : récupérer l'INCI réel des candidats ayant un code-barres (max 12) → recouvrement objectif
  const refCanon = refInciList.map(_canon);
  if (refCanon.length) {
    const withBar = cands.filter(c => c.barcode).slice(0, 12);
    await Promise.allSettled(withBar.map(async c => {
      const ci = await _fetchCandInci(c.barcode);
      if (ci && ci.length) {
        const s = slim.find(x => x.id === c.id);
        if (s) { s.inciTop = ci.slice(0, 20); s.overlapINCI = _overlap(refCanon, ci); }
      }
    }));
  }
  const inciMap = {}; slim.forEach(s => { inciMap[s.id] = (s.overlapINCI != null); });

  const validIds = new Set(slim.map(c => c.id));

  const prompt = `Tu es une experte cosmétique spécialisée dans les DUPES (équivalents beaucoup moins chers).

PRODUIT PHOTOGRAPHIÉ PAR L'UTILISATRICE :
${JSON.stringify({
    brand: product.brand, name: product.name, category: product.category,
    type: product.productType, actifs: product.keyActives, texture: product.texture,
    fini: product.finish, couvrance: product.coverage, teinte: product.shade,
    prixEstime: product.estPrice
  }, null, 0)}

${refInci}

PROFIL DE PEAU DE L'UTILISATRICE (info complémentaire uniquement) :
${JSON.stringify(userSkin || {}, null, 0)}

CANDIDATS DE NOTRE CATALOGUE (choisis les dupes UNIQUEMENT parmi ceux-ci, via leur "id") :
${JSON.stringify(slim, null, 0)}

Ta mission : trouver le VRAI dupe du produit photographié — un produit qui offre une expérience, une composition et un résultat très proches, pour un prix nettement inférieur.${ageBlock}

RÈGLES IMPÉRATIVES :
- Un dupe n'est PAS juste "moins cher" : il doit réellement RESSEMBLER (catégorie, fonction, actifs principaux, texture, fini, couvrance/tenue pour le maquillage, résultat, teinte/sous-ton).
- Si la COMPOSITION INCI de la référence est fournie, base ta comparaison SUR ELLE en priorité : compare les actifs RÉELLEMENT présents, en pondérant par l'ordre INCI (un ingrédient en début de liste pèse beaucoup plus qu'un extrait cité en fin de liste). Ne considère JAMAIS un ingrédient "marketing" (extrait végétal en bas de liste) comme actif principal. Un simple bénéfice/promesse commun ("anti-âge", "éclat", "hydrate") ne suffit JAMAIS à faire un dupe : il faut des actifs principaux et un mécanisme réellement communs.
- CRITÈRE ÉLIMINATOIRE (actifs centraux) : détermine la FAMILLE d'actif CENTRAL de la référence. Si un candidat a pour actif CENTRAL une famille PUISSANTE qui est ABSENTE de la référence — en particulier vitamine C (ascorbic acid, ascorbyl…), rétinol/rétinoïdes, AHA/BHA (acide glycolique, lactique, salicylique), arbutine/dépigmentants — alors ce candidat N'EST PAS un dupe : plafonne sa similarité à 20 et NE l'inclus PAS dans les résultats. Exemple : référence = sérum botanique/huileux SANS vitamine C → un sérum vitamine C (type "C-VIT", "C-VIT liposomal") n'est PAS un dupe. Inversement, un sérum botanique nourrissant PEUT être un dupe d'un sérum botanique nourrissant.
- Certains candidats ont un champ "overlapINCI" (recouvrement RÉEL de composition avec la référence, en %, calculé sur leurs vraies listes INCI hors ingrédients de base) et "inciTop" (leurs vrais ingrédients). Quand "overlapINCI" est présent, base la similarité de CE candidat PRINCIPALEMENT dessus (mesure objective de formule commune) : overlapINCI élevé → forte similarité ; overlapINCI faible → ce n'est PAS un dupe, même en cas de promesse commune.
- Le prix est essentiel : un vrai dupe est significativement MOINS CHER que le produit d'origine.
- PRIORITÉ ABSOLUE au catalogue ("results" via id). N'utilise "externalResults" QUE si le catalogue ne contient PAS de vrai dupe convaincant (aucun candidat avec une similarité ≥ 70).
- "externalResults" : dupes RÉELS et connus que tu proposes hors de notre catalogue (ex: The Ordinary, e.l.f., Inkey List, Revolution…). Donne marque + nom exact + prix public approximatif en euros. N'invente jamais un produit qui n'existe pas.
- Si AUCUN vrai dupe n'existe (ni catalogue ni ailleurs — le produit a déjà un excellent rapport qualité-prix), mets "trueDupeExists": false, laisse "results" et "externalResults" vides, et explique dans "noDupeMessage".
- La recherche part TOUJOURS du produit photographié, PAS du profil de peau. Le profil sert seulement à remplir "skinFit"/"skinNote".
- "skinFit" : "adapted" / "caution" / "unfit". Même un dupe "unfit" doit être affiché comme dupe.
- "bestSkinAlternativeId" : parmi les candidats du CATALOGUE (id), celui qui ressemble au produit MAIS est le mieux adapté à SA peau. null si identique au meilleur dupe ou aucun.

Retourne UNIQUEMENT ce JSON, sans texte avant/après :
{
  "trueDupeExists": boolean,
  "noDupeMessage": "message si aucun vrai dupe, sinon ''",
  "results": [
    {
      "id": "id d'un candidat du catalogue",
      "similarity": 0-100,
      "commonPoints": ["2-4 points communs concrets"],
      "differences": ["1-3 différences honnêtes"],
      "why": "phrase courte : pourquoi c'est un dupe",
      "role": "closest | value | cheapest",
      "skinFit": "adapted | caution | unfit",
      "skinNote": "phrase courte sur l'adéquation à sa peau"
    }
  ],
  "externalResults": [
    {
      "brand": "marque du dupe hors catalogue",
      "name": "nom exact du produit",
      "approxPrice": number,
      "similarity": 0-100,
      "commonPoints": ["..."],
      "differences": ["..."],
      "why": "phrase courte",
      "role": "closest | value | cheapest",
      "skinFit": "adapted | caution | unfit",
      "skinNote": "phrase courte"
    }
  ],
  "bestSkinAlternativeId": "id du catalogue ou null"
}
Donne au maximum 3 résultats au total (catalogue + externes confondus), du plus similaire au moins similaire.`;

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
        max_tokens: 1400,
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

    const strArr = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => x.slice(0, 120)).slice(0, 4) : [];
    const FITS = ['adapted', 'caution', 'unfit'];
    const ROLES = ['closest', 'value', 'cheapest'];

    const results = Array.isArray(parsed.results) ? parsed.results
      .filter(r => r && validIds.has(r.id))
      .slice(0, 3)
      .map(r => ({
        id:           r.id,
        similarity:   Math.max(0, Math.min(100, parseInt(r.similarity, 10) || 0)),
        commonPoints: strArr(r.commonPoints),
        differences:  strArr(r.differences),
        why:          typeof r.why === 'string' ? r.why.slice(0, 200) : '',
        role:         ROLES.includes(r.role) ? r.role : 'closest',
        skinFit:      FITS.includes(r.skinFit) ? r.skinFit : 'caution',
        skinNote:     typeof r.skinNote === 'string' ? r.skinNote.slice(0, 200) : '',
        source:       'catalog',
        confidence:   (inciMap[r.id] && refInciList.length) ? 'high' : (refInciList.length ? 'medium' : 'low')
      })) : [];

    // Dupes hors catalogue (repli quand le catalogue ne couvre pas)
    const externalResults = Array.isArray(parsed.externalResults) ? parsed.externalResults
      .filter(r => r && (r.brand || r.name))
      .slice(0, 3)
      .map(r => ({
        brand:        typeof r.brand === 'string' ? r.brand.slice(0, 60) : '',
        name:         typeof r.name === 'string' ? r.name.slice(0, 120) : '',
        approxPrice:  (typeof r.approxPrice === 'number' && r.approxPrice > 0 && r.approxPrice < 1000) ? Math.round(r.approxPrice * 100) / 100 : 0,
        similarity:   Math.max(0, Math.min(100, parseInt(r.similarity, 10) || 0)),
        commonPoints: strArr(r.commonPoints),
        differences:  strArr(r.differences),
        why:          typeof r.why === 'string' ? r.why.slice(0, 200) : '',
        role:         ROLES.includes(r.role) ? r.role : 'closest',
        skinFit:      FITS.includes(r.skinFit) ? r.skinFit : 'caution',
        skinNote:     typeof r.skinNote === 'string' ? r.skinNote.slice(0, 200) : '',
        source:       'external',
        confidence:   'low'
      })) : [];

    // Seuil minimum : en dessous, ce n'est pas un vrai dupe → on ne le propose pas
    const MIN_SIM = 55;
    const strongCatalog  = results.filter(r => r.similarity >= MIN_SIM);
    const strongExternal = externalResults.filter(r => r.similarity >= MIN_SIM);
    // Garder au max 3 résultats au total, catalogue prioritaire
    const trimmedExternal = strongExternal.slice(0, Math.max(0, 3 - strongCatalog.length));

    const trueDupeExists = Boolean(parsed.trueDupeExists) && (strongCatalog.length > 0 || trimmedExternal.length > 0);
    const bestAlt = (parsed.bestSkinAlternativeId && validIds.has(parsed.bestSkinAlternativeId))
      ? parsed.bestSkinAlternativeId : null;

    // Message honnête si pas de vrai dupe (aucun / trop faible similarité)
    let noDupeMessage = '';
    if (!trueDupeExists) {
      if (Boolean(parsed.trueDupeExists)) {
        // L'IA avait des pistes mais aucune assez proche (< seuil)
        noDupeMessage = "Les produits les plus proches restent trop différents pour être de vrais dupes. On préfère ne pas t'en proposer un approximatif.";
      } else {
        noDupeMessage = (typeof parsed.noDupeMessage === 'string' && parsed.noDupeMessage)
          ? parsed.noDupeMessage.slice(0, 400)
          : "Après analyse, nous n'avons pas trouvé de véritable dupe pour ce produit. Son excellent rapport qualité-prix explique qu'il n'existe pas actuellement d'alternative significativement moins chère aux performances équivalentes.";
      }
    }

    return res.status(200).json({
      trueDupeExists,
      noDupeMessage,
      results: trueDupeExists ? strongCatalog : [],
      externalResults: trueDupeExists ? trimmedExternal : [],
      bestSkinAlternativeId: bestAlt
    });

  } catch (err) {
    console.error('[dupeMatch] erreur:', err.message);
    return res.status(500).json({ error: 'Recherche de dupe IA échouée' });
  }
};
