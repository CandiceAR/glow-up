/* ============================================================
   api/skinInsights.js — Insights beauté précis via Claude Haiku
   Entrée : données structurées zone par zone + precision context
   Sortie : { insights: [{key, phrase, conseil}], synthese: "..." }
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

const ZONE_FR = {
  leftCheek: 'joue gauche',    rightCheek: 'joue droite',
  forehead:  'front',          nose:       'nez / ailes du nez',
  chin:      'menton',         eyes:       'contour des yeux',
};
const SKIN_TYPE_FR = {
  normale: 'normale', grasse: 'grasse', seche: 'sèche', mixte: 'mixte', sensible: 'sensible'
};
const UNDERTONE_FR = {
  warm: 'chaud — reflets dorés / pêchés',
  cool: 'froid — reflets rosés / bleutés',
  neutral: 'neutre'
};
const CERNES_FR = {
  bleu_violet: 'bleutés / violacés — microcirculation visible sous la peau fine',
  marron:      'bruns / pigmentaires — mélanine ou exposition solaire',
  rouge_rose:  'rosés / rougeâtres — irritation ou sensibilité locale',
  gris:        'gris / ternes — fatigue ou déshydratation localisée',
};
const REDNESS_PATTERN_FR = {
  diffuse:          'rougeur diffuse sur plusieurs zones du visage simultanément',
  cheeks_bilateral: 'rougeur bilatérale concentrée sur les deux joues uniquement',
  nose_wings:       'rougeur localisée autour des ailes du nez et du nez uniquement',
  cheeks_and_nose:  'rougeur sur les joues et les ailes du nez — schéma couperose-like',
  forehead:         'rougeur concentrée sur le front uniquement',
  localized:        'rougeur localisée sur une zone unique',
  none:             'pas de rougeur détectée',
};
const SEBUM_PATTERN_FR = {
  zone_t:    'brillance sur la zone T (front + nez ± menton)',
  localized: 'brillance localisée sur une zone précise',
  none:      'pas de brillance détectée',
};

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
const sev   = (s) => s > 70 ? 'assez marquée' : s > 55 ? 'modérée' : 'légère';

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });

  const raw = req.body?.analysisData;
  if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'analysisData manquant' });

  // ── Validation whitelist ───────────────────────────────────────────────
  const data = {
    score:     clamp(raw.score) || 65,
    skinType:  ALLOWED_SKIN_TYPES.includes(raw.skinType)  ? raw.skinType  : 'normale',
    undertone: ALLOWED_UNDERTONES.includes(raw.undertone) ? raw.undertone : 'neutral',
    carnation: ALLOWED_CARNATIONS.includes(raw.carnation) ? raw.carnation : 'medium',
    cernes:    null,
    insights:  [],
    precision: null,
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
        const zonesDetail = Array.isArray(i.zonesDetail)
          ? i.zonesDetail
              .filter(z => ALLOWED_ZONES.includes(z?.zone))
              .slice(0, 4)
              .map(z => ({ zone: z.zone, severity: clamp(z.severity) }))
          : [];
        const pm = i.primaryMetrics || {};
        return {
          key:      i.key,
          severity: clamp(i.severity),
          zonesDetail,
          primaryMetrics: {
            redness: clamp(pm.redness), pores: clamp(pm.pores),
            eclat:   clamp(pm.eclat),   taches: clamp(pm.taches),
            texture: clamp(pm.texture),
          }
        };
      });
  }

  if (!data.insights.length) return res.status(400).json({ error: 'Aucun insight valide' });

  // Precision context — valider les champs autorisés uniquement
  const pr = raw.precision || {};
  if (pr && typeof pr === 'object') {
    const ALLOWED_REDNESS_PATTERNS = Object.keys(REDNESS_PATTERN_FR);
    const ALLOWED_SEBUM_PATTERNS   = Object.keys(SEBUM_PATTERN_FR);
    data.precision = {
      rednessPattern:   ALLOWED_REDNESS_PATTERNS.includes(pr.rednessPattern) ? pr.rednessPattern : null,
      sebumPattern:     ALLOWED_SEBUM_PATTERNS.includes(pr.sebumPattern)     ? pr.sebumPattern   : null,
      sebumDominant:    ALLOWED_ZONES.includes(pr.sebumDominant)             ? pr.sebumDominant  : null,
      isOilyDehydrated: Boolean(pr.isOilyDehydrated),
      textureWorstZone: ALLOWED_ZONES.includes(pr.textureWorstZone)          ? pr.textureWorstZone : null,
      cheekAsymmetry:   ['left_more_red', 'right_more_red'].includes(pr.cheekAsymmetry) ? pr.cheekAsymmetry : null,
      avgEclat:         clamp(pr.avgEclat),
      avgRedness:       clamp(pr.avgRedness),
    };
  }

  // ── Construction du prompt ──────────────────────────────────────────────
  const cernesLine = data.cernes
    ? `Cernes : ${CERNES_FR[data.cernes.type]}, intensité ${data.cernes.intensity}`
    : 'Aucun cerne détecté';

  // Ligne par insight avec zones + métriques
  const insightLines = data.insights.map((ins, i) => {
    const zonesStr = ins.zonesDetail.length
      ? ins.zonesDetail.map(z => `${ZONE_FR[z.zone]} (${sev(z.severity)})`).join(' + ')
      : '(zone non précisée)';
    const pm = ins.primaryMetrics;
    return [
      `${i + 1}. Issue : ${ins.key} — intensité ${sev(ins.severity)} (score ${ins.severity}/100)`,
      `   Zones : ${zonesStr}`,
      `   Métriques zone principale → rougeur:${pm.redness} pores:${pm.pores} éclat:${pm.eclat} taches:${pm.taches} texture:${pm.texture}`,
    ].join('\n');
  });

  // Contexte de précision dérivé
  const p = data.precision;
  const precisionLines = p ? [
    p.rednessPattern && p.rednessPattern !== 'none'
      ? `Schéma rougeur : ${REDNESS_PATTERN_FR[p.rednessPattern]}`
      : null,
    p.sebumPattern && p.sebumPattern !== 'none'
      ? `Schéma brillance : ${SEBUM_PATTERN_FR[p.sebumPattern]}${p.sebumDominant ? ` — dominant sur ${ZONE_FR[p.sebumDominant]}` : ''}`
      : null,
    p.isOilyDehydrated
      ? 'Combinaison détectée : peau brillante + manque d\'éclat → probablement déshydratée sous la brillance'
      : null,
    p.textureWorstZone
      ? `Texture la plus irrégulière : ${ZONE_FR[p.textureWorstZone]}`
      : null,
    p.cheekAsymmetry === 'left_more_red'  ? 'Asymétrie : joue gauche plus rouge que la droite'  : null,
    p.cheekAsymmetry === 'right_more_red' ? 'Asymétrie : joue droite plus rouge que la gauche' : null,
    `Éclat moyen du visage : ${p.avgEclat}/100`,
  ].filter(Boolean) : [];

  const userPrompt =
`PROFIL PEAU :
- Score global : ${data.score}/100
- Type de peau : ${SKIN_TYPE_FR[data.skinType]}
- Sous-ton : ${UNDERTONE_FR[data.undertone]}
- Carnation : ${data.carnation}
- ${cernesLine}

ZONES DÉTECTÉES (données de l'analyse locale IA) :
${insightLines.join('\n\n')}

${precisionLines.length ? `CONTEXTE DE PRÉCISION DÉRIVÉ :\n${precisionLines.map(l => `- ${l}`).join('\n')}` : ''}

Génère exactement ${data.insights.length} observations dans le même ordre que les zones détectées.
Puis génère une synthèse globale.

Retourne UNIQUEMENT ce JSON, sans aucun texte avant ou après :
{
  "insights": [
    { "key": "...", "phrase": "...", "conseil": "..." }
  ],
  "synthese": "..."
}`;

  const systemPrompt =
`Tu es Glow Up, une IA beauté premium francophone. Tu reçois des données précises d'analyse cutanée zone par zone et tu génères des observations personnalisées, précises et naturelles.

RÈGLES pour "phrase" (32 à 42 mots) :
1. Commence par la localisation précise : "Sur les deux joues", "Autour des ailes du nez", "Sous le contour des yeux"...
2. Décris l'aspect visuel observé : couleur (bleuté, rosé, terne, gris), texture (brillant, irrégulier, sec), volume ou forme.
3. Ajoute une cause probable douce et non médicale.
4. Ton rassurant, premium, jamais alarmiste ni médical.

RÈGLES pour "conseil" (28 à 36 mots) :
1. Nomme 1 ou 2 actifs précis avec concentration si possible.
2. Indique où appliquer (ciblé sur la zone, sur tout le visage...).
3. Adapté au type de peau et au schéma détecté (ex: si peau déshydratée + brillante → ne pas simplement matifier).

RÈGLES pour "synthese" (35 à 50 mots) :
1. Relie les 2 ou 3 observations entre elles avec "tandis que", "d'autant plus que", "en parallèle"...
2. Donne une direction globale de soin qui tient compte de toutes les zones.
3. Ton : chaleureuse conseillère beauté, pas technique.
4. Une seule phrase fluide et naturelle.

CONTRAINTES STRICTES :
- Ne parle QUE des zones présentes dans les données. Zéro invention.
- Langue : français uniquement, style élégant.
- Format : JSON valide UNIQUEMENT. Aucun texte hors JSON, aucun markdown.`;

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
        max_tokens:  1100,
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
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Réponse non parseable');
      parsed = JSON.parse(match[0]);
    }

    // Accepte les deux formats : objet avec insights + synthese, ou tableau direct
    const insightsArr = Array.isArray(parsed) ? parsed : (parsed.insights || []);
    const synthese    = typeof parsed.synthese === 'string' ? parsed.synthese : null;

    if (!insightsArr.length) throw new Error('Aucun insight dans la réponse');

    const sanitizedInsights = insightsArr
      .filter(item => ALLOWED_KEYS.includes(item?.key))
      .map(item => ({
        key:     String(item.key).slice(0, 30),
        phrase:  String(item.phrase  || '').slice(0, 350).replace(/<[^>]*>/g, ''),
        conseil: String(item.conseil || '').slice(0, 350).replace(/<[^>]*>/g, '')
      }));

    return res.status(200).json({
      insights: sanitizedInsights,
      synthese: synthese ? synthese.slice(0, 400).replace(/<[^>]*>/g, '') : null
    });

  } catch (err) {
    console.error('[skinInsights] erreur IA :', err.message);
    return res.status(500).json({ error: 'Génération IA échouée' });
  }
};
