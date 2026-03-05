/* ============================================================
   adminPanel.js — Interface admin GLOW UP Phase 0
   Mot de passe simple (hardcodé) — pas de Firebase Auth admin
   CRUD sur products-manual.json (via localStorage en Phase 0)
   ============================================================ */

'use strict';

const ADMIN_PASSWORD = 'glowup2026';  // ← Change ce mot de passe !
const TAG            = 'kand10ar-21';

const Admin = (() => {

  let products     = [];
  let editingId    = null;
  let searchQuery  = '';
  let catFilter    = 'all';

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

  // ─── Init ──────────────────────────────────────────────────────
  async function initAdmin() {
    await loadProducts();
    renderStats();
    renderTable();
  }

  // ─── Chargement produits ──────────────────────────────────────
  async function loadProducts() {
    // D'abord localStorage (modifications admin), sinon fichier JSON
    const stored = localStorage.getItem('glow_products_manual');
    if (stored) {
      try {
        products = JSON.parse(stored);
        console.log('[Admin] Produits chargés depuis localStorage:', products.length);
        return;
      } catch {}
    }

    try {
      const res  = await fetch('data/products-manual.json');
      const data = await res.json();
      products = data.products || [];
      console.log('[Admin] Produits chargés depuis JSON:', products.length);
    } catch (err) {
      console.error('[Admin] Erreur chargement:', err);
      products = [];
    }
  }

  // ─── Sauvegarder en localStorage ─────────────────────────────
  function saveToStorage() {
    localStorage.setItem('glow_products_manual', JSON.stringify(products));
  }

  // ─── Stats ────────────────────────────────────────────────────
  function renderStats() {
    const total    = products.length;
    const active   = products.filter(p => p.active).length;
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

    if (catFilter !== 'all') {
      list = list.filter(p => p.category === catFilter);
    }

    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--muted);">Aucun produit trouvé</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => {
      const colorCell = p.colorHex
        ? `<div class="color-pill"><span class="color-pill-dot" style="background:${p.colorHex}"></span>${p.shadeName || p.colorHex}</div>`
        : '—';
      const statusBadge = p.active
        ? '<span class="badge-active">Actif</span>'
        : '<span class="badge-inactive">Inactif</span>';
      const featuredBadge = p.isFeatured
        ? ' <span class="badge-featured">★ Vedette</span>'
        : '';

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
          <td>${p.price ? p.price.toFixed(2) + ' €' : '—'}</td>
          <td>${p.rating || '—'}</td>
          <td>${statusBadge}${featuredBadge}</td>
          <td>
            <div class="btn-actions">
              <button class="btn-sm btn-edit" onclick="Admin.editProduct('${p.id}')">Modifier</button>
              <button class="btn-sm btn-toggle" onclick="Admin.toggleFeatured('${p.id}')" title="Basculer produit vedette">★</button>
              <button class="btn-sm btn-toggle" onclick="Admin.toggleActive('${p.id}')" title="Activer/Désactiver">${p.active ? 'Désact.' : 'Activ.'}</button>
              <button class="btn-sm btn-delete" onclick="Admin.deleteProduct('${p.id}')">Suppr.</button>
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
    // Générer un ID auto
    const nextNum = Math.max(...products.map(p => parseInt(p.id?.replace('m', '') || 0)), 50) + 1;
    document.getElementById('fId').value = 'm' + String(nextNum).padStart(3, '0');
    document.getElementById('productFormWrap').style.display = 'block';
    document.getElementById('productFormWrap').scrollIntoView({ behavior: 'smooth' });
  }

  function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    document.getElementById('formTitle').textContent = 'Modifier le produit';
    document.getElementById('fId').value          = p.id || '';
    document.getElementById('fAsin').value        = p.asin || '';
    document.getElementById('fName').value        = p.name || '';
    document.getElementById('fBrand').value       = p.brand || '';
    document.getElementById('fCategory').value    = p.category || 'lipstick';
    document.getElementById('fShadeName').value   = p.shadeName || '';
    document.getElementById('fColorHex').value    = p.colorHex || '#CC0000';
    document.getElementById('fPrice').value       = p.price || '';
    document.getElementById('fRating').value      = p.rating || '';
    document.getElementById('fAmazonUrl').value   = p.amazonUrl || '';
    document.getElementById('fImageUrl').value    = p.imageUrl || '';
    document.getElementById('fDescription').value = p.description || '';
    document.getElementById('fFinish').value      = p.finish || 'mat';
    document.getElementById('fNotes').value       = p.notes || '';
    document.getElementById('fActive').checked    = p.active !== false;
    document.getElementById('fFeatured').checked  = p.isFeatured === true;

    document.getElementById('productFormWrap').style.display = 'block';
    document.getElementById('productFormWrap').scrollIntoView({ behavior: 'smooth' });
  }

  function cancelForm() {
    document.getElementById('productFormWrap').style.display = 'none';
    clearForm();
    editingId = null;
  }

  function clearForm() {
    ['fId','fAsin','fName','fBrand','fShadeName','fPrice','fRating','fAmazonUrl','fImageUrl','fDescription','fNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('fColorHex').value    = '#CC0000';
    document.getElementById('fCategory').value    = 'lipstick';
    document.getElementById('fFinish').value      = 'mat';
    document.getElementById('fActive').checked    = true;
    document.getElementById('fFeatured').checked  = false;
  }

  function autoFillAmazonUrl() {
    const asin = document.getElementById('fAsin').value.trim().toUpperCase();
    if (asin.length === 10) {
      document.getElementById('fAmazonUrl').value = `https://www.amazon.fr/dp/${asin}?tag=${TAG}`;
    }
  }

  function saveProduct() {
    const id   = document.getElementById('fId').value.trim();
    const asin = document.getElementById('fAsin').value.trim().toUpperCase();
    const name = document.getElementById('fName').value.trim();
    const brand = document.getElementById('fBrand').value.trim();

    if (!id || !asin || !name || !brand) {
      alert('Merci de remplir les champs obligatoires (ID, ASIN, Nom, Marque)');
      return;
    }

    const amazonUrl = ensureTag(document.getElementById('fAmazonUrl').value.trim() || `https://www.amazon.fr/dp/${asin}?tag=${TAG}`);

    const product = {
      id,
      asin,
      name,
      brand,
      category:    document.getElementById('fCategory').value,
      subcategory: document.getElementById('fCategory').value,
      shadeName:   document.getElementById('fShadeName').value.trim() || null,
      colorHex:    document.getElementById('fColorHex').value || null,
      imageUrl:    document.getElementById('fImageUrl').value.trim() || '',
      amazonUrl,
      price:       parseFloat(document.getElementById('fPrice').value) || null,
      currency:    'EUR',
      rating:      parseFloat(document.getElementById('fRating').value) || null,
      skinTypeTags: ['normale', 'mixte', 'seche', 'grasse', 'sensible'],
      concernTags: [],
      makeupCategory: document.getElementById('fCategory').value,
      finish:      document.getElementById('fFinish').value,
      coverage:    null,
      isFeatured:  document.getElementById('fFeatured').checked,
      active:      document.getElementById('fActive').checked,
      skinTonePreview: {
        mode:   'images',
        light:  `assets/previews/${id}_light.jpg`,
        medium: `assets/previews/${id}_medium.jpg`,
        dark:   `assets/previews/${id}_dark.jpg`
      },
      description: document.getElementById('fDescription').value.trim(),
      curatedBy:   'admin',
      curatedAt:   new Date().toISOString().split('T')[0],
      notes:       document.getElementById('fNotes').value.trim()
    };

    if (editingId) {
      const idx = products.findIndex(p => p.id === editingId);
      if (idx !== -1) products[idx] = product;
    } else {
      // Vérifier unicité ASIN
      if (products.some(p => p.asin === asin)) {
        if (!confirm(`Un produit avec l'ASIN ${asin} existe déjà. Ajouter quand même ?`)) return;
      }
      products.push(product);
    }

    saveToStorage();
    cancelForm();
    renderStats();
    renderTable();
    alert(`Produit ${editingId ? 'modifié' : 'ajouté'} avec succès !`);
  }

  // ─── Toggle active / featured ─────────────────────────────────
  function toggleActive(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    p.active = !p.active;
    saveToStorage();
    renderStats();
    renderTable();
  }

  function toggleFeatured(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    p.isFeatured = !p.isFeatured;
    saveToStorage();
    renderStats();
    renderTable();
  }

  // ─── Supprimer ────────────────────────────────────────────────
  function deleteProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Supprimer "${p.name}" ? Cette action est irréversible.`)) return;
    products = products.filter(x => x.id !== id);
    saveToStorage();
    renderStats();
    renderTable();
  }

  // ─── Recherche et filtres ─────────────────────────────────────
  function search(q) {
    searchQuery = q;
    renderTable();
  }

  function filterCat(cat) {
    catFilter = cat;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    renderTable();
  }

  // ─── Onglets ──────────────────────────────────────────────────
  function showTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((t, i) => {
      t.classList.toggle('active', i === (tab === 'products' ? 0 : 1));
    });
    document.getElementById('tabProducts').style.display = tab === 'products' ? 'block' : 'none';
    document.getElementById('tabAsin').style.display     = tab === 'asin'     ? 'block' : 'none';
  }

  // ─── Extracteur ASIN ──────────────────────────────────────────
  function extractASIN() {
    const url   = document.getElementById('asinInput').value.trim();
    const match = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    const result = document.getElementById('asinResult');

    if (match) {
      const asin       = match[1].toUpperCase();
      const cleanUrl   = `https://www.amazon.fr/dp/${asin}?tag=${TAG}`;
      result.innerHTML = `<strong>ASIN :</strong> ${asin}<br><strong>URL affiliée :</strong> ${cleanUrl}<br><button class="btn-sm btn-edit" style="margin-top:8px;" onclick="navigator.clipboard.writeText('${cleanUrl}'); this.textContent='Copié !'">Copier l'URL</button>`;
      result.style.display = 'block';
    } else {
      result.innerHTML = '❌ ASIN non trouvé dans cette URL. Vérifie que c\'est bien une URL Amazon.';
      result.style.display = 'block';
    }
  }

  function checkTag() {
    const url    = document.getElementById('tagInput').value.trim();
    const result = document.getElementById('tagResult');
    const fixed  = ensureTag(url);
    const hasCorrectTag = url.includes(`tag=${TAG}`);
    result.innerHTML = hasCorrectTag
      ? `✅ Le tag ${TAG} est déjà correct.<br>${url}`
      : `⚠️ Tag corrigé :<br>${fixed}<br><button class="btn-sm btn-edit" style="margin-top:8px;" onclick="navigator.clipboard.writeText('${fixed}'); this.textContent='Copié !'">Copier</button>`;
    result.style.display = 'block';
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function ensureTag(url) {
    if (!url) return url;
    try {
      url = url.replace(/\/ref=[^?&]*/g, '');
      const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
      if (asinMatch) return `https://www.amazon.fr/dp/${asinMatch[1].toUpperCase()}?tag=${TAG}`;
      const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
      urlObj.searchParams.set('tag', TAG);
      return urlObj.toString();
    } catch { return url; }
  }

  function getCatLabel(cat) {
    const m = { lipstick: 'Rouge à lèvres', blush: 'Blush', foundation: 'Fond de teint', mascara: 'Mascara' };
    return m[cat] || cat;
  }

  // ─── Export JSON ──────────────────────────────────────────────
  function exportJSON() {
    const data = {
      _meta: { version: '1.0', source: 'manual', tag: TAG, lastUpdated: new Date().toISOString().split('T')[0], totalProducts: products.length },
      products
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'products-manual.json';
    a.click();
  }

  // ─── Init au chargement ───────────────────────────────────────
  window.addEventListener('DOMContentLoaded', checkAuth);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cancelForm();
  });

  return {
    login, logout, initAdmin, showAddForm, editProduct, cancelForm,
    saveProduct, toggleActive, toggleFeatured, deleteProduct,
    search, filterCat, showTab, extractASIN, checkTag, autoFillAmazonUrl, exportJSON
  };

})();
