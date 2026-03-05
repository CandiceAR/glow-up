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
      const res  = await fetch('data/rules.json');
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
  function evaluate(answers) {
    log = [];

    if (!rules || rules.length === 0) {
      logEntry('ERROR', 'Aucune règle chargée — application du FALLBACK');
      return applyFallback();
    }

    logEntry('START', `Évaluation démarrée — ${rules.length} règles disponibles`);
    logEntry('INPUT', `Réponses : ${JSON.stringify(answers)}`);

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

    return {
      routine: {
        ruleApplied:  matchedRule.id,
        ruleName:     matchedRule.name,
        matin:        matchedRule.routine?.matin   || [],
        soir:         matchedRule.routine?.soir    || [],
        warnings:     matchedRule.warnings         || [],
        makeupTips:   matchedRule.makeupTips       || [],
        log:          [...log]
      },
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
