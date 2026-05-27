/* ============================================================
   api/faceVision.js — Analyse visuelle du visage via Claude Haiku
   Entrée  : { photo: "data:image/jpeg;base64,..." }
   Sortie  : { cernes, rougeurs, eclat, texture, taches, imperfections }
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

  const { photo } = req.body || {};
  if (!photo || typeof photo !== 'string') {
    return res.status(400).json({ error: 'photo manquante' });
  }

  const match = photo.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: 'Format photo invalide' });

  const [, mediaType, base64Data] = match;

  if (base64Data.length > 5_000_000) {
    return res.status(413).json({ error: 'Image trop grande' });
  }

  const prompt = `Tu es un expert beauté. Analyse cette photo de visage et identifie les problèmes cutanés visibles.

Retourne UNIQUEMENT ce JSON valide, sans aucun texte avant ni après :
{
  "cernes": { "detected": boolean, "type": "bleu|marron|violet|aucun", "intensite": "légers|marqués" },
  "rougeurs": { "niveau": "aucune|légères|prononcées", "zones": "joues|nez|global|aucune" },
  "eclat": "normal|terne|très_terne",
  "texture": "lisse|légèrement_irrégulière|irrégulière",
  "taches": "aucune|légères|visibles",
  "imperfections": { "presentes": boolean, "type": "acne|points_noirs|post_acne|aucune" }
}

Règles :
- Sois conservateur : ne signale un problème que s'il est clairement visible sur la peau
- Si la photo est floue, mal éclairée ou sans visage net : retourne des valeurs neutres (aucune/normal/lisse)
- Si la personne porte du maquillage, analyse la peau visible sous le maquillage
- Réponds UNIQUEMENT avec le JSON, aucun autre texte`;

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
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error('[faceVision] API error:', resp.status, errData);
      return res.status(502).json({ error: 'API Anthropic indisponible' });
    }

    const aiData  = await resp.json();
    const rawText = aiData?.content?.[0]?.text?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Réponse non parseable');
      parsed = JSON.parse(jsonMatch[0]);
    }

    // ── Validation whitelist ──
    const NIVEAUX   = ['aucune', 'légères', 'prononcées'];
    const ZONES_R   = ['joues', 'nez', 'global', 'aucune'];
    const ECLAT_V   = ['normal', 'terne', 'très_terne'];
    const TEXTURE_V = ['lisse', 'légèrement_irrégulière', 'irrégulière'];
    const TACHES_V  = ['aucune', 'légères', 'visibles'];
    const TYPES_C   = ['bleu', 'marron', 'violet', 'aucun'];
    const TYPES_I   = ['acne', 'points_noirs', 'post_acne', 'aucune'];

    const safe = {
      cernes: {
        detected:  Boolean(parsed.cernes?.detected),
        type:      TYPES_C.includes(parsed.cernes?.type)      ? parsed.cernes.type     : 'aucun',
        intensite: parsed.cernes?.intensite === 'marqués'     ? 'marqués'              : 'légers',
      },
      rougeurs: {
        niveau: NIVEAUX.includes(parsed.rougeurs?.niveau)     ? parsed.rougeurs.niveau : 'aucune',
        zones:  ZONES_R.includes(parsed.rougeurs?.zones)      ? parsed.rougeurs.zones  : 'aucune',
      },
      eclat:   ECLAT_V.includes(parsed.eclat)      ? parsed.eclat    : 'normal',
      texture: TEXTURE_V.includes(parsed.texture)  ? parsed.texture  : 'lisse',
      taches:  TACHES_V.includes(parsed.taches)    ? parsed.taches   : 'aucune',
      imperfections: {
        presentes: Boolean(parsed.imperfections?.presentes),
        type:      TYPES_I.includes(parsed.imperfections?.type) ? parsed.imperfections.type : 'aucune',
      }
    };

    return res.status(200).json(safe);

  } catch (err) {
    console.error('[faceVision] erreur:', err.message);
    return res.status(500).json({ error: 'Analyse IA échouée' });
  }
};
