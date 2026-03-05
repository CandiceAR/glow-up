/* ============================================================
   app.js — AppState global + routeur SPA + initialisation
   GLOW UP Phase 0
   ============================================================ */

'use strict';

// ─── AppState ────────────────────────────────────────────────
const AppState = {
  screen: 'home',

  face: {
    photo: null,        // DataURL de la photo uploadée/capturée
    landmarks: null,    // Résultat MediaPipe (tableau 478 points)
    canvasEl: null,     // Référence au <canvas> du try-on
    imageEl: null       // Référence à l'<img> source
  },

  questionnaire: {
    answers: {},        // { q1: 'grasse', q2: ['acne','pores'], ... }
    completed: false,
    currentQ: 0
  },

  routine: {
    ruleApplied: null,  // ex: 'R1'
    ruleName: null,     // ex: 'Peau grasse acnéique'
    matin: [],          // Tableau d'étapes matin
    soir: [],           // Tableau d'étapes soir
    warnings: [],       // Avertissements issus de la règle
    makeupTips: [],     // Conseils maquillage de la règle
    log: []             // Log des décisions du moteur de règles
  },

  products: {
    catalog: [],        // Tous les produits actifs
    recommended: [],    // Produits recommandés (après questionnaire)
    selected: null,     // Produit ouvert en modal
    tryOnActive: [],    // Produits actuellement appliqués sur le try-on
    filters: { category: 'all' }
  },

  user: {
    uid: null,
    email: null,
    displayName: null,
    photoURL: null,
    isGuest: true
  }
};

// ─── Navigation ───────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (!target) { console.warn('Screen not found:', name); return; }
  target.classList.add('active');
  AppState.screen = name;
  window.scrollTo(0, 0);

  // Mettre à jour les liens actifs de la nav
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.screen === name);
  });

  // Actions spécifiques à chaque écran
  if (name === 'shop') renderShop();
  if (name === 'tryon') TryOn.initTryOnScreen();
  if (name === 'results') RoutineRenderer.renderResults();
  if (name === 'products') renderRecommendedProducts();
  if (name === 'questionnaire') Questionnaire.render();
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3000) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Modal générique ──────────────────────────────────────────
function openModal(html) {
  const overlay = document.getElementById('modalOverlay');
  const modal   = document.getElementById('modalBox');
  modal.innerHTML = html;
  overlay.classList.add('active');
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('modalBox').classList.remove('active');
}

// ─── Auth state dans la UI ────────────────────────────────────
function updateAuthUI() {
  const el = document.getElementById('navUser');
  if (!el) return;
  if (AppState.user.isGuest) {
    el.innerHTML = '<button class="btn-nav-auth" onclick="openAuthModal()">Connexion</button>';
  } else {
    const name = AppState.user.displayName || AppState.user.email || 'Moi';
    el.innerHTML = `<button class="btn-nav-auth" onclick="openProfileMenu()">${name.split(' ')[0]}</button>`;
  }
}

// ─── Menu hamburger ───────────────────────────────────────────
function toggleMobileMenu() {
  document.getElementById('navLinks').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
}

// ─── Initialisation principale ────────────────────────────────
async function initApp() {
  console.log('[GLOW UP] Initialisation Phase 0…');

  // 1. Chargement du catalogue produits + règles (en parallèle)
  await Promise.all([
    ProductCatalog.load(),
    RulesEngine.loadRules()
  ]);
  console.log(`[GLOW UP] Catalogue chargé : ${AppState.products.catalog.length} produits actifs`);

  // 2. Auth Firebase
  if (typeof Auth !== 'undefined') Auth.init();

  // 3. Questionnaire — reset si nécessaire
  Questionnaire.reset();

  // 4. Event listeners
  setupGlobalListeners();
  TryOn.setupCapture();

  // 5. Affichage écran home
  showScreen('home');

  // 6. Rendu grille featured sur home
  renderFeaturedHome();
}

function setupGlobalListeners() {
  // Fermer modal au clic overlay
  document.getElementById('modalOverlay')?.addEventListener('click', closeModal);

  // Hamburger
  document.getElementById('hamburger')?.addEventListener('click', toggleMobileMenu);

  // Fermer menu mobile au clic lien
  document.querySelectorAll('.nav-link').forEach(l => {
    l.addEventListener('click', () => {
      document.getElementById('navLinks').classList.remove('open');
      document.getElementById('hamburger').classList.remove('open');
    });
  });
}

// ─── Home — produits vedettes ─────────────────────────────────
function renderFeaturedHome() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  const featured = AppState.products.catalog.filter(p => p.isFeatured).slice(0, 4);
  if (featured.length === 0) {
    grid.innerHTML = '<p class="empty-state">Aucun produit vedette pour le moment.</p>';
    return;
  }
  grid.innerHTML = featured.map(p => ProductCatalog.renderCard(p)).join('');
}

// ─── Shop — rendu grille complète ────────────────────────────
function renderShop() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  const cat = AppState.products.filters.category;
  const list = cat === 'all'
    ? AppState.products.catalog
    : AppState.products.catalog.filter(p => p.category === cat);
  grid.innerHTML = list.length
    ? list.map(p => ProductCatalog.renderCard(p)).join('')
    : '<p class="empty-state">Aucun produit dans cette catégorie.</p>';
}

function filterShop(cat) {
  AppState.products.filters.category = cat;
  document.querySelectorAll('.filter-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.cat === cat));
  renderShop();
}

// ─── Produits recommandés ─────────────────────────────────────
function renderRecommendedProducts() {
  const grid = document.getElementById('recommendedGrid');
  if (!grid) return;
  const list = AppState.products.recommended;
  if (!list || list.length === 0) {
    grid.innerHTML = '<p class="empty-state">Complète le questionnaire pour voir tes recommandations.</p>';
    return;
  }
  grid.innerHTML = list.map(p => ProductCatalog.renderCard(p, { showTryOn: true })).join('');
}

// ─── Lancer le flow principal ─────────────────────────────────
function startGlowUp() {
  // Si déjà une photo → proposer recapture ou aller directement au questionnaire
  if (AppState.face.photo) {
    showScreen('questionnaire');
  } else {
    showScreen('capture');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
