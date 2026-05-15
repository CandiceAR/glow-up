/* ============================================================
   makeupRoutine.js — Clean Girl Routine
   Structure : 8 étapes core + 2 bonus (glow bronzant + pinceaux)
   Adapté par : sous-ton · carnation · budget · niveau
   ============================================================ */

'use strict';

const MakeupRoutine = (() => {

  let catalogue = [];
  let isLoaded  = false;

  // ══════════════════════════════════════════════════════════════
  // CHARGEMENT CATALOGUE
  // ══════════════════════════════════════════════════════════════

  async function loadCatalogue() {
    if (isLoaded) return catalogue;
    try {
      let allProducts = null;
      if (typeof FirestoreProducts !== 'undefined') {
        allProducts = await FirestoreProducts.loadAll();
      }
      if (!allProducts) {
        const res  = await fetch('data/products-manual.json');
        const data = await res.json();
        allProducts = Array.isArray(data) ? data : (data.products || []);
      }
      const SKINCARE_CATS = new Set([
        'cleanser','serum','eye','eyepatch','moisturizer','cream',
        'spf','nightmask','demaquillant','primer','skincare'
      ]);
      catalogue = allProducts.filter(p => p.active !== false && !SKINCARE_CATS.has(p.category));
      isLoaded = true;
      console.log('[MakeupRoutine] Catalogue:', catalogue.length, 'produits maquillage');
    } catch (e) {
      console.error('[MakeupRoutine] Erreur catalogue:', e);
      catalogue = [];
    }
    return catalogue;
  }

  // ══════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════

  const getByCategory  = cat  => catalogue.filter(p => p.category === cat);
  const getByCategories= cats => catalogue.filter(p => cats.includes(p.category));
  const getById        = id   => catalogue.find(p => p.id === id);

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickRandom(arr, n = 1) {
    if (!arr?.length) return [];
    return shuffle(arr.filter(Boolean)).slice(0, n);
  }

  // ── Budget ────────────────────────────────────────────────────
  const BUDGET_MAX = {
    low: 20, 'petits-prix': 20,
    medium: 50, 'bon-rapport': 50,
    high: 100, premium: Infinity
  };

  function filterByBudget(products, budget) {
    if (!budget || !products?.length) return products || [];
    const max = BUDGET_MAX[budget] ?? Infinity;
    if (max === Infinity) return [...products].sort((a,b) => (b.price||0)-(a.price||0));
    const filtered = products.filter(p => !p.price || p.price <= max);
    const pool     = filtered.length ? filtered : products;
    return budget === 'low'
      ? [...pool].sort((a,b) => (a.price||0)-(b.price||0))
      : pool;
  }

  function pick1(candidates, budget) {
    const pool = filterByBudget(candidates.filter(Boolean), budget);
    if (!pool.length) return [];
    return [pool[Math.floor(Math.random() * pool.length)]];
  }

  // ══════════════════════════════════════════════════════════════
  // SÉLECTION PRODUITS — adaptés au profil
  // ══════════════════════════════════════════════════════════════

  // 1. ANTI-CERNES MULTI-USAGE ───────────────────────────────────
  function selectConcealer({ carnation, undertone, budget }) {
    let ids;
    if (carnation === 'light') {
      ids = undertone === 'cool'
        ? ['m115','m042','m046','m038']   // HALOW GLOW Fair, NYX Ivoire, NYX Light, Clinique
        : ['m115','m038','m047','m046'];  // HALOW GLOW Fair, Clinique, Maybelline
    } else if (carnation === 'dark') {
      ids = undertone === 'warm'
        ? ['m044','m038','m039','m114']   // NYX Tan, Clinique, Charlotte Tilbury, HALOW GLOW
        : ['m038','m044','m039','m113'];
    } else {
      // medium
      ids = undertone === 'warm'
        ? ['m114','m038','m047','m043']   // HALOW GLOW 3, Clinique, Maybelline, NYX Natural
        : ['m038','m047','m114','m042'];
    }
    return pick1(ids.map(getById), budget);
  }

  // 2. HIGHLIGHTER GLOW ─────────────────────────────────────────
  function selectHighlighter({ carnation, budget }) {
    let ids;
    if (carnation === 'dark')       ids = ['m117','m090','m110'];
    else if (carnation === 'light') ids = ['m116','m090','m109'];
    else                            ids = ['m090','m109','m116'];
    return pick1(ids.map(getById), budget);
  }

  // 3. BLUSH ────────────────────────────────────────────────────
  function selectBlush({ undertone, budget }) {
    // m128 = contour bronzant, exclure
    const pool = getByCategory('blush').filter(p => p.id !== 'm128');
    let ordered;
    if (undertone === 'warm')       ordered = [getById('m105'), ...pool.filter(p => p.id !== 'm105')];
    else if (undertone === 'cool')  ordered = [getById('m104'), getById('m112'), ...pool.filter(p => !['m104','m112'].includes(p.id))];
    else                            ordered = [getById('m104'), ...pool.filter(p => p.id !== 'm104')];
    return pick1(ordered, budget);
  }

  // 4. POUDRE LIBRE ─────────────────────────────────────────────
  function selectPowder({ skinType, undertone, carnation, budget }) {
    let ids;
    if (skinType === 'grasse' || skinType === 'mixte') {
      ids = ['m099','m097','m127'];  // Stay Matte, Sun Lover, Laura Mercier
    } else if (undertone === 'warm' && carnation !== 'light') {
      ids = ['m126','m097','m127'];  // HUDA BEAUTY pain banane, Sun Lover, Laura Mercier
    } else {
      ids = ['m097','m127','m099'];  // Sun Lover, Laura Mercier (translucentes)
    }
    return pick1(ids.map(getById), budget);
  }

  // 5. CRAYON YEUX ESTOMPABLE ───────────────────────────────────
  function selectEyeliner({ undertone, budget }) {
    let ids;
    if (undertone === 'warm')      ids = ['m032', 'm033', 'm035']; // Cocoa Pavé, Terre Cuite, Olive
    else if (undertone === 'cool') ids = ['m031', 'm037', 'm036']; // Mauve, Quartz Fumé, Éclair de Nuit
    else                           ids = ['m036', 'm034', 'm031']; // Éclair de Nuit, Bordeaux, Mauve
    const products = ids.map(getById).filter(Boolean);
    return products.length ? pick1(products, budget) : pick1(getByCategory('eyeliner'), budget);
  }

  // 6. MASCARA ──────────────────────────────────────────────────
  function selectMascara({ undertone, carnation, budget }) {
    let ids;
    if (undertone === 'warm') {
      ids = carnation === 'dark'
        ? ['m050', 'm049', 'm052']  // CT Pillow Talk, CT Push Up, Clinique Brown
        : ['m052', 'm050', 'm054']; // Clinique Brown, CT Pillow Talk, Maybelline Lash Sensational
    } else {
      ids = ['m055', 'm051', 'm056']; // Maybelline Sky High, Clinique Noir, IT Cosmetics
    }
    const products = ids.map(getById).filter(Boolean);
    return products.length ? pick1(products, budget) : pick1(getByCategory('mascara'), budget);
  }

  // 7. CRAYON LÈVRES LONGUE TENUE ───────────────────────────────
  function selectLipliner({ undertone, carnation, budget }) {
    const pool = getByCategory('lipliner');
    if (!pool.length) return [];
    let ids;
    if (undertone === 'warm') {
      ids = carnation === 'dark'
        ? ['m079','m063','m068']   // Sacheu (nude foncé), Cayenne, NYX
        : ['m068','m063','m079'];  // NYX Repulpant, Cayenne, Sacheu
    } else if (undertone === 'cool') {
      ids = carnation === 'dark'
        ? ['m061','m062']          // Crushberry, Intense Blush
        : ['m062','m061'];         // Intense Blush (rose cool), Crushberry
    } else {
      ids = ['m068','m062','m079']; // NYX (neutre), Blush, Sacheu
    }
    return pick1(ids.map(getById), budget);
  }

  // 8. LÈVRES — GLOSS OU BAUME TEINTÉ ──────────────────────────
  function selectLips({ undertone, carnation, budget }) {
    // Priorité : formules hydratantes et glossy. Jamais de mat.
    let ids;
    if (undertone === 'warm') {
      ids = carnation === 'dark'
        ? ['m060','m071','m075']   // Chubby Stick, NYX Butter Gloss, Elizabeth Arden Lip Oil
        : ['m060','m075','m071'];  // Chubby Stick, Lip Oil, Gloss
    } else if (undertone === 'cool') {
      ids = carnation === 'dark'
        ? ['m064','m118','m071']   // Pink Honey, Gloss bonbon rose, NYX Butter Gloss
        : ['m064','m118','m111'];  // Pink Honey, Gloss bonbon rose, Fraise
    } else {
      ids = ['m064','m060','m075']; // Pink Honey, Chubby Stick, Lip Oil
    }
    const lips = getByCategories(['lipstick','lipgloss']);
    const candidates = ids.map(id => lips.find(p => p.id === id)).filter(Boolean);
    if (!candidates.length) return pick1(lips.filter(p => p.category === 'lipgloss' || p.id === 'm060' || p.id === 'm064'), budget);
    return pick1(candidates, budget);
  }

  // BONUS 1 — GLOW BRONZANT LIQUIDE ─────────────────────────────
  function selectGlowBronzer({ budget }) {
    const product = getById('m094'); // Weleda Teint Lumineux Sérum Bronzant
    if (product) return [product];
    return pick1(getByCategory('bronzer').filter(p => p.name.toLowerCase().includes('sérum') || p.name.toLowerCase().includes('liquid') || p.name.toLowerCase().includes('teint')), budget);
  }

  // BONUS 2 — PINCEAUX ──────────────────────────────────────────
  function selectBrushes({ budget }) {
    return pick1(getByCategory('tools'), budget);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU CARTE PRODUIT (inchangé)
  // ══════════════════════════════════════════════════════════════

  function renderCard(product) {
    if (!product) return '';
    const { id, name, brand, imageUrl, amazonUrl, price, description, rating } = product;
    const safeUrl = amazonUrl || '#';
    return `
      <article class="premium-card" data-product-id="${id}">
        <a href="${safeUrl}" target="_blank" rel="noopener nofollow sponsored" class="premium-card-link">
          <div class="premium-card-image-wrap">
            <div class="premium-card-glow"></div>
            <img src="${imageUrl}" alt="${name}" class="premium-card-image" loading="lazy"
                 onerror="this.src='assets/placeholder.jpg'">
          </div>
          <div class="premium-card-content">
            <span class="premium-card-brand">${brand}</span>
            <h3 class="premium-card-name">${name}</h3>
            <p class="premium-card-desc">${description || ''}</p>
            ${rating ? `<div class="premium-card-rating">★ ${rating}</div>` : ''}
            <div class="premium-card-footer">
              <span class="premium-card-price">${price != null ? price.toFixed(2) + ' €' : '—'}</span>
              <span class="premium-card-cta">Acheter →</span>
            </div>
          </div>
        </a>
      </article>`;
  }

  // ── Étape numérotée ───────────────────────────────────────────
  function renderStep(num, title, tip, product) {
    if (!product) return '';
    return `
      <div class="cg-step">
        <div class="cg-step-meta">
          <span class="cg-step-num">${String(num).padStart(2,'0')}</span>
          <div class="cg-step-info">
            <h2 class="cg-step-title">${title}</h2>
            <p class="cg-step-tip">${tip}</p>
          </div>
        </div>
        <div class="cg-step-card">
          ${renderCard(product)}
        </div>
      </div>`;
  }

  // ── Profil chips ──────────────────────────────────────────────
  function renderProfile(profile) {
    const labels = {
      faceShape:  { oval:'Ovale', round:'Rond', square:'Carré', heart:'Cœur', long:'Allongé' },
      undertone:  { warm:'Sous-ton chaud', cool:'Sous-ton froid', neutral:'Sous-ton neutre' },
      skinType:   { grasse:'Peau grasse', mixte:'Peau mixte', seche:'Peau sèche', sensible:'Peau sensible', normale:'Peau normale' },
      carnation:  { light:'Carnation claire', medium:'Carnation medium', dark:'Carnation foncée' }
    };
    const chips = [
      labels.carnation[profile.carnation],
      labels.undertone[profile.undertone],
      labels.skinType[profile.skinType],
      labels.faceShape[profile.faceShape]
    ].filter(Boolean);
    return `<div class="cg-profile">${chips.map(c => `<span class="cg-chip">${c}</span>`).join('')}</div>`;
  }

  // ── Total budget ──────────────────────────────────────────────
  function computeTotal(allProducts) {
    return allProducts.reduce((sum, p) => sum + (p?.price || 0), 0);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════

  function render(container, profile) {
    // Sélection
    const [concealer]    = selectConcealer(profile)   || [null];
    const [highlighter]  = selectHighlighter(profile)  || [null];
    const [blush]        = selectBlush(profile)        || [null];
    const [eyeliner]     = selectEyeliner(profile)     || [null];
    const [mascara]      = selectMascara(profile)      || [null];
    const [lipliner]     = selectLipliner(profile)     || [null];
    const [lips]         = selectLips(profile)         || [null];
    const [glowBronzer]  = selectGlowBronzer(profile)  || [null];
    const [powder]       = selectPowder(profile)       || [null];
    const [brush]        = selectBrushes(profile)      || [null];

    const coreProducts  = [concealer, highlighter, blush, eyeliner, mascara, lipliner, lips].filter(Boolean);
    const bonusProducts = [glowBronzer, powder, brush].filter(Boolean);
    const coreTotal     = computeTotal(coreProducts);
    const totalWithBonus= computeTotal([...coreProducts, ...bonusProducts]);

    if (!coreProducts.length) {
      container.innerHTML = `<div class="premium-routine"><div class="premium-empty">
        <span class="premium-empty-icon">💄</span>
        <p class="premium-empty-text">Aucun produit disponible pour ce profil.</p>
      </div></div>`;
      return;
    }

    const steps = [
      renderStep(1, 'Anti-cernes',    'Tapote avec le doigt sous les yeux et sur les petites imperfections. Effet seconde peau.',               concealer),
      renderStep(2, 'Highlighter',    'Une touche sur les pommettes et l\'arc de Cupidon. Le doigt suffit — pas besoin de pinceau.',            highlighter),
      renderStep(3, 'Blush',          'Souris et dépose sur les rondeurs des joues. Estompe vers les tempes pour un effet bonne mine naturel.',  blush),
      renderStep(4, 'Crayon yeux',    'Trace au plus près des cils et estompe avec le doigt. En waterline nude, il agrandit le regard.',         eyeliner),
      renderStep(5, 'Mascara',        'Zigzague la brosse de la racine vers les pointes. Une couche pour le naturel, deux pour l\'intensité.',   mascara),
      renderStep(6, 'Crayon lèvres',  'Contourne les lèvres puis remplis-les entièrement. Ça prolonge la tenue du gloss toute la journée.',     lipliner),
      renderStep(7, 'Lèvres',         'Applique directement depuis l\'embout. Tamponne au doigt pour un rendu encore plus naturel.',             lips)
    ].join('');

    const coreTotalHtml = coreTotal > 0 ? `
      <div class="cg-total">
        <span class="cg-total-label">Total routine (7 produits)</span>
        <strong class="cg-total-amount">${coreTotal.toFixed(2)} €</strong>
      </div>` : '';

    const bonusHtml = (glowBronzer || powder || brush) ? `
      <div class="cg-bonus">
        <div class="cg-bonus-header">
          <span class="cg-bonus-tag">Bonus</span>
          <h2 class="cg-bonus-title">Pour aller plus loin ✦</h2>
          <p class="cg-bonus-subtitle">Produits optionnels pour parfaire ta routine.</p>
        </div>
        ${glowBronzer ? `
        <div class="cg-bonus-item">
          <div class="cg-bonus-item-label">
            <h3>Glow bronzant liquide</h3>
            <p>Quelques gouttes sur les pommettes ou mélangées à ta crème pour un effet bonne mine ensoleillé.</p>
          </div>
          <div class="cg-bonus-item-card">${renderCard(glowBronzer)}</div>
        </div>` : ''}
        ${powder ? `
        <div class="cg-bonus-item">
          <div class="cg-bonus-item-label">
            <h3>Poudre libre</h3>
            <p>Presse légèrement sur la zone T pour fixer le maquillage. Une fine couche suffit — évite l'effet masque.</p>
          </div>
          <div class="cg-bonus-item-card">${renderCard(powder)}</div>
        </div>` : ''}
        ${brush ? `
        <div class="cg-bonus-item">
          <div class="cg-bonus-item-label">
            <h3>Pinceaux ✦</h3>
            <p>De bons pinceaux peuvent complètement transformer le rendu du maquillage. 2 ou 3 bons pinceaux suffisent pour une routine quotidienne.</p>
          </div>
          <div class="cg-bonus-item-card">${renderCard(brush)}</div>
        </div>` : ''}
      </div>` : '';

    const totalWithBonusHtml = bonusProducts.length > 0 && totalWithBonus > 0 ? `
      <div class="cg-total cg-total-bonus">
        <span class="cg-total-label">Total avec bonus</span>
        <strong class="cg-total-amount">${totalWithBonus.toFixed(2)} €</strong>
      </div>` : '';

    container.innerHTML = `
      <div class="makeup-routine">

        <header class="premium-header">
          <span class="premium-tag">Ta sélection personnalisée</span>
          <h1 class="premium-title">Clean Girl Routine ✦</h1>
          <p class="premium-subtitle">7 produits · Adapté à ton profil beauté</p>
        </header>

        ${renderProfile(profile)}

        <div class="cg-steps">
          ${steps}
        </div>

        ${coreTotalHtml}

        ${bonusHtml}

        ${totalWithBonusHtml}

        <footer class="premium-footer">
          <p>Liens affiliés Amazon · Même commission sur tous les produits</p>
          ${_renderSaveBanner()}
        </footer>

      </div>`;
  }

  function _renderSaveBanner() {
    const hasPhoto = !!AppState?.face?.skinAnalysis;
    const parts    = [];
    if (hasPhoto) parts.push('Analyse photo');
    parts.push('Questionnaire · Routine make-up');
    const isGuest = AppState?.user?.isGuest !== false;
    return `
      <div class="save-banner">
        <span class="save-banner-icon">✓</span>
        <div class="save-banner-text">
          <strong>${parts.join(' · ')} enregistrés</strong>
          <span>${isGuest ? 'Crée un compte pour retrouver ton profil partout.' : 'Retrouve ton profil dans <strong>Mon compte</strong>.'}</span>
        </div>
        ${isGuest ? `<button class="btn btn-outline save-banner-btn" onclick="openAuthModal()">Créer mon compte →</button>` : ''}
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  async function initScreen() {
    const container = document.getElementById('makeupRoutineContent');
    if (!container) return;

    container.innerHTML = `
      <div class="premium-loading">
        <div class="premium-loading-spinner"></div>
        <p>Préparation de ta routine…</p>
      </div>`;

    await loadCatalogue();

    if (!catalogue.length) {
      container.innerHTML = `<div class="premium-routine"><div class="premium-empty">
        <span class="premium-empty-icon">⚠️</span>
        <p class="premium-empty-text">Impossible de charger le catalogue.</p>
      </div></div>`;
      return;
    }

    const analysis = AppState?.face?.skinAnalysis;
    const skinQuiz = AppState?.questionnaire?.answers || {};
    const mkQuiz   = AppState?.makeupQuiz || {};

    // Carnation : photo > quiz
    const carnationRaw = analysis?.carnation?.type || skinQuiz?.skinTone || 'medium';
    const carnationMap = { light:'light', clair:'light', medium:'medium', fonce:'dark', dark:'dark' };
    const carnation    = carnationMap[carnationRaw] || 'medium';

    // Budget : quiz makeup > quiz skincare
    const budgetMap = { 'petits-prix':'low', 'bon-rapport':'medium', premium:'premium' };
    const budget    = budgetMap[mkQuiz.mkBudget] || skinQuiz?.budget || null;

    const profile = {
      faceShape: analysis?.faceShape?.shape   || 'oval',
      skinType:  mkQuiz.mkSkinType || analysis?.skinType?.type || skinQuiz?.skinType || 'normale',
      undertone: analysis?.undertone?.type    || 'neutral',
      eyeShape:  analysis?.eyeShape           || 'almond',
      lipShape:  analysis?.lipShape           || 'medium',
      carnation,
      budget,
      mkFocus:   mkQuiz.mkFocus  || null,
      mkLook:    mkQuiz.mkLook   || null,
      mkTime:    mkQuiz.mkTime   || null,
      ageGroup:  skinQuiz?.ageGroup     || null
    };

    console.log('[MakeupRoutine] Profil:', profile);
    render(container, profile);
  }

  return { initScreen, loadCatalogue, getByCategory, getById };

})();
