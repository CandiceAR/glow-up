/* ============================================================
   makeupRoutine.js — Routine Make-up
   UTILISE UNIQUEMENT LES PRODUITS DU CATALOGUE
   Aucun produit inventé - 100% cohérence image/texte/lien
   ============================================================ */

'use strict';

const MakeupRoutine = (() => {

  // ══════════════════════════════════════════════════════════════
  // CATALOGUE — Chargé depuis products-manual.json
  // ══════════════════════════════════════════════════════════════

  let catalogue = [];
  let isLoaded = false;

  async function loadCatalogue() {
    if (isLoaded) return catalogue;
    try {
      const res = await fetch('data/products-manual.json');
      const data = await res.json();
      catalogue = data.products.filter(p => p.active !== false);
      isLoaded = true;
      console.log('[MakeupRoutine] Catalogue chargé:', catalogue.length, 'produits');
    } catch (e) {
      console.error('[MakeupRoutine] Erreur chargement catalogue:', e);
      catalogue = [];
    }
    return catalogue;
  }

  // ══════════════════════════════════════════════════════════════
  // FILTRES PAR CATÉGORIE
  // ══════════════════════════════════════════════════════════════

  function getByCategory(cat) {
    return catalogue.filter(p => p.category === cat);
  }

  function getById(id) {
    return catalogue.find(p => p.id === id);
  }

  // ══════════════════════════════════════════════════════════════
  // SÉLECTION INTELLIGENTE DES PRODUITS
  // Basée sur le profil peau — retourne des IDs du catalogue
  // ══════════════════════════════════════════════════════════════

  function selectFoundation(profile) {
    const foundations = getByCategory('foundation');
    if (!foundations.length) return null;

    const { skinType, undertone } = profile;

    // Logique de sélection basée sur le type de peau
    // Peau grasse/mixte → fonds de teint mats (Dermacol, Wet n Wild)
    // Peau sèche → fonds de teint hydratants (By Terry, Clinique)
    // Peau sensible → CC crèmes douces (IT Cosmetics)

    let selectedIds = [];

    if (skinType === 'grasse' || skinType === 'mixte') {
      // Privilégier les mats
      selectedIds = ['m022', 'm016', 'm019']; // Dermacol, Wet n Wild, NYX
    } else if (skinType === 'seche') {
      // Privilégier les hydratants
      selectedIds = ['m017', 'm021', 'm015']; // By Terry, Charlotte Tilbury, Clinique
    } else if (skinType === 'sensible') {
      // CC crèmes douces
      selectedIds = ['m026', 'm028', 'm030']; // IT Cosmetics CC+
    } else {
      // Peau normale - polyvalent
      selectedIds = ['m020', 'm015', 'm026']; // Clinique Even Better, Superbalanced, IT Cosmetics
    }

    // Filtrer par sous-ton si possible
    if (undertone === 'warm') {
      // Teintes chaudes
      const warmIds = ['m026', 'm027', 'm023', 'm025'];
      const warmMatch = selectedIds.find(id => warmIds.includes(id));
      if (warmMatch) selectedIds = [warmMatch, ...selectedIds.filter(id => id !== warmMatch)];
    } else if (undertone === 'cool') {
      // Teintes froides/neutres
      const coolIds = ['m028', 'm029', 'm024'];
      const coolMatch = selectedIds.find(id => coolIds.includes(id));
      if (coolMatch) selectedIds = [coolMatch, ...selectedIds.filter(id => id !== coolMatch)];
    }

    // Retourner les produits existants
    const products = selectedIds
      .map(id => getById(id))
      .filter(Boolean)
      .slice(0, 2);

    if (!products.length) {
      // Fallback : premier fond de teint disponible
      return [foundations[0]];
    }

    return products;
  }

  function selectConcealer(profile) {
    const concealers = catalogue.filter(p =>
      p.category === 'foundation' && p.name.toLowerCase().includes('concealer')
    );

    if (!concealers.length) return null;
    if (!profile.cernes?.detected) return null;

    const { undertone } = profile;

    // IT Cosmetics Do It All selon sous-ton
    if (undertone === 'warm') {
      return [getById('m023') || getById('m025')].filter(Boolean); // Fair Warm ou Tan Rich Warm
    } else if (undertone === 'cool') {
      return [getById('m024')].filter(Boolean); // Tan Neutral
    }

    return [concealers[0]];
  }

  function selectEyeliner(profile) {
    const eyeliners = getByCategory('eyeliner');
    if (!eyeliners.length) return null;

    const { undertone, eyeColor } = profile;

    // Sélection basée sur le sous-ton
    let selectedId;

    if (undertone === 'warm') {
      // Teintes chaudes : Terre Cuite, Bordeaux, Olive
      selectedId = 'm033'; // Terre Cuite
    } else if (undertone === 'cool') {
      // Teintes froides : Mauve, Quartz Fumé
      selectedId = 'm031'; // Mauve
    } else {
      // Neutre : Éclair de Nuit (noir classique)
      selectedId = 'm036'; // Éclair de Nuit
    }

    const product = getById(selectedId);
    return product ? [product] : [eyeliners[0]];
  }

  function selectLips(profile) {
    const lips = getByCategory('lipbalm');
    if (!lips.length) return null;

    // On n'a qu'un seul produit lèvres : Clinique Almost Lipstick
    const cliniqueLips = getById('m011');
    return cliniqueLips ? [cliniqueLips] : null;
  }

  // ══════════════════════════════════════════════════════════════
  // TIPS CONTEXTUELS (courts et simples)
  // ══════════════════════════════════════════════════════════════

  function getTip(category, profile) {
    const tips = {
      foundation: {
        grasse: 'Applique par petites touches. Fixe avec une poudre légère.',
        mixte: 'Concentre le produit sur la zone T.',
        seche: 'Hydrate bien avant. Applique du centre vers l\'extérieur.',
        sensible: 'Teste d\'abord sur le cou. Évite de frotter.',
        normale: 'Estompe au pinceau ou éponge humide.'
      },
      concealer: {
        default: 'Tapote doucement sous les yeux. Ne tire pas la peau.'
      },
      eyeliner: {
        default: 'Trace près des cils. Estompe pour un effet smoky doux.'
      },
      lips: {
        default: 'Applique au doigt pour un effet naturel.'
      }
    };

    if (category === 'foundation') {
      return tips.foundation[profile.skinType] || tips.foundation.normale;
    }
    return tips[category]?.default || '';
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU CARTE PRODUIT
  // Affiche UNIQUEMENT les données du catalogue
  // ══════════════════════════════════════════════════════════════

  function renderCard(product, index) {
    if (!product) return '';

    // TOUTES les données viennent du même objet produit
    const { id, name, brand, imageUrl, amazonUrl, price, description, rating } = product;

    return `
      <article class="premium-card" style="animation-delay:${index * 0.08}s" data-product-id="${id}">
        <a href="${amazonUrl}" target="_blank" rel="noopener nofollow sponsored" class="premium-card-link">

          <div class="premium-card-image-wrap">
            <div class="premium-card-glow"></div>
            <img src="${imageUrl}" alt="${name}" class="premium-card-image" loading="lazy"
                 onerror="this.src='assets/placeholder.jpg'">
          </div>

          <div class="premium-card-content">
            <span class="premium-card-brand">${brand}</span>
            <h3 class="premium-card-name">${name}</h3>

            <p class="premium-card-desc">${description}</p>

            ${rating ? `<div class="premium-card-rating">★ ${rating}</div>` : ''}

            <div class="premium-card-footer">
              <span class="premium-card-price">${price.toFixed(2)} €</span>
              <span class="premium-card-cta">Acheter →</span>
            </div>
          </div>

        </a>
      </article>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU SECTION
  // ══════════════════════════════════════════════════════════════

  function renderSection(title, icon, tip, products) {
    if (!products || !products.length) return '';

    const cardsHtml = products.map((p, i) => renderCard(p, i)).join('');

    return `
      <section class="premium-section">
        <div class="premium-section-header">
          <span class="premium-section-icon">${icon}</span>
          <div>
            <h2 class="premium-section-title">${title}</h2>
            ${tip ? `<p class="premium-section-subtitle">${tip}</p>` : ''}
          </div>
        </div>
        <div class="premium-cards-grid">
          ${cardsHtml}
        </div>
      </section>`;
  }

  // ══════════════════════════════════════════════════════════════
  // PROFIL SIMPLIFIÉ
  // ══════════════════════════════════════════════════════════════

  function renderProfile(profile) {
    const labels = {
      faceShape: { oval: 'Ovale', round: 'Rond', square: 'Carré', heart: 'Cœur', long: 'Allongé' },
      undertone: { warm: 'Chaud', cool: 'Froid', neutral: 'Neutre' },
      skinType: { grasse: 'Grasse', mixte: 'Mixte', seche: 'Sèche', sensible: 'Sensible', normale: 'Normale' }
    };

    return `
      <div class="premium-profile">
        <div class="premium-profile-item">
          <span class="premium-profile-label">Visage</span>
          <span class="premium-profile-value">${labels.faceShape[profile.faceShape] || 'Ovale'}</span>
        </div>
        <div class="premium-profile-item">
          <span class="premium-profile-label">Sous-ton</span>
          <span class="premium-profile-value">${labels.undertone[profile.undertone] || 'Neutre'}</span>
        </div>
        <div class="premium-profile-item">
          <span class="premium-profile-label">Peau</span>
          <span class="premium-profile-value">${labels.skinType[profile.skinType] || 'Normale'}</span>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════

  function render(container, profile) {
    // Sélection des produits depuis le catalogue UNIQUEMENT
    const foundations = selectFoundation(profile);
    const concealers = selectConcealer(profile);
    const eyeliners = selectEyeliner(profile);
    const lips = selectLips(profile);

    // Vérifier qu'on a au moins un produit
    const hasProducts = foundations?.length || concealers?.length || eyeliners?.length || lips?.length;

    if (!hasProducts) {
      container.innerHTML = `
        <div class="premium-routine">
          <div class="premium-empty">
            <span class="premium-empty-icon">💄</span>
            <p class="premium-empty-text">Aucun produit makeup disponible dans le catalogue.</p>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="premium-routine">

        <header class="premium-header">
          <span class="premium-tag">Ta sélection personnalisée</span>
          <h1 class="premium-title">Routine Make-up</h1>
          <p class="premium-subtitle">Produits sélectionnés selon ton analyse</p>
        </header>

        ${renderProfile(profile)}

        ${renderSection('Teint', '◇', getTip('foundation', profile), foundations)}
        ${renderSection('Anti-cernes', '◉', getTip('concealer', profile), concealers)}
        ${renderSection('Yeux', '○', getTip('eyeliner', profile), eyeliners)}
        ${renderSection('Lèvres', '❋', getTip('lips', profile), lips)}

        <footer class="premium-footer">
          <p>Liens affiliés · Même commission sur tous les produits</p>
        </footer>

      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  async function initScreen() {
    const container = document.getElementById('makeupRoutineContent');
    if (!container) return;

    // Afficher loading
    container.innerHTML = `
      <div class="premium-loading">
        <div class="premium-loading-spinner"></div>
        <p>Chargement...</p>
      </div>`;

    // Charger le catalogue
    await loadCatalogue();

    if (!catalogue.length) {
      container.innerHTML = `
        <div class="premium-routine">
          <div class="premium-empty">
            <span class="premium-empty-icon">⚠️</span>
            <p class="premium-empty-text">Impossible de charger le catalogue.</p>
          </div>
        </div>`;
      return;
    }

    // Récupérer l'analyse
    const analysis = AppState?.face?.skinAnalysis;
    const questionnaire = AppState?.questionnaire?.answers;

    // Construire le profil
    const profile = {
      faceShape: analysis?.faceShape?.shape || 'oval',
      skinType: analysis?.skinType?.type || questionnaire?.skinType || 'normale',
      undertone: analysis?.undertone?.type || 'neutral',
      cernes: analysis?.cernes || null,
      eyeColor: questionnaire?.eyeColor || null
    };

    console.log('[MakeupRoutine] Profil:', profile);

    // Rendre
    render(container, profile);
  }

  // API publique
  return {
    initScreen,
    loadCatalogue,
    getByCategory,
    getById
  };

})();
