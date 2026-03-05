/* ============================================================
   questionnaire.js — 10 questions + progression
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const Questionnaire = (() => {

  const QUESTIONS = [
    {
      id: 'q1',
      key: 'skinType',
      question: 'Quel est ton type de peau ?',
      type: 'single',
      required: true,
      options: [
        { value: 'normale',   label: 'Normale',   desc: 'Ni trop grasse, ni trop sèche' },
        { value: 'grasse',    label: 'Grasse',     desc: 'Brillances, pores dilatés' },
        { value: 'seche',     label: 'Sèche',      desc: 'Tiraillements, peaux fines' },
        { value: 'mixte',     label: 'Mixte',      desc: 'Zone T grasse, joues sèches' },
        { value: 'sensible',  label: 'Sensible',   desc: 'Rougeurs, réactions fréquentes' }
      ]
    },
    {
      id: 'q2',
      key: 'concerns',
      question: 'Quelles sont tes principales préoccupations ?',
      subtitle: 'Jusqu\'à 3 réponses',
      type: 'multiple',
      max: 3,
      required: true,
      options: [
        { value: 'acne',          label: 'Acné / Boutons' },
        { value: 'rougeurs',      label: 'Rougeurs / Irritations' },
        { value: 'rides',         label: 'Rides / Fermeté' },
        { value: 'pores',         label: 'Pores dilatés' },
        { value: 'eclat_terne',   label: 'Teint terne / sans éclat' },
        { value: 'taches',        label: 'Taches / Hyperpigmentation' },
        { value: 'cernes',        label: 'Cernes / Poches' },
        { value: 'deshydration',  label: 'Déshydratation' }
      ]
    },
    {
      id: 'q3',
      key: 'objectives',
      question: 'Quel est ton objectif principal ?',
      type: 'single',
      required: true,
      options: [
        { value: 'anti-age',        label: 'Anti-âge',       desc: 'Prévenir et réduire les rides' },
        { value: 'eclat',           label: 'Éclat',          desc: 'Peau lumineuse, bonne mine' },
        { value: 'hydratation',     label: 'Hydratation',    desc: 'Peau souple et confortable' },
        { value: 'purification',    label: 'Purification',   desc: 'Réduire imperfections et pores' },
        { value: 'uniformisation',  label: 'Uniformisation', desc: 'Unifier le teint, estomper taches' }
      ]
    },
    {
      id: 'q4',
      key: 'budget',
      question: 'Quel est ton budget mensuel skincare ?',
      type: 'single',
      required: true,
      options: [
        { value: 'low',    label: 'Moins de 20 €',   desc: 'Budget serré, maxi efficacité' },
        { value: 'medium', label: '20 – 50 €',       desc: 'Le juste milieu qualité/prix' },
        { value: 'high',   label: '50 – 100 €',      desc: 'Je mise sur ma peau' },
        { value: 'premium',label: 'Plus de 100 €',   desc: 'Premium et sélectif' }
      ]
    },
    {
      id: 'q5',
      key: 'frequency',
      question: 'À quelle fréquence fais-tu ta routine ?',
      type: 'single',
      required: true,
      options: [
        { value: 'matin-soir',    label: 'Matin & soir',         desc: 'Routine complète deux fois/jour' },
        { value: 'matin',         label: 'Matin seulement',      desc: 'Je me concentre sur le matin' },
        { value: 'soir',          label: 'Soir seulement',       desc: 'Préférence pour la routine nuit' },
        { value: 'occasionnel',   label: 'Occasionnellement',    desc: 'Quelques fois par semaine' }
      ]
    },
    {
      id: 'q6',
      key: 'activeTolerance',
      question: 'Ta tolérance aux actifs cosmétiques ?',
      type: 'single',
      required: true,
      options: [
        { value: 'debutante',     label: 'Débutante',            desc: 'Premiers pas dans le skincare' },
        { value: 'intermediaire', label: 'Intermédiaire',        desc: 'J\'utilise déjà AHA/BHA, Vit C...' },
        { value: 'experte',       label: 'Experte',              desc: 'Rétinol, acides forts, etc.' }
      ]
    },
    {
      id: 'q7',
      key: 'fragranceSensitive',
      question: 'Es-tu sensible aux parfums dans les soins ?',
      type: 'single',
      required: true,
      options: [
        { value: 'oui',  label: 'Oui',  desc: 'Je réagis souvent aux parfums' },
        { value: 'non',  label: 'Non',  desc: 'Aucun problème avec les parfums' }
      ]
    },
    {
      id: 'q8',
      key: 'makeupFrequency',
      question: 'Tu portes du maquillage ?',
      type: 'single',
      required: true,
      options: [
        { value: 'jamais',       label: 'Jamais',           desc: 'Je préfère le naturel' },
        { value: 'parfois',      label: 'Parfois',          desc: 'Selon les occasions' },
        { value: 'tous-les-jours', label: 'Tous les jours', desc: 'Partie de ma routine quotidienne' }
      ]
    },
    {
      id: 'q9',
      key: 'makeupUsed',
      question: 'Quels produits maquillage utilises-tu ?',
      subtitle: 'Sélectionne tout ce que tu utilises',
      type: 'multiple',
      max: 4,
      required: false,
      options: [
        { value: 'lipstick',    label: 'Rouge à lèvres / Gloss' },
        { value: 'blush',       label: 'Blush / Fard à joues' },
        { value: 'foundation',  label: 'Fond de teint / BB Cream' },
        { value: 'mascara',     label: 'Mascara' }
      ]
    },
    {
      id: 'q10',
      key: 'skinTone',
      question: 'Quelle est ta carnation ?',
      subtitle: 'Pour personnaliser les aperçus de maquillage',
      type: 'single',
      required: true,
      options: [
        { value: 'light',   label: 'Claire',   desc: 'Peau très claire à claire' },
        { value: 'medium',  label: 'Medium',   desc: 'Carnation intermédiaire' },
        { value: 'dark',    label: 'Foncée',   desc: 'Peau foncée à très foncée' }
      ]
    }
  ];

  let currentIndex = 0;

  // ─── Réinitialiser ────────────────────────────────────────────
  function reset() {
    currentIndex = 0;
    AppState.questionnaire = { answers: {}, completed: false, currentQ: 0 };
  }

  // ─── Démarrer le questionnaire ────────────────────────────────
  function start() {
    reset();
    showScreen('questionnaire');
    render();
  }

  // ─── Rendre la question courante ──────────────────────────────
  function render() {
    const q = QUESTIONS[currentIndex];
    const container = document.getElementById('questionnaireContent');
    if (!container) return;

    const progress = Math.round(((currentIndex + 1) / QUESTIONS.length) * 100);

    container.innerHTML = `
      <div class="q-progress-bar">
        <div class="q-progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="q-counter">${currentIndex + 1} / ${QUESTIONS.length}</div>
      <div class="q-card">
        <h2 class="q-question">${q.question}</h2>
        ${q.subtitle ? `<p class="q-subtitle">${q.subtitle}</p>` : ''}
        <div class="q-options ${q.type === 'multiple' ? 'q-multiple' : 'q-single'}">
          ${renderOptions(q)}
        </div>
      </div>
      <div class="q-navigation">
        ${currentIndex > 0
          ? '<button class="btn btn-outline q-back" onclick="Questionnaire.prev()">← Retour</button>'
          : ''}
        <button class="btn btn-dark q-next" id="qNextBtn" onclick="Questionnaire.next()">
          ${currentIndex < QUESTIONS.length - 1 ? 'Continuer →' : 'Voir mes résultats ✦'}
        </button>
      </div>`;

    // Restaurer réponses déjà données
    const existing = AppState.questionnaire.answers[q.key];
    if (existing) {
      const vals = Array.isArray(existing) ? existing : [existing];
      vals.forEach(v => {
        const el = container.querySelector(`[data-value="${v}"]`);
        if (el) el.classList.add('selected');
      });
    }

    updateNextBtn();
  }

  function renderOptions(q) {
    return q.options.map(opt => `
      <div class="q-option" data-value="${opt.value}" onclick="Questionnaire.selectOption('${q.key}', '${opt.value}', '${q.type}', ${q.max || 1})">
        <div class="q-option-label">${opt.label}</div>
        ${opt.desc ? `<div class="q-option-desc">${opt.desc}</div>` : ''}
      </div>`).join('');
  }

  // ─── Sélectionner une option ──────────────────────────────────
  function selectOption(key, value, type, max) {
    if (type === 'single') {
      document.querySelectorAll('.q-option').forEach(el => el.classList.remove('selected'));
      document.querySelector(`[data-value="${value}"]`)?.classList.add('selected');
      AppState.questionnaire.answers[key] = value;
    } else {
      // Multiple
      const el = document.querySelector(`[data-value="${value}"]`);
      const current = AppState.questionnaire.answers[key] || [];
      if (el.classList.contains('selected')) {
        el.classList.remove('selected');
        AppState.questionnaire.answers[key] = current.filter(v => v !== value);
      } else {
        if (current.length >= max) {
          showToast(`Maximum ${max} réponses`, 'warning');
          return;
        }
        el.classList.add('selected');
        AppState.questionnaire.answers[key] = [...current, value];
      }
    }
    updateNextBtn();
  }

  function updateNextBtn() {
    const q = QUESTIONS[currentIndex];
    const btn = document.getElementById('qNextBtn');
    if (!btn) return;
    const answer = AppState.questionnaire.answers[q.key];
    const valid = !q.required || (Array.isArray(answer) ? answer.length > 0 : !!answer);
    btn.disabled = !valid;
    btn.style.opacity = valid ? '1' : '0.5';
  }

  // ─── Navigation ───────────────────────────────────────────────
  function next() {
    const q = QUESTIONS[currentIndex];
    const answer = AppState.questionnaire.answers[q.key];
    if (q.required && (Array.isArray(answer) ? answer.length === 0 : !answer)) {
      showToast('Merci de sélectionner une réponse', 'warning');
      return;
    }

    if (currentIndex < QUESTIONS.length - 1) {
      currentIndex++;
      AppState.questionnaire.currentQ = currentIndex;
      render();
    } else {
      submit();
    }
  }

  function prev() {
    if (currentIndex > 0) {
      currentIndex--;
      AppState.questionnaire.currentQ = currentIndex;
      render();
    }
  }

  // ─── Soumettre et générer la routine ─────────────────────────
  function submit() {
    AppState.questionnaire.completed = true;
    const { routine, log } = RulesEngine.evaluate(AppState.questionnaire.answers);
    AppState.routine = { ...routine, log };

    // Recommandation produits
    ProductCatalog.getRecommended(AppState.questionnaire.answers);

    showScreen('results');
  }

  return { start, reset, render, selectOption, next, prev, submit, QUESTIONS };

})();
