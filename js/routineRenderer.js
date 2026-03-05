/* ============================================================
   routineRenderer.js — Affichage de la routine personnalisée
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const RoutineRenderer = (() => {

  const STEP_ICONS = {
    cleanser:    '🫧',
    toner:       '💧',
    serum:       '✨',
    treatment:   '⚗️',
    eye:         '👁️',
    moisturizer: '🌿',
    oil:         '🌸',
    exfoliant:   '🔬',
    spf:         '☀️',
    default:     '◇'
  };

  // ─── Rendre tout l'écran résultats ───────────────────────────
  function renderResults() {
    const container = document.getElementById('resultsContent');
    if (!container) return;

    const { routine } = AppState;
    if (!routine.ruleApplied) {
      container.innerHTML = '<p class="empty-state">Complète le questionnaire pour voir ta routine.</p>';
      return;
    }

    container.innerHTML = `
      <div class="results-header">
        <span class="section-tag">Diagnostic personnalisé</span>
        <h1>${routine.ruleName || 'Ta Routine'}</h1>
        <p>Basée sur tes réponses, voici la routine adaptée à ta peau.</p>
      </div>

      ${renderWarnings(routine.warnings)}
      ${renderRoutineSection('Routine du matin', routine.matin, '🌅')}
      ${renderRoutineSection('Routine du soir', routine.soir, '🌙')}
      ${renderMakeupTips(routine.makeupTips)}

      <div class="results-cta">
        <p class="results-cta-text">Découvre les produits que nous recommandons pour cette routine.</p>
        <button class="btn btn-dark" onclick="showScreen('products')">
          Voir les produits recommandés →
        </button>
        <button class="btn btn-outline" onclick="showScreen('tryon')" style="margin-top:12px">
          Essayer virtuellement ✦
        </button>
      </div>

      ${renderDebugLog(routine.log)}
    `;
  }

  // ─── Section matin ou soir ────────────────────────────────────
  function renderRoutineSection(title, steps, emoji) {
    if (!steps || steps.length === 0) return '';

    const stepsHtml = steps
      .sort((a, b) => a.order - b.order)
      .map((step, i) => `
        <div class="routine-step">
          <div class="step-number">${i + 1}</div>
          <div class="step-icon">${STEP_ICONS[step.step] || STEP_ICONS.default}</div>
          <div class="step-info">
            <div class="step-label">${step.label}</div>
            ${step.note ? `<div class="step-note">${step.note}</div>` : ''}
          </div>
          <div class="step-type">${formatStepType(step.step)}</div>
        </div>`).join('');

    return `
      <div class="routine-section">
        <div class="routine-section-header">
          <span class="routine-emoji">${emoji}</span>
          <h2>${title}</h2>
        </div>
        <div class="routine-steps">${stepsHtml}</div>
      </div>`;
  }

  // ─── Avertissements ───────────────────────────────────────────
  function renderWarnings(warnings) {
    if (!warnings || warnings.length === 0) return '';
    return `
      <div class="routine-warnings">
        <h3>⚠️ Points importants</h3>
        <ul>
          ${warnings.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>`;
  }

  // ─── Conseils maquillage ──────────────────────────────────────
  function renderMakeupTips(tips) {
    if (!tips || tips.length === 0) return '';
    return `
      <div class="makeup-tips">
        <h3>💄 Conseils maquillage pour ton type de peau</h3>
        <ul>
          ${tips.map(t => `<li>${t}</li>`).join('')}
        </ul>
      </div>`;
  }

  // ─── Debug log (mode dev) ─────────────────────────────────────
  function renderDebugLog(log) {
    if (!log || log.length === 0) return '';
    // Affiché seulement si on met ?debug dans l'URL
    if (!window.location.search.includes('debug')) return '';

    return `
      <details class="debug-log">
        <summary>🔍 Log du moteur de règles</summary>
        <pre>${log.map(e => `[${e.type}] ${e.message}`).join('\n')}</pre>
      </details>`;
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function formatStepType(step) {
    const labels = {
      cleanser:    'Nettoyant',
      toner:       'Tonique',
      serum:       'Sérum',
      treatment:   'Traitement',
      eye:         'Contour yeux',
      moisturizer: 'Hydratant',
      oil:         'Huile',
      exfoliant:   'Exfoliant',
      spf:         'Protection solaire'
    };
    return labels[step] || step;
  }

  return { renderResults };

})();
