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

  // ─── Extraire ASIN de l'URL Amazon ────────────────────────
  function extractASINFromUrl() {
    const url = document.getElementById('fAmazonUrl').value;
    if (!url) return;

    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (asinMatch && asinMatch[1]) {
      document.getElementById('fAsin').value = asinMatch[1];
    }
  }

  // ─── Générer ID automatique depuis le nom et la marque ────
  function generateProductId() {
    const name = document.getElementById('fName').value.trim();
    const brand = document.getElementById('fBrand').value.trim();
    const asin = document.getElementById('fAsin').value.trim();

    if (!name || !brand || !asin) return null;

    // Créer un slug court et unique
    const brandSlug = brand.toLowerCase().replace(/\s+/g, '-').slice(0, 8);
    const nameSlug = name.toLowerCase().replace(/\s+/g, '-').slice(0, 12);
    const asinShort = asin.slice(-4);

    const id = `${brandSlug}-${nameSlug}-${asinShort}`;
    return id.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  }
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

  // ─── Persister sur GitHub via Netlify Function ──────────────────
  async function persistToGitHub() {
    try {
      const res = await fetch('/.netlify/functions/saveProducts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });
      if (!res.ok) {
        const err = await res.json();
        console.warn('[Admin] Erreur sauvegarde GitHub:', err);
      } else {
        const data = await res.json();
        console.log('[Admin] Sauvegardé sur GitHub:', data.message);
      }
    } catch (e) {
      console.warn('[Admin] Impossible d\'appeler saveProducts function:', e.message);
    }
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

  async function saveProduct() {
    const amazonUrl = document.getElementById('fAmazonUrl').value.trim();
    const name = document.getElementById('fName').value.trim();
    const brand = document.getElementById('fBrand').value.trim();
    const imageUrl = document.getElementById('fImageUrl').value.trim();

    // Validation des champs obligatoires
    if (!amazonUrl || !name || !brand || !imageUrl) {
      alert('Merci de remplir tous les champs obligatoires :\n- Lien affilié Amazon\n- Nom du produit\n- Marque\n- Chemin image');
      return;
    }

    // Extraire ASIN de l'URL
    extractASINFromUrl();
    let asin = document.getElementById('fAsin').value.trim();

    if (!asin) {
      const asinMatch = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/);
      if (asinMatch && asinMatch[1]) {
        asin = asinMatch[1];
        document.getElementById('fAsin').value = asin;
      } else {
        alert('Impossible d\'extraire l\'ASIN. Vérifie que le lien Amazon est au bon format : https://www.amazon.fr/dp/[ASIN]');
        return;
      }
    }

    // Générer ou utiliser l'ID existant
    let id = document.getElementById('fId').value.trim();
    if (!id) {
      id = generateProductId();
      if (!id) {
        alert('Erreur lors de la génération de l\'ID');
        return;
      }
      document.getElementById('fId').value = id;
    }

    // Vérifier unicité
    if (!editingId && products.some(p => p.id === id)) {
      if (!confirm(`Un produit avec l'ID "${id}" existe déjà. Changer l'ID ? (nouvelle génération)`)) return;
      // Rajouter un suffixe pour le rendre unique
      id = `${id}-${Date.now().toString().slice(-4)}`;
      document.getElementById('fId').value = id;
    }

    // Construire l'URL Amazon avec le tag si manquant
    let finalAmazonUrl = amazonUrl;
    if (!amazonUrl.includes('tag=')) {
      finalAmazonUrl = amazonUrl.includes('?')
        ? `${amazonUrl}&tag=${TAG}`
        : `${amazonUrl}?tag=${TAG}`;
    }

    const product = {
      id,
      asin,
      name,
      brand,
      category: document.getElementById('fCategory').value,
      subcategory: document.getElementById('fCategory').value,
      shadeName: null,
      colorHex: null,
      imageUrl,
      amazonUrl: finalAmazonUrl,
      price: null,
      currency: 'EUR',
      rating: null,
      skinTypeTags: ['normale', 'mixte', 'seche', 'grasse', 'sensible'],
      concernTags: [],
      makeupCategory: document.getElementById('fCategory').value,
      finish: 'mat',
      coverage: null,
      isFeatured: false,
      active: true,
      skinTonePreview: {
        mode: 'images',
        light: `assets/previews/${id}_light.jpg`,
        medium: `assets/previews/${id}_medium.jpg`,
        dark: `assets/previews/${id}_dark.jpg`
      },
      description: '',
      curatedBy: 'admin',
      curatedAt: new Date().toISOString().split('T')[0],
      notes: ''
    };

    if (editingId) {
      const idx = products.findIndex(p => p.id === editingId);
      if (idx !== -1) products[idx] = product;
    } else {
      products.push(product);
    }

    saveToStorage();
    persistToGitHub();
    cancelForm();
    renderStats();
    renderTable();
    alert(`✓ Produit ${editingId ? 'modifié' : 'ajouté'} avec succès !\nID: ${id}\nASIN: ${asin}`);
  }

  // ─── Toggle active / featured ─────────────────────────────────
  async function toggleActive(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    p.active = !p.active;
    saveToStorage();
    persistToGitHub();
    renderStats();
    renderTable();
  }

  async function toggleFeatured(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    p.isFeatured = !p.isFeatured;
    saveToStorage();
    persistToGitHub();
    renderStats();
    renderTable();
  }

  // ─── Supprimer ────────────────────────────────────────────────
  async function deleteProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Supprimer "${p.name}" ? Cette action est irréversible.`)) return;
    products = products.filter(x => x.id !== id);
    saveToStorage();
    persistToGitHub();
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
  let currentTab = 'products';

  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.admin-tab').forEach((t, i) => {
      t.classList.toggle('active', i === ['products', 'analytics', 'asin', 'coach'].indexOf(tab));
    });
    document.getElementById('tabProducts').style.display  = tab === 'products'  ? 'block' : 'none';
    document.getElementById('tabAnalytics').style.display = tab === 'analytics' ? 'block' : 'none';
    document.getElementById('tabAsin').style.display      = tab === 'asin'      ? 'block' : 'none';
    document.getElementById('tabCoach').style.display     = tab === 'coach'     ? 'block' : 'none';
    if (tab === 'analytics') renderAnalytics();
    if (tab === 'coach')     renderCoachKeyStatus();
  }

  // ─── Coach IA — gestion clé API ──────────────────────────────
  const COACH_KEY_STORE = 'glow_coach_key';

  function renderCoachKeyStatus() {
    const el = document.getElementById('coachKeyStatus');
    if (!el) return;
    el.innerHTML = `<span style="color:var(--muted); font-size:0.82rem;">La clé API est configurée dans les variables d'environnement Netlify — elle n'est jamais exposée côté navigateur.</span>`;
  }

  function saveCoachKey() {
    const inp = document.getElementById('coachApiKeyInput');
    const key = inp?.value?.trim();
    if (!key) { alert('Colle ta clé API avant d\'enregistrer.'); return; }
    if (!key.startsWith('sk-ant-')) {
      alert('Cette clé ne ressemble pas à une clé Claude (elle doit commencer par sk-ant-…). Vérifie et réessaie.');
      return;
    }
    localStorage.setItem(COACH_KEY_STORE, key);
    inp.value = '';
    renderCoachKeyStatus();
    alert('✅ Clé enregistrée avec succès !');
  }

  function deleteCoachKey() {
    if (!confirm('Supprimer la clé API ? Le Coach reviendra en mode sans IA.')) return;
    localStorage.removeItem(COACH_KEY_STORE);
    renderCoachKeyStatus();
  }

  function toggleKeyVisibility() {
    const inp = document.getElementById('coachApiKeyInput');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  async function testCoachKey() {
    const result = document.getElementById('coachTestResult');
    result.innerHTML = '<span style="color:var(--muted);">⏳ Test en cours…</span>';
    try {
      const res = await fetch('/.netlify/functions/coach', {
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
        const reply = data.content?.[0]?.text || '?';
        result.innerHTML = `<span style="color:var(--success);">✅ Connexion réussie ! Réponse Claude : <em>${reply}</em></span>`;
      } else {
        const err = await res.json().catch(() => ({}));
        result.innerHTML = `<span style="color:var(--error);">❌ Erreur ${res.status} : ${err?.error?.message || 'Clé API manquante ou invalide dans Netlify.'}</span>`;
      }
    } catch (e) {
      result.innerHTML = `<span style="color:var(--error);">❌ Fonction proxy non disponible — déploie le site sur Netlify d'abord.</span>`;
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
      document.getElementById('analyticsKpis').innerHTML = '<p style="color:var(--muted); font-size:0.85rem;">Le module tracker n\'est pas chargé.</p>';
      return;
    }

    const s = Tracker.getStats(analyticsPeriod);

    // KPIs
    document.getElementById('analyticsKpis').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-value">${s.sessions}</div>
        <div class="kpi-label">Sessions</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${s.views}</div>
        <div class="kpi-label">Vues produits</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-value">${s.buys}</div>
        <div class="kpi-label">Clics Acheter</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${s.tryons}</div>
        <div class="kpi-label">Essais virtuels</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${s.convRate}%</div>
        <div class="kpi-label">Taux vue → achat</div>
      </div>`;

    // Timeline 7 jours
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

    // Top vues
    const maxViews = s.topViews[0]?.[1] || 1;
    document.getElementById('analyticsTopViews').innerHTML = s.topViews.length
      ? s.topViews.map(([pid, count], i) => {
          const p = products.find(x => x.id === pid);
          const name = p ? `${p.brand} — ${p.name.slice(0, 28)}` : pid;
          return `<tr>
            <td class="top-rank">#${i + 1}</td>
            <td style="font-size:0.78rem;">${name}</td>
            <td class="top-bar-wrap"><div class="top-bar" style="width:${Math.round((count / maxViews) * 80)}px"></div></td>
            <td class="top-count">${count}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" style="color:var(--muted); padding:12px 0; font-size:0.8rem;">Aucune vue enregistrée</td></tr>';

    // Top achats
    const maxBuys = s.topBuys[0]?.[1] || 1;
    document.getElementById('analyticsTopBuys').innerHTML = s.topBuys.length
      ? s.topBuys.map(([pid, count], i) => {
          const p = products.find(x => x.id === pid);
          const name = p ? `${p.brand} — ${p.name.slice(0, 28)}` : pid;
          return `<tr>
            <td class="top-rank">#${i + 1}</td>
            <td style="font-size:0.78rem;">${name}</td>
            <td class="top-bar-wrap"><div class="top-bar" style="width:${Math.round((count / maxBuys) * 80)}px"></div></td>
            <td class="top-count">${count}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" style="color:var(--muted); padding:12px 0; font-size:0.8rem;">Aucun clic enregistré</td></tr>';

    // Écrans
    const screenLabels = {
      home: 'Accueil', shop: 'Boutique', capture: 'Photo', 'skin-analysis': 'Analyse peau',
      questionnaire: 'Questionnaire', results: 'Résultats', tryon: 'Essai virtuel',
      products: 'Produits recommandés', makeup: 'Routine makeup', intention: 'Intention', journey: 'Mon parcours'
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

    // Produits froids
    document.getElementById('analyticsCold').innerHTML = s.coldProducts.length
      ? s.coldProducts.map(({ pid, views }, i) => {
          const p = products.find(x => x.id === pid);
          const name = p ? `${p.brand} — ${p.name.slice(0, 30)}` : pid;
          return `<tr>
            <td class="top-rank">#${i + 1}</td>
            <td style="font-size:0.78rem;">${name}</td>
            <td class="top-count" style="color:#856404;">${views} vues</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="3" style="color:var(--muted); padding:12px 0; font-size:0.8rem;">Aucun produit froid détecté</td></tr>';
  }

  function exportStatsCSV() {
    if (typeof Tracker !== 'undefined') Tracker.exportCSV();
  }

  function clearStats() {
    if (!confirm('Effacer toutes les statistiques ? Cette action est irréversible.')) return;
    if (typeof Tracker !== 'undefined') Tracker.clearAll();
    renderAnalytics();
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
    search, filterCat, showTab, setPeriod, exportStatsCSV, clearStats,
    extractASIN, checkTag, autoFillAmazonUrl, exportJSON,
    saveCoachKey, deleteCoachKey, toggleKeyVisibility, testCoachKey
  };

})();
