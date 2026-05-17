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
        const res  = await fetch('data/products-manual.json?v=56');
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

  // Marques considérées luxe — seules proposées quand mkLuxe est actif
  const LUXURY_BRANDS = new Set([
    'Clinique', 'Charlotte Tilbury', 'IT Cosmetics', 'IT COSMETIC',
    'Victoria Beckham Beauty', 'DLA Paris', 'Elizabeth Arden',
    'Summer Fridays', 'By Terry', 'NARS', 'HUDA BEAUTY',
    'Laura Mercier', 'Erborian', 'ERBORIAN', 'Sacheu'
  ]);

  // Picks randomly from the best-scored products across the full catalog
  // priorityIds get a +50 bonus so they appear in top-10 more often but aren't guaranteed
  // luxeOnly: if true, restricts to LUXURY_BRANDS (falls back to full pool if no luxury product found)
  function pickFromCatalog(categories, budget, priorityIds = [], excludeIds = [], luxeOnly = false) {
    const cats = Array.isArray(categories) ? categories : [categories];
    const excludeSet = new Set(excludeIds);
    let all = filterByBudget(
      getByCategories(cats).filter(p => !excludeSet.has(p.id)),
      budget
    );
    if (luxeOnly) {
      const luxury = all.filter(p => LUXURY_BRANDS.has(p.brand));
      if (luxury.length) all = luxury;
    }
    if (!all.length) return null;
    const prioritySet = new Set(priorityIds);
    const scored = all.map(p => ({
      ...p, _w: (p.rating || 3) * 10 + (prioritySet.has(p.id) ? 50 : 0)
    }));
    scored.sort((a, b) => b._w - a._w);
    const topN = scored.slice(0, Math.min(10, scored.length));
    return topN[Math.floor(Math.random() * topN.length)] || null;
  }

  // ══════════════════════════════════════════════════════════════
  // SÉLECTION PRODUITS — adaptés au profil
  // ══════════════════════════════════════════════════════════════

  // 1. ANTI-CERNES MULTI-USAGE ───────────────────────────────────
  function selectConcealer({ carnation, undertone, budget, mkLuxe }) {
    let priority;
    if (carnation === 'light') {
      priority = undertone === 'cool'
        ? ['m115','m042','m046','m038']
        : ['m115','m038','m047','m046'];
    } else if (carnation === 'dark') {
      priority = undertone === 'warm'
        ? ['m044','m038','m039','m114']
        : ['m038','m044','m039','m113'];
    } else {
      priority = undertone === 'warm'
        ? ['m114','m038','m047','m043']
        : ['m038','m047','m114','m042'];
    }
    return [pickFromCatalog('concealer', budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // 2. HIGHLIGHTER GLOW ─────────────────────────────────────────
  function selectHighlighter({ carnation, budget, mkLuxe }) {
    const priority = carnation === 'dark'
      ? ['m117','m090','m110']
      : carnation === 'light'
        ? ['m116','m090','m109']
        : ['m090','m109','m116'];
    return [pickFromCatalog('highlighter', budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // 3. BLUSH ────────────────────────────────────────────────────
  function selectBlush({ undertone, carnation, budget, ageGroup, mkLuxe }) {
    const isDark  = carnation === 'dark';
    const is40plus = ageGroup === '40+';

    if (is40plus) {
      const id = isDark ? 'm193' : 'm192';
      const p  = getById(id);
      return p ? [p] : [pickFromCatalog('blush', budget, ['m193','m192'], ['m128'], mkLuxe)].filter(Boolean);
    }

    let priority;
    if (undertone === 'warm')      priority = isDark ? ['m193','m105'] : ['m105'];
    else if (undertone === 'cool') priority = isDark ? ['m104','m112'] : ['m104','m112'];
    else                           priority = ['m104'];
    return [pickFromCatalog('blush', budget, priority, ['m128','m192','m193'], mkLuxe)].filter(Boolean);
  }

  // 4. POUDRE LIBRE ─────────────────────────────────────────────
  function selectPowder({ skinType, undertone, carnation, budget, mkLuxe }) {
    let priority;
    if (skinType === 'grasse' || skinType === 'mixte') {
      priority = ['m099','m097','m127'];
    } else if (undertone === 'warm' && carnation !== 'light') {
      priority = ['m126','m097','m127'];
    } else {
      priority = ['m097','m127','m099'];
    }
    return [pickFromCatalog('powder', budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // 5. CRAYON YEUX ESTOMPABLE ───────────────────────────────────
  function selectEyeliner({ undertone, budget, mkLuxe }) {
    const priority = undertone === 'warm'
      ? ['m032','m033','m035']
      : undertone === 'cool'
        ? ['m031','m037','m036']
        : ['m036','m034','m031'];
    return [pickFromCatalog('eyeliner', budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // 6. MASCARA ──────────────────────────────────────────────────
  function selectMascara({ undertone, carnation, budget, mkLuxe }) {
    let priority;
    if (undertone === 'warm') {
      priority = carnation === 'dark'
        ? ['m050','m049','m052']
        : ['m052','m050','m054'];
    } else {
      priority = ['m055','m051','m056'];
    }
    return [pickFromCatalog('mascara', budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // 7. CRAYON LÈVRES LONGUE TENUE ───────────────────────────────
  function selectLipliner({ undertone, carnation, budget, mkLuxe }) {
    let priority;
    if (undertone === 'warm') {
      priority = carnation === 'dark'
        ? ['m079','m063','m068']
        : ['m068','m063','m079'];
    } else if (undertone === 'cool') {
      priority = carnation === 'dark'
        ? ['m061','m062']
        : ['m062','m061'];
    } else {
      priority = ['m068','m062','m079'];
    }
    return [pickFromCatalog('lipliner', budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // 8. LÈVRES — GLOSS OU BAUME TEINTÉ ──────────────────────────
  function selectLips({ undertone, carnation, budget, mkLuxe }) {
    let priority;
    if (undertone === 'warm') {
      priority = carnation === 'dark'
        ? ['m060','m071','m075']
        : ['m060','m075','m071'];
    } else if (undertone === 'cool') {
      priority = carnation === 'dark'
        ? ['m064','m118','m071']
        : ['m064','m118','m111'];
    } else {
      priority = ['m064','m060','m075'];
    }
    return [pickFromCatalog(['lipstick','lipgloss'], budget, priority, [], mkLuxe)].filter(Boolean);
  }

  // BONUS 1 — GLOW BRONZANT LIQUIDE ─────────────────────────────
  function selectGlowBronzer({ budget }) {
    const liquidBronzers = getByCategory('bronzer').filter(p =>
      ['sérum','serum','liquid','teint','glow'].some(kw => p.name?.toLowerCase().includes(kw))
    );
    return pick1(liquidBronzers.length ? liquidBronzers : getByCategory('bronzer'), budget);
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
    const { id, name, brand, imageUrl, amazonUrl, shopUrl, price, description, rating } = product;
    const safeUrl = amazonUrl || shopUrl || '#';
    const isAffiliate = !!amazonUrl;
    return `
      <article class="premium-card" data-product-id="${id}">
        <a href="${safeUrl}" target="_blank" rel="noopener nofollow${isAffiliate ? ' sponsored' : ''}" class="premium-card-link">
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
            <p>De bons pinceaux, ça change tout. Un outil de qualité fait la différence entre un maquillage ordinaire et un résultat parfaitement estompé — plus naturel, plus précis, plus longue tenue.</p>
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

    // Carnation : quiz makeup (choix manuel) > photo > quiz skincare
    const carnationMap = { light:'light', clair:'light', medium:'medium', fonce:'dark', dark:'dark' };
    const carnationRaw = mkQuiz.mkCarnation || analysis?.carnation?.type || skinQuiz?.skinTone || 'medium';
    const carnation    = carnationMap[carnationRaw] || 'medium';

    // Sous-ton : quiz makeup > photo
    const undertoneRaw = mkQuiz.mkUndertone || analysis?.undertone?.type || 'neutral';

    // Budget : quiz makeup > quiz skincare
    const budgetMap = { 'petits-prix':'low', 'bon-rapport':'medium', premium:'premium' };
    const budget    = budgetMap[mkQuiz.mkBudget] || skinQuiz?.budget || null;

    const profile = {
      faceShape: analysis?.faceShape?.shape   || 'oval',
      skinType:  mkQuiz.mkSkinType || analysis?.skinType?.type || skinQuiz?.skinType || 'normale',
      undertone: undertoneRaw,
      eyeShape:  analysis?.eyeShape           || 'almond',
      lipShape:  analysis?.lipShape           || 'medium',
      carnation,
      budget,
      mkFocus:   mkQuiz.mkFocus  || null,
      mkLook:    mkQuiz.mkLook   || null,
      mkTime:    mkQuiz.mkTime   || null,
      ageGroup:  skinQuiz?.ageGroup     || null,
      mkLuxe:    mkQuiz.mkBudget === 'premium'
    };

    console.log('[MakeupRoutine] Profil:', profile);
    render(container, profile);
  }

  return { initScreen, loadCatalogue, getByCategory, getById };

})();
