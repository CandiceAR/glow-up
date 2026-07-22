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

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const { product, candidates, userSkin } = req.body || {};
  if (!product || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: 'product/candidates manquants' });
  }

  // Limiter la charge : max 25 candidats, champs compacts
  const slim = candidates.slice(0, 25).map(c => ({
    id: c.id, brand: c.brand, name: c.name, category: c.category,
    price: c.price, actives: (c.ingredientTags || []).slice(0, 8),
    concerns: (c.concernTags || []).slice(0, 8),
    desc: (c.description || '').slice(0, 160)
  }));
  const validIds = new Set(slim.map(c => c.id));

  const prompt = `Tu es une experte cosmétique spécialisée dans les DUPES (équivalents beaucoup moins chers).

PRODUIT PHOTOGRAPHIÉ PAR L'UTILISATRICE :
${JSON.stringify({
    brand: product.brand, name: product.name, category: product.category,
    type: product.productType, actifs: product.keyActives, texture: product.texture,
    fini: product.finish, couvrance: product.coverage, teinte: product.shade,
    prixEstime: product.estPrice
  }, null, 0)}

PROFIL DE PEAU DE L'UTILISATRICE (info complémentaire uniquement) :
${JSON.stringify(userSkin || {}, null, 0)}

CANDIDATS DE NOTRE CATALOGUE (choisis les dupes UNIQUEMENT parmi ceux-ci, via leur "id") :
${JSON.stringify(slim, null, 0)}

Ta mission : trouver le VRAI dupe du produit photographié — un produit qui offre une expérience, une composition et un résultat très proches, pour un prix nettement inférieur.

RÈGLES IMPÉRATIVES :
- Un dupe n'est PAS juste "moins cher" : il doit réellement RESSEMBLER (catégorie, fonction, actifs principaux, texture, fini, couvrance/tenue pour le maquillage, résultat, teinte/sous-ton).
- Le prix est essentiel : un vrai dupe est significativement MOINS CHER que le produit d'origine.
- Si AUCUN candidat n'est un vrai dupe (rien de vraiment ressemblant et moins cher), mets "trueDupeExists": false et NE PROPOSE PAS de dupe bidon. Explique dans "noDupeMessage" (ex: le produit a déjà un excellent rapport qualité-prix).
- La recherche part TOUJOURS du produit photographié, PAS du profil de peau. Le profil sert seulement à remplir "skinFit"/"skinNote".
- "skinFit" : "adapted" (adapté à sa peau), "caution" (peut convenir avec précautions), "unfit" (peu adapté). Même un dupe "unfit" doit être affiché comme dupe.
- "bestSkinAlternativeId" : parmi les candidats, celui qui ressemble au produit MAIS est le mieux adapté à SA peau (peut différer du meilleur dupe). null si identique au meilleur dupe ou aucun.

Retourne UNIQUEMENT ce JSON, sans texte avant/après :
{
  "trueDupeExists": boolean,
  "noDupeMessage": "message si trueDupeExists=false, sinon ''",
  "results": [
    {
      "id": "id d'un candidat",
      "similarity": 0-100,
      "commonPoints": ["2-4 points communs concrets"],
      "differences": ["1-3 différences honnêtes"],
      "why": "phrase courte : pourquoi c'est un dupe",
      "role": "closest | value | cheapest",
      "skinFit": "adapted | caution | unfit",
      "skinNote": "phrase courte sur l'adéquation à sa peau"
    }
  ],
  "bestSkinAlternativeId": "id ou null"
}
Donne au maximum 3 résultats, du plus similaire au moins similaire. Utilise les "role" pour marquer: le plus proche (closest), le meilleur rapport qualité-prix (value), le moins cher (cheapest).`;

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
        skinNote:     typeof r.skinNote === 'string' ? r.skinNote.slice(0, 200) : ''
      })) : [];

    const trueDupeExists = Boolean(parsed.trueDupeExists) && results.length > 0;
    const bestAlt = (parsed.bestSkinAlternativeId && validIds.has(parsed.bestSkinAlternativeId))
      ? parsed.bestSkinAlternativeId : null;

    return res.status(200).json({
      trueDupeExists,
      noDupeMessage: !trueDupeExists ? (typeof parsed.noDupeMessage === 'string' && parsed.noDupeMessage
        ? parsed.noDupeMessage.slice(0, 400)
        : "Après analyse, nous n'avons pas trouvé de véritable dupe pour ce produit. Son excellent rapport qualité-prix explique qu'il n'existe pas actuellement d'alternative significativement moins chère aux performances équivalentes.") : '',
      results: trueDupeExists ? results : [],
      bestSkinAlternativeId: bestAlt
    });

  } catch (err) {
    console.error('[dupeMatch] erreur:', err.message);
    return res.status(500).json({ error: 'Recherche de dupe IA échouée' });
  }
};
