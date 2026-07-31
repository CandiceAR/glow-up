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
      id: 'q0', key: 'complexes', type: 'multiple', max: 3,
      question: 'Qu\'est-ce qui te complexe le plus ?',
      subtitle: 'Choisis jusqu\'à 3 réponses — on en déduit ton objectif',
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

    // Q3 — Visage interactif (skip si photo faite)
    {
      id: 'q3', key: 'problemZones', type: 'face-map',
      question: 'Où se concentrent tes problèmes ?',
      subtitle: 'Touche les zones concernées',
      required: false,
      skipIf: (answers, photo) => _hasPhotoZones(photo)
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

    // Q12+Q13 — Préférences & exclusions (écran groupé : labels + ingrédients à éviter)
    {
      id: 'qprefs', key: 'prefs', type: 'prefs-group', required: false, skipIf: null,
      question: 'Tes préférences & exclusions',
      subtitle: 'Optionnel — on filtre tes recommandations en conséquence',
      groups: [
        {
          key: 'labels', title: '✅ Labels importants pour toi', max: 3,
          options: [
            { value: 'vegan',              emoji: '🌱', label: 'Vegan',            desc: '' },
            { value: 'bio',                emoji: '🌿', label: 'Bio / Certifié',   desc: '' },
            { value: 'cruelty',            emoji: '🐰', label: 'Cruelty-free',     desc: '' },
            { value: 'grossesse',          emoji: '🤰', label: 'Grossesse safe',   desc: '' },
            { value: 'dermo',              emoji: '🏥', label: 'Dermato-testé',    desc: '' },
            { value: 'non_comedogenique',  emoji: '◇',  label: 'Non-comédogène',  desc: '' }
          ]
        },
        {
          key: 'avoidIngredients', title: '🚫 Ingrédients à éviter', max: 5,
          options: [
            { value: 'alcool',      emoji: '🚫', label: 'Alcool dénaturé',    desc: '' },
            { value: 'parfum',      emoji: '🚫', label: 'Parfum / Fragrance', desc: '' },
            { value: 'silicones',   emoji: '🚫', label: 'Silicones',          desc: '' },
            { value: 'parabens',    emoji: '🚫', label: 'Parabènes',          desc: '' },
            { value: 'retinol',     emoji: '⚠️', label: 'Rétinol',            desc: '' },
            { value: 'aha_bha',     emoji: '⚠️', label: 'AHA / BHA',          desc: '' },
            { value: 'niacinamide', emoji: '⚠️', label: 'Niacinamide',        desc: '' }
          ]
        }
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

    // Q-SPF — Fini SPF préféré (seule question SPF, le reste est dérivé du profil peau)
    {
      id: 'qspf', key: 'spfFinish', type: 'single', required: false, skipIf: null,
      question: '☀️ Quel fini préfères-tu pour ta protection solaire ?',
      subtitle: 'Pour te recommander le meilleur SPF adapté à ta peau',
      options: [
        { value: 'invisible', emoji: '👻', label: 'Invisible et très léger', desc: 'Sans trace ni effet' },
        { value: 'matte',     emoji: '✦',  label: 'Mat / anti-brillance',     desc: 'Zone T sous contrôle' },
        { value: 'hydrating', emoji: '💧', label: 'Hydratant et confortable', desc: 'Effet cocon' },
        { value: 'glow',      emoji: '🌟', label: 'Glow / lumineux',           desc: 'Bonne mine instantanée' },
        { value: 'any',       emoji: '🤷‍♀️', label: 'Peu importe',            desc: '' }
      ]
    },

    // Q-ROUTINE — Ma routine actuelle (produits déjà utilisés)
    {
      id: 'qcurrent', key: 'currentRoutine', type: 'current-routine', required: false, skipIf: null,
      question: '🧴 Quels produits utilises-tu déjà ?',
      subtitle: 'On part de ta routine actuelle. On garde ce qui te va, on remplace seulement ce qui ne convient pas. (Facultatif)'
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

  function startSkincare(keepAnalysis = false) {
    // Limite gratuite : 1 seule routine générée. Au-delà → abonnement.
    if (typeof Subscription !== 'undefined' && !Subscription.canGenerateRoutine()) {
      Subscription.showRoutineLimit();
      return;
    }
    mode = 'skincare';

    // Réutiliser « Analyser ma routine » (photo + quiz déjà collectés)
    const ra    = _loadAnalysisLS();
    const reuse = !keepAnalysis && !!(ra && (ra.faceAnalysis || ra.quiz));
    if (reuse && ra.faceAnalysis) {
      AppState.face = AppState.face || {};
      AppState.face.skinAnalysis = ra.faceAnalysis;   // on reprend l'analyse photo
      if (ra.photo) AppState.face.photo = ra.photo;
    }

    // Effacer l'analyse photo précédente — sauf si on met à jour les besoins ou qu'on la réutilise
    if (!keepAnalysis && !reuse && AppState.face) {
      AppState.face.skinAnalysis = null;
      AppState.face.photo        = null;
    }
    reset();
    if (keepAnalysis && AppState.face?.skinAnalysis) {
      // Garder l'analyse → commencer après l'étape photo
      _prefillFromPhoto();
      const photoIdx = QUESTIONS.findIndex(q => q.type === 'photo-step');
      currentIndex = _nextActive(photoIdx >= 0 ? photoIdx : 0);
      if (currentIndex < 0) currentIndex = 0;
    } else {
      currentIndex = 0; // Q0 toujours en premier (les questions restent visibles/modifiables)
      if (reuse && AppState.face?.skinAnalysis) _prefillFromPhoto();
    }
    // Profil partagé : si un quiz maquillage a déjà été rempli, pré-remplir le skincare
    _seedSkincareFromMakeup();
    // Réutiliser les réponses du quiz « Analyser ma routine » (type de peau, préoccupations)
    _seedSkincareFromAnalysis(ra);
    AppState.questionnaire.currentQ = currentIndex;
    showScreen('questionnaire');
  }

  // Photo renvoie 'light'/'dark', les options MQ utilisent 'clair'/'fonce'
  const CARN_PHOTO_MAP = { light: 'clair', medium: 'medium', dark: 'fonce', clair: 'clair', fonce: 'fonce' };

  function startMakeup(keepAnalysis = true) {
    // Limite gratuite : 1 seule routine générée. Au-delà → abonnement.
    if (typeof Subscription !== 'undefined' && !Subscription.canGenerateRoutine()) {
      Subscription.showRoutineLimit();
      return;
    }
    mode = 'makeup';
    // Refaire l'analyse → on efface la photo pour réafficher l'étape photo
    if (!keepAnalysis && AppState.face) {
      AppState.face.skinAnalysis = null;
      AppState.face.photo        = null;
    }
    const analysis = AppState?.face?.skinAnalysis;
    makeupIndex = analysis ? 1 : 0;
    AppState.makeupQuiz = {
      mkCarnation: CARN_PHOTO_MAP[analysis?.carnation?.type] || null,
      mkUndertone: analysis?.undertone?.type || null
    };
    // Profil partagé : réutiliser le skincare déjà répondu (type de peau, budget, cernes, préoccupations)
    _seedMakeupFromShared();
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

  // ─── Réutilisation de « Analyser ma routine » (photo + quiz) ──
  function _loadAnalysisLS() {
    if (AppState.routineAnalysis) return AppState.routineAnalysis;
    try {
      const r = JSON.parse(localStorage.getItem('glow_routine_analysis') || 'null');
      if (r) AppState.routineAnalysis = r;
      return r;
    } catch (e) { return null; }
  }

  const _ST_MAP = { grasse: 'grasse', mixte: 'mixte', seche: 'seche', sensible: 'sensible', normale: 'normale', deshydratee: 'seche', reactive: 'sensible' };
  const _ST_PRIORITY = ['grasse', 'mixte', 'seche', 'sensible', 'normale'];
  function _skinTypeFromDesc(desc) {
    if (!Array.isArray(desc)) return null;
    const mapped = desc.map(d => _ST_MAP[d]).filter(Boolean);
    for (const t of _ST_PRIORITY) if (mapped.includes(t)) return t;
    return null;
  }
  const _CX_FROM_ANALYSIS = {
    acne: 'acne', boutons: 'acne', points_noirs: 'acne',
    rides: 'rides', ridules: 'rides',
    taches: 'taches',
    rougeurs: 'rougeurs', sensibilite: 'rougeurs',
    hydratation: 'secheresse', tiraillements: 'secheresse',
    eclat: 'eclat', manque_eclat: 'eclat',
    pores: 'pores', sebum: 'pores', brillance: 'pores', texture: 'pores'
  };
  function _complexesFromAnalysis(ra) {
    const out = [];
    const add = v => { const m = _CX_FROM_ANALYSIS[v]; if (m && !out.includes(m)) out.push(m); };
    (ra.quiz?.objectives || []).forEach(add);
    (ra.quiz?.bother || []).forEach(add);
    if (ra.faceAnalysis?.cernes?.detected && !out.includes('cernes')) out.push('cernes');
    return out.slice(0, 3);
  }

  // Pré-remplit le questionnaire skincare depuis l'analyse de routine (type de peau + préoccupations)
  function _seedSkincareFromAnalysis(ra) {
    if (!ra || !ra.quiz) return;
    const a  = AppState.questionnaire.answers;
    const pf = AppState.questionnaire.photoPreFill = AppState.questionnaire.photoPreFill || {};
    const st = _skinTypeFromDesc(ra.quiz.skinDesc);
    if (st) { a.skinType = st; pf.skinType = st; }
    const cx = _complexesFromAnalysis(ra);
    if (cx.length) { a.complexes = cx; pf.complexes = cx; }
  }

  // ─── Profil partagé skincare ⇆ maquillage (pas de questions posées 2×) ─
  const _BUDGET_S2M = { low: 'petits-prix', medium: 'bon-rapport', high: 'premium', premium: 'premium' };
  const _BUDGET_M2S = { 'petits-prix': 'low', 'bon-rapport': 'medium', premium: 'premium' };
  const _COMPLEXE_2_MK = { rougeurs: 'rougeurs', cernes: 'cernes', pores: 'pores', eclat: 'eclat', acne: 'imperfections', rides: 'ridules', taches: 'uniformite' };
  const _MK_2_COMPLEXE = { rougeurs: 'rougeurs', cernes: 'cernes', pores: 'pores', eclat: 'eclat', imperfections: 'acne', ridules: 'rides', uniformite: 'taches' };

  function _syncSharedProfileFromSkincare() {
    const a = AppState.questionnaire?.answers || {};
    AppState.profile = AppState.profile || {};
    if (a.skinType)    AppState.profile.skinType    = a.skinType;
    if (a.complexes)   AppState.profile.concerns    = a.complexes;
    if (a.cernesColor) AppState.profile.cernesColor = a.cernesColor;
    if (a.budget)      AppState.profile.budget      = a.budget;
  }

  // Pré-remplit le quiz maquillage depuis le skincare déjà répondu (dans la session)
  function _seedMakeupFromShared() {
    const sk = AppState.questionnaire?.answers || {};
    const mq = AppState.makeupQuiz = AppState.makeupQuiz || {};
    mq._shared = mq._shared || {};
    if (!mq.mkSkinType && sk.skinType)       { mq.mkSkinType = sk.skinType; mq._shared.skinType = true; }
    if (!mq.mkCernesColor && sk.cernesColor) { mq.mkCernesColor = sk.cernesColor; mq._shared.cernesColor = true; }
    if (!mq.mkBudget && sk.budget)           { mq.mkBudget = _BUDGET_S2M[sk.budget] || null; mq._shared.budget = true; }
    if (!mq.mkConcerns && Array.isArray(sk.complexes) && sk.complexes.length) {
      const mapped = sk.complexes.map(c => _COMPLEXE_2_MK[c]).filter(Boolean);
      if (mapped.length) mq.mkConcerns = mapped.slice(0, 3);
    }
  }

  // Sens inverse : pré-remplit le skincare depuis un quiz maquillage déjà répondu
  function _seedSkincareFromMakeup() {
    const mq = AppState.makeupQuiz || {};
    const a  = AppState.questionnaire.answers;
    const pf = AppState.questionnaire.photoPreFill = AppState.questionnaire.photoPreFill || {};
    if (!a.skinType && mq.mkSkinType)       { a.skinType = mq.mkSkinType; pf.skinType = mq.mkSkinType; }
    if (!a.cernesColor && mq.mkCernesColor) { a.cernesColor = mq.mkCernesColor; }
    if (!a.budget && mq.mkBudget)           { a.budget = _BUDGET_M2S[mq.mkBudget] || null; if (a.budget) pf.budget = a.budget; }
    if ((!a.complexes || !a.complexes.length) && Array.isArray(mq.mkConcerns) && mq.mkConcerns.length) {
      const mapped = mq.mkConcerns.map(c => _MK_2_COMPLEXE[c]).filter(Boolean);
      if (mapped.length) a.complexes = mapped.slice(0, 3);
    }
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
      case 'current-routine': return _renderCurrentRoutine(q);
      case 'prefs-group':     return _renderPrefsGroup(q);
      default:          return '';
    }
  }

  // ─── Écran groupé « Préférences & exclusions » (2 multi-sélecteurs) ─
  function _renderPrefsGroup(q) {
    const answers = AppState.questionnaire.answers;
    return (q.groups || []).map(group => {
      const sel = Array.isArray(answers[group.key]) ? answers[group.key] : [];
      const opts = group.options.map(opt => {
        const checked = sel.includes(opt.value);
        return `<div class="q-option-premium${checked ? ' selected' : ''}"
                     data-value="${opt.value}"
                     onclick="Questionnaire.selectOption('${group.key}','${opt.value}','multiple',${group.max || 99})">
          <span class="q-option-emoji">${opt.emoji || ''}</span>
          <div class="q-option-body">
            <div class="q-option-label">${opt.label}</div>
            ${opt.desc ? `<div class="q-option-desc">${opt.desc}</div>` : ''}
          </div>
          <div class="q-option-check">✓</div>
        </div>`;
      }).join('');
      return `<div class="q-prefs-group">
        <p class="q-prefs-group-title">${group.title}</p>
        ${opts}
      </div>`;
    }).join('');
  }

  // ─── Étape « Ma routine actuelle » ────────────────────────────
  function _renderCurrentRoutine() {
    return `
      <div class="cr-step">
        <div class="cr-search-wrap">
          <input type="text" id="crSearchInput" class="cr-search-input" autocomplete="off"
                 placeholder="🔍 Rechercher un produit (ex : Effaclar, CeraVe…)"
                 oninput="Questionnaire.crSearch(this.value)">
          <div id="crSearchResults" class="cr-search-results"></div>
        </div>
        <div id="crManualZone" class="cr-manual-zone"></div>
        <button type="button" class="cr-manual-toggle" onclick="Questionnaire.crToggleManual()">
          + Je ne trouve pas mon produit → l'ajouter à la main
        </button>
        <div id="crList" class="cr-list">${_renderCrList()}</div>
      </div>`;
  }

  function _renderCrList() {
    const l = (typeof CurrentRoutine !== 'undefined') ? CurrentRoutine.list() : [];
    if (!l.length) {
      return '<p class="cr-empty">Aucun produit pour l\'instant — tu peux aussi partir de zéro et passer cette étape.</p>';
    }
    return l.map(e => `
      <div class="cr-item${e.loved ? ' loved' : ''}">
        <div class="cr-item-main">
          <span class="cr-item-cat">${CurrentRoutine.catLabel(e.category)}</span>
          <span class="cr-item-name">${e.brand ? e.brand + ' ' : ''}${e.name}</span>
        </div>
        <button type="button" class="cr-love-btn${e.loved ? ' on' : ''}" title="J'adore, à garder"
                onclick="Questionnaire.crToggleLove('${e._key}')">${e.loved ? '❤️' : '🤍'}</button>
        <button type="button" class="cr-remove-btn" title="Retirer"
                onclick="Questionnaire.crRemove('${e._key}')">×</button>
      </div>`).join('');
  }

  function crSearch(query) {
    const box = document.getElementById('crSearchResults');
    if (!box) return;
    const res = (typeof CurrentRoutine !== 'undefined') ? CurrentRoutine.searchCatalog(query) : [];
    if (!query || query.trim().length < 2) { box.innerHTML = ''; return; }
    if (!res.length) {
      box.innerHTML = '<div class="cr-noresult">Aucun résultat — ajoute-le à la main ci-dessous 👇</div>';
      return;
    }
    box.innerHTML = res.map(p => `
      <div class="cr-result" onclick="Questionnaire.crAdd('${p.id}')">
        <span class="cr-result-brand">${p.brand || ''}</span>
        <span class="cr-result-name">${p.name || ''}</span>
        <span class="cr-result-add">+ Ajouter</span>
      </div>`).join('');
  }

  function crAdd(id) {
    CurrentRoutine.addFromCatalog(id);
    const input = document.getElementById('crSearchInput');
    if (input) input.value = '';
    const box = document.getElementById('crSearchResults');
    if (box) box.innerHTML = '';
    _refreshCrList();
  }

  function crToggleManual() {
    const zone = document.getElementById('crManualZone');
    if (!zone) return;
    if (zone.dataset.open === '1') { zone.dataset.open = '0'; zone.innerHTML = ''; return; }
    zone.dataset.open = '1';
    const opts = CurrentRoutine.CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
    zone.innerHTML = `
      <div class="cr-manual-form">
        <input type="text" id="crManualBrand" class="cr-manual-input" placeholder="Marque (ex : CeraVe)">
        <input type="text" id="crManualName"  class="cr-manual-input" placeholder="Nom du produit *">
        <select id="crManualCat" class="cr-manual-input">${opts}</select>
        <button type="button" class="cr-manual-add" onclick="Questionnaire.crAddManual()">Ajouter à ma routine</button>
      </div>`;
  }

  function crAddManual() {
    const brand = document.getElementById('crManualBrand')?.value;
    const name  = document.getElementById('crManualName')?.value;
    const cat   = document.getElementById('crManualCat')?.value;
    if (!name || !name.trim()) { showToast('Indique au moins le nom du produit', 'warning'); return; }
    CurrentRoutine.addManual(brand, name, cat);
    const zone = document.getElementById('crManualZone');
    if (zone) { zone.dataset.open = '0'; zone.innerHTML = ''; }
    showToast('Produit ajouté à ta routine ✦', 'success', 1800);
    _refreshCrList();
  }

  function crToggleLove(key) { CurrentRoutine.toggleLove(key); _refreshCrList(); }
  function crRemove(key)     { CurrentRoutine.remove(key);     _refreshCrList(); }

  function _refreshCrList() {
    const el = document.getElementById('crList');
    if (el) el.innerHTML = _renderCrList();
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

    // Dans le navigateur intégré d'Instagram, la caméra live est bloquée :
    // on met l'upload en avant (qui, lui, fonctionne parfaitement).
    const inApp = (typeof InAppBrowser !== 'undefined' && InAppBrowser.isInApp());
    const uploadBtn = `
      <label class="btn ${inApp ? 'btn-dark' : 'btn-outline'}" style="cursor:pointer;text-align:center;">
        📂 ${inApp ? 'Choisir une photo' : 'Uploader une photo'}
        <input type="file" accept="image/*" style="display:none"
               onchange="Questionnaire.uploadPhoto(this)">
      </label>`;
    const cameraBtn = `
      <button class="btn ${inApp ? 'btn-outline' : 'btn-dark'}" onclick="Questionnaire.takePhoto()">📸 Prendre une photo</button>`;

    return `<div class="q-photo-step">
      <p style="font-size:0.9rem;color:var(--muted);margin-bottom:20px;">
        En 5 secondes, l'IA analyse ta peau et pré-remplit les questions suivantes.
      </p>
      <div class="q-photo-buttons">
        ${inApp ? uploadBtn + cameraBtn : cameraBtn + uploadBtn}
      </div>
      ${inApp ? `<p class="q-inapp-note">📷 Pour prendre une photo en direct, ouvre Glow Up dans Safari ou Chrome — l'upload fonctionne ici sans souci ✦</p>` : ''}
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

    // Priorités dynamiques (remplace le score) — cartes premium
    const priorities = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildPriorities)
      ? SkinAnalysis.buildPriorities(photo, AppState.questionnaire?.answers || {}) : [];
    const prioritiesHtml = priorities.length ? `
      <section class="ap-section">
        <h2 class="ap-section-title">${priorities.length} priorités identifiées pour ta peau</h2>
        <p class="ap-section-sub">Ce sur quoi Glow Up va concentrer ta routine.</p>
        <div class="ap-priority-cards">
          ${priorities.map(p => `
            <div class="ap-priority-card">
              <span class="ap-priority-emoji">${p.emoji}</span>
              <div class="ap-priority-text">
                <span class="ap-priority-label">${p.label}</span>
                ${p.desc ? `<span class="ap-priority-desc">${p.desc}</span>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </section>` : '';

    const INSIGHT_EMOJI = {
      redness: '🌿', sebum: '✨', taches: '☀️', terne: '💫', texture: '🫧', cernes: '🌙', positive: '🌸'
    };

    const insights = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.getTopInsights)
      ? SkinAnalysis.getTopInsights(photo) : [];

    // Points forts — valorisation élégante (base ~300 commentaires, pondérée par les données)
    const portrait = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildBeautyPortrait)
      ? SkinAnalysis.buildBeautyPortrait(photo, AppState.questionnaire?.answers || {}) : [];
    const portraitHtml = portrait.length ? `
      <section class="ap-section ap-strengths">
        <h2 class="ap-section-title">✨ Ce qui te met naturellement en valeur</h2>
        <ul class="ap-strengths-list">
          ${portrait.map(l => `<li>🤍 ${l}</li>`).join('')}
        </ul>
      </section>` : '';

    // 🎨 Analyse colorimétrique — la feature vedette
    const colo = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildColorimetry)
      ? SkinAnalysis.buildColorimetry(photo) : null;
    const swatches = (arr, cls) => `<div class="colo-swatches">${arr.map(([n, hex]) =>
      `<div class="colo-sw ${cls || ''}"><span class="colo-dot" style="background:${hex}"></span><span class="colo-name">${n}</span></div>`).join('')}</div>`;
    const coloHtml = colo ? `
      <section class="ap-section colo-section">
        <div class="colo-header">
          <span class="colo-eyebrow">✦ Ton analyse colorimétrique</span>
          <h2 class="colo-season">${colo.emoji} ${colo.label}</h2>
          <p class="colo-desc">${colo.desc}</p>
        </div>
        <div class="colo-block">
          <h3 class="colo-block-title">🎨 Tes couleurs</h3>
          ${swatches(colo.palette)}
        </div>
        <div class="colo-block">
          <h3 class="colo-block-title">💄 Ton maquillage</h3>
          ${swatches(colo.makeup)}
        </div>
        <div class="colo-block">
          <h3 class="colo-block-title">💇‍♀️ Tes couleurs de cheveux</h3>
          ${swatches(colo.hair)}
        </div>
        <div class="colo-block colo-block--avoid">
          <h3 class="colo-block-title">🚫 À éviter</h3>
          ${swatches(colo.avoid, 'colo-sw--avoid')}
        </div>
        <button class="btn-orange-cta colo-share-btn" onclick="Questionnaire.shareColorimetry()">
          📲 Partager ma saison
        </button>
      </section>` : '';

    const insightsHtml = insights.length ? `
      <section class="ap-section q-insights">
        <h2 class="ap-section-title">✦ Ton diagnostic de peau</h2>
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
      </section>` : '';

    const skinLabel = { normale:'Normale', grasse:'Grasse', seche:'Sèche', mixte:'Mixte', sensible:'Sensible' };
    const chips = [];
    if (photo.skinType?.type)   chips.push(`${skinLabel[photo.skinType.type] || photo.skinType.type}`);
    if (photo.undertone?.label) chips.push(`${photo.undertone.label}`);
    if (photo.carnation?.label) chips.push(`${photo.carnation.label}`);
    const chipsHtml = chips.length
      ? `<div class="ap-chips">${chips.map(c => `<span class="ap-chip">${c}</span>`).join('')}</div>`
      : '';

    return `<div class="q-photo-step analysis-premium">
      <div class="ap-header">
        <span class="ap-eyebrow">Étape 2 · Analyse de ta peau ✨</span>
      </div>
      <div class="ap-photo">${overlayDiv}</div>
      ${chipsHtml}
      ${coloHtml}
      ${prioritiesHtml}
      ${portraitHtml}
      ${insightsHtml}
      <div class="ap-actions">
        <button class="btn-orange-cta ap-continue" onclick="Questionnaire.next()">
          Continuer vers ma routine →
        </button>
        <button class="ap-retake" onclick="Questionnaire.retakePhoto()">
          Refaire l'analyse photo
        </button>
      </div>
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

      // ── Filet de sécurité : analyse impossible (navigateur ancien,
      //    MediaPipe/CDN bloqué, webview Instagram…) → ne JAMAIS bloquer ──
      if (!AppState.face.skinAnalysis) {
        if (typeof showToast === 'function') {
          showToast("L'analyse auto n'est pas dispo sur ce navigateur — continue, on personnalise avec tes réponses ✦", 'info', 5500);
        }
        if (mode === 'makeup') {
          const nxt = _mkNextActive(makeupIndex);
          if (nxt >= 0) { makeupIndex = nxt; _renderMakeupLegacy(); }
          else { showScreen('makeup'); }
        } else {
          const nxt = _nextActive(currentIndex);
          if (nxt >= 0) _slideTo(nxt, 'forward'); else submit();
        }
        return;
      }

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
    // Filet de sécurité : si l'analyse a échoué, ne pas rester bloqué sur le spinner
    if (!AppState.face?.skinAnalysis) {
      if (typeof showToast === 'function') {
        showToast("L'analyse auto n'est pas dispo sur ce navigateur — continue, on personnalise avec tes réponses ✦", 'info', 5500);
      }
      const nxt = _nextActive(currentIndex >= 0 ? currentIndex : 0);
      if (nxt >= 0) { _slideTo(nxt, 'forward'); } else { submit(); }
      return;
    }
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
      const resp = await fetch(apiUrl('/api/skinInsights'), {
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

  // ─── Dérivations : champs déduits pour éviter les questions redondantes ─
  // objectif ← préoccupations · brillance/sensibilité ← type de peau/photo
  const _OBJ_FROM_COMPLEXE = {
    rides: 'anti-age', taches: 'uniformisation', eclat: 'eclat',
    secheresse: 'hydratation', pores: 'purification', acne: 'purification',
    rougeurs: 'apaisement', cernes: 'eclat'
  };
  function _deriveObjective(complexes) {
    for (const c of (complexes || [])) if (_OBJ_FROM_COMPLEXE[c]) return _OBJ_FROM_COMPLEXE[c];
    return 'hydratation';
  }
  function _deriveOiliness(a, photo) {
    if (_hasPhotoZones(photo)) return _oilinessFromPhoto(photo);
    return ({ grasse: 8, mixte: 6, normale: 4, seche: 2, sensible: 3 })[a.skinType] ?? 5;
  }
  function _deriveSensitivity(a, photo) {
    if (_hasPhotoZones(photo)) return _sensitivityFromPhoto(photo);
    if (a.skinType === 'sensible') return 8;
    if (Array.isArray(a.complexes) && a.complexes.includes('rougeurs')) return 7;
    return 3;
  }
  function _deriveSkincareFields() {
    const a = AppState.questionnaire.answers;
    const photo = AppState.face?.skinAnalysis;
    if (!a.objectives)              a.objectives  = _deriveObjective(a.complexes);
    if (a.oiliness == null)         a.oiliness    = _deriveOiliness(a, photo);
    if (a.sensitivity == null)      a.sensitivity = _deriveSensitivity(a, photo);
  }

  // Réintègre les bons produits de « Analyser ma routine » dans la routine générée.
  // Si l'utilisatrice n'a pas fait l'analyse → rien n'est ajouté (routine 100% nouveaux produits).
  function _integrateRoutineAnalysisProducts() {
    let ra = AppState.routineAnalysis;
    if (!ra) {
      try { ra = JSON.parse(localStorage.getItem('glow_routine_analysis') || 'null'); AppState.routineAnalysis = ra; } catch (e) {}
    }
    if (!ra || !Array.isArray(ra.keepProducts) || !ra.keepProducts.length) return;
    if (typeof CurrentRoutine === 'undefined') return;
    const list = CurrentRoutine.list();
    ra.keepProducts.forEach(p => {
      const exists = list.some(e => (e.name || '').toLowerCase().trim() === (p.name || '').toLowerCase().trim());
      if (!exists) list.push({
        _key: 'ra_' + Math.random().toString(36).slice(2, 9),
        id: p.id || null, brand: p.brand || '', name: p.name || '',
        category: p.category || 'other', fromCatalog: !!p.id, loved: true, forceKeep: true
      });
    });
  }

  // ─── Submit ───────────────────────────────────────────────────

  function submit() {
    AppState.questionnaire.completed = true;

    // Déduire les champs qu'on ne demande plus explicitement (objectif, brillance, sensibilité)
    _deriveSkincareFields();
    // Alimenter le profil partagé (réutilisé par le questionnaire maquillage)
    _syncSharedProfileFromSkincare();

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

    // Intégrer les bons produits de l'analyse "Ma routine actuelle" (si faite)
    _integrateRoutineAnalysisProducts();
    // Enregistrer les produits saisis manuellement (enrichissement catalogue)
    if (typeof CurrentRoutine !== 'undefined') CurrentRoutine.saveManual();

    const { routine, log } = RulesEngine.evaluate(answers);
    AppState.routine = { ...routine, log };
    // Seed STABLE : fige les produits de CETTE routine (mêmes produits au
    // re-rendu / retour sur la page / reprise). Persisté avec la routine.
    AppState.routine.seed = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ProductCatalog.getRecommended(answers);
    if (typeof RoutineSaver !== 'undefined') RoutineSaver.saveProfile();
    // Compter la génération : free (1 au total) · Premium (+1 ce mois) · Coach (illimité).
    // Free : on enregistre aussi la routine pour qu'elle reste toujours reprenable.
    if (typeof Subscription !== 'undefined') {
      if (Subscription.getPlan() === 'free' && typeof RoutineSaver !== 'undefined') RoutineSaver.save();
      Subscription.markRoutineGenerated();
    }
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
      skipIfMk: (a) => !!(a._shared && a._shared.skinType),
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
      skipIfMk: (a) => !a.mkConcerns?.includes('cernes') || !!(a._shared && a._shared.cernesColor),
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
      skipIfMk: (a) => !!(a._shared && a._shared.budget),
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

  // ─── Génère une image "Ta saison" partageable (story Instagram) ──
  async function shareColorimetry() {
    const photo = AppState.face?.skinAnalysis;
    const colo = (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.buildColorimetry)
      ? SkinAnalysis.buildColorimetry(photo) : null;
    if (!colo) { if (typeof showToast === 'function') showToast('Analyse indisponible', 'error'); return; }

    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fond nude dégradé + halo orange
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#FBF7F2'); g.addColorStop(1, '#F2E4D8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(W/2, 360, 60, W/2, 360, 520);
    halo.addColorStop(0, 'rgba(240,145,63,0.20)'); halo.addColorStop(1, 'rgba(240,145,63,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, 760);

    ctx.textAlign = 'center';

    // Logo G
    try {
      const logo = new Image(); logo.crossOrigin = 'anonymous'; logo.src = 'assets/logo-g.png';
      await new Promise((r) => { logo.onload = r; logo.onerror = r; });
      if (logo.complete && logo.naturalWidth) {
        const lw = 190, lh = lw * (logo.naturalHeight / logo.naturalWidth);
        ctx.drawImage(logo, W/2 - lw/2, 150, lw, lh);
      }
    } catch (e) {}

    // Eyebrow
    ctx.fillStyle = '#C9A98A';
    ctx.font = '600 30px DM Sans, sans-serif';
    ctx.fillText('T O N   A N A L Y S E   C O L O R I M É T R I Q U E', W/2, 430);

    // Emoji saison
    ctx.font = '150px serif';
    ctx.fillText(colo.emoji, W/2, 620);

    // Saison
    ctx.fillStyle = '#2C2A27';
    ctx.font = '400 96px "Cormorant Garamond", Georgia, serif';
    ctx.fillText(colo.label, W/2, 740);

    // Description (wrap)
    ctx.fillStyle = '#8a8276';
    ctx.font = '300 36px DM Sans, sans-serif';
    _wrapText(ctx, colo.desc, W/2, 820, 820, 48);

    // Palette — 8 pastilles, 2 rangées de 4
    const cols = 4, r = 78, gapX = 230, startX = W/2 - gapX*1.5, rowY = [1120, 1420];
    colo.palette.slice(0, 8).forEach(([name, hex], i) => {
      const cx = startX + (i % cols) * gapX;
      const cy = rowY[Math.floor(i / cols)];
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fillStyle = hex; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
      ctx.fillStyle = '#2C2A27'; ctx.font = '500 28px DM Sans, sans-serif';
      ctx.fillText(name, cx, cy + r + 46);
    });

    // Footer
    ctx.fillStyle = '#F0913F';
    ctx.font = '600 40px DM Sans, sans-serif';
    ctx.fillText('✨ Découvre ta saison gratuitement', W/2, 1700);
    ctx.fillStyle = '#2C2A27';
    ctx.font = '600 44px DM Sans, sans-serif';
    ctx.fillText('glowupskin.app', W/2, 1770);

    // Export : partage natif si dispo, sinon téléchargement
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'ma-saison-glowup.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Ma saison colorimétrique Glow Up',
            text: `Je suis ${colo.label} ${colo.emoji} ! Découvre ta saison sur glowupskin.app` });
          return;
        } catch (e) {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'ma-saison-glowup.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('Image enregistrée ✨ partage-la en story !', 'success', 3500);
    }, 'image/png');
  }

  function _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = (text || '').split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line + w + ' ';
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line.trim(), x, yy); line = w + ' '; yy += lineHeight;
      } else line = test;
    }
    ctx.fillText(line.trim(), x, yy);
  }

  return {
    startSkincare, startMakeup,
    reset, render,
    selectOption, selectMkOption, selectMkMulti,
    onSlider, toggleZone, onTextarea,
    takePhoto, retakePhoto, uploadPhoto, skipPhoto, resumeFromPhoto,
    continueFromAnalysis,
    next, prev, submit,
    shareColorimetry,
    crSearch, crAdd, crToggleManual, crAddManual, crToggleLove, crRemove,
    QUESTIONS, MAKEUP_QUESTIONS
  };

})();
