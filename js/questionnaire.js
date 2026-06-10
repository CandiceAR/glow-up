/* ============================================================
   questionnaire.js — Questionnaire premium GLOW UP
   • 15 étapes dynamiques (skipIf + prefill depuis analyse photo)
   • Types : single, multiple, slider, face-map, photo-step, textarea
   • Transitions slide entre questions
   ============================================================ */

'use strict';

const Questionnaire = (() => {

  // ─── Définition des questions ─────────────────────────────────

  const QUESTIONS = [

    // Q0 — Complexes (toujours affichée, multiple max 2)
    {
      id: 'q0', key: 'complexes', type: 'multiple', max: 2,
      question: 'Qu\'est-ce qui te complexe le plus ?',
      subtitle: 'Choisis jusqu\'à 2 réponses',
      required: true,
      skipIf: null,
      options: [
        { value: 'acne',      emoji: '😓', label: 'Acné / Boutons',        desc: 'Points noirs, kystes, imperfections' },
        { value: 'taches',    emoji: '🫥', label: 'Taches & Teint inégal', desc: 'Hyperpigmentation, cicatrices' },
        { value: 'rides',     emoji: '🕰', label: 'Rides & Fermeté',       desc: 'Perte de tonus, sillons' },
        { value: 'cernes',    emoji: '😴', label: 'Cernes & Poches',       desc: 'Regard fatigué, cercles sombres' },
        { value: 'pores',     emoji: '🔬', label: 'Pores dilatés',         desc: 'Peau d\'orange, brillances' },
        { value: 'eclat',     emoji: '✨', label: 'Teint terne',            desc: 'Sans éclat, mine grise' },
        { value: 'secheresse',emoji: '🏜', label: 'Sécheresse',            desc: 'Tiraillements, squames' },
        { value: 'rougeurs',  emoji: '🌹', label: 'Rougeurs & Sensibilité',desc: 'Réactivité, couperose' }
      ]
    },

    // Q0b — Couleur des cernes (conditionnel : complexes contient cernes)
    {
      id: 'q0b', key: 'cernesColor', type: 'single', required: false,
      question: 'De quelle couleur sont tes cernes ?',
      subtitle: 'Pour te proposer le bon correcteur coloré dans ta routine maquillage',
      skipIf: (answers) => !answers.complexes?.includes('cernes'),
      options: [
        { value: 'bleu_violet', emoji: '💜', label: 'Bleus / Violets', desc: 'Circulation sanguine visible, fatigue, peau fine' },
        { value: 'marron',      emoji: '🟤', label: 'Marrons / Bruns',  desc: 'Hyperpigmentation, soleil, hérédité' },
        { value: 'rouge_rose',  emoji: '🔴', label: 'Rouges / Rosés',   desc: 'Irritation, sensibilité, inflammation' },
        { value: 'gris',        emoji: '⚫', label: 'Gris / Ternes',    desc: 'Manque d\'éclat, fatigue chronique' }
      ]
    },

    // Q-PHOTO — Étape analyse photo intégrée (jamais sautée)
    {
      id: 'q-photo', key: null, type: 'photo-step',
      question: 'Analyse ta peau en temps réel',
      subtitle: 'Pour des recommandations ultra-personnalisées',
      required: false,
      skipIf: null
    },

    // Q1 — Type de peau (toujours affiché — photo pré-sélectionne mais user peut corriger)
    {
      id: 'q1', key: 'skinType', type: 'single',
      question: 'Quel est ton type de peau ?',
      required: true,
      skipIf: null,
      prefill: (photo) => photo?.skinType?.type,
      options: [
        { value: 'normale',  emoji: '◇', label: 'Normale',  desc: 'Équilibrée, confortable' },
        { value: 'grasse',   emoji: '◎', label: 'Grasse',   desc: 'Brillances, pores dilatés' },
        { value: 'seche',    emoji: '○', label: 'Sèche',    desc: 'Tiraillements, inconfort' },
        { value: 'mixte',    emoji: '⟡', label: 'Mixte',    desc: 'Zone T grasse, joues sèches' },
        { value: 'sensible', emoji: '△', label: 'Sensible', desc: 'Rougeurs, réactivité fréquente' }
      ]
    },

    // Q2 — Brillance slider (skip si photo a mesuré les pores)
    {
      id: 'q2', key: 'oiliness', type: 'slider',
      question: 'À quel point ta peau brille-t-elle ?',
      required: false,
      min: 0, maxVal: 10,
      labels: ['Aucune brillance', 'Brille toute la journée'],
      skipIf: (answers, photo) => _hasPhotoZones(photo),
      prefill: (photo) => _oilinessFromPhoto(photo)
    },

    // Q3 — Visage interactif (skip si photo faite)
    {
      id: 'q3', key: 'problemZones', type: 'face-map',
      question: 'Où se concentrent tes problèmes ?',
      subtitle: 'Touche les zones concernées',
      required: false,
      skipIf: (answers, photo) => _hasPhotoZones(photo)
    },

    // Q4 — Sensibilité slider
    {
      id: 'q4', key: 'sensitivity', type: 'slider',
      question: 'Ma peau est sensible…',
      required: true,
      min: 0, maxVal: 10,
      labels: ['Pas du tout', 'Extrêmement sensible'],
      skipIf: (answers, photo) => _hasPhotoZones(photo),
      prefill: (photo) => _sensitivityFromPhoto(photo)
    },

    // Q5 — Localisation rougeurs (conditionnel : sensitivity ≥ 7)
    {
      id: 'q5', key: 'rednessZones', type: 'multiple', max: 4,
      question: 'Où apparaissent tes rougeurs ?',
      required: false,
      skipIf: (answers) => !answers.complexes?.includes('rougeurs'),
      options: [
        { value: 'joues',   emoji: '🌹', label: 'Joues',   desc: '' },
        { value: 'nez',     emoji: '🔴', label: 'Nez',     desc: '' },
        { value: 'menton',  emoji: '🫦', label: 'Menton',  desc: '' },
        { value: 'partout', emoji: '😮', label: 'Partout', desc: 'Le visage entier réagit' }
      ]
    },

    // Q6 — Imperfections détail (conditionnel : complexes contient acne)
    {
      id: 'q6', key: 'acneType', type: 'multiple', max: 2,
      question: 'Quel type d\'imperfections as-tu surtout ?',
      required: false,
      skipIf: (answers) => !answers.complexes?.includes('acne'),
      options: [
        { value: 'points_noirs',  emoji: '⚫', label: 'Points noirs',     desc: 'Comédons ouverts' },
        { value: 'points_blancs', emoji: '⚪', label: 'Points blancs',    desc: 'Comédons fermés' },
        { value: 'kystes',        emoji: '🔴', label: 'Kystes / Nodules', desc: 'Profonds, douloureux' },
        { value: 'cicatrices',    emoji: '🩹', label: 'Cicatrices',       desc: 'Post-acnéiques' }
      ]
    },

    // Q7 — Fermeté (conditionnel : complexes contient rides)
    {
      id: 'q7', key: 'firmness', type: 'slider',
      question: 'Comment est la fermeté de ta peau ?',
      required: false,
      min: 0, maxVal: 10,
      labels: ['Très ferme', 'Très relâchée'],
      skipIf: (answers) => !answers.complexes?.includes('rides')
    },

    // Q8 — Objectif prioritaire
    {
      id: 'q8', key: 'objectives', type: 'single',
      question: 'Quel est ton objectif principal ?',
      required: true, skipIf: null,
      options: [
        { value: 'anti-age',       emoji: '⏳', label: 'Anti-âge',       desc: 'Prévenir et réduire les rides' },
        { value: 'eclat',          emoji: '✨', label: 'Éclat',           desc: 'Teint lumineux, bonne mine' },
        { value: 'hydratation',    emoji: '💧', label: 'Hydratation',     desc: 'Peau souple et confortable' },
        { value: 'purification',   emoji: '🌿', label: 'Purification',    desc: 'Réduire imperfections et pores' },
        { value: 'uniformisation', emoji: '🪞', label: 'Uniformisation',  desc: 'Unifier le teint, estomper taches' },
        { value: 'apaisement',     emoji: '🕊', label: 'Apaisement',      desc: 'Calmer la réactivité' }
      ]
    },

    // Q9 — Tranche d'âge
    {
      id: 'q9', key: 'ageGroup', type: 'single',
      question: 'Dans quelle tranche d\'âge te situes-tu ?',
      required: true, skipIf: null,
      options: [
        { value: 'moins-20', emoji: '🌸', label: 'Moins de 20 ans', desc: 'Peau jeune, éclat naturel' },
        { value: '20-25',    emoji: '🌺', label: '20 – 25 ans',     desc: 'Prévention & légèreté' },
        { value: '25-30',    emoji: '🌻', label: '25 – 30 ans',     desc: 'Premiers soins ciblés' },
        { value: '30-40',    emoji: '🌹', label: '30 – 40 ans',     desc: 'Soin actif & hydratation' },
        { value: '40+',      emoji: '🌷', label: '40 ans et plus',  desc: 'Confort, éclat & fermeté' }
      ]
    },

    // Q10 — Texture préférée
    {
      id: 'q10', key: 'texture', type: 'single',
      question: 'Quelle texture préfères-tu sur ta peau ?',
      required: true, skipIf: null,
      options: [
        { value: 'gel',    emoji: '💎', label: 'Gel',     desc: 'Frais, non-gras, absorbe vite' },
        { value: 'fluide', emoji: '💧', label: 'Fluide',  desc: 'Léger, pénétration rapide' },
        { value: 'creme',  emoji: '🍦', label: 'Crème',   desc: 'Nourrissante, enveloppante' },
        { value: 'baume',  emoji: '🧴', label: 'Baume',   desc: 'Très riche, cocon protecteur' },
        { value: 'huile',  emoji: '🫙', label: 'Huile',   desc: 'Éclat, nourrit en profondeur' }
      ]
    },

    // Q11 — Budget
    {
      id: 'q11', key: 'budget', type: 'single',
      question: 'Quel est ton budget mensuel skincare ?',
      required: true, skipIf: null,
      options: [
        { value: 'low',     emoji: '🌱', label: 'Moins de 20 €', desc: 'Budget serré, maxi efficacité' },
        { value: 'medium',  emoji: '🌿', label: '20 – 50 €',     desc: 'Le juste milieu qualité/prix' },
        { value: 'high',    emoji: '🌳', label: '50 – 100 €',    desc: 'Je mise sur ma peau' },
        { value: 'premium', emoji: '✦',  label: 'Plus de 100 €', desc: 'Premium et sélectif' }
      ]
    },

    // Q12 — Ingrédients à éviter
    {
      id: 'q12', key: 'avoidIngredients', type: 'multiple', max: 5,
      question: 'Des ingrédients à éviter ?',
      subtitle: 'Allergies, intolérances, préférences — optionnel',
      required: false, skipIf: null,
      options: [
        { value: 'alcool',      emoji: '🚫', label: 'Alcool dénaturé',    desc: '' },
        { value: 'parfum',      emoji: '🚫', label: 'Parfum / Fragrance', desc: '' },
        { value: 'silicones',   emoji: '🚫', label: 'Silicones',          desc: '' },
        { value: 'parabens',    emoji: '🚫', label: 'Parabènes',          desc: '' },
        { value: 'retinol',     emoji: '⚠️', label: 'Rétinol',            desc: '' },
        { value: 'aha_bha',     emoji: '⚠️', label: 'AHA / BHA',          desc: '' },
        { value: 'niacinamide', emoji: '⚠️', label: 'Niacinamide',        desc: '' }
      ]
    },

    // Q13 — Labels
    {
      id: 'q13', key: 'labels', type: 'multiple', max: 3,
      question: 'Des labels importants pour toi ?',
      subtitle: 'Optionnel',
      required: false, skipIf: null,
      options: [
        { value: 'vegan',              emoji: '🌱', label: 'Vegan',            desc: '' },
        { value: 'bio',                emoji: '🌿', label: 'Bio / Certifié',   desc: '' },
        { value: 'cruelty',            emoji: '🐰', label: 'Cruelty-free',     desc: '' },
        { value: 'grossesse',          emoji: '🤰', label: 'Grossesse safe',   desc: '' },
        { value: 'dermo',              emoji: '🏥', label: 'Dermato-testé',    desc: '' },
        { value: 'non_comedogenique',  emoji: '◇',  label: 'Non-comédogène',  desc: '' }
      ]
    },

    // Q14 — Style skincare préféré
    {
      id: 'q14', key: 'skincareStyle', type: 'single',
      question: 'Quel est ton style de skincare préféré ?',
      subtitle: 'Pour des recommandations encore plus ciblées',
      required: false, skipIf: null,
      options: [
        { value: 'minimaliste',  emoji: '◇',  label: 'Minimaliste',        desc: 'Le moins de produits possible, maxi efficacité' },
        { value: 'dermo',        emoji: '🏥', label: 'Dermocosmétique',    desc: 'Formules cliniques, validées dermato' },
        { value: 'naturel',      emoji: '🌿', label: 'Naturel',            desc: 'Ingrédients d\'origine naturelle, clean' },
        { value: 'luxe',         emoji: '✦',  label: 'Luxe',               desc: 'Textures premium, expérience sensorielle' },
        { value: 'korean',       emoji: '🇰🇷', label: 'Produits coréens',   desc: 'K-Beauty, rituel multi-étapes, innovations' }
      ]
    },

    // Q15 — Champ libre
    {
      id: 'q15', key: 'freeText', type: 'textarea',
      question: 'Autre chose à me dire sur ta peau ?',
      subtitle: 'Optionnel — allergies spécifiques, contexte particulier…',
      required: false, skipIf: null,
      placeholder: 'Ex : j\'utilise déjà de la vitamine C, je suis enceinte…'
    }
  ];

  // ─── Helpers photo ────────────────────────────────────────────

  function _hasPhotoZones(photo) {
    return !!(photo?.zones && Object.keys(photo.zones).length > 0);
  }

  function _oilinessFromPhoto(photo) {
    if (!_hasPhotoZones(photo)) return 5;
    const avg = Object.values(photo.zones).reduce((s, z) => s + (z.pores || 0), 0) / 5;
    return Math.min(10, Math.round(avg / 10));
  }

  function _sensitivityFromPhoto(photo) {
    if (!_hasPhotoZones(photo)) return 3;
    const avg = Object.values(photo.zones).reduce((s, z) => s + (z.redness || 0), 0) / 5;
    return Math.min(10, Math.round(avg / 10));
  }

  function _numVal(v) {
    return typeof v === 'number' ? v : 0;
  }

  // ─── State ────────────────────────────────────────────────────

  let currentIndex = 0;   // index direct dans QUESTIONS[]
  let mode = 'skincare';  // 'skincare' | 'makeup'
  let sliding = false;

  // ─── Navigation dans QUESTIONS[] en tenant compte des skipIf ─

  function _shouldSkip(q) {
    if (!q.skipIf) return false;
    const answers   = AppState.questionnaire.answers;
    const photo     = AppState.face?.skinAnalysis;
    const skip      = !!q.skipIf(answers, photo);
    if (skip) console.log('[Q] SKIP', q.id, '| photo skinType:', photo?.skinType?.type);
    return skip;
  }

  function _firstActive() {
    for (let i = 0; i < QUESTIONS.length; i++) {
      if (!_shouldSkip(QUESTIONS[i])) return i;
    }
    return 0;
  }

  function _nextActive(from) {
    for (let i = from + 1; i < QUESTIONS.length; i++) {
      if (!_shouldSkip(QUESTIONS[i])) return i;
    }
    return -1; // fin
  }

  function _prevActive(from) {
    for (let i = from - 1; i >= 0; i--) {
      if (!_shouldSkip(QUESTIONS[i])) return i;
    }
    return -1;
  }

  function _visibleCount() {
    return QUESTIONS.filter((q, i) => !_shouldSkip(q)).length;
  }

  function _visiblePosition() {
    let pos = 0;
    for (let i = 0; i <= currentIndex; i++) {
      if (!_shouldSkip(QUESTIONS[i])) pos++;
    }
    return pos;
  }

  // ─── Init ─────────────────────────────────────────────────────

  function reset() {
    AppState.questionnaire = { answers: {}, completed: false, currentQ: 0, photoPreFill: {} };
    currentIndex = 0;
  }

  function startSkincare() {
    mode = 'skincare';
    // Effacer la routine sauvegardée pour repartir de zéro
    if (typeof RoutineSaver !== 'undefined') RoutineSaver.clear();
    // Effacer l'analyse photo précédente pour que q-photo s'affiche
    if (AppState.face) {
      AppState.face.skinAnalysis = null;
      AppState.face.photo        = null;
    }
    reset();
    currentIndex = 0; // Q0 toujours en premier
    showScreen('questionnaire');
  }

  // Photo renvoie 'light'/'dark', les options MQ utilisent 'clair'/'fonce'
  const CARN_PHOTO_MAP = { light: 'clair', medium: 'medium', dark: 'fonce', clair: 'clair', fonce: 'fonce' };

  function startMakeup() {
    mode = 'makeup';
    const analysis = AppState?.face?.skinAnalysis;
    makeupIndex = analysis ? 1 : 0;
    AppState.makeupQuiz = {
      mkCarnation: CARN_PHOTO_MAP[analysis?.carnation?.type] || null,
      mkUndertone: analysis?.undertone?.type || null
    };
    showScreen('questionnaire');
    render();
  }

  function _prefillFromPhoto() {
    const photo = AppState.face?.skinAnalysis;
    if (!photo) return;
    QUESTIONS.forEach(q => {
      if (q.prefill && q.key) {
        const val = q.prefill(photo);
        if (val !== undefined && val !== null) {
          AppState.questionnaire.answers[q.key] = val;
          AppState.questionnaire.photoPreFill[q.key] = val;
        }
      }
    });
  }

  // ─── Render ───────────────────────────────────────────────────

  function render() {
    if (mode === 'makeup') { _renderMakeupLegacy(); return; }

    // Guard : s'assurer que l'état est initialisé
    if (!AppState.questionnaire?.answers) {
      AppState.questionnaire = { answers: {}, completed: false, currentQ: 0, photoPreFill: {} };
    }

    const container = document.getElementById('questionnaireContent');
    if (!container) return;

    const q          = QUESTIONS[currentIndex];
    if (!q) return;
    console.log('[Q] Affichage question', currentIndex, q.id, q.type, '| skipIf?', !!q.skipIf);

    const total      = _visibleCount();
    const pos        = _visiblePosition();
    const pct        = Math.round((pos / total) * 100);
    const photo      = AppState.face?.skinAnalysis;
    const isPhotoQ   = q.type === 'photo-step';
    const hasPhoto   = !!photo;
    const isPrefilled = q.key && AppState.questionnaire.photoPreFill?.[q.key] !== undefined;

    const prevIdx  = _prevActive(currentIndex);
    const nextIdx  = _nextActive(currentIndex);
    const isLast   = nextIdx === -1;
    const ctaLabel = isLast ? 'Voir mes résultats ✦' : 'Continuer →';

    container.innerHTML = `
      <div class="q-progress-header">
        <span class="q-progress-counter">${pos} / ${total}</span>
        ${hasPhoto ? '<span class="q-progress-photo-badge">✦ Analyse photo active</span>' : ''}
      </div>
      <div class="q-progress-bar">
        <div class="q-progress-fill" style="width:${pct}%"></div>
      </div>

      <div class="q-card" id="qCard">
        ${isPrefilled ? '<div class="q-prefill-badge">✦ Pré-rempli depuis ton analyse photo</div>' : ''}
        <h2 class="q-question">${q.question}</h2>
        ${q.subtitle ? `<p class="q-subtitle">${q.subtitle}</p>` : ''}
        <div id="qOptionsWrap">
          ${_renderOptions(q)}
        </div>
      </div>

      <div class="q-navigation">
        ${prevIdx >= 0
          ? '<button class="btn btn-outline q-back" onclick="Questionnaire.prev()">← Retour</button>'
          : '<div></div>'}
        ${(q.type !== 'photo-step' || AppState.face?.skinAnalysis)
          ? `<button class="btn btn-dark q-next" id="qNextBtn" onclick="Questionnaire.next()">${ctaLabel}</button>`
          : ''}
      </div>`;

    _restoreAnswer(q);
    _updateNextBtn();
  }

  // ─── Renderers par type ───────────────────────────────────────

  function _renderOptions(q) {
    switch (q.type) {
      case 'single':
      case 'multiple':  return _renderChoices(q);
      case 'slider':    return _renderSlider(q);
      case 'face-map':  return _renderFaceMap(q);
      case 'photo-step':return _renderPhotoStep(q);
      case 'textarea':  return _renderTextarea(q);
      default:          return '';
    }
  }

  function _renderChoices(q) {
    const answers = AppState.questionnaire.answers;
    const sel     = answers[q.key];
    const selArr  = Array.isArray(sel) ? sel : (sel ? [sel] : []);

    return q.options.map(opt => {
      const checked = selArr.includes(opt.value);
      return `<div class="q-option-premium${checked ? ' selected' : ''}"
                   data-value="${opt.value}"
                   onclick="Questionnaire.selectOption('${q.key}','${opt.value}','${q.type}',${q.max || 1})">
        <span class="q-option-emoji">${opt.emoji || ''}</span>
        <div class="q-option-body">
          <div class="q-option-label">${opt.label}</div>
          ${opt.desc ? `<div class="q-option-desc">${opt.desc}</div>` : ''}
        </div>
        <div class="q-option-check">✓</div>
      </div>`;
    }).join('');
  }

  function _renderSlider(q) {
    const answers = AppState.questionnaire.answers;
    const val     = answers[q.key] !== undefined ? answers[q.key] : 5;
    const label   = _sliderLabel(val, q);
    const bgStyle = `background: linear-gradient(to right, var(--nude) 0%, var(--nude) ${val*10}%, var(--sand) ${val*10}%, var(--sand) 100%)`;

    return `<div class="q-slider-wrap">
      <div class="q-slider-value-display" id="sliderVal">${val}</div>
      <div class="q-slider-value-label"  id="sliderLbl">${label}</div>
      <input type="range" class="q-slider" id="qSlider"
             min="${q.min}" max="${q.maxVal}" step="1" value="${val}"
             style="${bgStyle}"
             oninput="Questionnaire.onSlider('${q.key}', this.value)">
      <div class="q-slider-extremes">
        <span>${q.labels[0]}</span>
        <span>${q.labels[1]}</span>
      </div>
    </div>`;
  }

  function _sliderLabel(val, q) {
    val = parseInt(val);
    if (q.key === 'oiliness') {
      if (val <= 2) return 'Peau très mate';
      if (val <= 4) return 'Légères brillances';
      if (val <= 6) return 'Brillances modérées';
      if (val <= 8) return 'Peau grasse';
      return 'Très grasse, brille toute la journée';
    }
    if (q.key === 'sensitivity') {
      if (val <= 2) return 'Peau solide, réagit rarement';
      if (val <= 4) return 'Quelques réactions occasionnelles';
      if (val <= 6) return 'Assez réactive';
      if (val <= 8) return 'Peau sensible, réagit souvent';
      return 'Hyper-sensible, réagit à presque tout';
    }
    if (q.key === 'firmness') {
      if (val <= 2) return 'Peau très ferme et tonique';
      if (val <= 4) return 'Légère perte de tonus';
      if (val <= 6) return 'Tonus modérément diminué';
      if (val <= 8) return 'Peau relâchée';
      return 'Peau très relâchée';
    }
    return '';
  }

  function _renderFaceMap(q) {
    const answers  = AppState.questionnaire.answers;
    const photo    = AppState.face?.skinAnalysis;
    const selected = answers[q.key] || [];

    // Zones problématiques détectées par la photo (score > 60 = rouge)
    const photoHot = {};
    if (photo?.zones) {
      for (const [zone, data] of Object.entries(photo.zones)) {
        if ((data.redness || 0) > 45 || (data.pores || 0) > 55) photoHot[zone] = true;
      }
    }

    const zone = (id, d) => {
      const isSel      = selected.includes(id);
      const isFromPhoto = photoHot[id];
      let cls = 'face-zone';
      if (isSel)        cls += ' selected';
      if (isFromPhoto)  cls += ' from-photo';
      return `<path class="${cls}" d="${d}" data-zone="${id}"
                    onclick="Questionnaire.toggleZone('${id}')" />`;
    };

    const chips = selected.length
      ? selected.map(z => `<span class="q-face-chip">${_zoneLabel(z)}</span>`).join('')
      : '<span style="font-size:0.8rem;color:var(--muted);">Touche les zones concernées</span>';

    return `<div class="q-face-map-wrap">
      <svg class="q-face-map-svg" viewBox="0 0 200 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Front -->
        ${zone('forehead', 'M 60 30 Q 100 5 140 30 L 145 75 Q 100 65 55 75 Z')}
        <!-- Nez -->
        ${zone('nose', 'M 85 100 L 90 145 Q 100 155 110 145 L 115 100 Q 100 90 85 100 Z')}
        <!-- Joue gauche -->
        ${zone('leftCheek', 'M 30 105 Q 55 95 80 110 L 78 160 Q 55 168 35 155 Z')}
        <!-- Joue droite -->
        ${zone('rightCheek', 'M 170 105 Q 145 95 120 110 L 122 160 Q 145 168 165 155 Z')}
        <!-- Menton -->
        ${zone('chin', 'M 75 175 Q 100 192 125 175 L 128 210 Q 100 225 72 210 Z')}
        <!-- Contour yeux (gauche) -->
        ${zone('leftEye', 'M 48 88 Q 68 80 88 88 Q 68 100 48 88 Z')}
        <!-- Contour yeux (droite) -->
        ${zone('rightEye', 'M 152 88 Q 132 80 112 88 Q 132 100 152 88 Z')}
        <!-- Séparateur front/yeux -->
        <line x1="55" y1="80" x2="145" y2="80" stroke="rgba(201,169,138,0.2)" stroke-width="1"/>
      </svg>
      <div class="q-face-map-chips" id="faceChips">${chips}</div>
    </div>`;
  }

  function _zoneLabel(z) {
    return { forehead: 'Front', nose: 'Nez', leftCheek: 'Joue gauche',
             rightCheek: 'Joue droite', chin: 'Menton',
             leftEye: 'Contour œil G', rightEye: 'Contour œil D' }[z] || z;
  }

  function _renderPhotoStep(q) {
    const photo = AppState.face?.skinAnalysis;
    if (photo) {
      // Photo déjà faite — afficher résumé
      return _renderPhotoMiniResult(photo);
    }
    const existingPhoto = AppState.face?.photo;
    if (existingPhoto) {
      // Photo capturée mais pas encore analysée
      return `<div class="q-photo-step">
        <img src="${existingPhoto}" class="q-photo-step-preview" alt="Ta photo">
        <div class="q-photo-analyzing">
          <div class="q-photo-scan-ring"></div>
          <p style="font-size:0.85rem;color:var(--muted);">Analyse en cours…</p>
        </div>
      </div>`;
    }

    return `<div class="q-photo-step">
      <p style="font-size:0.9rem;color:var(--muted);margin-bottom:20px;">
        En 5 secondes, l'IA analyse ta peau et pré-remplit les questions suivantes.
      </p>
      <div class="q-photo-buttons">
        <button class="btn btn-dark" onclick="Questionnaire.takePhoto()">📸 Prendre une photo</button>
        <label class="btn btn-outline" style="cursor:pointer;text-align:center;">
          📂 Uploader une photo
          <input type="file" accept="image/*" style="display:none"
                 onchange="Questionnaire.uploadPhoto(this)">
        </label>
      </div>
      <button class="q-textarea-skip" onclick="Questionnaire.skipPhoto()">
        Passer cette étape →
      </button>
    </div>`;
  }

  function _renderPhotoMiniResult(photo) {
    const photoSrc = AppState.face?.photo;
    const overlayDiv = photoSrc
      ? `<div id="q-face-overlay-target"></div>`
      : `<div style="font-size:3rem;margin-bottom:12px;">📸</div>`;

    // Priorités dynamiques (remplace le score)
    const priorities = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildPriorities)
      ? SkinAnalysis.buildPriorities(photo, AppState.questionnaire?.answers || {}) : [];
    const prioritiesHtml = priorities.length ? `
      <div class="q-priorities">
        <div class="q-priorities-title">✨ ${priorities.length} priorités identifiées pour ta peau</div>
        <div class="q-priorities-list">
          ${priorities.map(p => `
            <div class="q-priority">
              <span class="q-priority-emoji">${p.emoji}</span>
              <span class="q-priority-label">${p.label}</span>
            </div>`).join('')}
        </div>
      </div>` : '';

    const INSIGHT_EMOJI = {
      redness: '🌿', sebum: '✨', taches: '☀️', terne: '💫', texture: '🫧', cernes: '🌙', positive: '🌸'
    };

    const insights = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.getTopInsights)
      ? SkinAnalysis.getTopInsights(photo) : [];

    // Portrait beauté — valoriser d'abord (comme une conseillère qui complimente)
    const portrait = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildBeautyPortrait)
      ? SkinAnalysis.buildBeautyPortrait(photo) : [];
    const portraitHtml = portrait.length ? `
      <div class="q-portrait">
        <div class="q-portrait-title">✦ Tes atouts</div>
        <ul class="q-portrait-list">
          ${portrait.map(l => `<li>${l}</li>`).join('')}
        </ul>
      </div>` : '';

    const insightsHtml = insights.length ? `
      <div class="q-insights">
        <div class="q-insights-title">Ce que Glow Up a détecté</div>
        ${insights.map(({ key, pillLabel, sentence, advice, rank }) => {
          const emoji = INSIGHT_EMOJI[key] || '◆';
          const isPri = rank === 0;
          return `<div class="q-insight-item${isPri ? ' q-insight-primary' : ''}" data-insight-key="${key}">
            <span class="q-insight-emoji">${emoji}</span>
            <div class="q-insight-body">
              <div class="q-insight-name">${pillLabel || key}</div>
              <div class="q-insight-sentence">${sentence || ''}</div>
              <div class="q-insight-advice">${advice || ''}</div>
            </div>
          </div>`;
        }).join('')}
        <div class="q-insight-synthese" style="display:none"></div>
      </div>` : '';

    const skinLabel = { normale:'Normale', grasse:'Grasse', seche:'Sèche', mixte:'Mixte', sensible:'Sensible' };
    const chips = [];
    if (photo.skinType?.type)   chips.push(`🧬 ${skinLabel[photo.skinType.type] || photo.skinType.type}`);
    if (photo.undertone?.label) chips.push(`🎨 ${photo.undertone.label}`);
    if (photo.carnation?.label) chips.push(`✨ ${photo.carnation.label}`);
    const chipsHtml = chips.length
      ? `<div class="q-photo-base-chips">${chips.map(c => `<span class="q-photo-chip">${c}</span>`).join('')}</div>`
      : '';

    return `<div class="q-photo-step">
      ${overlayDiv}
      ${prioritiesHtml}
      ${portraitHtml}
      ${insightsHtml}
      ${chipsHtml}
      <div class="q-photo-buttons" style="margin-top:16px;">
        <button class="btn btn-outline" onclick="Questionnaire.retakePhoto()" style="font-size:0.85rem;">
          🔄 Refaire l'analyse photo
        </button>
      </div>
      <button class="q-textarea-skip" onclick="Questionnaire.next()">
        Continuer avec ces données →
      </button>
    </div>`;
  }

  function _renderTextarea(q) {
    const val = AppState.questionnaire.answers[q.key] || '';
    return `<div>
      <textarea class="q-textarea" id="qTextarea" placeholder="${q.placeholder || ''}"
                oninput="Questionnaire.onTextarea('${q.key}', this.value)"
                rows="4">${val}</textarea>
      <span class="q-textarea-skip" onclick="Questionnaire.next()">Passer →</span>
    </div>`;
  }

  // ─── Interactions ─────────────────────────────────────────────

  function selectOption(key, value, type, max) {
    if (!AppState.questionnaire) AppState.questionnaire = { answers: {}, completed: false, currentQ: 0, photoPreFill: {} };
    const answers = AppState.questionnaire.answers;
    const maxInt  = parseInt(max, 10) || 99;
    console.log('[Q selectOption]', key, value, 'type:', type, 'max reçu:', max, '→ maxInt:', maxInt, '| déjà sélectionné:', answers[key]);

    if (type === 'single') {
      document.querySelectorAll('.q-option-premium').forEach(el => el.classList.remove('selected'));
      document.querySelector(`[data-value="${value}"]`)?.classList.add('selected');
      answers[key] = value;
      _updateNextBtn();
      // Auto-avance sur mobile après 220ms
      setTimeout(() => { if (!_isLastQuestion()) next(); }, 220);

    } else {
      const el      = document.querySelector(`[data-value="${value}"]`);
      const current = Array.isArray(answers[key]) ? [...answers[key]] : [];
      if (el?.classList.contains('selected')) {
        el.classList.remove('selected');
        answers[key] = current.filter(v => v !== value);
      } else {
        if (current.length >= maxInt) {
          showToast(`Maximum ${maxInt} réponse${maxInt > 1 ? 's' : ''}`, 'warning'); return;
        }
        el?.classList.add('selected');
        answers[key] = [...current, value];
      }
      _updateNextBtn();
    }
  }

  function onSlider(key, value) {
    const val  = parseInt(value);
    const q    = QUESTIONS[currentIndex];
    AppState.questionnaire.answers[key] = val;

    const display = document.getElementById('sliderVal');
    const lbl     = document.getElementById('sliderLbl');
    if (display) display.textContent = val;
    if (lbl)     lbl.textContent     = _sliderLabel(val, q);

    // Update gradient
    const slider = document.getElementById('qSlider');
    if (slider) {
      slider.style.background = `linear-gradient(to right, var(--nude) 0%, var(--nude) ${val*10}%, var(--sand) ${val*10}%, var(--sand) 100%)`;
    }
    _updateNextBtn();
  }

  function toggleZone(zoneId) {
    const answers = AppState.questionnaire.answers;
    const zones   = answers.problemZones || [];
    const idx     = zones.indexOf(zoneId);

    if (idx >= 0) {
      answers.problemZones = zones.filter(z => z !== zoneId);
      document.querySelector(`[data-zone="${zoneId}"]`)?.classList.remove('selected');
    } else {
      answers.problemZones = [...zones, zoneId];
      document.querySelector(`[data-zone="${zoneId}"]`)?.classList.add('selected');
    }

    const chips = answers.problemZones.length
      ? answers.problemZones.map(z => `<span class="q-face-chip">${_zoneLabel(z)}</span>`).join('')
      : '<span style="font-size:0.8rem;color:var(--muted);">Touche les zones concernées</span>';
    const el = document.getElementById('faceChips');
    if (el) el.innerHTML = chips;
    _updateNextBtn();
  }

  function onTextarea(key, value) {
    AppState.questionnaire.answers[key] = value;
  }

  // ─── Photo step ───────────────────────────────────────────────

  function takePhoto() {
    sessionStorage.setItem('glow_resume_questionnaire', '1');
    showScreen('capture');
  }

  function retakePhoto() {
    // Efface l'analyse existante et relance la capture
    if (AppState.face) {
      AppState.face.photo        = null;
      AppState.face.skinAnalysis = null;
    }
    AppState.questionnaire.photoPreFill = {};
    takePhoto();
  }

  function uploadPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      AppState.face = AppState.face || {};
      AppState.face.photo       = e.target.result;
      AppState.face.skinAnalysis = null;

      // Analyse en arrière-plan (skincare ET makeup) — pas d'écran intermédiaire lourd
      _showPhotoAnalyzing();
      try {
        if (typeof SkinAnalysis !== 'undefined') {
          const result = await SkinAnalysis.analyzeFromPhoto(e.target.result);
          if (result) AppState.face.skinAnalysis = result;
        }
      } catch {}

      if (mode === 'makeup') {
        // Pré-remplir carnation / sous-ton du quiz makeup depuis la photo
        const an = AppState.face.skinAnalysis;
        AppState.makeupQuiz = AppState.makeupQuiz || {};
        AppState.makeupQuiz.mkCarnation = CARN_PHOTO_MAP[an?.carnation?.type] || AppState.makeupQuiz.mkCarnation || null;
        AppState.makeupQuiz.mkUndertone = an?.undertone?.type || AppState.makeupQuiz.mkUndertone || null;
        makeupIndex = 0; // rester sur l'étape photo pour afficher l'analyse
      } else {
        _prefillFromPhoto();
      }

      // Afficher d'abord l'analyse (avec sympathie), puis continuer le questionnaire
      _showPhotoResult();
    };
    reader.readAsDataURL(file);
  }

  function skipPhoto() {
    _slideTo(_nextActive(currentIndex), 'forward');
  }

  function resumeFromPhoto() {
    // Appelé depuis app.js quand la photo est capturée et l'analyse terminée
    _prefillFromPhoto();
    _showPhotoResult();
  }

  function continueFromAnalysis() {
    sessionStorage.removeItem('glow_from_questionnaire');
    _prefillFromPhoto();
    const photoIdx = QUESTIONS.findIndex(q => q.type === 'photo-step');
    const startIdx = photoIdx >= 0 ? photoIdx : 0;
    currentIndex = _nextActive(startIdx);
    if (currentIndex < 0) currentIndex = startIdx;
    AppState.questionnaire.currentQ = currentIndex;
    showScreen('questionnaire');
  }

  function _showPhotoAnalyzing() {
    const wrap = document.getElementById('qOptionsWrap');
    if (!wrap) return;
    wrap.innerHTML = `<div class="q-photo-analyzing">
      <div class="q-photo-scan-ring"></div>
      <p style="font-size:0.85rem;color:var(--muted);">Analyse de ta peau…</p>
    </div>`;
  }

  function _showPhotoResult() {
    showScreen('questionnaire');
    render();
    const overlayTarget = document.getElementById('q-face-overlay-target');
    if (overlayTarget && typeof SkinAnalysis !== 'undefined') {
      SkinAnalysis.renderFaceOverlay(
        overlayTarget,
        AppState.face?.photo,
        AppState.face?.landmarks,
        AppState.face?.skinAnalysis
      );
    }
    // Enrichissement IA async — n'attend pas, affiche le template en attendant
    _enrichWithAI();
  }

  // ─── IA enrichissement — génère des insights personnalisés via Haiku ──

  function _canUseSkinAI() {
    const plan = AppState.user?.plan;
    if (plan === 'glow' || plan === 'glowplus') return true;
    // Si déjà enrichi dans cette session → ne rappelle pas
    if (AppState.face?.skinAnalysis?.aiInsights) return false;
    // Free : une seule fois à vie
    if (localStorage.getItem('glow_skin_ai_used')) return false;
    return true;
  }

  function _markSkinAIUsed() {
    const plan = AppState.user?.plan;
    if (plan === 'glow' || plan === 'glowplus') return;
    localStorage.setItem('glow_skin_ai_used', '1');
  }

  async function _enrichWithAI() {
    const result = AppState.face?.skinAnalysis;
    if (!result) return;
    if (!_canUseSkinAI()) {
      // Si déjà en cache dans AppState (même session), réappliquer directement
      const cached = result.aiInsights;
      if (cached) {
        _swapInsightTexts(cached.insights || cached);
        if (cached.synthese) _showSynthese(cached.synthese);
      }
      return;
    }

    const insights = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.getTopInsights)
      ? SkinAnalysis.getTopInsights(result) : [];
    if (!insights.length) return;

    // Indicateur discret pendant le chargement
    _setInsightsLoading(true);

    const analysisData = {
      score:     result.globalScore ?? 65,
      skinType:  result.skinType?.type  || 'normale',
      undertone: result.undertone?.type || 'neutral',
      carnation: result.carnation?.type || 'medium',
      cernes:    result.cernes?.detected
        ? { detected: true, type: result.cernes.type, intensity: result.cernes.intensity }
        : null,
      insights: insights.map(({ key, severity, zones, zoneKey }) => {
        const pm = result.zones?.[zoneKey] || {};
        return {
          key,
          severity,
          zonesDetail: (zones || []).map(z => ({
            zone: z.zoneKey,
            severity: Math.round(z.severity)
          })),
          primaryMetrics: {
            redness: Math.round(pm.redness ?? 0),
            pores:   Math.round(pm.pores   ?? 0),
            eclat:   Math.round(pm.eclat   ?? 0),
            taches:  Math.round(pm.taches  ?? 0),
            texture: Math.round(pm.texture ?? 0)
          }
        };
      }),
      precision: (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildPrecisionContext)
        ? SkinAnalysis.buildPrecisionContext(result)
        : null
    };

    try {
      const resp = await fetch('/api/skinInsights', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisData })
      });
      _setInsightsLoading(false);
      if (!resp.ok) return;
      const { insights: aiInsights } = await resp.json();
      if (!Array.isArray(aiInsights) || !aiInsights.length) return;

      _swapInsightTexts(aiInsights.insights || aiInsights);
      if (aiInsights.synthese) _showSynthese(aiInsights.synthese);
      _markSkinAIUsed();
      result.aiInsights = aiInsights;

    } catch (err) {
      _setInsightsLoading(false);
      console.warn('[GlowAI] enrichissement échoué, templates conservés :', err.message);
    }
  }

  function _setInsightsLoading(on) {
    const wrap = document.querySelector('.q-insights');
    if (!wrap) return;
    if (on) wrap.classList.add('q-insights--loading');
    else    wrap.classList.remove('q-insights--loading');
  }

  function _swapInsightTexts(aiInsights) {
    aiInsights.forEach(({ key, phrase, conseil }) => {
      const item = document.querySelector(`[data-insight-key="${key}"]`);
      if (!item) return;
      const sentenceEl = item.querySelector('.q-insight-sentence');
      const adviceEl   = item.querySelector('.q-insight-advice');

      // Fondu doux pour le remplacement
      [sentenceEl, adviceEl].forEach(el => {
        if (el) { el.style.transition = 'opacity 0.35s'; el.style.opacity = '0'; }
      });
      setTimeout(() => {
        if (sentenceEl && phrase)  { sentenceEl.textContent = phrase;  sentenceEl.style.opacity = '1'; }
        if (adviceEl   && conseil) { adviceEl.textContent   = conseil; adviceEl.style.opacity   = '1'; }
      }, 380);
    });
  }

  function _showSynthese(text) {
    if (!text) return;
    const el = document.querySelector('.q-insight-synthese');
    if (!el) return;
    el.style.opacity = '0';
    el.style.display = 'block';
    el.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      el.textContent = text;
      el.style.opacity = '1';
    }, 600);
  }

  // ─── Navigation ───────────────────────────────────────────────

  function next() {
    if (mode === 'makeup') {
      const q = MAKEUP_QUESTIONS[makeupIndex];

      // Quitter l'étape photo → pré-remplir carnation + undertone depuis l'analyse
      if (q.type === 'photo-step') {
        const analysis = AppState?.face?.skinAnalysis;
        if (analysis) {
          AppState.makeupQuiz = AppState.makeupQuiz || {};
          if (analysis.carnation?.type) AppState.makeupQuiz.mkCarnation = CARN_PHOTO_MAP[analysis.carnation.type] || analysis.carnation.type;
          if (analysis.undertone?.type) AppState.makeupQuiz.mkUndertone = analysis.undertone.type;
        }
        makeupIndex++;
        _renderMakeupLegacy();
        return;
      }

      const answers = AppState.makeupQuiz || {};
      if (q.required && !answers[q.key]) return;
      const nextMkIdx = _mkNextActive(makeupIndex);
      if (nextMkIdx >= 0) { makeupIndex = nextMkIdx; _renderMakeupLegacy(); }
      else { showScreen('makeup'); }
      return;
    }
    const q       = QUESTIONS[currentIndex];
    const answers = AppState.questionnaire.answers;

    // Validation
    if (q.required && q.type !== 'photo-step') {
      const answer = answers[q.key];
      const valid  = Array.isArray(answer) ? answer.length > 0 : (answer !== undefined && answer !== null && answer !== '');
      if (!valid) {
        showToast('Merci de faire une sélection', 'warning');
        return;
      }
    }

    const nextIdx = _nextActive(currentIndex);
    if (nextIdx >= 0) {
      _slideTo(nextIdx, 'forward');
    } else {
      submit();
    }
  }

  function prev() {
    if (mode === 'makeup') {
      const prevMkIdx = _mkPrevActive(makeupIndex);
      if (prevMkIdx >= 0) { makeupIndex = prevMkIdx; _renderMakeupLegacy(); }
      return;
    }
    const prevIdx = _prevActive(currentIndex);
    if (prevIdx >= 0) _slideTo(prevIdx, 'backward');
  }

  function _isLastQuestion() {
    return _nextActive(currentIndex) === -1;
  }

  function _slideTo(targetIndex, direction) {
    if (sliding) return;
    sliding = true;

    const card = document.getElementById('qCard');
    if (!card) {
      currentIndex = targetIndex;
      AppState.questionnaire.currentQ = currentIndex;
      render();
      sliding = false;
      return;
    }

    const outClass = direction === 'forward' ? 'slide-out-left'  : 'slide-out-right';
    const inClass  = direction === 'forward' ? 'slide-in-right'  : 'slide-in-left';

    card.classList.add(outClass);
    setTimeout(() => {
      currentIndex = targetIndex;
      AppState.questionnaire.currentQ = currentIndex;
      render();
      const newCard = document.getElementById('qCard');
      if (newCard) {
        newCard.classList.add(inClass);
        setTimeout(() => { newCard.classList.remove(inClass); sliding = false; }, 230);
      } else {
        sliding = false;
      }
    }, 220);
  }

  // ─── Validation bouton suivant ────────────────────────────────

  function _updateNextBtn() {
    const q   = QUESTIONS[currentIndex];
    const btn = document.getElementById('qNextBtn');
    if (!btn || !q || q.type === 'photo-step') return;

    const answers = AppState.questionnaire.answers;
    const answer  = answers[q.key];
    const valid   = !q.required
      || q.type === 'slider'     // slider toujours valide
      || q.type === 'face-map'   // face-map optionnel
      || q.type === 'textarea'   // textarea optionnel
      || (Array.isArray(answer) ? answer.length > 0 : (answer !== undefined && answer !== null && answer !== ''));

    btn.disabled      = !valid;
    btn.style.opacity = valid ? '1' : '0.5';
  }

  function _restoreAnswer(q) {
    // Les choix sont déjà restaurés dans le HTML — rien à faire pour single/multiple
    // Pour slider, la valeur est déjà injectée dans le value= de l'input
    // Pour textarea, la valeur est déjà dans le contenu
    _updateNextBtn();
  }

  // ─── Submit ───────────────────────────────────────────────────

  function submit() {
    AppState.questionnaire.completed = true;

    // Construire l'objet final avec données photo
    const answers = {
      ...AppState.questionnaire.answers,
      photoData: AppState.face?.skinAnalysis || null
    };

    // Compatibilité rulesEngine (ancien champ concerns → nouveau complexes)
    if (answers.complexes && !answers.concerns) {
      answers.concerns = answers.complexes;
    }
    // Compatibilité ageGroup
    if (!answers.ageGroup && answers.age) answers.ageGroup = answers.age;

    const { routine, log } = RulesEngine.evaluate(answers);
    AppState.routine = { ...routine, log };
    ProductCatalog.getRecommended(answers);
    if (typeof RoutineSaver !== 'undefined') RoutineSaver.saveProfile();
    showScreen('results');
  }

  // ─── Legacy makeup (questionnaire maquillage inchangé) ────────

  const MAKEUP_QUESTIONS = [
    {
      id: 'mq_photo', key: null, type: 'photo-step', required: false,
      question: 'Analyse ton visage pour personnaliser ta routine make-up',
      subtitle: 'Carnation, sous-ton et forme du visage détectés automatiquement'
    },
    {
      id: 'mq_carn', key: 'mkCarnation', type: 'single', required: true,
      photoKey: 'carnation',
      question: 'Ma teinte de peau naturelle est :',
      hint: 'Compare ton intérieur de poignet à la lumière naturelle.',
      options: [
        { value: 'clair',  emoji: '🌸', label: 'Claire',  desc: 'Fair, ivoire, beige pâle — je rougis facilement' },
        { value: 'medium', emoji: '🌻', label: 'Medium',  desc: 'Dorée, caramel, olive — je bronze facilement' },
        { value: 'fonce',  emoji: '🌙', label: 'Foncée',  desc: 'Chocolat, acajou, ébène — teinte profonde naturelle' }
      ]
    },
    {
      id: 'mq_tone', key: 'mkUndertone', type: 'single', required: true,
      photoKey: 'undertone',
      question: 'Mon sous-ton naturel est :',
      hint: 'Regarde tes veines à l\'intérieur du poignet : vertes/jaunes → chaud · bleues/violettes → froid · entre les deux → neutre',
      options: [
        { value: 'warm',    emoji: '☀️', label: 'Chaud',   desc: 'Teintes dorées, pêche, abricot — veines vert/jaune' },
        { value: 'cool',    emoji: '❄️', label: 'Froid',   desc: 'Teintes roses, mauves, rouges — veines bleues/violettes' },
        { value: 'neutral', emoji: '✦',  label: 'Neutre',  desc: 'L\'or et l\'argent me conviennent — veines bleu-vert' }
      ]
    },
    {
      id: 'mq1', key: 'mkSkinType', type: 'single', required: true,
      question: 'Ma peau au réveil est plutôt :',
      options: [
        { value: 'normale',  emoji: '◇', label: 'Normale',  desc: 'Équilibrée, sans excès' },
        { value: 'grasse',   emoji: '◎', label: 'Grasse',   desc: 'Brillances, pores visibles' },
        { value: 'seche',    emoji: '○', label: 'Sèche',    desc: 'Tiraillements, desquamations' },
        { value: 'mixte',    emoji: '⟡', label: 'Mixte',    desc: 'Zone T grasse, joues sèches' },
        { value: 'sensible', emoji: '△', label: 'Sensible', desc: 'Réactive, rougeurs possibles' }
      ]
    },
    {
      id: 'mq_concerns', key: 'mkConcerns', type: 'mk-multiple', max: 3, required: false,
      question: 'Qu\'est-ce que tu veux camoufler ou améliorer ?',
      subtitle: 'Choisis jusqu\'à 3 besoins — ta routine sera adaptée',
      options: [
        { value: 'rougeurs',      emoji: '🌸', label: 'Rougeurs',                  desc: 'Zones réactives à neutraliser' },
        { value: 'cernes',        emoji: '👁',  label: 'Cernes',                    desc: 'Regard fatigué, cercles sombres' },
        { value: 'pores',         emoji: '🔬', label: 'Pores dilatés',              desc: 'Texture à affiner, brillances' },
        { value: 'eclat',         emoji: '✨', label: 'Teint terne',                desc: 'Besoin de luminosité et bonne mine' },
        { value: 'matifiant',     emoji: '✦',  label: 'Brillances',                 desc: 'Zone T, peau grasse à matifier' },
        { value: 'imperfections', emoji: '⚬',  label: 'Imperfections',              desc: 'Boutons, cicatrices à camoufler' },
        { value: 'ridules',       emoji: '〰', label: 'Ridules',                    desc: 'Marquer moins les plis' },
        { value: 'uniformite',    emoji: '🎨', label: 'Taches / Teint irrégulier',  desc: 'Uniformiser le teint' }
      ]
    },
    {
      id: 'mq_cernes_color', key: 'mkCernesColor', type: 'single', required: false,
      skipIfMk: (answers) => !answers.mkConcerns?.includes('cernes'),
      question: 'De quelle couleur sont tes cernes ?',
      subtitle: 'Pour te proposer le bon correcteur coloré',
      options: [
        { value: 'bleu_violet', emoji: '💜', label: 'Bleus / Violets', desc: 'Circulation sanguine visible, fatigue, peau fine' },
        { value: 'marron',      emoji: '🟤', label: 'Marrons / Bruns',  desc: 'Hyperpigmentation, soleil, hérédité' },
        { value: 'rouge_rose',  emoji: '🔴', label: 'Rouges / Rosés',   desc: 'Irritation, sensibilité, inflammation' },
        { value: 'gris',        emoji: '⚫', label: 'Gris / Ternes',    desc: 'Manque d\'éclat, fatigue chronique' }
      ]
    },
    {
      id: 'mq2', key: 'mkLook', type: 'single', required: true,
      question: 'Aujourd\'hui, je veux un maquillage :',
      options: [
        { value: 'naturel', emoji: '🌸', label: 'Naturel', desc: 'No-makeup makeup, peau nue améliorée' },
        { value: 'soigne',  emoji: '✨', label: 'Soigné',  desc: 'Everyday chic, bien fini' },
        { value: 'glam',    emoji: '💫', label: 'Glam',    desc: 'Full glam, impact maximal' }
      ]
    },
    {
      id: 'mq3', key: 'mkFocus', type: 'single', required: true,
      question: 'La zone que je veux le plus améliorer est :',
      options: [
        { value: 'yeux',   emoji: '👁', label: 'Les yeux',   desc: 'Regard, mascara, liner' },
        { value: 'levres', emoji: '💋', label: 'Les lèvres', desc: 'Couleur, volume, brillance' },
        { value: 'teint',  emoji: '🌟', label: 'Le teint',   desc: 'Peau nette et lumineuse' },
        { value: 'joues',  emoji: '🌹', label: 'Les joues',  desc: 'Bonne mine, structure' }
      ]
    },
    {
      id: 'mq4', key: 'mkTime', type: 'single', required: true,
      question: 'Le matin, j\'ai plutôt :',
      options: [
        { value: 'rapide',  emoji: '⚡', label: 'Moins de 5 min', desc: 'Routine express, l\'essentiel' },
        { value: 'moyen',   emoji: '☕', label: '5 – 10 min',     desc: 'Un peu de temps pour moi' },
        { value: 'complet', emoji: '🌅', label: 'Plus de 10 min', desc: 'Je prends le temps de me sublimer' }
      ]
    },
    {
      id: 'mq5', key: 'mkBudget', type: 'single', required: true,
      question: 'Je préfère :',
      options: [
        { value: 'petits-prix', emoji: '🌱', label: 'Petits prix',     desc: 'Maxi effet, mini budget' },
        { value: 'bon-rapport', emoji: '🌿', label: 'Bon rapport Q/P', desc: 'Qualité accessible' },
        { value: 'premium',     emoji: '✦',  label: 'Premium',         desc: 'Je choisis les meilleurs' }
      ]
    }
  ];

  // ─── Makeup navigation helpers (skip logic pour questions conditionnelles) ──
  function _mkShouldSkip(q) {
    if (!q.skipIfMk) return false;
    return q.skipIfMk(AppState.makeupQuiz || {});
  }
  function _mkNextActive(from) {
    for (let i = from + 1; i < MAKEUP_QUESTIONS.length; i++) {
      if (!_mkShouldSkip(MAKEUP_QUESTIONS[i])) return i;
    }
    return -1;
  }
  function _mkPrevActive(from) {
    for (let i = from - 1; i >= 0; i--) {
      if (!_mkShouldSkip(MAKEUP_QUESTIONS[i])) return i;
    }
    return -1;
  }
  function _mkVisibleCount() {
    return MAKEUP_QUESTIONS.filter(q => !_mkShouldSkip(q)).length;
  }
  function _mkVisiblePosition(idx) {
    let pos = 0;
    for (let i = 0; i <= idx; i++) {
      if (!_mkShouldSkip(MAKEUP_QUESTIONS[i])) pos++;
    }
    return pos;
  }

  let makeupIndex = 0;

  function _renderMakeupLegacy() {
    const container = document.getElementById('questionnaireContent');
    if (!container) return;

    const q        = MAKEUP_QUESTIONS[makeupIndex];
    if (!q) return;

    // ── Étape photo ────────────────────────────────────────────────
    if (q.type === 'photo-step') {
      const photoHtml = _renderPhotoStep(q);
      const hasAnalysis = !!AppState?.face?.skinAnalysis;
      container.innerHTML = `
        <div class="q-progress-header">
          <span class="q-progress-counter">Analyse photo</span>
        </div>
        <div class="q-progress-bar">
          <div class="q-progress-fill" style="width:0%"></div>
        </div>
        ${photoHtml}
        <div class="q-navigation" style="margin-top:24px;">
          <div></div>
          <button class="btn btn-dark q-next" onclick="Questionnaire.next()">
            ${hasAnalysis ? 'Utiliser cette analyse →' : 'Passer cette étape →'}
          </button>
        </div>`;
      return;
    }

    const answers    = AppState.makeupQuiz || {};
    const visiblePos = _mkVisiblePosition(makeupIndex);
    const visibleCnt = _mkVisibleCount();
    const progress   = Math.round((visiblePos / visibleCnt) * 100);
    const isLast     = _mkNextActive(makeupIndex) === -1;

    // Badge "Détecté depuis ta photo" si la valeur vient de l'analyse photo
    const analysis    = AppState?.face?.skinAnalysis;
    const photoVal    = q.photoKey ? analysis?.[q.photoKey]?.type : null;
    const photoDetect = photoVal && answers[q.key] === photoVal;
    const photoConf  = photoVal ? (analysis?.[q.photoKey]?.confidence || 'medium') : null;
    const photoBadge = photoDetect
      ? photoConf === 'low'
        ? `<div class="mk-photo-badge mk-photo-badge--uncertain">📷 Résultat incertain — confirme ou modifie ci-dessous</div>`
        : `<div class="mk-photo-badge">📸 Détecté depuis ton analyse photo · tu peux modifier si besoin</div>`
      : (analysis && q.photoKey && !photoVal
          ? `<div class="mk-photo-badge mk-photo-badge--miss">📷 Non détecté par la photo — choisis ci-dessous</div>`
          : '');

    container.innerHTML = `
      <div class="q-progress-header">
        <span class="q-progress-counter">${visiblePos} / ${visibleCnt}</span>
      </div>
      <div class="q-progress-bar">
        <div class="q-progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="q-card" id="qCard">
        ${photoBadge}
        <h2 class="q-question">${q.question}</h2>
        ${q.subtitle ? `<p class="mk-question-hint">${q.subtitle}</p>` : ''}
        ${q.hint     ? `<p class="mk-question-hint">${q.hint}</p>`     : ''}
        ${q.type === 'mk-multiple' ? `<p class="mk-multi-count" id="mkMultiBadge">${answers[q.key]?.length || 0}/${q.max || 3} sélectionnée${(answers[q.key]?.length || 0) > 1 ? 's' : ''}</p>` : ''}
        <div id="qOptionsWrap">${_renderMkChoices(q, answers)}</div>
      </div>
      <div class="q-navigation">
        ${_mkPrevActive(makeupIndex) >= 0
          ? '<button class="btn btn-outline q-back" onclick="Questionnaire.prev()">← Retour</button>'
          : '<div></div>'}
        <button class="btn btn-dark q-next" id="qNextBtn" onclick="Questionnaire.next()">
          ${isLast ? 'Voir ma routine ✦' : 'Continuer →'}
        </button>
      </div>`;
    _updateMkBtn(q, answers);
  }

  function _renderMkChoices(q, answers) {
    const sel     = answers[q.key];
    const selArr  = Array.isArray(sel) ? sel : (sel ? [sel] : []);
    const isMulti = q.type === 'mk-multiple';
    return q.options.map(opt => {
      const onclick = isMulti
        ? `Questionnaire.selectMkMulti('${q.key}','${opt.value}',${q.max || 99})`
        : `Questionnaire.selectMkOption('${q.key}','${opt.value}')`;
      return `
      <div class="q-option-premium${selArr.includes(opt.value) ? ' selected' : ''}"
           data-value="${opt.value}"
           onclick="${onclick}">
        <span class="q-option-emoji">${opt.emoji || ''}</span>
        <div class="q-option-body">
          <div class="q-option-label">${opt.label}</div>
          ${opt.desc ? `<div class="q-option-desc">${opt.desc}</div>` : ''}
        </div>
        <div class="q-option-check">✓</div>
      </div>`;
    }).join('');
  }

  function selectMkOption(key, value) {
    AppState.makeupQuiz = AppState.makeupQuiz || {};
    document.querySelectorAll('.q-option-premium').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-value="${value}"]`)?.classList.add('selected');
    AppState.makeupQuiz[key] = value;
    // Auto-activer le filtre luxe quand premium est sélectionné
    if (key === 'mkBudget') {
      AppState.makeupQuiz.mkLuxe = value === 'premium';
    }
    const q = MAKEUP_QUESTIONS[makeupIndex];
    _updateMkBtn(q, AppState.makeupQuiz);
    setTimeout(() => {
      const nextMkIdx = _mkNextActive(makeupIndex);
      if (nextMkIdx >= 0) { makeupIndex = nextMkIdx; _renderMakeupLegacy(); }
      else { showScreen('makeup'); }
    }, 220);
  }

  function selectMkMulti(key, value, max) {
    AppState.makeupQuiz = AppState.makeupQuiz || {};
    const current = Array.isArray(AppState.makeupQuiz[key]) ? [...AppState.makeupQuiz[key]] : [];
    const idx = current.indexOf(value);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= max) { showToast(`Maximum ${max} choix`, 'warning'); return; }
      current.push(value);
    }
    AppState.makeupQuiz[key] = current;
    const q = MAKEUP_QUESTIONS[makeupIndex];
    const wrap = document.getElementById('qOptionsWrap');
    if (wrap) wrap.innerHTML = _renderMkChoices(q, AppState.makeupQuiz);
    const badge = document.getElementById('mkMultiBadge');
    if (badge) badge.textContent = `${current.length}/${max} sélectionnée${current.length > 1 ? 's' : ''}`;
    _updateMkBtn(q, AppState.makeupQuiz);
  }

  function _updateMkBtn(q, answers) {
    const btn = document.getElementById('qNextBtn');
    if (!btn) return;
    const valid = !q.required || !!answers[q.key];
    btn.disabled = !valid;
    btn.style.opacity = valid ? '1' : '0.5';
  }

  // ─── API publique ─────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', () => {
    // Si retour depuis la capture photo
    if (sessionStorage.getItem('glow_resume_questionnaire') === '1') {
      sessionStorage.removeItem('glow_resume_questionnaire');
      const screen = document.getElementById('screen-questionnaire');
      if (screen && AppState.face?.photo) {
        showScreen('questionnaire');
        render();
      }
    }
  });

  return {
    startSkincare, startMakeup,
    reset, render,
    selectOption, selectMkOption, selectMkMulti,
    onSlider, toggleZone, onTextarea,
    takePhoto, retakePhoto, uploadPhoto, skipPhoto, resumeFromPhoto,
    continueFromAnalysis,
    next, prev, submit,
    QUESTIONS, MAKEUP_QUESTIONS
  };

})();
