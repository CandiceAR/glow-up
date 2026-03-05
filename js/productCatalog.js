/* ============================================================
   productCatalog.js — Chargement, fusion et affichage catalogue
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const ProductCatalog = (() => {

  const TAG = 'kand10ar-21';

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
      const [manualRes, autoRes] = await Promise.all([
        fetch('data/products-manual.json'),
        fetch('data/products-auto.json').catch(() => null)
      ]);

      const manualData = await manualRes.json();
      const manual = (manualData.products || []).map(p => ({
        ...p,
        _source: 'manual',
        amazonUrl: ensureTag(p.amazonUrl)
      }));

      let auto = [];
      if (autoRes && autoRes.ok) {
        const autoData = await autoRes.json();
        auto = (autoData.products || []).map(p => ({
          ...p,
          _source: 'auto',
          amazonUrl: ensureTag(p.amazonUrl)
        }));
      }

      // Fusion : manual prioritaire, dédup par ASIN
      const merged = mergeProducts(manual, auto);

      // Filtrer inactifs
      AppState.products.catalog = merged.filter(p => p.active !== false);

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
  function getRecommended(answers) {
    const { skinType, makeupUsed } = answers;
    const usedCategories = makeupUsed || [];

    let pool = AppState.products.catalog;

    // Filtrer par catégories maquillage utilisées
    if (usedCategories.length > 0) {
      pool = pool.filter(p => usedCategories.includes(p.category));
    }

    // Trier : featured d'abord, puis par rating
    pool.sort((a, b) => {
      if (b.isFeatured !== a.isFeatured) return b.isFeatured ? 1 : -1;
      return (b.rating || 0) - (a.rating || 0);
    });

    // Filtrer par type de peau si défini
    if (skinType) {
      const withSkinFilter = pool.filter(p =>
        !p.skinTypeTags || p.skinTypeTags.length === 0 ||
        p.skinTypeTags.includes(skinType)
      );
      pool = withSkinFilter.length >= 3 ? withSkinFilter : pool;
    }

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
    const featuredBadge = product.isFeatured
      ? '<span class="badge badge-featured">★ Vedette</span>'
      : '';
    const categoryLabel = getCategoryLabel(product.category);

    return `
      <div class="product-card" data-id="${product.id}" onclick="ProductCatalog.openProductModal('${product.id}')">
        <div class="product-card-img">
          <img src="${product.imageUrl || 'assets/images/placeholder.jpg'}"
               alt="${product.name}"
               onerror="this.src='assets/images/placeholder.jpg'">
          ${featuredBadge}
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

    // On est AVANT le try-on ? → pas de bouton Amazon
    const postTryOn = ['final'].includes(AppState.screen);

    const previews = renderSkinTonePreviews(p);
    const ratingStars = renderStars(p.rating);
    const colorInfo = p.colorHex
      ? `<div class="modal-color"><span class="color-swatch" style="background:${p.colorHex}"></span>${p.shadeName || ''}</div>`
      : '';

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="modal-product">
        <div class="modal-product-img">
          <img src="${p.imageUrl || 'assets/images/placeholder.jpg'}"
               alt="${p.name}"
               onerror="this.src='assets/images/placeholder.jpg'">
        </div>
        <div class="modal-product-info">
          <span class="product-brand">${p.brand}</span>
          <h2>${p.name}</h2>
          ${colorInfo}
          <div class="product-rating">${ratingStars} <span>(${p.rating || '—'}/5)</span></div>
          <p class="product-desc">${p.description || ''}</p>
          <div class="product-price-lg">${p.price ? p.price.toFixed(2) + ' €' : '—'}</div>
          ${previews}
          <div class="modal-actions">
            ${postTryOn ? renderBuyButton(p) : ''}
            <button class="btn btn-outline" onclick="TryOn.addProduct('${p.id}'); closeModal();">
              ✦ Essayer virtuellement
            </button>
          </div>
        </div>
      </div>`;

    openModal(html);
  }

  // ─── Bouton Amazon (affiché SEULEMENT après try-on) ──────────
  function renderBuyButton(product) {
    return `
      <a class="btn btn-amazon"
         href="${product.amazonUrl}"
         target="_blank"
         rel="noopener nofollow sponsored"
         onclick="trackAmazonClick('${product.id}')">
        Acheter sur Amazon →
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
      lipstick: 'Rouge à lèvres',
      blush: 'Blush',
      foundation: 'Fond de teint',
      mascara: 'Mascara'
    };
    return map[cat] || cat;
  }

  // ─── Tracking click Amazon (Phase 0 : simple log) ─────────────
  window.trackAmazonClick = function(productId) {
    console.log('[Tracking] Clic Amazon →', productId);
    // Phase 1 : envoyer à Firebase Analytics
  };

  return { load, getRecommended, getByCategory, renderCard, openProductModal, ensureTag, mergeProducts };

})();
