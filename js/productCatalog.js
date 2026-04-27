/* ============================================================
   productCatalog.js — Chargement, fusion et affichage catalogue
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const ProductCatalog = (() => {

  const TAG = 'kan10ar-21';

  // ─── Injecter/normaliser le tag affilié dans une URL Amazon ──
  function ensureTag(url) {
    if (!url) return url;
    try {
      // Supprimer /ref=... path components
      url = url.replace(/\/ref=[^?&]*/g, '');

      // Extraire ASIN si URL courte → reconstruire proprement
      const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinMatch) {
        return `https://www.amazon.fr/dp/${asinMatch[1]}?tag=${TAG}`;
      }

      // Sinon manipuler les query params
      const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
      urlObj.searchParams.set('tag', TAG);
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  // ─── Charger les produits ─────────────────────────────────────
  async function load() {
    try {
      // 1. Charger le catalogue statique
      let products = (typeof CATALOGUE !== 'undefined' ? CATALOGUE : []);

      // 2. Charger les produits depuis Firestore (prioritaire)
      try {
        let manualProducts = null;
        if (typeof FirestoreProducts !== 'undefined') {
          manualProducts = await FirestoreProducts.loadAll();
        }
        if (!manualProducts) {
          // Fallback JSON statique
          const res = await fetch('data/products-manual.json');
          if (res.ok) {
            const data = await res.json();
            manualProducts = Array.isArray(data) ? data : (data.products || []);
          }
        }
        if (manualProducts?.length) {
          // Fusionner : manual prioritaire
          const map = new Map();
          manualProducts.forEach(p => {
            const key = p.asin || p.id;
            map.set(key, p);
          });
          products.forEach(p => {
            const key = p.asin || p.id;
            if (!map.has(key)) map.set(key, p);
          });
          products = Array.from(map.values());
        }
      } catch (err) {
        console.log('[Catalog] Erreur chargement produits:', err.message);
      }

      // 3. Filtrer les actifs et ajouter tag affilié
      products = products
        .filter(p => p.active !== false)
        .map(p => ({ ...p, amazonUrl: ensureTag(p.amazonUrl) }));

      AppState.products.catalog = products;
      console.log('[Catalog] Chargé:', AppState.products.catalog.length, 'produits actifs');
    } catch (err) {
      console.error('[Catalog] Erreur chargement:', err);
      AppState.products.catalog = [];
    }
  }

  // ─── Fusion manual + auto (manual prioritaire) ────────────────
  function mergeProducts(manual, auto) {
    const map = new Map();

    // D'abord les manuels
    manual.forEach(p => {
      const key = p.asin || p.id;
      map.set(key, p);
    });

    // Puis les auto (uniquement si pas déjà en manuel)
    auto.forEach(p => {
      const key = p.asin || p.id;
      if (!map.has(key)) map.set(key, p);
    });

    return Array.from(map.values());
  }

  // ─── Obtenir produits recommandés selon les réponses ─────────
  // ─── Détecter la maturité peau à partir des réponses ─────────
  function getMaturityPreference(answers) {
    const { ageGroup, skinMaturity } = answers || {};
    if (ageGroup === 'moins-20') return 'teen';
    if (ageGroup === '40+' || skinMaturity === 'ridules') return 'mature';
    if (ageGroup === '20-25' && skinMaturity === 'lisse') return 'jeune';
    return 'all';
  }

  function getRecommended(answers) {
    const { skinType, makeupUsed = [], makeupFrequency } = answers;

    const skincareCategories = ['cleanser', 'serum', 'eye', 'cream', 'spf', 'lipbalm'];
    const makeupCategories   = makeupFrequency !== 'jamais' ? (makeupUsed || []) : [];
    const allowed = [...skincareCategories, ...makeupCategories];

    let pool = AppState.products.catalog.filter(p => allowed.includes(p.category));

    // Filtrer par type de peau
    if (skinType) {
      const filtered = pool.filter(p =>
        !p.skinTypeTags || p.skinTypeTags.length === 0 ||
        p.skinTypeTags.includes(skinType)
      );
      if (filtered.length >= 4) pool = filtered;
    }

    // Filtrer par maturité peau (soft preference — ne jamais vider)
    const matPref = getMaturityPreference(answers);
    if (matPref !== 'all') {
      // teen : priorité aux produits teen + jeune + all (jamais mature)
      const allowedMat = matPref === 'teen'
        ? (p) => !p.maturity || p.maturity === 'all' || p.maturity === 'jeune' || p.maturity === 'teen'
        : (p) => !p.maturity || p.maturity === 'all' || p.maturity === matPref;

      const matFiltered = pool.filter(allowedMat);
      if (matFiltered.length >= 4) pool = matFiltered;
    }

    // Trier : teen en tête si profil ado, puis featured, puis rating
    pool.sort((a, b) => {
      const matPref = getMaturityPreference(answers);
      if (matPref === 'teen') {
        const aT = a.maturity === 'teen' ? 1 : 0;
        const bT = b.maturity === 'teen' ? 1 : 0;
        if (bT !== aT) return bT - aT;
      }
      if (b.isFeatured !== a.isFeatured) return b.isFeatured ? 1 : -1;
      return (b.rating || 0) - (a.rating || 0);
    });

    AppState.products.recommended = pool;
    return pool;
  }

  // ─── Filtrer par catégorie pour le try-on ─────────────────────
  function getByCategory(category) {
    return AppState.products.catalog.filter(p => p.category === category);
  }

  // ─── Rendre une carte produit ─────────────────────────────────
  function renderCard(product, opts = {}) {
    const { showBuyButton = false, showTryOn = false } = opts;
    const ratingStars = renderStars(product.rating);
    const colorDot = product.colorHex
      ? `<span class="color-dot" style="background:${product.colorHex}" title="${product.shadeName || ''}"></span>`
      : '';
    const badgeParts = [];
    if (product.badge === 'h2o')      badgeParts.push('<span class="badge badge-h2o">💧 H₂O</span>');
    if (product.badge === 'vitc')     badgeParts.push('<span class="badge badge-vitc">✨ Vit C</span>');
    if (product.badge === 'vitc-spf') badgeParts.push('<span class="badge badge-vitc-spf">☀️ Vit C + SPF</span>');
    if (product.isFeatured)           badgeParts.push('<span class="badge badge-featured">★ Vedette</span>');
    const badgeHTML = badgeParts.length
      ? `<div class="badge-stack">${badgeParts.join('')}</div>`
      : '';
    const categoryLabel = getCategoryLabel(product.category);

    // Icônes type de peau
    const ST_ICONS = { normale: '🌿', grasse: '💦', seche: '🌵', mixte: '☯', sensible: '🌸' };
    const stTags   = Array.isArray(product.skinTypeTags) && product.skinTypeTags.length > 0 && product.skinTypeTags.length < 5
      ? `<div class="product-skin-tags">${product.skinTypeTags.map(s => `<span class="skin-tag" title="${s}">${ST_ICONS[s] || ''}</span>`).join('')}</div>`
      : '';

    // Badge ado
    if (product.maturity === 'teen') badgeParts.push('<span class="badge badge-teen">🧒 Ado</span>');

    return `
      <div class="product-card" data-id="${product.id}" onclick="ProductCatalog.openProductModal('${product.id}')">
        <div class="product-card-img">
          <img src="${product.imageUrl || ''}"
               alt="${product.name}"
               onerror="this.onerror=null;this.style.opacity='0'">
          ${badgeHTML}
        </div>
        <div class="product-card-body">
          <div class="product-card-meta">
            <span class="product-brand">${product.brand}</span>
            <span class="product-category-tag">${categoryLabel}</span>
          </div>
          <h3 class="product-name">${product.name}</h3>
          <div class="product-card-row">
            ${colorDot}
            <div class="product-rating">${ratingStars} <span>${product.rating || '—'}</span></div>
            <span class="product-price">${product.price ? product.price.toFixed(2) + ' €' : '—'}</span>
          </div>
          ${stTags}
          ${showBuyButton ? renderBuyButton(product) : ''}
          ${showTryOn ? `<button class="btn btn-tryon" onclick="event.stopPropagation(); TryOn.addProduct('${product.id}')">Essayer</button>` : ''}
        </div>
      </div>`;
  }

  // ─── Ouvrir modal produit ─────────────────────────────────────
  function openProductModal(id) {
    const p = AppState.products.catalog.find(x => x.id === id);
    if (!p) return;
    AppState.products.selected = p;
    if (typeof Tracker !== 'undefined') Tracker.trackView(id);

    const previews = renderSkinTonePreviews(p);
    const ratingStars = renderStars(p.rating);
    const colorInfo = p.colorHex
      ? `<div class="modal-color"><span class="color-swatch" style="background:${p.colorHex}"></span>${p.shadeName || ''}</div>`
      : '';

    const paired = p.pairedWith
      ? AppState.products.catalog.find(x => x.id === p.pairedWith)
      : null;
    const pairedHtml = paired ? `
      <div class="modal-paired">
        <p class="modal-paired-label">🖌️ Utilise avec</p>
        <div class="modal-paired-card">
          <img src="${paired.imageUrl}" alt="${paired.name}" onerror="this.onerror=null;this.style.opacity='0'">
          <div class="modal-paired-info">
            <span class="product-brand">${paired.brand}</span>
            <p class="modal-paired-name">${paired.name}</p>
            <span class="modal-paired-price">${paired.price.toFixed(2)} €</span>
          </div>
          <a class="btn btn-amazon btn-amazon-sm" href="${paired.amazonUrl}" target="_blank" rel="noopener">Acheter</a>
        </div>
      </div>` : '';

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="modal-product">
        <div class="modal-product-img">
          <img src="${p.imageUrl || ''}"
               alt="${p.name}"
               onerror="this.onerror=null;this.style.opacity='0'">
        </div>
        <div class="modal-product-info">
          <span class="product-brand">${p.brand}</span>
          <h2>${p.name}</h2>
          ${colorInfo}
          <div class="product-rating">${ratingStars} <span>(${p.rating || '—'}/5)</span></div>
          <p class="product-desc">${p.description || ''}</p>
          ${p.applyTip ? `<div class="product-apply-tip"><span class="apply-tip-label">💡 Comment l'appliquer</span><p>${p.applyTip}</p></div>` : ''}
          <div class="product-price-lg">${p.price ? p.price.toFixed(2) + ' €' : '—'}</div>
          ${previews}
          ${pairedHtml}
          <div class="modal-actions">
            ${renderBuyButton(p)}
            <button class="btn btn-outline" onclick="TryOn.addProduct('${p.id}'); closeModal();">
              ✦ Essayer virtuellement
            </button>
          </div>
        </div>
      </div>`;

    openModal(html);
  }

  // ─── Bouton Amazon ─────────────────────────────────────────────
  function renderBuyButton(product) {
    return `
      <a class="btn btn-amazon btn-amazon-prominent"
         href="${product.amazonUrl}"
         target="_blank"
         rel="noopener nofollow sponsored"
         onclick="trackAmazonClick('${product.id}')">
        🛒 Acheter sur Amazon →
      </a>`;
  }

  // ─── Prévisualisations carnation ──────────────────────────────
  function renderSkinTonePreviews(product) {
    const sp = product.skinTonePreview;
    if (!sp || sp.mode !== 'images') return '';

    const labels = { light: 'Claire', medium: 'Medium', dark: 'Foncée' };
    const items = ['light', 'medium', 'dark'].map(tone => `
      <div class="preview-item">
        <img src="${sp[tone]}"
             alt="Rendu carnation ${labels[tone]}"
             onerror="this.parentElement.style.display='none'">
        <span>${labels[tone]}</span>
      </div>`).join('');

    return `<div class="skin-tone-previews"><h4>Rendu selon ta carnation</h4><div class="preview-row">${items}</div></div>`;
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function renderStars(rating) {
    if (!rating) return '';
    const full  = Math.floor(rating);
    const half  = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function getCategoryLabel(cat) {
    const map = {
      // Skincare
      cleanser:   'Démaquillant',
      serum:      'Sérum',
      eye:        'Contour yeux',
      cream:      'Crème hydratante',
      spf:        'Protection solaire',
      nightmask:  'Masque de nuit',
      // Maquillage
      lipstick:    'Rouge à lèvres',
      lipgloss:    'Gloss',
      lipliner:    'Crayon à lèvres',
      lipprimer:   'Base lèvres',
      lipplumper:  'Repulpeur lèvres',
      blush:       'Blush',
      foundation:  'Fond de teint',
      mascara:     'Mascara',
      eyebrow:     'Sourcils',
      // Lèvres / Soin
      lipbalm:     'Baume à lèvres',
      demaquillant:'Démaquillant'
    };
    return map[cat] || cat;
  }

  // ─── Tracking click Amazon ────────────────────────────────────
  window.trackAmazonClick = function(productId) {
    if (typeof Tracker !== 'undefined') Tracker.trackBuyClick(productId);
  };

  return { load, getRecommended, getMaturityPreference, getByCategory, renderCard, openProductModal, ensureTag, mergeProducts };

})();
