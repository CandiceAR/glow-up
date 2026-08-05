/* ============================================================
   api/analyzeRoutine.js — Analyse experte d'une routine skincare via Claude
   Entrée : {
     products: [{ ref, brand, name, category, ingredientTags[], description }],
     quiz: { objectives[], skinDesc[], bother[], duration, notes },
     skin: { skinType, undertone, cernes, rougeurs, eclat, taches } | null
   }
   Sortie : { score, strengths[], improvements[], priorityActions[],
              products[], routine{}, optimized{} }
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

  const { products, quiz, skin, moment } = req.body || {};
  if (!Array.isArray(products) || !products.length) {
    return res.status(400).json({ error: 'products manquants' });
  }
  const momentLabel = moment === 'soir' ? 'du SOIR' : moment === 'matin' ? 'du MATIN' : '';

  // Produits compacts, indexés par ref
  const slim = products.slice(0, 20).map((p, i) => ({
    ref: i,
    brand: p.brand || '', name: p.name || '', category: p.category || 'other',
    actives: (p.ingredientTags || []).slice(0, 10),
    desc: (p.description || '').slice(0, 160)
  }));
  const validRefs = new Set(slim.map(p => p.ref));

  const prompt = `Tu es une dermo-conseillère experte en skincare. Analyse la routine ${momentLabel} d'une utilisatrice de façon PÉDAGOGIQUE, personnalisée et honnête, comme si tu examinais tout en détail.

${momentLabel ? `IMPORTANT : elle analyse UNIQUEMENT sa routine ${momentLabel}. Reste cohérente avec ce moment : le MATIN → le SPF est indispensable en dernière étape, on évite le rétinol/les exfoliants forts ; le SOIR → c'est le moment du rétinol/exfoliants, PAS de SPF. Ne reproche pas l'absence de SPF le soir, ni l'absence de rétinol le matin.\n` : ''}
PRODUITS DE SA ROUTINE (référencés par "ref") :
${JSON.stringify(slim, null, 0)}

SON QUESTIONNAIRE :
${JSON.stringify(quiz || {}, null, 0)}

SON PROFIL DE PEAU (analyse photo, peut être null) :
${JSON.stringify(skin || null, null, 0)}

Utilise ta connaissance des produits et de leurs actifs (INCI) même si tout n'est pas listé. Analyse À LA FOIS chaque produit ET la cohérence de TOUTE la routine (matin/soir, associations, doublons, manques).

RÈGLES :
- Sois honnête et bienveillante. Ne conseille pas d'acheter plus pour vendre : garde les produits déjà adaptés, ne remplace que le problématique, ne complète que si nécessaire.
- NE mentionne JAMAIS de "patch test", "test de tolérance" ou "test 48h" dans tes réponses (ni dans les why, différences, notes, actions ou commentaires).
- "verdict" par produit : "adapted" (✅ adapté), "weak" (⚠️ peu adapté), "discouraged" (❌ déconseillé).
- Explique simplement : pourquoi, quels actifs intéressants, quels actifs problématiques, redondance éventuelle, actif manquant.
- Pour les incompatibilités : pense rétinol+AHA/BHA, vitamine C + acides, niacinamide, exfoliants multiples, etc.
- "score" = compatibilité globale de la routine sur 100 (sois nuancée, pas toujours 80+).
- "priorityActions" = EXACTEMENT 3 actions concrètes, chacune avec type "keep" | "replace" | "add".

Retourne UNIQUEMENT ce JSON valide, sans texte avant/après :
{
  "score": 0-100,
  "strengths": ["2 à 4 points forts courts"],
  "improvements": ["2 à 4 axes d'amélioration courts"],
  "priorityActions": [
    { "type": "keep|replace|add", "text": "action concrète et courte" }
  ],
  "products": [
    {
      "ref": 0,
      "verdict": "adapted|weak|discouraged",
      "why": "explication simple et courte",
      "goodIngredients": ["actifs intéressants"],
      "problemIngredients": ["actifs problématiques pour SA peau — [] si aucun"],
      "redundantWith": "ref d'un autre produit en doublon, ou ''",
      "missingNote": "actif/étape manquant lié à ce produit, ou ''"
    }
  ],
  "routine": {
    "worksTogether": boolean,
    "incompatibilities": ["incompatibilités concrètes — [] si aucune"],
    "duplicateActives": ["actifs présents en double — [] si aucun"],
    "uselessProducts": ["ref des produits redondants/inutiles — [] si aucun"],
    "missingSteps": ["étapes manquantes, ex: 'SPF le matin' — [] si aucune"],
    "amCoherent": boolean,
    "pmCoherent": boolean,
    "comment": "synthèse courte de la cohérence de la routine"
  },
  "optimized": {
    "keep": ["ref des produits à garder"],
    "replace": [{ "ref": 0, "suggestion": "type de produit/actif à privilégier", "reason": "pourquoi" }],
    "add": [{ "what": "produit/étape à ajouter", "reason": "pourquoi" }]
  }
}
Les "ref" renvoient à l'index des produits fournis. N'invente pas de produits inexistants.`;

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
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error('[analyzeRoutine] API error:', resp.status, errData);
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

    const strArr = (v, n = 6, len = 160) => Array.isArray(v)
      ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.slice(0, len)).slice(0, n) : [];
    const refArr = (v, n = 20) => Array.isArray(v)
      ? v.map(x => parseInt(x, 10)).filter(x => validRefs.has(x)).slice(0, n) : [];
    const VERDICTS = ['adapted', 'weak', 'discouraged'];
    const ATYPES   = ['keep', 'replace', 'add'];

    const score = Math.max(0, Math.min(100, parseInt(parsed.score, 10) || 0));

    const priorityActions = (Array.isArray(parsed.priorityActions) ? parsed.priorityActions : [])
      .filter(a => a && typeof a.text === 'string')
      .slice(0, 3)
      .map(a => ({ type: ATYPES.includes(a.type) ? a.type : 'keep', text: a.text.slice(0, 160) }));

    const prods = (Array.isArray(parsed.products) ? parsed.products : [])
      .filter(p => p && validRefs.has(parseInt(p.ref, 10)))
      .map(p => ({
        ref:                parseInt(p.ref, 10),
        verdict:            VERDICTS.includes(p.verdict) ? p.verdict : 'weak',
        why:                typeof p.why === 'string' ? p.why.slice(0, 300) : '',
        goodIngredients:    strArr(p.goodIngredients, 6, 60),
        problemIngredients: strArr(p.problemIngredients, 6, 60),
        redundantWith:      validRefs.has(parseInt(p.redundantWith, 10)) ? parseInt(p.redundantWith, 10) : null,
        missingNote:        typeof p.missingNote === 'string' ? p.missingNote.slice(0, 160) : ''
      }));

    const R = parsed.routine || {};
    const routine = {
      worksTogether:     Boolean(R.worksTogether),
      incompatibilities: strArr(R.incompatibilities),
      duplicateActives:  strArr(R.duplicateActives),
      uselessProducts:   refArr(R.uselessProducts),
      missingSteps:      strArr(R.missingSteps),
      amCoherent:        Boolean(R.amCoherent),
      pmCoherent:        Boolean(R.pmCoherent),
      comment:           typeof R.comment === 'string' ? R.comment.slice(0, 400) : ''
    };

    const O = parsed.optimized || {};
    const optimized = {
      keep:    refArr(O.keep),
      replace: (Array.isArray(O.replace) ? O.replace : [])
        .filter(x => x && validRefs.has(parseInt(x.ref, 10)))
        .slice(0, 10)
        .map(x => ({ ref: parseInt(x.ref, 10),
                     suggestion: typeof x.suggestion === 'string' ? x.suggestion.slice(0, 160) : '',
                     reason: typeof x.reason === 'string' ? x.reason.slice(0, 200) : '' })),
      add: (Array.isArray(O.add) ? O.add : [])
        .filter(x => x && typeof x.what === 'string')
        .slice(0, 6)
        .map(x => ({ what: x.what.slice(0, 120),
                     reason: typeof x.reason === 'string' ? x.reason.slice(0, 200) : '' }))
    };

    return res.status(200).json({
      score,
      strengths:    strArr(parsed.strengths, 4),
      improvements: strArr(parsed.improvements, 4),
      priorityActions,
      products: prods,
      routine,
      optimized
    });

  } catch (err) {
    console.error('[analyzeRoutine] erreur:', err.message);
    return res.status(500).json({ error: 'Analyse IA échouée' });
  }
};
