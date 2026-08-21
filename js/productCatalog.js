/* ============================================================
   productCatalog.js — Chargement, fusion et affichage catalogue
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const ProductCatalog = (() => {

  const TAG = 'kan10ar-21';

  // ─── Dupes curés (dupeId → { hero, savings, ... }) ────────────
  let _dupeMap = {};
  async function _loadDupes() {
    try {
      const r = await fetch('data/dupes.json?v=2');
      if (!r.ok) return;
      const d = await r.json();
      (d.dupes || []).forEach(x => { _dupeMap[x.dupeId] = x; });
      console.log('[Dupes] Curés chargés:', Object.keys(_dupeMap).length);
    } catch (e) { /* ignore */ }
  }

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

      // 2. Charger Firestore + JSON en parallèle (JSON toujours chargé)
      try {
        // 2a. JSON statique — toujours chargé (source de vérité pour les nouveaux produits)
        let jsonProducts = [];
        try {
          const res = await fetch('data/products-manual.json?v=97');
          if (res.ok) {
            const data = await res.json();
            jsonProducts = Array.isArray(data) ? data : (data.products || []);
          }
        } catch (e) { /* ignore */ }

        // 2b. Firestore — chargé en supplément si disponible
        let firestoreProducts = [];
        if (typeof FirestoreProducts !== 'undefined') {
          try {
            firestoreProducts = await FirestoreProducts.loadAll() || [];
          } catch (e) { /* ignore */ }
        }

        // 2c. Fusion : JSON prioritaire > Firestore > CATALOGUE statique
        // JSON d'abord (nouveaux produits toujours présents)
        const map = new Map();
        jsonProducts.forEach(p => { const k = p.asin || p.id; if (k) map.set(k, p); });
        // Firestore complète ce qui manque dans le JSON
        firestoreProducts.forEach(p => { const k = p.asin || p.id; if (k && !map.has(k)) map.set(k, p); });
        // CATALOGUE statique en dernier recours
        products.forEach(p => { const k = p.asin || p.id; if (k && !map.has(k)) map.set(k, p); });

        // Dédupliquer par id
        const idSeen = new Set();
        products = Array.from(map.values()).filter(p => {
          if (!p.id || idSeen.has(p.id)) return false;
          idSeen.add(p.id);
          return true;
        });

        console.log(`[Catalog] JSON: ${jsonProducts.length} · Firestore: ${firestoreProducts.length} · Total fusionné: ${products.length}`);
      } catch (err) {
        console.log('[Catalog] Erreur chargement produits:', err.message);
      }

      // 3. Filtrer les actifs, tag affilié, et tag isKorean automatique
      const KOREAN_BRANDS = new Set([
        'anua','beauty of joseon','medicube','cosrx','innisfree','some by mi',
        'skin1004','axis-y','purito','klairs','isntree','torriden','round lab',
        'laneige','etude','missha','dr.jart+','the ordinary korea','neogen',
        'dear klairs','numbuzin','abib','ma:nyo','benton','rovectin'
      ]);
      products = products
        .filter(p => p.active !== false)
        .map(p => ({
          ...p,
          amazonUrl: ensureTag(p.amazonUrl),
          isKorean:  p.isKorean === true || KOREAN_BRANDS.has((p.brand || '').toLowerCase())
        }));

      AppState.products.catalog = products;
      await _loadDupes();
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
    if (ageGroup === 'moins-15' || ageGroup === 'moins-20') return 'teen';
    if (ageGroup === '40+' || skinMaturity === 'ridules') return 'mature';
    if (ageGroup === '20-25' && skinMaturity === 'lisse') return 'jeune';
    return 'all';
  }

  function getRecommended(answers, skincareOnly = true) {
    const { skinType, makeupUsed = [], makeupFrequency, budget, skincareStyle } = answers;
    const preferKorean = skincareStyle === 'korean';

    const skincareCategories = ['cleanser', 'serum', 'moisturizer', 'eye', 'spf', 'lipbalm', 'nightmask'];
    const makeupCategories   = (!skincareOnly && makeupFrequency !== 'jamais') ? (makeupUsed || []) : [];
    const allowed = [...skincareCategories, ...makeupCategories];

    let pool = AppState.products.catalog.filter(p => allowed.includes(p.category));

    // Filtrer par budget (support des deux formats : questionnaire (low/medium/high) et ancien (petits-prix/bon-rapport/premium))
    const BUDGET_MAX = { 'petits-prix': 20, 'low': 20, 'bon-rapport': 50, 'medium': 50, 'premium': Infinity, 'high': Infinity };
    const maxPrice = BUDGET_MAX[budget] ?? Infinity;
    if (maxPrice !== Infinity) {
      const budgetFiltered = pool.filter(p => !p.price || p.price <= maxPrice);
      if (budgetFiltered.length >= 4) pool = budgetFiltered;
    }

    // Filtrer par type de peau
    if (skinType) {
      const filtered = pool.filter(p =>
        !p.skinTypeTags || p.skinTypeTags.length === 0 ||
        p.skinTypeTags.includes(skinType)
      );
      if (filtered.length >= 4) pool = filtered;
    }

    // Adéquation à l'âge — règle CENTRALE (AgeGuard). Ne jamais recommander un actif non adapté.
    if (typeof AgeGuard !== 'undefined') {
      pool = AgeGuard.filter(pool, AgeGuard.age(answers));
    }

    // Filtrer par maturité peau (soft preference — ne jamais vider)
    const matPref = getMaturityPreference(answers);
    if (matPref !== 'all') {
      const allowedMat = matPref === 'teen'
        ? (p) => !p.maturity || p.maturity === 'all' || p.maturity === 'jeune' || p.maturity === 'teen'
        : (p) => !p.maturity || p.maturity === 'all' || p.maturity === matPref;

      const matFiltered = pool.filter(allowedMat);
      if (matFiltered.length >= 4) pool = matFiltered;
    }

    // Si style coréen : filtrer en priorité les produits isKorean, avec fallback
    if (preferKorean) {
      const korean = pool.filter(p => p.isKorean === true);
      if (korean.length >= 4) pool = korean;
    }

    // Trier : K-Beauty en tête si préférence coréenne, teen si profil ado, budget, featured, rating
    pool.sort((a, b) => {
      // Boost K-Beauty
      if (preferKorean) {
        const aK = a.isKorean ? 1 : 0;
        const bK = b.isKorean ? 1 : 0;
        if (bK !== aK) return bK - aK;
      }
      const matPref = getMaturityPreference(answers);
      if (matPref === 'teen') {
        const aT = a.maturity === 'teen' ? 1 : 0;
        const bT = b.maturity === 'teen' ? 1 : 0;
        if (bT !== aT) return bT - aT;
      }
      if (budget === 'premium')     return (b.price || 0) - (a.price || 0);
      if (budget === 'petits-prix') return (a.price || 0) - (b.price || 0);
      if (b.isFeatured !== a.isFeatured) return b.isFeatured ? 1 : -1;
      return (b.rating || 0) - (a.rating || 0);
    });

    // Sélection aléatoire parmi les top-20 pour varier les recommandations
    const TOP_N   = Math.min(20, pool.length);
    const topPool = pool.slice(0, TOP_N);
    // Fisher-Yates shuffle sur le top pool, garder les 8 premiers
    for (let i = topPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [topPool[i], topPool[j]] = [topPool[j], topPool[i]];
    }
    // Re-trier légèrement pour ne pas être 100% aléatoire (garder la pertinence)
    const finalPool = topPool.slice(0, 8).sort((a, b) => (b.rating || 0) - (a.rating || 0));

    AppState.products.recommended = finalPool;
    return finalPool;
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
    if (product.multiUsage)           badgeParts.push(`<span class="badge badge-multiusage">🔄 ${product.multiUsageLabel || 'Multi-usage'}</span>`);
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
          <a class="btn btn-amazon btn-amazon-sm" href="${paired.amazonUrl || paired.shopUrl || '#'}" target="_blank" rel="noopener">Acheter</a>
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

  // ─── Comparaison de prix pertinente ? ─────────────────────────
  // Non si : flag noCompare (exclusif Amazon), ou vendu uniquement sur
  // un site de marque (shopUrl sans amazonUrl) → rien à comparer.
  function isComparable(p) {
    if (!p) return false;
    if (p.noCompare === true || p.singleSeller === true) return false;
    if (p.shopUrl && !p.amazonUrl) return false;
    return true;
  }

  // ─── 💸 DUPE — équivalent moins cher (100% catalogue) ────────
  // status: 'found' (dupe moins cher) · 'cheapest' (déjà le meilleur prix) · 'none'
  function findDupe(product) {
    if (!product) return { status: 'none' };
    // 0) Ce produit EST un dupe culte curé → on le valorise (non gated)
    const cur = _dupeMap[product.id];
    if (cur) return { status: 'isDupe', hero: cur.hero, savings: cur.savings, pct: cur.savingsPct, reason: cur.reason };
    if (product.price == null) return { status: 'none' };
    // Override curé prioritaire (Lot Dupe 2)
    if (product.dupeId) {
      const d = (AppState.products.catalog || []).find(p => p.id === product.dupeId);
      if (d && d.price != null && d.price < product.price) {
        const savings = +(product.price - d.price).toFixed(2);
        return { status: 'found', dupe: d, savings, pct: Math.round(savings / product.price * 100), shared: [], curated: true };
      }
    }
    const catalog  = AppState.products.catalog || [];
    const myActives = new Set((product.ingredientTags || []).map(t => String(t).toLowerCase()));
    const mySkin    = new Set(product.skinTypeTags || []);
    const MIN_SAVE  = Math.max(3, product.price * 0.2);
    let best = null, bestScore = -1;
    for (const p of catalog) {
      if (p.id === product.id || p.category !== product.category || p.price == null) continue;
      if ((product.price - p.price) < MIN_SAVE) continue;
      const shared    = (p.ingredientTags || []).map(t => String(t).toLowerCase()).filter(t => myActives.has(t));
      const sharedSkin = (p.skinTypeTags || []).filter(t => mySkin.has(t)).length;
      const score = shared.length * 12 + sharedSkin * 3 + (p.rating || 0) + (product.price - p.price) / product.price * 6;
      if (score > bestScore) { bestScore = score; best = { p, shared }; }
    }
    if (!best) return { status: 'cheapest' };
    const savings = +(product.price - best.p.price).toFixed(2);
    return { status: 'found', dupe: best.p, savings, pct: Math.round(savings / product.price * 100), shared: best.shared };
  }

  function renderDupe(product) {
    const r = findDupe(product);
    if (r.status === 'none') return '';
    // Ce produit EST le dupe d'un produit culte → mise en valeur (non gated)
    if (r.status === 'isDupe') {
      return `<div class="dupe-block dupe-block--is">
        <div class="dupe-head"><span class="dupe-badge">💸 C'est un dupe culte</span><span class="dupe-save">−${r.pct}% vs ${r.hero.brand}</span></div>
        <p class="dupe-is-text">Tu paies <strong>${product.price != null ? product.price.toFixed(2) + ' €' : '—'}</strong> au lieu de <s>${Number(r.hero.price).toFixed(2)} €</s> — c'est le dupe de <strong>${r.hero.brand} ${r.hero.name}</strong>. ${r.reason}.</p>
      </div>`;
    }
    if (r.status === 'cheapest') {
      return `<div class="dupe-block dupe-block--best"><span class="dupe-badge">💸 Dupe</span><span class="dupe-best-text">Déjà un excellent rapport qualité-prix — difficile de trouver moins cher pour un résultat équivalent.</span></div>`;
    }
    const d = r.dupe;
    const url = d.amazonUrl || d.shopUrl || '#';
    const reason = r.curated ? 'Le dupe culte : même résultat, une fraction du prix.'
      : (r.shared.length ? `Mêmes actifs clés (${r.shared.slice(0, 2).join(', ')}) — bien moins cher.`
                         : 'Même type de produit, résultat similaire — bien moins cher.');
    const plan  = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
    const isSub = plan === 'glow' || plan === 'glowplus';
    const cardInner = `
      ${d.imageUrl ? `<img class="dupe-img" src="${d.imageUrl}" alt="${d.name}" onerror="this.style.display='none'">` : ''}
      <div class="dupe-info">
        <span class="dupe-brand">${d.brand || ''}</span>
        <span class="dupe-name">${d.name || ''}</span>
        <span class="dupe-reason">${reason}</span>
      </div>
      <div class="dupe-price"><s>${product.price.toFixed(2)} €</s><strong>${d.price.toFixed(2)} €</strong></div>`;
    if (isSub) {
      return `<div class="dupe-block">
        <div class="dupe-head"><span class="dupe-badge">💸 Le dupe de ce produit</span><span class="dupe-save">−${r.pct}% · économise ${r.savings} €</span></div>
        <div class="dupe-card">${cardInner}</div>
        <a class="dupe-buy" href="${url}" target="_blank" rel="noopener nofollow" onclick="event.stopPropagation()">Voir le dupe →</a>
      </div>`;
    }
    return `<div class="dupe-block dupe-block--locked" onclick="Subscription.openLock('dupe')" role="button" tabindex="0">
      <div class="dupe-head"><span class="dupe-badge">💸 Le dupe de ce produit</span><span class="dupe-save">économise ${r.savings} €</span></div>
      <div class="dupe-card dupe-card--blur" aria-hidden="true">${cardInner}</div>
      <div class="dupe-lock-cta">Débloque le dupe à ${d.price.toFixed(2)} € · Premium →</div>
    </div>`;
  }

  // ─── Bouton achat (Amazon ou boutique directe) ───────────────
  function renderBuyButton(product) {
    const url = product.amazonUrl || product.shopUrl;
    if (!url) return '';
    const isAmazon = !!product.amazonUrl;
    const canCompare = isComparable(product);
    const compareUrl = `https://www.google.com/search?q=${encodeURIComponent((product.brand || '') + ' ' + (product.name || ''))}&tbm=shop`;
    return `
      ${canCompare ? '<p class="pc-value">✨ Compare les prix du marché en 1 clic</p>' : ''}
      <div class="premium-card-ctas">
        ${canCompare ? `<a class="pc-cta pc-cta--compare"
           href="${compareUrl}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()">
          🔍 Comparer les prix sur tout le marché
        </a>` : ''}
        <a class="pc-cta pc-cta--buy"
           href="${url}" target="_blank"
           rel="noopener nofollow${isAmazon ? ' sponsored' : ''}"
           onclick="event.stopPropagation();${isAmazon ? ` trackAmazonClick('${product.id}')` : ''}">
          ${isAmazon ? 'Acheter maintenant →' : 'Voir le produit →'}
        </a>
      </div>`;
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
      cleanser:    'Nettoyant',
      serum:       'Sérum',
      moisturizer: 'Crème hydratante',
      cream:       'Crème hydratante',
      eye:         'Contour yeux',
      eyepatch:    'Patchs yeux',
      spf:         'Protection solaire',
      nightmask:   'Masque de nuit',
      // Maquillage visage
      foundation:  'Fond de teint',
      concealer:   'Correcteur',
      primer:      'Primer',
      powder:      'Poudre',
      bronzer:     'Bronzer',
      highlighter: 'Highlighter',
      blush:       'Blush',
      // Yeux
      mascara:     'Mascara',
      eyeliner:    'Eyeliner',
      eyeshadow:   'Fards à paupières',
      eyebrow:     'Sourcils',
      // Lèvres
      lipstick:    'Rouge à lèvres',
      lipgloss:    'Gloss',
      lipbalm:     'Baume à lèvres',
      lipliner:    'Crayon à lèvres',
      lipprimer:   'Base lèvres',
      lipplumper:  'Repulpeur lèvres',
      // Autres
      tools:       'Accessoires',
      set:         'Coffret',
      demaquillant:'Démaquillant',
      multi_usage: 'Multi-usage'
    };
    return map[cat] || cat;
  }

  // ─── Tracking click Amazon ────────────────────────────────────
  window.trackAmazonClick = function(productId) {
    if (typeof Tracker !== 'undefined') Tracker.trackBuyClick(productId);
  };

  return { load, getRecommended, getMaturityPreference, getByCategory, renderCard, openProductModal, ensureTag, mergeProducts, isComparable, findDupe, renderDupe };

})();
