/* ============================================================
   api/skinInsights.js — Génération IA d'insights beauté personnalisés
   Reçoit les données structurées de l'analyse locale (pas d'image)
   et retourne des observations et conseils en français via Haiku
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_KEYS      = ['redness', 'sebum', 'taches', 'terne', 'texture', 'cernes'];
const ALLOWED_SKIN_TYPES = ['normale', 'grasse', 'seche', 'mixte', 'sensible'];
const ALLOWED_UNDERTONES = ['warm', 'cool', 'neutral'];
const ALLOWED_CARNATIONS = ['clair', 'medium', 'fonce'];
const ALLOWED_CERNES     = ['bleu_violet', 'marron', 'rouge_rose', 'gris'];

const KEY_FR = {
  redness: 'rougeurs / zones sensibilisées',
  sebum:   'pores dilatés / brillance zone T',
  taches:  'taches / teint irrégulier',
  terne:   'manque d\'éclat / teint terne',
  texture: 'texture irrégulière / grain visible',
};
const ZONE_FR = {
  leftCheek: 'joue gauche', rightCheek: 'joue droite',
  forehead: 'front', nose: 'nez', chin: 'menton', eyes: 'contour des yeux'
};
const SKIN_TYPE_FR = { normale: 'normale', grasse: 'grasse', seche: 'sèche', mixte: 'mixte', sensible: 'sensible' };
const UNDERTONE_FR = { warm: 'chaud (doré)', cool: 'froid (rosé)', neutral: 'neutre' };
const SEV_LABEL    = (s) => s > 70 ? 'assez marquée' : s > 55 ? 'modérée' : 'légère';

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const raw = req.body?.analysisData;
  if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'analysisData manquant' });

  // ── Validation et whitelist stricte — jamais de données brutes client ──
  const data = {
    score:     Math.min(100, Math.max(0, Math.round(Number(raw.score) || 65))),
    skinType:  ALLOWED_SKIN_TYPES.includes(raw.skinType)  ? raw.skinType  : 'normale',
    undertone: ALLOWED_UNDERTONES.includes(raw.undertone) ? raw.undertone : 'neutral',
    carnation: ALLOWED_CARNATIONS.includes(raw.carnation) ? raw.carnation : 'medium',
    cernes:    null,
    insights:  []
  };

  if (raw.cernes?.detected && ALLOWED_CERNES.includes(raw.cernes.type)) {
    data.cernes = {
      type:      raw.cernes.type,
      intensity: raw.cernes.intensity === 'marqués' ? 'marqués' : 'légers'
    };
  }

  if (Array.isArray(raw.insights)) {
    data.insights = raw.insights
      .filter(i => ALLOWED_KEYS.includes(i?.key))
      .slice(0, 3)
      .map(i => ({
        key:      i.key,
        severity: Math.min(100, Math.max(0, Number(i.severity) || 50)),
        zones:    Array.isArray(i.zones)
          ? i.zones.filter(z => ZONE_FR[z]).slice(0, 4)
          : []
      }));
  }

  if (!data.insights.length) return res.status(400).json({ error: 'Aucun insight valide' });

  // ── Construction du prompt ────────────────────────────────────────────
  const cernesLine = data.cernes
    ? `Cernes : type ${data.cernes.type.replace('_', '/')}, ${data.cernes.intensity}`
    : 'Pas de cernes détectés';

  const insightLines = data.insights.map((ins, i) => {
    const zonesStr = ins.zones.map(z => ZONE_FR[z]).join(', ');
    return `${i + 1}. ${KEY_FR[ins.key] || ins.key} — intensité ${SEV_LABEL(ins.severity)}${zonesStr ? ` (${zonesStr})` : ''}`;
  });

  const userPrompt =
`Profil peau :
- Score global : ${data.score}/100
- Type de peau : ${SKIN_TYPE_FR[data.skinType]}
- Sous-ton : ${UNDERTONE_FR[data.undertone]}
- Carnation : ${data.carnation}
- ${cernesLine}

Priorités détectées par l'analyse IA :
${insightLines.join('\n')}

Génère exactement ${data.insights.length} observations, une par priorité dans l'ordre.
Retourne UNIQUEMENT ce JSON, sans aucun texte avant ou après :
[
  { "key": "...", "phrase": "...", "conseil": "..." }
]`;

  const systemPrompt =
`Tu es Glow Up, une IA beauté francophone premium. Tu reçois des données structurées d'analyse cutanée (pas d'image) et tu génères des observations personnalisées.

Règles absolues :
- "phrase" : 22 à 30 mots. Ton doux, rassurant, premium. Jamais médical ni alarmiste. Commence par une observation naturelle du visage. Varie les formulations d'une réponse à l'autre.
- "conseil" : 20 à 28 mots. Conseil skincare concret avec 1 ou 2 actifs précis. Adapté au type de peau et au sous-ton reçus.
- Ne parle QUE des zones présentes dans les données. N'en invente aucune.
- Adapte chaque phrase au profil exact : type de peau, sous-ton, intensité, zones.
- Langue : français uniquement, style élégant.
- Format : JSON valide UNIQUEMENT. Aucun texte supplémentaire, aucun markdown.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 700,
        temperature: 0.78,
        system:   systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const aiData  = await resp.json();
    const rawText = aiData?.content?.[0]?.text?.trim() || '';

    // Parse JSON — tente d'extraire si le modèle a ajouté du texte autour
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Réponse non parseable');
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed)) throw new Error('Format inattendu');

    // Sanitize output — sécurité maximale
    const sanitized = parsed
      .filter(item => ALLOWED_KEYS.includes(item?.key))
      .map(item => ({
        key:     String(item.key).slice(0, 30),
        phrase:  String(item.phrase  || '').slice(0, 250).replace(/<[^>]*>/g, ''),
        conseil: String(item.conseil || '').slice(0, 250).replace(/<[^>]*>/g, '')
      }));

    return res.status(200).json({ insights: sanitized });

  } catch (err) {
    console.error('[skinInsights] erreur IA :', err.message);
    return res.status(500).json({ error: 'Génération IA échouée' });
  }
};
