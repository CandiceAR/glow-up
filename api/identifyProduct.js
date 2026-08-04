/* ============================================================
   api/identifyProduct.js — Identifie un produit de beauté via Claude vision
   Entrée : { photo: "data:image/jpeg;base64,..." }
   Sortie : { recognized, brand, name, category, productType, range,
              shade, keyActives[], texture, finish, coverage, estPrice, confidence }
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Catégories alignées sur notre catalogue (products-manual.json)
const CATEGORIES = [
  'cleanser', 'toner', 'serum', 'exfoliant', 'moisturizer', 'oil', 'mask',
  'nightmask', 'eye', 'eye_cream', 'spf', 'sunscreen', 'lipbalm', 'mist',
  'foundation', 'concealer', 'corrector', 'powder', 'primer', 'blush',
  'bronzer', 'highlighter', 'mascara', 'eyeliner', 'eyebrow', 'eyeshadow',
  'lipstick', 'lipgloss', 'lipliner', 'set', 'tools', 'multi_usage', 'other'
];

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const { photo } = req.body || {};
  if (!photo || typeof photo !== 'string') return res.status(400).json({ error: 'photo manquante' });

  const match = photo.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: 'Format photo invalide' });
  const [, mediaType, base64Data] = match;
  if (base64Data.length > 5_000_000) return res.status(413).json({ error: 'Image trop grande' });

  const prompt = `Tu es une experte beauté qui identifie un produit cosmétique à partir d'une photo (packaging, étiquette, texte de la marque).

Observe attentivement la photo et identifie le produit. Utilise ta connaissance des produits de beauté populaires pour compléter (actifs clés, texture, fini) même si tout n'est pas écrit sur l'emballage.

Retourne UNIQUEMENT ce JSON valide, sans texte avant ni après :
{
  "recognized": boolean,
  "brand": "marque",
  "name": "nom exact du produit",
  "range": "gamme/version si visible, sinon ''",
  "category": "une valeur EXACTE parmi: ${CATEGORIES.join(', ')}",
  "productType": "skincare | makeup",
  "shade": "teinte si maquillage (ex: '220 Natural Beige'), sinon ''",
  "keyActives": ["actifs/ingrédients principaux connus, ex: 'niacinamide','acide hyaluronique' — [] si inconnu"],
  "texture": "gel|crème|fluide|huile|baume|mousse|liquide|poudre|stick|'' ",
  "finish": "mat|satiné|lumineux|naturel|'' ",
  "coverage": "légère|moyenne|haute|'' (maquillage teint uniquement, sinon '')",
  "estPrice": number,
  "confidence": "high|medium|low"
}

Règles :
- Si tu n'arrives pas à lire la marque ET le nom, mets "recognized": false et remplis ce que tu peux.
- "category" DOIT être une valeur exacte de la liste. Déduis-la du NOM et du packaging :
  • "serum/sérum/ampoule/ampoule/essence/booster" → serum
  • "eye/contour des yeux/yeux" → eye
  • "cream/crème/moisturizer/hydratant/lotion/emulsion" → moisturizer
  • "cleanser/nettoyant/foam/mousse/cleansing" → cleanser
  • "toner/tonique/lotion tonique" → toner
  • "spf/sun/sunscreen/solaire/uv" → spf
  • "exfoliant/peeling/gommage/scrub/aha/bha" → exfoliant
  Un flacon compte-gouttes ou une ampoule = presque toujours un serum, pas une crème.
  Ne confonds JAMAIS un sérum avec une crème hydratante, ni un contour des yeux avec une crème.
- Sois factuelle : n'invente pas une marque que tu ne vois pas. Mais tu peux déduire actifs/texture/fini d'un produit que tu reconnais.
- "estPrice" = prix de vente public estimé en euros (0 si inconnu).
- Réponds UNIQUEMENT avec le JSON.`;

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
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error('[identifyProduct] API error:', resp.status, errData);
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

    const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
    const arr = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length < 40).slice(0, 8) : [];

    const safe = {
      recognized:  Boolean(parsed.recognized),
      brand:       str(parsed.brand, 60),
      name:        str(parsed.name, 120),
      range:       str(parsed.range, 60),
      category:    CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
      productType: parsed.productType === 'makeup' ? 'makeup' : 'skincare',
      shade:       str(parsed.shade, 40),
      keyActives:  arr(parsed.keyActives),
      texture:     str(parsed.texture, 20),
      finish:      str(parsed.finish, 20),
      coverage:    str(parsed.coverage, 20),
      estPrice:    (typeof parsed.estPrice === 'number' && parsed.estPrice > 0 && parsed.estPrice < 1000) ? Math.round(parsed.estPrice * 100) / 100 : 0,
      confidence:  ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low'
    };
    if (!safe.brand && !safe.name) safe.recognized = false;

    return res.status(200).json(safe);

  } catch (err) {
    console.error('[identifyProduct] erreur:', err.message);
    return res.status(500).json({ error: 'Identification IA échouée' });
  }
};
