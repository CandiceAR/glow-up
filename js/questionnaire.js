/* ============================================================
   questionnaire.js — Questionnaire skincare (5 q) + makeup (5 q)
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const Questionnaire = (() => {

  // ─── Questions Skincare ───────────────────────────────────────
  const SKINCARE_QUESTIONS = [
    {
      id: 'q0',
      key: 'skinType',
      // Affiché uniquement si l'analyse photo n'a pas détecté le type de peau
      condition: () => !AppState?.face?.skinAnalysis?.skinType?.type,
      question: 'Quel est ton type de peau ?',
      type: 'single',
      required: true,
      options: [
        { value: 'normale',  label: 'Normale',  desc: 'Ni trop grasse, ni trop sèche' },
        { value: 'grasse',   label: 'Grasse',   desc: 'Brillances, pores dilatés' },
        { value: 'seche',    label: 'Sèche',    desc: 'Tiraillements, peaux fines' },
        { value: 'mixte',    label: 'Mixte',    desc: 'Zone T grasse, joues sèches' },
        { value: 'sensible', label: 'Sensible', desc: 'Rougeurs, réactions fréquentes' }
      ]
    },
    {
      id: 'q1',
      key: 'concerns',
      question: 'Quelles sont tes principales préoccupations ?',
      subtitle: 'Jusqu\'à 3 réponses',
      type: 'multiple',
      max: 3,
      required: true,
      options: [
        { value: 'acne',         label: 'Acné / Boutons' },
        { value: 'rougeurs',     label: 'Rougeurs / Irritations' },
        { value: 'rides',        label: 'Rides / Fermeté' },
        { value: 'pores',        label: 'Pores dilatés' },
        { value: 'eclat_terne',  label: 'Teint terne / sans éclat' },
        { value: 'taches',       label: 'Taches / Hyperpigmentation' },
        { value: 'cernes',       label: 'Cernes / Poches' },
        { value: 'deshydration', label: 'Déshydratation' }
      ]
    },
    {
      id: 'q2',
      key: 'objectives',
      question: 'Quel est ton objectif principal ?',
      type: 'single',
      required: true,
      options: [
        { value: 'anti-age',       label: 'Anti-âge',       desc: 'Prévenir et réduire les rides' },
        { value: 'eclat',          label: 'Éclat',          desc: 'Peau lumineuse, bonne mine' },
        { value: 'hydratation',    label: 'Hydratation',    desc: 'Peau souple et confortable' },
        { value: 'purification',   label: 'Purification',   desc: 'Réduire imperfections et pores' },
        { value: 'uniformisation', label: 'Uniformisation', desc: 'Unifier le teint, estomper taches' }
      ]
    },
    {
      id: 'q3',
      key: 'ageGroup',
      question: 'Dans quelle tranche d\'âge te situes-tu ?',
      type: 'single',
      required: true,
      options: [
        { value: 'moins-20', label: 'Moins de 20 ans', desc: 'Peau jeune, éclat naturel' },
        { value: '20-25',    label: '20 – 25 ans',     desc: 'Prévention & légèreté' },
        { value: '25-30',    label: '25 – 30 ans',     desc: 'Premiers soins ciblés' },
        { value: '30-40',    label: '30 – 40 ans',     desc: 'Soin actif & hydratation' },
        { value: '40+',      label: '40 ans et plus',  desc: 'Confort, éclat & fermeté' }
      ]
    },
    {
      id: 'q4',
      key: 'activeTolerance',
      question: 'Ta tolérance aux actifs cosmétiques ?',
      type: 'single',
      required: true,
      options: [
        { value: 'debutante',     label: 'Débutante',     desc: 'Premiers pas dans le skincare' },
        { value: 'intermediaire', label: 'Intermédiaire', desc: 'J\'utilise déjà AHA/BHA, Vit C...' },
        { value: 'experte',       label: 'Experte',       desc: 'Rétinol, acides forts, etc.' }
      ]
    },
    {
      id: 'q5',
      key: 'budget',
      question: 'Quel est ton budget mensuel skincare ?',
      type: 'single',
      required: true,
      options: [
        { value: 'low',     label: 'Moins de 20 €', desc: 'Budget serré, maxi efficacité' },
        { value: 'medium',  label: '20 – 50 €',     desc: 'Le juste milieu qualité/prix' },
        { value: 'high',    label: '50 – 100 €',    desc: 'Je mise sur ma peau' },
        { value: 'premium', label: 'Plus de 100 €', desc: 'Premium et sélectif' }
      ]
    }
  ];

  // ─── Questions Makeup ─────────────────────────────────────────
  const MAKEUP_QUESTIONS = [
    {
      id: 'mq1',
      key: 'mkSkinType',
      question: 'Ma peau au réveil est plutôt :',
      type: 'single',
      required: true,
      options: [
        { value: 'normale',  label: 'Normale',  desc: 'Équilibrée, sans excès' },
        { value: 'grasse',   label: 'Grasse',   desc: 'Brillances, pores visibles' },
        { value: 'seche',    label: 'Sèche',    desc: 'Tiraillements, desquamations' },
        { value: 'mixte',    label: 'Mixte',    desc: 'Zone T grasse, joues sèches' },
        { value: 'sensible', label: 'Sensible', desc: 'Réactive, rougeurs possibles' }
      ]
    },
    {
      id: 'mq2',
      key: 'mkLook',
      question: 'Aujourd\'hui, je veux un maquillage :',
      type: 'single',
      required: true,
      options: [
        { value: 'naturel', label: 'Naturel', desc: 'No-makeup makeup, peau nue améliorée' },
        { value: 'soigne',  label: 'Soigné',  desc: 'Everyday chic, bien fini' },
        { value: 'glam',    label: 'Glam',    desc: 'Full glam, impact maximal' }
      ]
    },
    {
      id: 'mq3',
      key: 'mkFocus',
      question: 'La zone que je veux le plus améliorer est :',
      type: 'single',
      required: true,
      options: [
        { value: 'yeux',   label: 'Les yeux',   desc: 'Regard, mascara, liner' },
        { value: 'levres', label: 'Les lèvres', desc: 'Couleur, volume, brillance' },
        { value: 'teint',  label: 'Le teint',   desc: 'Peau nette et lumineuse' },
        { value: 'joues',  label: 'Les joues',  desc: 'Bonne mine, structure' }
      ]
    },
    {
      id: 'mq4',
      key: 'mkTime',
      question: 'Le matin, j\'ai plutôt :',
      type: 'single',
      required: true,
      options: [
        { value: 'rapide',  label: 'Moins de 5 min', desc: 'Routine express, l\'essentiel' },
        { value: 'moyen',   label: '5 – 10 min',     desc: 'Un peu de temps pour moi' },
        { value: 'complet', label: 'Plus de 10 min', desc: 'Je prends le temps de me sublimer' }
      ]
    },
    {
      id: 'mq5',
      key: 'mkBudget',
      question: 'Je préfère :',
      type: 'single',
      required: true,
      options: [
        { value: 'petits-prix', label: 'Petits prix',     desc: 'Maxi effet, mini budget' },
        { value: 'bon-rapport', label: 'Bon rapport Q/P', desc: 'Qualité accessible' },
        { value: 'premium',     label: 'Premium',         desc: 'Je choisis les meilleurs' }
      ]
    }
  ];

  let mode = 'skincare'; // 'skincare' | 'makeup'
  let activeQuestions = [];
  let currentIndex = 0;

  // ─── Calculer les questions actives (avec conditions) ────────
  function computeActiveQuestions(questions) {
    return questions.filter(q => !q.condition || q.condition());
  }

  // ─── Réinitialiser ────────────────────────────────────────────
  function reset() {
    currentIndex = 0;
    AppState.questionnaire = { answers: {}, completed: false, currentQ: 0 };
  }

  // ─── Démarrer questionnaire skincare ─────────────────────────
  function startSkincare() {
    mode = 'skincare';
    reset();
    activeQuestions = computeActiveQuestions(SKINCARE_QUESTIONS);
    showScreen('questionnaire');
  }

  // ─── Démarrer questionnaire makeup ───────────────────────────
  function startMakeup() {
    mode = 'makeup';
    currentIndex = 0;
    AppState.makeupQuiz = {};
    activeQuestions = MAKEUP_QUESTIONS;
    showScreen('questionnaire');
  }

  // ─── Rendre la question courante ──────────────────────────────
  function render() {
    // Garantir que les questions actives sont initialisées
    if (!activeQuestions || activeQuestions.length === 0) {
      activeQuestions = mode === 'makeup'
        ? MAKEUP_QUESTIONS
        : computeActiveQuestions(SKINCARE_QUESTIONS);
    }

    const q = activeQuestions[currentIndex];
    if (!q) return;

    const container = document.getElementById('questionnaireContent');
    if (!container) return;

    const answers  = mode === 'makeup' ? (AppState.makeupQuiz || {}) : AppState.questionnaire.answers;
    const progress = Math.round(((currentIndex + 1) / activeQuestions.length) * 100);
    const isLast   = currentIndex === activeQuestions.length - 1;
    const ctaLabel = isLast
      ? (mode === 'makeup' ? 'Voir ma routine ✦' : 'Voir mes résultats ✦')
      : 'Continuer →';

    container.innerHTML = `
      <div class="q-progress-bar">
        <div class="q-progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="q-counter">${currentIndex + 1} / ${activeQuestions.length}</div>
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
          ${ctaLabel}
        </button>
      </div>`;

    // Restaurer les réponses déjà données
    const existing = answers[q.key];
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
    const answers = mode === 'makeup' ? AppState.makeupQuiz : AppState.questionnaire.answers;

    if (type === 'single') {
      document.querySelectorAll('.q-option').forEach(el => el.classList.remove('selected'));
      document.querySelector(`[data-value="${value}"]`)?.classList.add('selected');
      answers[key] = value;
    } else {
      const el      = document.querySelector(`[data-value="${value}"]`);
      const current = answers[key] || [];
      if (el.classList.contains('selected')) {
        el.classList.remove('selected');
        answers[key] = current.filter(v => v !== value);
      } else {
        if (current.length >= max) {
          showToast(`Maximum ${max} réponses`, 'warning');
          return;
        }
        el.classList.add('selected');
        answers[key] = [...current, value];
      }
    }
    updateNextBtn();
  }

  function updateNextBtn() {
    const q   = activeQuestions[currentIndex];
    const btn = document.getElementById('qNextBtn');
    if (!btn || !q) return;
    const answers = mode === 'makeup' ? AppState.makeupQuiz : AppState.questionnaire.answers;
    const answer  = answers[q.key];
    const valid   = !q.required || (Array.isArray(answer) ? answer.length > 0 : !!answer);
    btn.disabled      = !valid;
    btn.style.opacity = valid ? '1' : '0.5';
  }

  // ─── Navigation ───────────────────────────────────────────────
  function next() {
    const q       = activeQuestions[currentIndex];
    const answers = mode === 'makeup' ? AppState.makeupQuiz : AppState.questionnaire.answers;
    const answer  = answers[q.key];
    if (q.required && (Array.isArray(answer) ? answer.length === 0 : !answer)) {
      showToast('Merci de sélectionner une réponse', 'warning');
      return;
    }

    if (currentIndex < activeQuestions.length - 1) {
      currentIndex++;
      if (mode === 'skincare') AppState.questionnaire.currentQ = currentIndex;
      render();
    } else {
      submit();
    }
  }

  function prev() {
    if (currentIndex > 0) {
      currentIndex--;
      if (mode === 'skincare') AppState.questionnaire.currentQ = currentIndex;
      render();
    }
  }

  // ─── Soumettre ────────────────────────────────────────────────
  function submit() {
    if (mode === 'skincare') {
      AppState.questionnaire.completed = true;
      const { routine, log } = RulesEngine.evaluate(AppState.questionnaire.answers);
      AppState.routine = { ...routine, log };
      ProductCatalog.getRecommended(AppState.questionnaire.answers);
      if (typeof RoutineSaver !== 'undefined') RoutineSaver.saveProfile();
      showScreen('results');
    } else {
      // Makeup : AppState.makeupQuiz est déjà à jour, aller vers la routine
      showScreen('makeup');
    }
  }

  return {
    startSkincare, startMakeup,
    reset, render,
    selectOption, next, prev, submit,
    SKINCARE_QUESTIONS, MAKEUP_QUESTIONS
  };

})();
