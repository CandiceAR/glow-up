/* ============================================================
   api/skinInsights.js — Génération IA d'insights beauté précis
   Reçoit des données structurées zone par zone (pas d'image)
   et génère des observations précises + conseils via Haiku
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_KEYS       = ['redness', 'sebum', 'taches', 'terne', 'texture', 'cernes'];
const ALLOWED_SKIN_TYPES = ['normale', 'grasse', 'seche', 'mixte', 'sensible'];
const ALLOWED_UNDERTONES = ['warm', 'cool', 'neutral'];
const ALLOWED_CARNATIONS = ['clair', 'medium', 'fonce'];
const ALLOWED_CERNES     = ['bleu_violet', 'marron', 'rouge_rose', 'gris'];
const ALLOWED_ZONES      = ['leftCheek', 'rightCheek', 'forehead', 'nose', 'chin', 'eyes'];

const KEY_FR = {
  redness: 'rougeurs / zones sensibilisées',
  sebum:   'pores dilatés / brillance zone T',
  taches:  'taches / teint irrégulier',
  terne:   'manque d\'éclat / teint terne',
  texture: 'texture irrégulière / grain visible',
};
const ZONE_FR = {
  leftCheek: 'joue gauche',      rightCheek: 'joue droite',
  forehead:  'front',            nose:       'nez / ailes du nez',
  chin:      'menton',           eyes:       'contour des yeux',
};
const SKIN_TYPE_FR = {
  normale: 'normale', grasse: 'grasse', seche: 'sèche', mixte: 'mixte', sensible: 'sensible'
};
const UNDERTONE_FR = {
  warm: 'chaud — reflets dorés / pêchés', cool: 'froid — reflets rosés / bleutés', neutral: 'neutre'
};
const CERNES_FR = {
  bleu_violet: 'bleutés / violacés (microcirculation visible)',
  marron:      'bruns / pigmentaires (mélanine ou soleil)',
  rouge_rose:  'rosés / rougeâtres (irritation ou sensibilité)',
  gris:        'gris / ternes (fatigue ou déshydratation)',
};

const clamp  = (v, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const sevFR  = (s) => s > 70 ? 'assez marquée' : s > 55 ? 'modérée' : 'légère';

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const raw = req.body?.analysisData;
  if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'analysisData manquant' });

  // ── Validation stricte — whitelist de tout ce qui vient du client ──────
  const data = {
    score:     clamp(raw.score, 0, 100) || 65,
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
      .map(i => {
        // Validate zonesDetail
        const zonesDetail = Array.isArray(i.zonesDetail)
          ? i.zonesDetail
              .filter(z => ALLOWED_ZONES.includes(z?.zone))
              .slice(0, 4)
              .map(z => ({ zone: z.zone, severity: clamp(z.severity) }))
          : [];

        // Validate primaryMetrics
        const pm = i.primaryMetrics || {};
        const primaryMetrics = {
          redness: clamp(pm.redness),
          pores:   clamp(pm.pores),
          eclat:   clamp(pm.eclat),
          taches:  clamp(pm.taches),
          texture: clamp(pm.texture),
        };

        return {
          key:            i.key,
          severity:       clamp(i.severity),
          zonesDetail,
          primaryMetrics,
        };
      });
  }

  if (!data.insights.length) return res.status(400).json({ error: 'Aucun insight valide' });

  // ── Construction du prompt enrichi zone par zone ───────────────────────
  const cernesLine = data.cernes
    ? `Cernes détectés : ${CERNES_FR[data.cernes.type] || data.cernes.type}, intensité ${data.cernes.intensity}`
    : 'Aucun cerne détecté';

  const insightLines = data.insights.map((ins, i) => {
    const zonesStr = ins.zonesDetail.length
      ? ins.zonesDetail.map(z => `${ZONE_FR[z.zone]} (intensité ${sevFR(z.severity)})`).join(' + ')
      : '(zone non précisée)';

    const pm = ins.primaryMetrics;
    const metricsStr = `rougeur=${pm.redness} pores=${pm.pores} éclat=${pm.eclat} taches=${pm.taches} texture=${pm.texture}`;

    return `${i + 1}. ${KEY_FR[ins.key] || ins.key}
   - Zones touchées : ${zonesStr}
   - Intensité globale : ${sevFR(ins.severity)} (score ${ins.severity}/100)
   - Métriques zone principale : ${metricsStr}`;
  });

  const userPrompt =
`PROFIL PEAU ANALYSÉ :
- Score global : ${data.score}/100
- Type de peau : ${SKIN_TYPE_FR[data.skinType]}
- Sous-ton : ${UNDERTONE_FR[data.undertone]}
- Carnation : ${data.carnation}
- ${cernesLine}

ZONES DÉTECTÉES (données de l'IA de détection locale) :
${insightLines.join('\n\n')}

Génère exactement ${data.insights.length} observations, une par zone détectée, dans le même ordre.
Retourne UNIQUEMENT ce JSON valide, sans aucun texte avant ou après :
[
  { "key": "...", "phrase": "...", "conseil": "..." }
]`;

  const systemPrompt =
`Tu es Glow Up, une IA beauté premium francophone. Tu reçois des données précises d'analyse cutanée zone par zone et tu génères des observations personnalisées, précises et naturelles.

RÈGLES ABSOLUES pour "phrase" (30 à 40 mots) :
1. Commence par nommer la zone précise : "Sur la joue gauche", "Sous les yeux", "Sur le front et le nez"...
2. Décris ce qui est observé avec ses caractéristiques : couleur (bleuté, rosé, terne), texture (brillant, irrégulier), intensité.
3. Ajoute une cause possible douce, non médicale : "souvent lié à...", "probablement dû à..."
4. Ton : rassurant, premium, jamais alarmiste, jamais médical.
5. Varie les formulations — ne commence jamais deux phrases de la même façon.

RÈGLES ABSOLUES pour "conseil" (25 à 35 mots) :
1. Nomme 1 ou 2 actifs précis avec leur concentration si possible.
2. Précise où appliquer (sur la zone concernée, ciblé, tout le visage...).
3. Adapte au type de peau et sous-ton reçus.
4. Concret et actionnable — pas de généralités.

Contraintes strictes :
- Ne parle QUE des zones présentes dans les données. N'invente rien.
- Langue : français uniquement, style élégant.
- Format : JSON valide UNIQUEMENT. Aucun markdown, aucun texte hors JSON.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:       'claude-haiku-4-5-20251001',
        max_tokens:  900,
        temperature: 0.80,
        system:      systemPrompt,
        messages:    [{ role: 'user', content: userPrompt }]
      })
    });

    const aiData  = await resp.json();
    const rawText = aiData?.content?.[0]?.text?.trim() || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Réponse non parseable');
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed)) throw new Error('Format inattendu');

    const sanitized = parsed
      .filter(item => ALLOWED_KEYS.includes(item?.key))
      .map(item => ({
        key:     String(item.key).slice(0, 30),
        phrase:  String(item.phrase  || '').slice(0, 300).replace(/<[^>]*>/g, ''),
        conseil: String(item.conseil || '').slice(0, 300).replace(/<[^>]*>/g, '')
      }));

    return res.status(200).json({ insights: sanitized });

  } catch (err) {
    console.error('[skinInsights] erreur IA :', err.message);
    return res.status(500).json({ error: 'Génération IA échouée' });
  }
};
