/* ============================================================
   adminPanel.js — Interface admin GLOW UP
   ============================================================ */

'use strict';

const ADMIN_PASSWORD = 'glowup2026';
const TAG            = 'kand10ar-21';

const Admin = (() => {

  let products         = [];
  let editingId        = null;
  let searchQuery      = '';
  let catFilter        = 'all';
  let ingredientFilter = 'all';

  // ─── Toast notifications ──────────────────────────────────────
  function toast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.classList.add('toast-hide'), 3000);
    setTimeout(() => el.remove(), 3500);
  }

  // ─── Auth ─────────────────────────────────────────────────────
  function login() {
    const pw = document.getElementById('adminPassword').value;
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem('glow_admin', '1');
      document.getElementById('loginPanel').style.display  = 'none';
      document.getElementById('adminPanel').style.display  = 'block';
      initAdmin();
    } else {
      const err = document.getElementById('loginError');
      err.textContent = 'Mot de passe incorrect';
      err.style.display = 'block';
    }
  }

  function logout() {
    sessionStorage.removeItem('glow_admin');
    location.reload();
  }

  function checkAuth() {
    if (sessionStorage.getItem('glow_admin') === '1') {
      document.getElementById('loginPanel').style.display  = 'none';
      document.getElementById('adminPanel').style.display  = 'block';
      initAdmin();
    }
  }

  // ─── Extraire ASIN ────────────────────────────────────────────
  // BUG FIX: flag /i ajouté + exposée dans le return
  function extractASINFromUrl() {
    const url = document.getElementById('fAmazonUrl').value;
    if (!url) return;
    const m = url.match(/\/dp\/([A-Z0-9]{10})/i)
           || url.match(/\/gp\/product\/([A-Z0-9]{10})/i)
           || url.match(/[?&](?:dp|ASIN)=([A-Z0-9]{10})/i);
    if (m) document.getElementById('fAsin').value = m[1].toUpperCase();
  }

  // ─── Générer ID ───────────────────────────────────────────────
  function generateProductId() {
    const name  = document.getElementById('fName').value.trim();
    const brand = document.getElementById('fBrand').value.trim();
    const asin  = document.getElementById('fAsin').value.trim();
    if (!name || !brand || !asin) return null;
    const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 8);
    const nameSlug  = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 12);
    return `${brandSlug}-${nameSlug}-${asin.slice(-4)}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  async function initAdmin() {
    await loadProducts();
    renderStats();
    renderTable();
  }

  // ─── Chargement produits ──────────────────────────────────────
  async function loadProducts() {
    // 1. Essayer Firestore (source de vérité)
    if (typeof FirestoreProducts !== 'undefined') {
      const fp = await FirestoreProducts.loadAll();
      if (fp?.length) {
        products = fp;
        saveToStorage();
        return;
      }
      // Firestore vide → migration one-time depuis localStorage ou JSON
      const stored = localStorage.getItem('glow_products_manual');
      if (stored) {
        try {
          products = JSON.parse(stored);
          await FirestoreProducts.migrateFromJSON(products);
          return;
        } catch {}
      }
      try {
        const res  = await fetch('data/products-manual.json');
        const data = await res.json();
        products = data.products || [];
        if (products.length) await FirestoreProducts.migrateFromJSON(products);
        return;
      } catch {}
    }
    // 2. Fallback localStorage
    const stored = localStorage.getItem('glow_products_manual');
    if (stored) {
      try { products = JSON.parse(stored); return; } catch {}
    }
    // 3. Fallback JSON statique
    try {
      const res  = await fetch('data/products-manual.json');
      const data = await res.json();
      products = data.products || [];
    } catch { products = []; }
  }

  function saveToStorage() {
    localStorage.setItem('glow_products_manual', JSON.stringify(products));
  }

  async function persistProduct(product) {
    if (typeof FirestoreProducts !== 'undefined') {
      await FirestoreProducts.save(product);
      toast('Sauvegardé ✓');
    }
  }

  async function removeProduct(id) {
    if (typeof FirestoreProducts !== 'undefined') {
      await FirestoreProducts.remove(id);
    }
  }

  // ─── Stats ────────────────────────────────────────────────────
  function renderStats() {
    const total    = products.length;
    const active   = products.filter(p => p.active !== false).length;
    const featured = products.filter(p => p.isFeatured).length;
    const cats     = [...new Set(products.map(p => p.category))].length;
    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Produits total</div></div>
      <div class="stat-card"><div class="stat-number">${active}</div><div class="stat-label">Actifs</div></div>
      <div class="stat-card"><div class="stat-number">${featured}</div><div class="stat-label">Produits vedettes</div></div>
      <div class="stat-card"><div class="stat-number">${cats}</div><div class="stat-label">Catégories</div></div>`;
  }

  // ─── Table produits ───────────────────────────────────────────
  function renderTable() {
    let list = [...products];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.asin?.toLowerCase().includes(q) ||
        p.id?.toLowerCase().includes(q)
      );
    }
    if (catFilter !== 'all') list = list.filter(p => p.category === catFilter);
    if (ingredientFilter !== 'all') list = list.filter(p => Array.isArray(p.ingredientTags) && p.ingredientTags.includes(ingredientFilter));

    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:32px; color:var(--muted);">Aucun produit trouvé</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => {
      const colorCell = (p.colorHex && p.colorHex !== '#ffffff') || p.shadeName
        ? `<div class="color-pill"><span class="color-pill-dot" style="background:${p.colorHex || '#fff'}"></span>${p.shadeName || p.colorHex}</div>`
        : '—';
      const UT_LABELS = { warm: '🌡 Chaud', cool: '❄ Froid', neutral: '⚖ Neutre' };
      const carnStr   = Array.isArray(p.carnation) && p.carnation.length && p.carnation.length < 3
        ? p.carnation.map(c => c === 'clair' ? 'Claire' : c === 'medium' ? 'Medium' : 'Foncée').join(', ')
        : null;
      const MAT_LABELS = { teen: '🧒 Ado -16', jeune: '🌱 Jeune', mature: '🌸 Mature', all: '' };
      const matStr     = p.maturity && p.maturity !== 'all' ? MAT_LABELS[p.maturity] || '' : '';
      const ST_ICONS   = { normale: '🌿', grasse: '💦', seche: '🌵', mixte: '☯', sensible: '🌸' };
      const stTags     = Array.isArray(p.skinTypeTags) && p.skinTypeTags.length > 0 && p.skinTypeTags.length < 5
        ? p.skinTypeTags.map(s => `${ST_ICONS[s] || ''}${s}`).join(' ')
        : null;
      const profilCell = (p.undertone || carnStr || matStr || stTags)
        ? `<div style="font-size:0.72rem;line-height:1.8">
             ${p.undertone ? `<span style="color:var(--nude);font-weight:500">${UT_LABELS[p.undertone] || p.undertone}</span>` : ''}
             ${carnStr ? `<br><span style="color:var(--muted)">${carnStr}</span>` : ''}
             ${matStr  ? `<br><span style="color:var(--muted)">${matStr}</span>`  : ''}
             ${stTags  ? `<br><span style="color:#5a7a5a;font-weight:500">${stTags}</span>` : ''}
           </div>`
        : '<span style="color:var(--muted);font-size:0.72rem">—</span>';
      const statusBadge = (p.active !== false)
        ? '<span class="badge-active">Actif</span>'
        : '<span class="badge-inactive">Inactif</span>';
      const featuredBadge = p.isFeatured ? ' <span class="badge-featured">★ Vedette</span>' : '';
      return `
        <tr>
          <td style="font-family:monospace; font-size:0.75rem; color:var(--muted);">${p.id}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              ${p.imageUrl ? `<img src="${p.imageUrl}" alt="" style="width:36px; height:36px; object-fit:cover; border-radius:6px; border:1px solid var(--sand);" onerror="this.style.display='none'">` : ''}
              <div>
                <div style="font-weight:500; font-size:0.82rem;">${p.name}</div>
                <div style="color:var(--muted); font-size:0.72rem;">${p.brand}</div>
              </div>
            </div>
          </td>
          <td style="font-family:monospace; font-size:0.75rem;">${p.asin || '—'}</td>
          <td>${getCatLabel(p.category)}</td>
          <td>${colorCell}</td>
          <td>${profilCell}</td>
          <td>${p.price != null ? Number(p.price).toFixed(2) + ' €' : '—'}</td>
          <td>${p.rating || '—'}</td>
          <td>${statusBadge}${featuredBadge}</td>
          <td>
            <div class="btn-actions">
              <button class="btn-sm btn-edit"      onclick="Admin.editProduct('${p.id}')">Modifier</button>
              <button class="btn-sm btn-duplicate" onclick="Admin.duplicateProduct('${p.id}')" title="Dupliquer">⧉</button>
              <button class="btn-sm btn-toggle"    onclick="Admin.toggleFeatured('${p.id}')" title="Produit vedette">★</button>
              <button class="btn-sm btn-toggle"    onclick="Admin.toggleActive('${p.id}')">${p.active !== false ? 'Désact.' : 'Activ.'}</button>
              <button class="btn-sm btn-delete"    onclick="Admin.deleteProduct('${p.id}')">Suppr.</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ─── Formulaire ───────────────────────────────────────────────
  function showAddForm() {
    editingId = null;
    document.getElementById('formTitle').textContent = 'Ajouter un produit';
    clearForm();
    // BUG FIX: Math.max sécurisé si products est vide
    const ids = products.map(p => parseInt(p.id?.replace(/\D/g, '') || '0')).filter(n => !isNaN(n) && n > 0);
    const nextNum = ids.length > 0 ? Math.max(...ids) + 1 : 51;
    document.getElementById('fId').value = 'm' + String(nextNum).padStart(3, '0');
    document.getElementById('productFormWrap').style.display = 'block';
    document.getElementById('productFormWrap').scrollIntoView({ behavior: 'smooth' });
  }

  function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    document.getElementById('formTitle').textContent = 'Modifier le produit';
    document.getElementById('fId').value        = p.id || '';
    document.getElementById('fAsin').value      = p.asin || '';
    document.getElementById('fName').value      = p.name || '';
    document.getElementById('fBrand').value     = p.brand || '';
    document.getElementById('fCategory').value  = p.category || 'serum';
    document.getElementById('fAmazonUrl').value = p.amazonUrl || '';
    document.getElementById('fImageUrl').value  = p.imageUrl || '';
    // BUG FIX: fActive et fFeatured sont maintenant de vrais checkboxes
    document.getElementById('fPrice').value       = p.price != null ? p.price : '';
    document.getElementById('fRating').value      = p.rating != null ? p.rating : '';
    document.getElementById('fReviews').value     = p.reviews != null ? p.reviews : '';
    document.getElementById('fActive').checked    = p.active !== false;
    document.getElementById('fFeatured').checked  = p.isFeatured === true;
    document.getElementById('fColorHex').value     = p.colorHex || '#ffffff';
    document.getElementById('fColorHexText').value = p.colorHex || '';
    document.getElementById('fShadeName').value    = p.shadeName || '';
    document.getElementById('fUndertone').value    = p.undertone || '';
    document.getElementById('fCarnClair').checked  = Array.isArray(p.carnation) ? p.carnation.includes('clair')  : true;
    document.getElementById('fCarnMedium').checked = Array.isArray(p.carnation) ? p.carnation.includes('medium') : true;
    document.getElementById('fCarnFonce').checked  = Array.isArray(p.carnation) ? p.carnation.includes('fonce')  : true;
    document.getElementById('fFinish').value       = p.finish || 'naturel';
    document.getElementById('fMaturity').value     = p.maturity || 'all';
    document.getElementById('fFormat').value        = p.format || '';
    document.getElementById('fFormatGroup').style.display = p.category === 'eyeshadow' ? 'flex' : 'none';
    // Type de peau — si skinTypeTags vide ou tous = tout coché
    const st = Array.isArray(p.skinTypeTags) && p.skinTypeTags.length > 0 ? p.skinTypeTags : [];
    document.getElementById('fSkinNormale').checked  = st.length === 0 || st.includes('normale');
    document.getElementById('fSkinGrasse').checked   = st.length === 0 || st.includes('grasse');
    document.getElementById('fSkinSeche').checked    = st.length === 0 || st.includes('seche');
    document.getElementById('fSkinMixte').checked    = st.length === 0 || st.includes('mixte');
    document.getElementById('fSkinSensible').checked = st.length === 0 || st.includes('sensible');
    // Besoins traités
    const ct = Array.isArray(p.concernTags) ? p.concernTags : [];
    ['rougeurs','cernes','pores','hydratation','matifiant','imperfections','ridules','eclat','couvrance','uniformite'].forEach(v => {
      const el = document.getElementById('fNeed' + v.charAt(0).toUpperCase() + v.slice(1));
      if (el) el.checked = ct.includes(v);
    });
    // Ingrédients actifs
    const it = Array.isArray(p.ingredientTags) ? p.ingredientTags : [];
    Array.from(document.getElementById('fIngredients').options).forEach(o => {
      o.selected = it.includes(o.value);
    });
    previewImage(p.imageUrl || '');
    document.getElementById('productFormWrap').style.display = 'block';
    document.getElementById('productFormWrap').scrollIntoView({ behavior: 'smooth' });
  }

  function cancelForm() {
    document.getElementById('productFormWrap').style.display = 'none';
    clearForm();
    editingId = null;
  }

  function clearForm() {
    ['fId', 'fAsin', 'fName', 'fBrand', 'fAmazonUrl', 'fImageUrl', 'fPrice', 'fRating', 'fReviews', 'fColorHexText', 'fShadeName'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('fCategory').value   = 'serum';
    document.getElementById('fColorHex').value   = '#ffffff';
    document.getElementById('fActive').checked   = true;
    document.getElementById('fFeatured').checked = false;
    document.getElementById('fUndertone').value    = '';
    document.getElementById('fCarnClair').checked  = true;
    document.getElementById('fCarnMedium').checked = true;
    document.getElementById('fCarnFonce').checked  = true;
    document.getElementById('fFinish').value       = 'naturel';
    document.getElementById('fMaturity').value     = 'all';
    document.getElementById('fFormat').value        = '';
    document.getElementById('fFormatGroup').style.display = 'none';
    ['fSkinNormale','fSkinGrasse','fSkinSeche','fSkinMixte','fSkinSensible'].forEach(id => {
      document.getElementById(id).checked = false;
    });
    ['rougeurs','cernes','pores','hydratation','matifiant','imperfections','ridules','eclat','couvrance','uniformite'].forEach(v => {
      const el = document.getElementById('fNeed' + v.charAt(0).toUpperCase() + v.slice(1));
      if (el) el.checked = false;
    });
    Array.from(document.getElementById('fIngredients').options).forEach(o => { o.selected = false; });
    previewImage('');
    const prog = document.getElementById('imageUploadProgress');
    if (prog) prog.textContent = '';
  }

  async function saveProduct() {
    const amazonUrl  = document.getElementById('fAmazonUrl').value.trim();
    const name       = document.getElementById('fName').value.trim();
    const brand      = document.getElementById('fBrand').value.trim();
    const imageUrl   = document.getElementById('fImageUrl').value.trim();
    const category   = document.getElementById('fCategory').value;
    // BUG FIX: lire les vrais checkboxes
    const priceRaw   = document.getElementById('fPrice').value.trim();
    const ratingRaw  = document.getElementById('fRating').value.trim();
    const reviewsRaw = document.getElementById('fReviews').value.trim();
    const price      = priceRaw   ? parseFloat(priceRaw)   : null;
    const rating     = ratingRaw  ? parseFloat(ratingRaw)  : null;
    const reviews    = reviewsRaw ? parseInt(reviewsRaw, 10) : null;
    const isActive   = document.getElementById('fActive').checked;
    const isFeatured = document.getElementById('fFeatured').checked;
    const colorHexText = document.getElementById('fColorHexText').value.trim();
    const colorHex   = colorHexText || document.getElementById('fColorHex').value;
    const shadeName  = document.getElementById('fShadeName').value.trim();
    const undertone  = document.getElementById('fUndertone').value || null;
    const carnation  = ['clair','medium','fonce'].filter(v => document.getElementById('fCarn' + v.charAt(0).toUpperCase() + v.slice(1)).checked);
    const finish     = document.getElementById('fFinish').value || 'naturel';
    const maturity   = document.getElementById('fMaturity').value || 'all';
    const skinTypes  = ['normale','grasse','seche','mixte','sensible'].filter(v => {
      const key = 'fSkin' + v.charAt(0).toUpperCase() + v.slice(1);
      return document.getElementById(key)?.checked;
    });
    // Si tous cochés ou aucun coché = null (convient à tous)
    const skinTypeTags = skinTypes.length > 0 && skinTypes.length < 5 ? skinTypes : null;
    const format = category === 'eyeshadow' ? (document.getElementById('fFormat').value || null) : null;
    const NEEDS_LIST = ['rougeurs','cernes','pores','hydratation','matifiant','imperfections','ridules','eclat','couvrance','uniformite'];
    const concernTags = NEEDS_LIST.filter(v => document.getElementById('fNeed' + v.charAt(0).toUpperCase() + v.slice(1))?.checked);
    const ingredientTags = Array.from(document.getElementById('fIngredients').selectedOptions).map(o => o.value);

    if (!amazonUrl || !name || !brand || !imageUrl) {
      toast('Remplis tous les champs obligatoires (lien, nom, marque, image)', 'error');
      return;
    }

    extractASINFromUrl();
    let asin = document.getElementById('fAsin').value.trim();
    if (!asin) {
      const m = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/i);
      if (m) { asin = m[1].toUpperCase(); document.getElementById('fAsin').value = asin; }
      else { toast('Impossible d\'extraire l\'ASIN — vérifie le lien Amazon', 'error'); return; }
    }

    let id = document.getElementById('fId').value.trim();
    if (!editingId && products.some(p => p.id === id)) {
      id = generateProductId() || `${id}-${Date.now().toString().slice(-4)}`;
      document.getElementById('fId').value = id;
    }
    if (!id) { toast('Erreur lors de la génération de l\'ID', 'error'); return; }

    let finalAmazonUrl = amazonUrl;
    if (!amazonUrl.includes('tag=')) {
      finalAmazonUrl = amazonUrl.includes('?') ? `${amazonUrl}&tag=${TAG}` : `${amazonUrl}?tag=${TAG}`;
    }

    let product;
    if (editingId) {
      // BUG FIX CRITIQUE: préserver price, rating, description, reviews, badge, etc.
      // On ne remplace que les champs du formulaire, le reste est conservé.
      const existing = products.find(p => p.id === editingId);
      product = {
        ...existing,
        name,
        brand,
        category,
        imageUrl,
        amazonUrl: finalAmazonUrl,
        asin,
        price,
        rating,
        reviews,
        active: isActive,
        isFeatured,
        colorHex:  colorHex  || null,
        shadeName: shadeName || null,
        undertone: undertone || null,
        carnation: carnation.length === 3 ? null : (carnation.length ? carnation : null),
        finish:      finish || 'naturel',
        maturity:    maturity || 'all',
        skinTypeTags: skinTypeTags,
        format:      format || null,
        concernTags: concernTags,
        ingredientTags: ingredientTags,
        curatedAt:   new Date().toISOString().split('T')[0]
      };
    } else {
      product = {
        id,
        asin,
        name,
        brand,
        category,
        imageUrl,
        amazonUrl: finalAmazonUrl,
        price,
        currency: 'EUR',
        rating,
        reviews,
        colorHex:  colorHex  || null,
        shadeName: shadeName || null,
        undertone: undertone || null,
        carnation: carnation.length === 3 ? null : (carnation.length ? carnation : null),
        finish:      finish || 'naturel',
        maturity:    maturity || 'all',
        skinTypeTags: skinTypeTags,
        format:      format || null,
        concernTags: concernTags,
        isFeatured,
        active: isActive,
        description: '',
        curatedBy: 'admin',
        curatedAt: new Date().toISOString().split('T')[0],
        notes: ''
      };
    }

    if (editingId) {
      const idx = products.findIndex(p => p.id === editingId);
      if (idx !== -1) products[idx] = product;
    } else {
      products.push(product);
    }

    saveToStorage();
    persistProduct(product);
    cancelForm();
    renderStats();
    renderTable();
    toast(`✓ Produit ${editingId ? 'modifié' : 'ajouté'} — ${name}`);
  }

  // ─── Image : aperçu live ──────────────────────────────────────
  function previewImage(path) {
    const preview = document.getElementById('imagePreview');
    if (!preview) return;
    if (!path) { preview.style.display = 'none'; return; }
    preview.src = path;
    preview.style.display = 'block';
    preview.onerror = () => { preview.style.display = 'none'; };
    preview.onload  = () => { preview.style.display = 'block'; };
  }

  function onImageUrlChange() {
    previewImage(document.getElementById('fImageUrl').value.trim());
  }

  // ─── Image : compression canvas avant upload ─────────────────
  function compressImage(file, maxWidth = 900, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // ─── Image : upload fichier → GitHub via Netlify function ─────
  async function uploadImageFile(file) {
    if (!file) return;
    const prog = document.getElementById('imageUploadProgress');
    prog.innerHTML = '<span style="color:var(--muted)">⏳ Compression de l\'image…</span>';

    // Compression côté navigateur (max 900px, JPEG 85%)
    const compressed = await compressImage(file);
    const sizeMB = (compressed.size / 1024 / 1024).toFixed(1);
    prog.innerHTML = `<span style="color:var(--muted)">⏳ Upload (${sizeMB} Mo)…</span>`;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64   = e.target.result.split(',')[1];
      const filename = file.name.replace(/\.[^.]+$/, '.jpg').replace(/\s+/g, '-');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await fetch('/api/uploadImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, contentBase64: base64 }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          document.getElementById('fImageUrl').value = data.path;
          previewImage(data.path);
          prog.innerHTML = '<span style="color:var(--success)">✅ Image uploadée !</span>';
        } else {
          const err = await res.json().catch(() => ({}));
          prog.innerHTML = `<span style="color:var(--error)">❌ ${err.error || 'Erreur upload'}</span>`;
        }
      } catch (ex) {
        clearTimeout(timeout);
        const msg = ex.name === 'AbortError'
          ? 'Délai dépassé — réessaie avec une image plus légère'
          : ex.message;
        prog.innerHTML = `<span style="color:var(--error)">❌ ${msg}</span>`;
      }
    };
    reader.readAsDataURL(compressed);
  }

  // ─── Image : picker (images déjà dans le catalogue) ──────────
  function openImagePicker() {
    const s = document.getElementById('imagePickerSearch');
    if (s) s.value = '';
    renderImagePicker('');
    document.getElementById('imagePickerModal').style.display = 'flex';
  }

  function closeImagePicker() {
    document.getElementById('imagePickerModal').style.display = 'none';
  }

  function renderImagePicker(query) {
    const q = (query || '').toLowerCase();
    const imageMap = {};
    products.forEach(p => {
      if (!p.imageUrl) return;
      const match = !q ||
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.imageUrl.toLowerCase().includes(q);
      if (match) imageMap[p.imageUrl] = { brand: p.brand, name: p.name };
    });
    const entries = Object.entries(imageMap);
    const grid = document.getElementById('imagePickerGrid');
    if (!grid) return;
    if (entries.length === 0) {
      grid.innerHTML = '<p style="color:var(--muted); grid-column:1/-1; font-size:0.82rem; padding:16px 0;">Aucune image trouvée</p>';
      return;
    }
    grid.innerHTML = entries.map(([path, info]) => `
      <div class="img-picker-item" onclick="Admin.selectImage(${JSON.stringify(path)})">
        <img src="${path}" alt="${info.name}" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="img-picker-label">${info.brand}</div>
      </div>`).join('');
  }

  function selectImage(path) {
    document.getElementById('fImageUrl').value = path;
    previewImage(path);
    closeImagePicker();
  }

  // ─── Dupliquer un produit ────────────────────────────────────
  function duplicateProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = null;
    document.getElementById('formTitle').textContent = 'Dupliquer le produit';

    // Nouveau ID unique
    const ids = products.map(p => parseInt(p.id?.replace(/\D/g, '') || '0')).filter(n => !isNaN(n) && n > 0);
    const nextNum = ids.length > 0 ? Math.max(...ids) + 1 : 51;
    const newId = 'm' + String(nextNum).padStart(3, '0');

    // Pré-remplir avec les données du produit source
    document.getElementById('fId').value          = newId;
    document.getElementById('fAsin').value        = '';
    document.getElementById('fName').value        = p.name || '';
    document.getElementById('fBrand').value       = p.brand || '';
    document.getElementById('fCategory').value    = p.category || 'serum';
    document.getElementById('fAmazonUrl').value   = '';
    document.getElementById('fImageUrl').value    = '';
    document.getElementById('fPrice').value       = p.price != null ? p.price : '';
    document.getElementById('fRating').value      = p.rating != null ? p.rating : '';
    document.getElementById('fReviews').value     = p.reviews != null ? p.reviews : '';
    document.getElementById('fActive').checked    = p.active !== false;
    document.getElementById('fFeatured').checked  = false;
    document.getElementById('fColorHex').value    = p.colorHex || '#ffffff';
    document.getElementById('fColorHexText').value = p.colorHex || '';
    document.getElementById('fShadeName').value   = '';
    previewImage('');

    document.getElementById('productFormWrap').style.display = 'block';
    document.getElementById('productFormWrap').scrollIntoView({ behavior: 'smooth' });
    toast('Produit dupliqué — change la teinte, l\'image et le lien Amazon ✦');
  }

  // ─── Toggle active / featured ─────────────────────────────────
  async function toggleActive(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    // BUG FIX: gérer correctement active=undefined (= true par défaut)
    p.active = p.active === false ? true : false;
    saveToStorage(); persistProduct(p); renderStats(); renderTable();
  }

  async function toggleFeatured(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    p.isFeatured = !p.isFeatured;
    saveToStorage(); persistProduct(p); renderStats(); renderTable();
  }

  // ─── Supprimer ────────────────────────────────────────────────
  async function deleteProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Supprimer "${p.name}" ? Action irréversible.`)) return;
    products = products.filter(x => x.id !== id);
    saveToStorage(); removeProduct(id); renderStats(); renderTable();
  }

  // ─── Patch tags skincare ──────────────────────────────────────
  const SKINCARE_TAGS_PATCH = {
    m001: { concernTags: ['eclat','uniformite','ridules','anti_age'],            ingredientTags: ['vitaminec'] },
    m002: { concernTags: ['hydratation','eclat'],                                ingredientTags: ['hyaluronique','glycerine'] },
    m003: { concernTags: ['eclat','uniformite','barriere','hydratation'],        ingredientTags: ['vitaminec','vitaminee','glycerine'] },
    m004: { concernTags: ['hydratation','eclat'],                                ingredientTags: ['hyaluronique','glycerine'] },
    m005: { concernTags: ['hydratation','barriere','apaisement','rougeurs'],     ingredientTags: ['hyaluronique','ceramides'] },
    m006: { concernTags: ['eclat','uniformite','rougeurs'],                      ingredientTags: ['vitaminec'] },
    m007: { concernTags: ['uniformite','ridules'],                               ingredientTags: ['vitaminee','spf'] },
    m008: { concernTags: ['eclat','uniformite','ridules','rougeurs'],            ingredientTags: ['vitaminec','spf','hyaluronique'] },
    m009: { concernTags: ['cernes','ridules','anti_age'],                        ingredientTags: ['bakuchiol'] },
    m010: { concernTags: ['hydratation','barriere'],                             ingredientTags: ['glycerine','uree'] },
    m012: { concernTags: ['cernes'],                                             ingredientTags: ['hyaluronique'] },
    m013: { concernTags: ['cernes','ridules'],                                   ingredientTags: [] },
    m014: { concernTags: ['cernes','ridules','anti_age','eclat'],                ingredientTags: ['retinol','vitaminec'] },
    m121: { concernTags: ['hydratation','eclat'],                                ingredientTags: ['hyaluronique'] },
    m122: { concernTags: ['ridules','anti_age','hydratation'],                   ingredientTags: ['collagene','niacinamide','hyaluronique'] },
    m123: { category: 'eye', concernTags: ['cernes','ridules','eclat'],          ingredientTags: ['hyaluronique','collagene'] },
    m124: { concernTags: ['hydratation','ridules','barriere'],                   ingredientTags: ['hyaluronique','collagene'] },
    m125: { concernTags: ['ridules','anti_age','hydratation'],                   ingredientTags: ['hyaluronique','collagene'] },
    m126: { category: 'powder' },
    m127: { category: 'powder' },
    m139: { concernTags: ['pores','matifiant','imperfections','uniformite'],        ingredientTags: ['niacinamide','zinc'] },
    m140: { concernTags: ['pores','eclat','apaisement','uniformite'],               ingredientTags: ['niacinamide','hyaluronique'] },
    m141: { concernTags: ['pores','anti_age','eclat','imperfections'],              ingredientTags: ['niacinamide','peptides'] },
    m142: { concernTags: ['pores','imperfections','purification','matifiant'],      ingredientTags: ['salicylique','niacinamide'] },
    m143: { concernTags: ['pores','taches','eclat','uniformite'],                   ingredientTags: ['niacinamide','vitaminec'] },
    m144: { concernTags: ['pores','taches','eclat','uniformite','anti_age'],        ingredientTags: ['vitaminec','niacinamide'] },
  };

  async function patchSkincareTags() {
    const ids = Object.keys(SKINCARE_TAGS_PATCH);
    let ok = 0, skip = 0;
    for (const id of ids) {
      const p = products.find(x => x.id === id);
      if (!p) { skip++; continue; }
      const patch = SKINCARE_TAGS_PATCH[id];
      if (patch.concernTags   !== undefined) p.concernTags   = patch.concernTags;
      if (patch.ingredientTags !== undefined) p.ingredientTags = patch.ingredientTags;
      if (patch.category       !== undefined) p.category      = patch.category;
      await persistProduct(p);
      ok++;
    }
    saveToStorage();
    renderStats();
    renderTable();
    toast(`${ok} produits mis à jour${skip ? ` (${skip} non trouvés)` : ''} ✓`);
  }

  // ─── Recherche et filtres ─────────────────────────────────────
  function search(q) { searchQuery = q; renderTable(); }

  function filterCat(cat) {
    catFilter = cat;
    // BUG FIX: ne jamais toucher aux classes des onglets de navigation
    renderTable();
  }

  function filterIngredient(ing) {
    ingredientFilter = ing;
    renderTable();
  }

  // ─── Onglets ──────────────────────────────────────────────────
  let currentTab = 'products';
  const TAB_IDS  = ['products', 'analytics', 'asin', 'coach'];

  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.admin-tab').forEach((t, i) => {
      t.classList.toggle('active', TAB_IDS[i] === tab);
    });
    TAB_IDS.forEach(t => {
      const el = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'analytics') renderAnalytics();
    if (tab === 'coach')     renderCoachKeyStatus();
  }

  // ─── Coach IA ─────────────────────────────────────────────────
  function renderCoachKeyStatus() {
    const el = document.getElementById('coachKeyStatus');
    if (!el) return;
    el.innerHTML = `<span style="color:var(--muted); font-size:0.82rem;">La clé API est configurée dans les variables d'environnement Netlify — jamais exposée côté navigateur.</span>`;
  }

  function saveCoachKey() {
    const inp = document.getElementById('coachApiKeyInput');
    const key = inp?.value?.trim();
    if (!key) { toast('Colle ta clé API avant d\'enregistrer', 'error'); return; }
    if (!key.startsWith('sk-ant-')) { toast('Clé invalide (doit commencer par sk-ant-…)', 'error'); return; }
    localStorage.setItem('glow_coach_key', key);
    inp.value = '';
    renderCoachKeyStatus();
    toast('Clé enregistrée ✓');
  }

  function deleteCoachKey() {
    if (!confirm('Supprimer la clé API ?')) return;
    localStorage.removeItem('glow_coach_key');
    renderCoachKeyStatus();
  }

  async function testCoachKey() {
    const result = document.getElementById('coachTestResult');
    result.innerHTML = '<span style="color:var(--muted);">⏳ Test en cours…</span>';
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 30,
          messages: [{ role: 'user', content: 'Réponds juste "Connexion OK".' }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        result.innerHTML = `<span style="color:var(--success);">✅ Connexion réussie ! Réponse : <em>${data.content?.[0]?.text || '?'}</em></span>`;
      } else {
        const err = await res.json().catch(() => ({}));
        result.innerHTML = `<span style="color:var(--error);">❌ Erreur ${res.status} : ${err?.error?.message || 'Clé API manquante ou invalide.'}</span>`;
      }
    } catch {
      result.innerHTML = `<span style="color:var(--error);">❌ Fonction proxy non disponible — déploie sur Netlify d'abord.</span>`;
    }
  }

  // ─── Analytics ────────────────────────────────────────────────
  let analyticsPeriod = 30;

  function setPeriod(days) {
    analyticsPeriod = days;
    ['7', '30', '90', 'All'].forEach(d => {
      const btn = document.getElementById('period' + d);
      if (btn) btn.classList.toggle('active', String(days) === (d === 'All' ? '9999' : d));
    });
    renderAnalytics();
  }

  function renderAnalytics() {
    if (typeof Tracker === 'undefined') {
      document.getElementById('analyticsKpis').innerHTML = '<p style="color:var(--muted); font-size:0.85rem;">Module tracker non chargé.</p>';
      return;
    }
    const s = Tracker.getStats(analyticsPeriod);

    document.getElementById('analyticsKpis').innerHTML = `
      <div class="kpi-card"><div class="kpi-value">${s.sessions}</div><div class="kpi-label">Sessions</div></div>
      <div class="kpi-card"><div class="kpi-value">${s.views}</div><div class="kpi-label">Vues produits</div></div>
      <div class="kpi-card highlight"><div class="kpi-value">${s.buys}</div><div class="kpi-label">Clics Acheter</div></div>
      <div class="kpi-card"><div class="kpi-value">${s.tryons}</div><div class="kpi-label">Essais virtuels</div></div>
      <div class="kpi-card"><div class="kpi-value">${s.convRate}%</div><div class="kpi-label">Taux vue → achat</div></div>`;

    const maxVal = Math.max(1, ...s.timeline.map(d => Math.max(d.sessions, d.views, d.buys)));
    document.getElementById('analyticsTimeline').innerHTML = s.timeline.map(d => `
      <div class="timeline-col">
        <div class="timeline-bar-wrap">
          <div class="timeline-bar bar-sessions" style="height:${Math.round((d.sessions / maxVal) * 56)}px" title="Sessions: ${d.sessions}"></div>
          <div class="timeline-bar bar-views"    style="height:${Math.round((d.views    / maxVal) * 56)}px" title="Vues: ${d.views}"></div>
          <div class="timeline-bar bar-buys"     style="height:${Math.round((d.buys     / maxVal) * 56)}px" title="Achats: ${d.buys}"></div>
        </div>
        <div class="timeline-label">${d.label}</div>
      </div>`).join('');

    const renderTopTable = (elId, data, max) => {
      document.getElementById(elId).innerHTML = data.length
        ? data.map(([pid, count], i) => {
            const p    = products.find(x => x.id === pid);
            const name = p ? `${p.brand} — ${p.name.slice(0, 28)}` : pid;
            return `<tr>
              <td class="top-rank">#${i + 1}</td>
              <td style="font-size:0.78rem;">${name}</td>
              <td class="top-bar-wrap"><div class="top-bar" style="width:${Math.round((count / max) * 80)}px"></div></td>
              <td class="top-count">${count}</td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="4" style="color:var(--muted); padding:12px 0; font-size:0.8rem;">Aucune donnée</td></tr>';
    };
    renderTopTable('analyticsTopViews', s.topViews, s.topViews[0]?.[1] || 1);
    renderTopTable('analyticsTopBuys',  s.topBuys,  s.topBuys[0]?.[1]  || 1);

    const screenLabels = {
      home: 'Accueil', shop: 'Boutique', capture: 'Photo', 'skin-analysis': 'Analyse peau',
      questionnaire: 'Questionnaire', results: 'Résultats', tryon: 'Essai virtuel',
      products: 'Produits', makeup: 'Routine makeup', intention: 'Intention', journey: 'Mon parcours'
    };
    const maxScreen = s.topScreens[0]?.[1] || 1;
    document.getElementById('analyticsScreens').innerHTML = s.topScreens.length
      ? s.topScreens.map(([name, count]) => `
          <div class="screen-row">
            <span class="screen-name">${screenLabels[name] || name}</span>
            <div class="screen-bar-bg"><div class="screen-bar-fill" style="width:${Math.round((count / maxScreen) * 100)}%"></div></div>
            <span class="screen-count">${count}</span>
          </div>`).join('')
      : '<p style="color:var(--muted); font-size:0.8rem;">Aucune navigation enregistrée</p>';

    document.getElementById('analyticsCold').innerHTML = s.coldProducts.length
      ? s.coldProducts.map(({ pid, views }, i) => {
          const p    = products.find(x => x.id === pid);
          const name = p ? `${p.brand} — ${p.name.slice(0, 30)}` : pid;
          return `<tr>
            <td class="top-rank">#${i + 1}</td>
            <td style="font-size:0.78rem;">${name}</td>
            <td class="top-count" style="color:#856404;">${views} vues</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="3" style="color:var(--muted); padding:12px 0; font-size:0.8rem;">Aucun produit froid</td></tr>';
  }

  function exportStatsCSV() {
    if (typeof Tracker !== 'undefined') Tracker.exportCSV();
  }

  function clearStats() {
    if (!confirm('Effacer toutes les statistiques ? Action irréversible.')) return;
    if (typeof Tracker !== 'undefined') Tracker.clearAll();
    renderAnalytics();
  }

  // ─── Extracteur ASIN ──────────────────────────────────────────
  function extractASIN() {
    const url    = document.getElementById('asinInput').value.trim();
    const match  = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    const result = document.getElementById('asinResult');
    if (match) {
      const asin     = match[1].toUpperCase();
      const cleanUrl = `https://www.amazon.fr/dp/${asin}?tag=${TAG}`;
      result.innerHTML = `<strong>ASIN :</strong> ${asin}<br><strong>URL affiliée :</strong> ${cleanUrl}<br>
        <button class="btn-sm btn-edit" style="margin-top:8px;"
          onclick="navigator.clipboard.writeText(${JSON.stringify(cleanUrl)}); this.textContent='Copié !'">Copier l'URL</button>`;
      result.style.display = 'block';
    } else {
      result.innerHTML = '❌ ASIN non trouvé. Vérifie que c\'est une URL Amazon.';
      result.style.display = 'block';
    }
  }

  function checkTag() {
    const url    = document.getElementById('tagInput').value.trim();
    const result = document.getElementById('tagResult');
    const fixed  = ensureTag(url);
    result.innerHTML = url.includes(`tag=${TAG}`)
      ? `✅ Le tag ${TAG} est déjà correct.<br>${url}`
      : `⚠️ Tag corrigé :<br>${fixed}<br>
         <button class="btn-sm btn-edit" style="margin-top:8px;"
           onclick="navigator.clipboard.writeText(${JSON.stringify(fixed)}); this.textContent='Copié !'">Copier</button>`;
    result.style.display = 'block';
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function ensureTag(url) {
    if (!url) return url;
    try {
      url = url.replace(/\/ref=[^?&]*/g, '');
      const m = url.match(/\/dp\/([A-Z0-9]{10})/i);
      if (m) return `https://www.amazon.fr/dp/${m[1].toUpperCase()}?tag=${TAG}`;
      const u = new URL(url.startsWith('http') ? url : 'https://' + url);
      u.searchParams.set('tag', TAG);
      return u.toString();
    } catch { return url; }
  }

  // BUG FIX: liste complète des 19+ catégories réelles du catalogue
  function getCatLabel(cat) {
    const m = {
      blush:       'Blush',
      bronzer:     'Bronzer',
      concealer:   'Correcteur / Anti-cernes',
      cream:       'Crème visage',
      eye:         'Contour des yeux',
      eyepatch:    'Patchs yeux',
      eyeliner:    'Eyeliner',
      eyeshadow:   'Fard à paupières',
      foundation:  'Fond de teint',
      highlighter: 'Enlumineur',
      lipbalm:     'Baume à lèvres',
      lipgloss:    'Gloss',
      lipliner:    'Crayon à lèvres',
      lipprimer:   'Base lèvres',
      lipplumper:  'Repulpeur lèvres',
      lipstick:    'Rouge à lèvres',
      demaquillant: 'Démaquillant',
      mascara:     'Mascara',
      nightmask:   'Masque de nuit',
      powder:      'Poudre',
      primer:      'Base / Primer',
      serum:       'Sérum',
      set:         'Coffret',
      skincare:    'Soin',
      spf:         'Crème solaire SPF',
      tools:       'Accessoires'
    };
    return m[cat] || cat;
  }

  function autoFillAmazonUrl() {
    const asin = document.getElementById('fAsin').value.trim().toUpperCase();
    if (asin.length === 10) {
      document.getElementById('fAmazonUrl').value = `https://www.amazon.fr/dp/${asin}?tag=${TAG}`;
    }
  }

  function exportJSON() {
    const data = {
      _meta: { version: '1.0', source: 'manual', tag: TAG, lastUpdated: new Date().toISOString().split('T')[0], totalProducts: products.length },
      products
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'products-manual.json';
    a.click();
  }

  // ─── Auto-tag produits maquillage ────────────────────────────
  async function autoTagAll() {
    const MAKEUP_CATS = ['foundation', 'lipstick', 'lipbalm', 'lipliner', 'lipgloss', 'lipprimer', 'lipplumper', 'mascara', 'blush', 'bronzer', 'eye', 'powder', 'concealer'];
    let count = 0;

    function detectUndertone(p) {
      if (p.undertone) return p.undertone;
      const text = [p.name, p.shadeName, p.description].filter(Boolean).join(' ').toLowerCase();
      const warmKw = ['warm','chaud','doré','dore','golden','gold','honey','miel','coral','corail','peach','pêche','peche','orange','terracotta','bronze','caramel','ginger','chai','amber'];
      const coolKw = ['cool','froid','rose','pink','rosy','berry','mauve','plum','prune','violet','framboise','porcelain','porcelaine','ivoire','ivory','lilac','lavender'];
      const neutKw = ['neutral','neutre','nude','natural','naturel','beige','sand','sable','taupe'];
      if (warmKw.some(k => text.includes(k))) return 'warm';
      if (coolKw.some(k => text.includes(k))) return 'cool';
      if (neutKw.some(k => text.includes(k))) return 'neutral';
      // Shade prefix (W10, C20, N30)
      const shade = (p.shadeName || '').toLowerCase();
      if (/^w\d|\bw\b/.test(shade)) return 'warm';
      if (/^c\d|\bc\b/.test(shade)) return 'cool';
      if (/^n\d|\bn\b/.test(shade)) return 'neutral';
      // colorHex heuristic for lips
      if (p.colorHex && ['lipstick','lipbalm'].includes(p.category)) {
        const h = p.colorHex.replace('#','');
        const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
        if (!isNaN(r)) {
          if (r > 160 && b > 100) return 'cool';
          if (r > 160 && g < 100) return 'warm';
        }
      }
      if (p.category === 'mascara') return 'neutral';
      if (p.category === 'bronzer') return 'warm';
      return 'neutral';
    }

    function detectCarnation(p) {
      if (Array.isArray(p.carnation) && p.carnation.length) return p.carnation;
      if (p.concealerDepth) return [p.concealerDepth];
      const shade = (p.shadeName || '').toLowerCase();
      const clairKw = ['light','clair','fair','porcelain','ivory','pale','n10','w10','c10','010','1w','1n','1c','vanilla','beige clair'];
      const medKw   = ['medium','beige','sand','sable','n20','n30','w20','w30','020','030','2w','2n','3n','natural','buff','bisque'];
      const fonceKw = ['deep','dark','fonce','foncé','tan','mahogany','ebony','espresso','n40','w40','040','050','4n','5w','mocha'];
      if (fonceKw.some(k => shade.includes(k))) return ['fonce'];
      if (clairKw.some(k => shade.includes(k))) return ['clair'];
      if (medKw.some(k => shade.includes(k))) return ['clair','medium'];
      return null; // universal — null means all carnations
    }

    function detectFinish(p) {
      if (p.finish && p.finish !== 'naturel') return p.finish;
      const text = [p.name, p.description].filter(Boolean).join(' ').toLowerCase();
      if (/lumineux|luminous|glow|éclat|eclat|illumin|radiant|highlight/.test(text)) return 'lumineux';
      if (/\bmat\b|matte|sans brillance/.test(text)) return 'mat';
      if (/couvrant|full cover|high cover/.test(text)) return 'couvrant';
      if (/léger|leger|light|sheer|tinted|\bbb\b|\bcc\b/.test(text)) return 'leger';
      return 'naturel';
    }

    function detectMaturity(p) {
      if (p.maturity && p.maturity !== 'all') return p.maturity;
      const text = [p.name, p.description].filter(Boolean).join(' ').toLowerCase();
      const matureKw = ['anti-âge','anti-age','antiâge','antiage','fermeté','fermete','lifting','rides','ridules','raffermissant','repulpeur','lissant','collagène','collagene','rétinol','retinol','peptide','firming','anti-wrinkle','anti wrinkle','densité','densite','restructurant'];
      const jeuneKw  = ['légère formule','formule légère','légèreté','texture légère','effet naturel','natural look','bb cream','tinted moisturizer','hydration légère'];
      if (matureKw.some(k => text.includes(k))) return 'mature';
      if (jeuneKw.some(k => text.includes(k))) return 'jeune';
      return 'all';
    }

    const toUpdate = products.filter(p => MAKEUP_CATS.includes(p.category));
    if (!toUpdate.length) { toast('Aucun produit maquillage trouvé', 'error'); return; }

    if (!confirm(`Auto-tagger ${toUpdate.length} produits maquillage ?\n\nCela ajoutera sous-ton, carnation et fini selon les noms et descriptions existants.\nTu pourras corriger manuellement ensuite.`)) return;

    for (const p of toUpdate) {
      const updated = {
        ...p,
        undertone: detectUndertone(p),
        carnation: detectCarnation(p),
        finish:    detectFinish(p),
        maturity:  detectMaturity(p)
      };
      const idx = products.findIndex(x => x.id === p.id);
      if (idx !== -1) products[idx] = updated;
      if (typeof FirestoreProducts !== 'undefined') {
        await FirestoreProducts.save(updated);
        count++;
      }
    }

    saveToStorage();
    renderTable();
    toast(`✓ ${count} produits taggés — vérifie et corrige dans l'admin`, 'success');
  }

  // ─── Init ─────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', checkAuth);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cancelForm(); closeImagePicker(); }
  });

  return {
    login, logout,
    showAddForm, editProduct, duplicateProduct, cancelForm, saveProduct,
    autoTagAll,
    toggleActive, toggleFeatured, deleteProduct,
    search, filterCat, filterIngredient, patchSkincareTags, showTab,
    extractASIN, extractASINFromUrl, checkTag, autoFillAmazonUrl, exportJSON,
    setPeriod, exportStatsCSV, clearStats,
    saveCoachKey, deleteCoachKey, testCoachKey,
    previewImage, onImageUrlChange,
    openImagePicker, closeImagePicker, selectImage, renderImagePicker,
    uploadImageFile
  };

})();
