/* ============================================================
   rulesEngine.js — Moteur de règles pur JS, sans IA
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const RulesEngine = (() => {

  let rules = null;
  let log   = [];

  // ─── Charger les règles ───────────────────────────────────────
  async function loadRules() {
    if (rules) return rules;
    try {
      const res  = await fetch('data/rules.json?v=136');
      const data = await res.json();
      rules = data.rules;
      console.log('[RulesEngine] Règles chargées:', rules.length);
      return rules;
    } catch (err) {
      console.error('[RulesEngine] Erreur chargement rules.json:', err);
      rules = [];
      return [];
    }
  }

  // ─── Évaluer les réponses et trouver la règle applicable ─────
  // ─── Enrichissement depuis l'analyse photo ───────────────────
  function _enrichFromPhoto(answers) {
    const enriched = { ...answers };

    // Toujours synchroniser complexes → concerns
    if (enriched.complexes && !enriched.concerns) {
      enriched.concerns = [...enriched.complexes];
    }

    const pd = answers.photoData;
    if (!pd) return enriched;

    // skinType depuis photo si pas de réponse quiz
    if (!enriched.skinType && pd.skinType?.type) {
      enriched.skinType = pd.skinType.type;
    }

    // oiliness depuis pores photo
    if (enriched.oiliness === undefined && pd.zones) {
      const poresAvg = Object.values(pd.zones).reduce((s, z) => s + (z.pores || 0), 0) / 5;
      enriched.oiliness = Math.min(10, Math.round(poresAvg / 10));
    }

    // sensitivity depuis redness photo
    if (enriched.sensitivity === undefined && pd.zones) {
      const redAvg = Object.values(pd.zones).reduce((s, z) => s + (z.redness || 0), 0) / 5;
      enriched.sensitivity = Math.min(10, Math.round(redAvg / 10));
    }

    // cernes depuis photo
    if (!enriched.complexes?.includes('cernes') && pd.cernes?.detected) {
      enriched.complexes = [...(enriched.complexes || []), 'cernes'];
      enriched.concerns  = [...(enriched.concerns  || []), 'cernes'];
    }

    // taches depuis photo (score taches moyen < 60 → taches visibles)
    if (!enriched.complexes?.includes('taches') && pd.zones) {
      const tachesAvg = Object.values(pd.zones).reduce((s, z) => s + (z.taches || 100), 0) / 5;
      if (tachesAvg < 60) {
        enriched.complexes = [...(enriched.complexes || []), 'taches'];
        enriched.concerns  = [...(enriched.concerns  || []), 'taches'];
      }
    }

    // éclat terne depuis photo (score éclat moyen < 40)
    if (!enriched.complexes?.includes('eclat_terne') && pd.zones) {
      const eclatAvg = Object.values(pd.zones).reduce((s, z) => s + (z.eclat || 100), 0) / 5;
      if (eclatAvg < 40) {
        enriched.complexes = [...(enriched.complexes || []), 'eclat_terne'];
        enriched.concerns  = [...(enriched.concerns  || []), 'eclat_terne'];
      }
    }

    // Métadonnées photo disponibles pour les adaptations
    if (pd.undertone)  enriched.undertone  = pd.undertone;
    if (pd.carnation)  enriched.carnation  = pd.carnation;
    if (pd.faceShape)  enriched.faceShape  = pd.faceShape;

    return enriched;
  }

  // ─── Post-traitement : adaptations sécurité et personnalisation ─
  function _applyAdaptations(routine, answers) {
    const adapted = {
      ...routine,
      matin:     routine.matin     ? routine.matin.map(s => ({ ...s }))     : [],
      soir:      routine.soir      ? routine.soir.map(s => ({ ...s }))      : [],
      warnings:  [...(routine.warnings  || [])],
      makeupTips:[...(routine.makeupTips || [])]
    };

    const labels    = Array.isArray(answers.labels)    ? answers.labels    : [];
    const complexes = Array.isArray(answers.complexes) ? answers.complexes : [];
    const ageGroup  = answers.ageGroup;

    const hasStep   = (arr, stepType) => arr.some(s => s.step === stepType);
    const labelHas  = kw => text => text.toLowerCase().includes(kw);

    // ── Grossesse (sécurité) : supprimer rétinol, AHA, BHA ──
    if (labels.includes('grossesse')) {
      const UNSAFE = ['rétinol', 'retinol', 'rétinoïde', 'aha', 'bha', 'salicylique', 'glycolique', 'lactique'];
      const isUnsafe = s => UNSAFE.some(kw => s.label.toLowerCase().includes(kw));
      adapted.matin = adapted.matin.filter(s => !isUnsafe(s));
      adapted.soir  = adapted.soir.filter(s  => !isUnsafe(s));
      if (!adapted.warnings[0]?.includes('grossesse')) {
        adapted.warnings.unshift('⚠️ Routine adaptée grossesse : rétinol, AHA et BHA retirés — consulte ton gynécologue avant tout actif');
      }
    }

    // ── Ado (moins-20) : pas de rétinol, BHA adouci ──
    if (ageGroup === 'moins-20') {
      const isRetinol = s => labelHas('rétinol')(s.label) || labelHas('retinol')(s.label);
      adapted.matin = adapted.matin.filter(s => !isRetinol(s));
      adapted.soir  = adapted.soir.filter(s  => !isRetinol(s));
      adapted.soir  = adapted.soir.map(s => {
        if (labelHas('salicylique')(s.label) || labelHas('bha')(s.label)) {
          return { ...s, note: '1x/semaine pour commencer' };
        }
        return s;
      });
    }

    // ── Cernes (photo ou déclaré) : ajouter contour yeux si absent ──
    if (complexes.includes('cernes') && !hasStep(adapted.matin, 'eye')) {
      const insertAt = Math.max(0, adapted.matin.length - 2);
      adapted.matin.splice(insertAt, 0, {
        order: adapted.matin.length + 1,
        step:  'eye',
        label: 'Contour des yeux décongestionnant',
        note:  "Tapotements doux avec l'annulaire, matin et soir"
      });
    }

    // ── Taches / éclat terne : booster note sérum Vitamine C ──
    if (complexes.includes('taches') || complexes.includes('eclat_terne')) {
      adapted.matin = adapted.matin.map(s => {
        if (s.step === 'serum' && !s.note.includes('Vit C') && !s.note.includes('tach')) {
          return { ...s, note: (s.note ? s.note + ' — ' : '') + 'Vit C pour unifier le teint' };
        }
        return s;
      });
    }

    // ── Mature (40+) : ajouter contour yeux si absent ──
    if (ageGroup === '40+' && !hasStep(adapted.matin, 'eye')) {
      const insertAt = Math.max(0, adapted.matin.length - 2);
      adapted.matin.splice(insertAt, 0, {
        order: adapted.matin.length + 1,
        step:  'eye',
        label: 'Contour des yeux repulpant — Peptides',
        note:  'Tapotements doux, matin et soir'
      });
    }

    return adapted;
  }

  function evaluate(answers) {
    log = [];

    if (!rules || rules.length === 0) {
      logEntry('ERROR', 'Aucune règle chargée — application du FALLBACK');
      return applyFallback();
    }

    // Enrichir les réponses avec les données photo
    answers = _enrichFromPhoto(answers);

    logEntry('START', `Évaluation démarrée — ${rules.length} règles disponibles`);
    logEntry('INPUT', `Réponses enrichies : skinType=${answers.skinType}, oiliness=${answers.oiliness}, sensitivity=${answers.sensitivity}`);

    // Trier par priorité décroissante (hors FALLBACK)
    const sorted = [...rules]
      .filter(r => r.id !== 'FALLBACK')
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let matchedRule = null;

    for (const rule of sorted) {
      const result = matchConditions(rule.conditions, answers, rule.id);
      if (result.match) {
        matchedRule = rule;
        logEntry('MATCH', `Règle ${rule.id} (${rule.name}) correspondante — score conditions: ${result.score}`);
        break;
      }
    }

    if (!matchedRule) {
      const fallback = rules.find(r => r.id === 'FALLBACK');
      if (fallback) {
        matchedRule = fallback;
        logEntry('FALLBACK', 'Aucune règle spécifique trouvée — Routine safe universelle appliquée');
      } else {
        logEntry('ERROR', 'Pas de FALLBACK défini');
        return applyFallback();
      }
    }

    logEntry('RESULT', `Règle appliquée : ${matchedRule.id} — ${matchedRule.name}`);

    const baseRoutine = {
      ruleApplied: matchedRule.id,
      ruleName:    matchedRule.name,
      matin:       matchedRule.routine?.matin   || [],
      soir:        matchedRule.routine?.soir    || [],
      warnings:    matchedRule.warnings         || [],
      makeupTips:  matchedRule.makeupTips       || [],
      log:         [...log]
    };

    const adaptedRoutine = _applyAdaptations(baseRoutine, answers);
    logEntry('ADAPT', `Adaptations appliquées (grossesse=${(answers.labels||[]).includes('grossesse')}, cernes=${(answers.complexes||[]).includes('cernes')}, ageGroup=${answers.ageGroup})`);

    return {
      routine: { ...adaptedRoutine, log: [...log] },
      log: [...log]
    };
  }

  // ─── Vérifier les conditions d'une règle ─────────────────────
  function matchConditions(conditions, answers, ruleId) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { match: true, score: 0 };
    }

    let score = 0;
    let allMatch = true;

    for (const [field, condition] of Object.entries(conditions)) {
      const value = answers[field];
      const result = evaluateCondition(field, value, condition, ruleId);

      if (!result.match) {
        logEntry('SKIP', `Règle ${ruleId} — condition "${field}" non satisfaite (valeur: ${JSON.stringify(value)}, requis: ${JSON.stringify(condition)})`);
        allMatch = false;
        break;
      }
      score += result.points || 1;
    }

    return { match: allMatch, score };
  }

  // ─── Évaluer une condition individuelle ───────────────────────
  function evaluateCondition(field, value, condition, ruleId) {
    // { in: ['grasse', 'mixte'] }
    if (condition.in !== undefined) {
      const vals = Array.isArray(value) ? value : [value];
      const match = vals.some(v => condition.in.includes(v));
      return { match, points: match ? 2 : 0 };
    }

    // { includes: 'acne' }
    if (condition.includes !== undefined) {
      const arr = Array.isArray(value) ? value : [value];
      const match = arr.includes(condition.includes);
      return { match, points: match ? 2 : 0 };
    }

    // { includesAny: ['acne', 'pores'] }
    if (condition.includesAny !== undefined) {
      const arr = Array.isArray(value) ? value : [value];
      const match = condition.includesAny.some(v => arr.includes(v));
      return { match, points: match ? 1 : 0 };
    }

    // { eq: 'experte' }
    if (condition.eq !== undefined) {
      const match = value === condition.eq;
      return { match, points: match ? 1 : 0 };
    }

    // { not: 'jamais' }
    if (condition.not !== undefined) {
      const match = value !== condition.not;
      return { match, points: match ? 1 : 0 };
    }

    // { gte: 7 }  — valeur numérique >= 7
    if (condition.gte !== undefined) {
      const num   = typeof value === 'number' ? value : parseFloat(value);
      const match = !isNaN(num) && num >= condition.gte;
      return { match, points: match ? 2 : 0 };
    }

    // { lte: 4 }  — valeur numérique <= 4
    if (condition.lte !== undefined) {
      const num   = typeof value === 'number' ? value : parseFloat(value);
      const match = !isNaN(num) && num <= condition.lte;
      return { match, points: match ? 2 : 0 };
    }

    // { range: [3, 6] }  — entre 3 et 6 inclus
    if (condition.range !== undefined) {
      const [lo, hi] = condition.range;
      const num   = typeof value === 'number' ? value : parseFloat(value);
      const match = !isNaN(num) && num >= lo && num <= hi;
      return { match, points: match ? 2 : 0 };
    }

    // { intersects: ['acne', 'pores'] }  — au moins 1 élément commun
    if (condition.intersects !== undefined) {
      const arr   = Array.isArray(value) ? value : (value ? [value] : []);
      const match = condition.intersects.some(v => arr.includes(v));
      return { match, points: match ? 1 : 0 };
    }

    // { notIncludes: 'retinol' }  — array ne contient PAS cet élément
    if (condition.notIncludes !== undefined) {
      const arr   = Array.isArray(value) ? value : (value ? [value] : []);
      const match = !arr.includes(condition.notIncludes);
      return { match, points: match ? 1 : 0 };
    }

    logEntry('WARN', `Règle ${ruleId} — opérateur inconnu dans condition "${field}": ${JSON.stringify(condition)}`);
    return { match: true, points: 0 };
  }

  // ─── Routine de secours (si rules.json non chargé) ───────────
  function applyFallback() {
    return {
      routine: {
        ruleApplied:  'FALLBACK',
        ruleName:     'Routine safe universelle',
        matin: [
          { order: 1, step: 'cleanser',    label: 'Nettoyant doux visage',   note: '' },
          { order: 2, step: 'moisturizer', label: 'Crème hydratante légère', note: '' },
          { order: 3, step: 'spf',         label: 'SPF 30 minimum',          note: 'La règle d\'or' }
        ],
        soir: [
          { order: 1, step: 'cleanser',    label: 'Nettoyant doux visage', note: '' },
          { order: 2, step: 'moisturizer', label: 'Crème hydratante',      note: '' }
        ],
        warnings:   ['Le SPF est le produit anti-âge n°1 selon tous les dermatologues'],
        makeupTips: [],
        log:        log
      },
      log
    };
  }

  // ─── Logger ───────────────────────────────────────────────────
  function logEntry(type, message) {
    const entry = { type, message, ts: new Date().toISOString() };
    log.push(entry);
    console.log(`[RulesEngine][${type}]`, message);
  }

  function getLog() { return [...log]; }

  return { loadRules, evaluate, getLog };

})();
