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
    spfCatalog: [],     // Base SPF dédiée (visage + corps) — voir spfEngine.js
    recommended: [],    // Produits recommandés (après questionnaire)
    selected: null,     // Produit ouvert en modal
    tryOnActive: [],    // Produits actuellement appliqués sur le try-on
    filters: { category: 'all', brand: 'all' }
  },

  user: {
    uid: null,
    email: null,
    displayName: null,
    photoURL: null,
    isGuest: true
  },

  routineChoice: null,  // 'skincare' | 'makeup' | null
  pendingRoute:  null,  // Route à ouvrir après l'écran d'intention
  intention:     null,  // { key, label, emoji, tone, skincareIntro, makeupIntro, color }

  makeupQuiz: {}        // Réponses au questionnaire makeup (mkSkinType, mkLook, mkFocus, mkTime, mkBudget)
};

// ─── Navigation ───────────────────────────────────────────────
function showScreen(name) {
  // Stopper l'analyse live caméra si on quitte la capture
  if (AppState.screen === 'capture' && name !== 'capture') {
    if (typeof SkinAnalysis !== 'undefined') SkinAnalysis.stopLiveAnalysis();
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (!target) { console.warn('Screen not found:', name); return; }
  target.classList.add('active');
  AppState.screen = name;
  window.scrollTo(0, 0);
  if (typeof Tracker !== 'undefined') Tracker.trackScreen(name);

  // Mettre à jour les liens actifs de la nav (desktop + mobile)
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.screen === name);
  });
  document.querySelectorAll('.mobile-nav-item').forEach(l => {
    l.classList.toggle('active', l.dataset.screen === name);
  });

  // Actions spécifiques à chaque écran
  if (name === 'capture') {
    if (typeof TryOn !== 'undefined' && TryOn.setupCapture) TryOn.setupCapture(); // ré-attache les listeners (garde anti-doublon)
    const overlay = document.getElementById('prephotoOverlay');
    if (overlay && !sessionStorage.getItem('prephoto_seen')) {
      overlay.style.display = 'flex';
    }
  }
  if (name === 'shop')          { renderShopBrands(); renderShop(); }
  if (name === 'tryon')         TryOn.initTryOnScreen();
  if (name === 'results') {
    RoutineRenderer.renderResults();
    if (typeof RoutineSaver !== 'undefined') RoutineSaver.save();
  }
  if (name === 'products')      renderRecommendedProducts();
  if (name === 'questionnaire') Questionnaire.render();
  if (name === 'skin-analysis')   SkinAnalysis.initScreen();
  if (name === 'journey')         SkinJourney.initScreen();
  if (name === 'skinpedia')       Skinpedia.initScreen();
  if (name === 'plans')           { if (typeof Subscription !== 'undefined') Subscription.renderPlansPage(); }
  if (name === 'premium')         { if (typeof Subscription !== 'undefined') Subscription.renderPremiumPage(); }
  if (name === 'dupe-finder')     { if (typeof DupeFinder !== 'undefined') DupeFinder.initScreen(); }

  // ─── Écrans avec gating ───────────────────────────────────────
  if (name === 'makeup') {
    const firstChoice = AppState.routineChoice || null;
    if (firstChoice === 'skincare' && typeof Subscription !== 'undefined' && !Subscription.canAccess('routine_second')) {
      Subscription.showPaywall('routine_second');
      return;
    }
    MakeupRoutine.initScreen();
    // Sauvegarder la routine make-up (quiz) pour pouvoir la retrouver
    AppState.routineChoice = 'makeup';
    if (typeof RoutineSaver !== 'undefined') RoutineSaver.save();
  }

  if (name === 'coach') {
    if (typeof Subscription !== 'undefined' && !Subscription.canAccess('coach')) {
      Subscription.showPaywall('coach');
      return;
    }
    GlowCoach.initScreen();
  }

  if (name === 'routine-choice')  initRoutineChoiceScreen();
}

// ─── Pre-photo overlay ────────────────────────────────────────
window.dismissPrephoto = function(hasMakeup) {
  const overlay = document.getElementById('prephotoOverlay');
  if (overlay) overlay.style.display = 'none';
  if (hasMakeup) AppState.face = AppState.face || {};
  if (hasMakeup) AppState.face.hasMakeup = true;
  sessionStorage.setItem('prephoto_seen', '1');
};

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
const _iconProfil = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

function updateAuthUI() {
  const el   = document.getElementById('navUser');
  const hint = document.getElementById('heroLoginHint');
  if (!el) return;
  if (AppState.user.isGuest) {
    el.innerHTML = `<button class="nav-account-btn" onclick="openAuthModal()" aria-label="Se connecter" title="Se connecter">${_iconProfil}</button>`;
    if (hint) hint.style.display = '';
  } else {
    const prenom = AppState.user.displayName ? AppState.user.displayName.split(' ')[0] : 'Mon compte';
    el.innerHTML = `<button class="nav-account-btn nav-account-btn--connected" onclick="openProfileMenu()" aria-label="Mon compte" title="Bonjour ${prenom}">${_iconProfil}</button>`;
    if (hint) hint.style.display = 'none';
  }
}

// ─── Menu hamburger ───────────────────────────────────────────
function toggleMobileMenu() {
  document.getElementById('navLinks').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
}

// ─── Initialisation principale ────────────────────────────────
// ─── Capture du code parrainage dans l'URL (?ref=GU-XXXXX) ───
function _captureReferralCode() {
  const params = new URLSearchParams(window.location.search);
  const ref    = params.get('ref');
  if (ref && /^GU-[A-Z0-9]{5}$/.test(ref)) {
    sessionStorage.setItem('glow_pending_ref', ref);
    // Nettoyer l'URL sans recharger la page
    const clean = new URL(window.location.href);
    clean.searchParams.delete('ref');
    window.history.replaceState({}, '', clean.toString());
    console.log('[Referral] Code capturé:', ref);
  }
}

async function initApp() {
  _captureReferralCode();
  console.log('[GLOW UP] Initialisation Phase 0…');

  // Purge du cache localStorage produits (catalogue remis à zéro)
  localStorage.removeItem('glow_products_manual');

  // 0. Listeners UI en premier — indépendants du chargement des données
  setupGlobalListeners();
  TryOn.setupCapture();

  // 1. Chargement du catalogue produits + règles (en parallèle)
  await Promise.all([
    ProductCatalog.load(),
    RulesEngine.loadRules(),
    (typeof SpfEngine !== 'undefined' ? SpfEngine.load() : Promise.resolve())
  ]);

  console.log(`[GLOW UP] Catalogue chargé : ${AppState.products.catalog.length} produits actifs`);

  // 2. Auth Firebase
  if (typeof Auth !== 'undefined') Auth.init();
  updateAuthUI(); // Afficher le bouton immédiatement, même sans Firebase

  // 3. Profil — restaurer si existant, sinon reset questionnaire
  const _profileRestored = typeof RoutineSaver !== 'undefined' && RoutineSaver.restoreProfile();
  if (!_profileRestored) {
    Questionnaire.reset(); // Nouveau visiteur : questionnaire vierge
  } else {
    RoutineSaver.showResumeBanner(); // Visiteur connu : bannière de reprise
  }

  // 4. (listeners déjà attachés en step 0)

  // 5. Affichage écran home
  showScreen('home');

  // 6. Rendu grille featured sur home
  renderFeaturedHome();

  // 7. Bannière de reprise si une routine est sauvegardée
  if (typeof RoutineSaver !== 'undefined') RoutineSaver.showResumeBanner();

  // 8. Retour depuis Stripe Checkout
  if (typeof Subscription !== 'undefined') Subscription.handleCheckoutReturn();
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
  const { category: cat, brand } = AppState.products.filters;
  let list;
  if (cat === 'all')           list = AppState.products.catalog;
  else if (cat === 'featured') list = AppState.products.catalog.filter(p => p.isFeatured);
  else if (cat === 'h2o')      list = AppState.products.catalog.filter(p => p.badge === 'h2o');
  else if (cat === 'vitc')     list = AppState.products.catalog.filter(p => p.badge === 'vitc' || p.badge === 'vitc-spf');
  else                         list = AppState.products.catalog.filter(p => p.category === cat);
  if (brand !== 'all')         list = list.filter(p => p.brand === brand);
  grid.innerHTML = list.length
    ? list.map(p => ProductCatalog.renderCard(p)).join('')
    : '<p class="empty-state">Aucun produit dans cette sélection.</p>';
}

function renderShopBrands() {
  const container = document.getElementById('shopBrandBar');
  if (!container) return;
  const brands = [...new Set(AppState.products.catalog.map(p => p.brand).filter(Boolean))].sort();
  const currentBrand = AppState.products.filters.brand;
  container.innerHTML =
    `<button class="brand-pill${currentBrand === 'all' ? ' active' : ''}" data-brand="all" onclick="filterShopBrand('all')">Toutes</button>` +
    brands.map(b =>
      `<button class="brand-pill${currentBrand === b ? ' active' : ''}" data-brand="${b.replace(/"/g,'&quot;')}" onclick="filterShopBrand(${JSON.stringify(b)})">${b}</button>`
    ).join('');
}

function filterShop(cat) {
  AppState.products.filters.category = cat;
  document.querySelectorAll('[data-cat]').forEach(t =>
    t.classList.toggle('active', t.dataset.cat === cat));
  renderCatExplainer(cat);
  renderShop();
}

function filterShopBrand(brand) {
  AppState.products.filters.brand = brand;
  document.querySelectorAll('.brand-pill').forEach(t =>
    t.classList.toggle('active', t.dataset.brand === brand));
  renderShop();
}

function toggleSidebarGroup(id) {
  document.getElementById(id)?.classList.toggle('collapsed');
}

function toggleShopSidebar() {
  document.getElementById('shopSidebarBody')?.classList.toggle('open');
}

// ─── Bannière explicative par catégorie ───────────────────────
const CAT_EXPLAINERS = {
  serum: `
    <div class="cat-explainer serum-explainer">
      <div class="cat-explainer-header">
        <span class="cat-explainer-title">⚡ Sérum Vitamine C — Comprends l'essentiel</span>
      </div>
      <div class="radical-flow">
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float">☀️</span>
          <span class="radical-label">Soleil</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float" style="animation-delay:.3s">🏙️</span>
          <span class="radical-label">Pollution</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float" style="animation-delay:.6s">😤</span>
          <span class="radical-label">Stress</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-molecule">
          <span class="radical-emoji anim-pulse">💥</span>
          <span class="radical-label">Radicaux libres</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-damage">
          <span class="radical-emoji anim-shake">🧬</span>
          <span class="radical-label">Vieillissement</span>
        </div>
      </div>
      <div class="radical-solution">
        <span class="radical-emoji anim-glow">🛡️</span>
        <div>
          <strong>La Vitamine C neutralise !</strong>
          <p>Elle capture les radicaux libres avant qu'ils n'endommagent tes cellules et illumine le teint ✨</p>
        </div>
      </div>
      <p class="radical-detail">Les <strong>radicaux libres</strong> sont des molécules instables générées par le soleil, la pollution et le stress. Elles volent des électrons aux cellules de ta peau, accélèrent le vieillissement et ternissent le teint. La Vitamine C les neutralise en les stabilisant — ta peau reste protégée, lumineuse et jeune.</p>
    </div>`,

  cleanser: `
    <div class="cat-explainer cleanser-explainer">
      <div class="cat-explainer-header">
        <span class="cat-explainer-title">🫧 Démaquillant — Le conseil des dermatologues</span>
      </div>
      <div class="radical-flow">
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float">💄</span>
          <span class="radical-label">Maquillage</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float" style="animation-delay:.3s">🌫️</span>
          <span class="radical-label">Sébum & pollution</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float" style="animation-delay:.6s">🦠</span>
          <span class="radical-label">Impuretés</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-molecule">
          <span class="radical-emoji anim-pulse">🫧</span>
          <span class="radical-label">Démaquillage doux</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-damage">
          <span class="radical-emoji anim-glow">✨</span>
          <span class="radical-label">Barrière intacte</span>
        </div>
      </div>
      <p class="radical-detail">
        Les dermatologues recommandent d'utiliser un <strong>démaquillant doux</strong>, <strong>non comédogène</strong> et <strong>sans alcool ni parfum</strong>, afin de respecter la <strong>barrière cutanée</strong>, surtout pour les <strong>peaux sensibles</strong>.
        Les <strong>eaux micellaires</strong>, <strong>huiles nettoyantes légères</strong> ou <strong>baumes démaquillants</strong> sont souvent conseillés car ils éliminent efficacement <strong>maquillage, sébum et pollution</strong> sans agresser la peau.
        Un <strong>démaquillage quotidien</strong>, suivi d'un <strong>nettoyant doux</strong>, est essentiel pour maintenir une <strong>bonne hygiène de la peau</strong> et prévenir les <strong>irritations ou les imperfections</strong>.
      </p>
    </div>`,

  spf: `
    <div class="cat-explainer spf-explainer">
      <div class="cat-explainer-header">
        <span class="cat-explainer-title">☀️ Protection Solaire — Le soin anti-âge n°1</span>
      </div>
      <div class="radical-flow">
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float">☀️</span>
          <span class="radical-label">UVA (rides)</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float" style="animation-delay:.4s">🔆</span>
          <span class="radical-label">UVB (coups de soleil)</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-molecule">
          <span class="radical-emoji anim-pulse">🛡️</span>
          <span class="radical-label">SPF 30 / 50</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-damage">
          <span class="radical-emoji anim-glow">💆‍♀️</span>
          <span class="radical-label">Peau protégée</span>
        </div>
      </div>
      <p class="radical-detail">Le SPF est l'investissement beauté le plus rentable : il prévient 80% du vieillissement cutané lié au soleil. UVA = rides & taches, UVB = coups de soleil. SPF30 bloque 97% des UVB, SPF50 bloque 98%. À appliquer <strong>chaque matin</strong>, par tous les temps.</p>
    </div>`,

  lipbalm: `
    <div class="cat-explainer lipbalm-explainer">
      <div class="cat-explainer-header">
        <span class="cat-explainer-icon">💋</span>
        <div>
          <h3>Baume à Lèvres</h3>
          <p>La zone la plus vulnérable de ton visage — et la plus négligée</p>
        </div>
      </div>
      <div class="radical-flow">
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float">🌬️</span>
          <span class="radical-label">Froid & vent</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-pulse">☀️</span>
          <span class="radical-label">UV (sans mélanine)</span>
        </div>
        <div class="radical-aggressor">
          <span class="radical-emoji anim-shake">💧</span>
          <span class="radical-label">Déshydratation</span>
        </div>
        <div class="radical-solution">
          <span class="radical-emoji anim-glow">🫧</span>
          <span class="radical-label">Baume réparateur</span>
        </div>
      </div>
      <p class="radical-detail">Les lèvres n'ont <strong>ni mélanine protectrice, ni glandes sébacées</strong> — elles sont 4× plus exposées au dessèchement que le reste du visage. Un baume à la Cire d'Abeille (Cera Alba) ou au Karité (Butyrospermum Parkii) appliqué matin et soir répare et prévient les gerçures. Bonus : certains avec SPF 15 protègent aussi des UV.</p>
    </div>`,

  nightmask: `
    <div class="cat-explainer nightmask-explainer">
      <div class="cat-explainer-header">
        <span class="cat-explainer-title">🌙 Masque de Nuit — Répare pendant que tu dors</span>
      </div>
      <div class="radical-flow">
        <div class="radical-aggressor">
          <span class="radical-emoji anim-float">🌙</span>
          <span class="radical-label">Nuit</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-molecule">
          <span class="radical-emoji anim-pulse">✨</span>
          <span class="radical-label">Actifs nocturnes</span>
        </div>
        <div class="radical-arrow">→</div>
        <div class="radical-damage">
          <span class="radical-emoji anim-glow">💎</span>
          <span class="radical-label">Glass Skin au réveil</span>
        </div>
      </div>
      <p class="radical-detail">La nuit, la peau entre en <strong>mode régénération</strong> : le renouvellement cellulaire est multiplié par 3, le flux sanguin augmente et la barrière cutanée se répare. Le masque de nuit forme un <strong>film occlusif léger</strong> qui amplifie la pénétration des actifs (Collagène, Acide Hyaluronique, Peptides) et prévient la <strong>perte insensible en eau (TEWL)</strong>. Résultat au réveil : peau repulpée, élastique et lumineuse — l'effet <em>Glass Skin</em> coréen.</p>
    </div>`
};

function renderCatExplainer(cat) {
  const el = document.getElementById('catExplainer');
  if (!el) return;
  el.innerHTML = CAT_EXPLAINERS[cat] || '';
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

// ─── Navigation capture → analyse ou questionnaire ────────────
async function handleCaptureNext() {
  if (!AppState.face.photo) {
    showToast('Une photo est nécessaire pour personnaliser ta routine ✦', 'info', 3500);
    return;
  }

  if (sessionStorage.getItem('glow_resume_questionnaire') === '1') {
    sessionStorage.removeItem('glow_resume_questionnaire');
    // Mode questionnaire skincare → analyse silencieuse, pas d'écran intermédiaire
    AppState.face.skinAnalysis = null;
    try {
      if (typeof SkinAnalysis !== 'undefined') {
        const result = await SkinAnalysis.analyzeFromPhoto(AppState.face.photo);
        if (result) AppState.face.skinAnalysis = result;
      }
    } catch {}
    showScreen('questionnaire');
    if (typeof Questionnaire !== 'undefined') Questionnaire.resumeFromPhoto();
    return;
  }

  AppState.face.skinAnalysis = null;
  showScreen('skin-analysis');
}

// ─── Passer la photo depuis la capture (bouton skip) ──────────
function _captureSkip() {
  if (sessionStorage.getItem('glow_resume_questionnaire') === '1') {
    sessionStorage.removeItem('glow_resume_questionnaire');
    showScreen('questionnaire');
    setTimeout(() => Questionnaire.skipPhoto(), 50);
  } else {
    Questionnaire.startSkincare();
  }
}

// ─── Lancer le flow principal ─────────────────────────────────
// Bouton home "Faire mon analyse" → écran de choix skincare/makeup
function startGlowUp() {
  if (AppState.user?.isGuest) {
    Auth.openRequiredAuthModal(() => showScreen('routine-choice'));
    return;
  }
  showScreen('routine-choice');
}

// Navbar "Skincare" → questionnaire skincare directement
function goToSkincare() {
  if (AppState.user?.isGuest) {
    Auth.openRequiredAuthModal(() => _proceedToSkincare());
    return;
  }
  _proceedToSkincare();
}

function _proceedToSkincare() {
  const plan        = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
  const freeChoice  = AppState.user?.freeRoutineChoice;

  // Choix gratuit persisté = makeup → skincare verrouillée
  if (plan === 'free' && freeChoice === 'makeup') {
    Subscription.showPaywall('routine_second');
    return;
  }
  // Compat ancien comportement (session courante sans Firestore)
  if (plan === 'free' && !freeChoice && AppState.routineChoice === 'makeup') {
    Subscription.showPaywall('routine_second');
    return;
  }
  AppState.routineChoice = 'skincare';
  // Routine déjà enregistrée → proposer de la reprendre ou d'en générer une nouvelle
  if (typeof RoutineSaver !== 'undefined' && RoutineSaver.hasSavedRoutine('skincare')) {
    _routineResumeModal('skincare');
    return;
  }
  Questionnaire.startSkincare();
}

// Modal : reprendre la routine enregistrée ou en générer une nouvelle
function _routineResumeModal(type) {
  const label = type === 'skincare' ? 'skincare' : 'make-up';
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <div class="routine-resume-modal">
      <div class="rr-icon">✨</div>
      <h2 class="rr-title">Votre routine ${label}<br>est déjà enregistrée</h2>
      <p class="rr-sub">Que souhaitez-vous faire ?</p>
      <button class="btn-orange-cta rr-btn" onclick="closeModal(); RoutineSaver.resumeSaved('${type}')">
        🧡 Reprendre ma routine actuelle
      </button>
      <button class="btn btn-outline rr-btn" onclick="_newRoutineModal('${type}')">
        ✨ Générer une nouvelle routine
      </button>
    </div>`);
}

// Modal : nouvelle routine → refaire l'analyse ou mettre à jour les besoins
function _newRoutineModal(type) {
  // Compte gratuit ayant déjà généré sa routine → paywall (routines illimitées)
  if (typeof Subscription !== 'undefined' && !Subscription.canGenerateRoutine()) {
    closeModal();
    Subscription.showRoutineLimit();
    return;
  }
  AppState.routineChoice = type;
  const redoFn   = type === 'skincare' ? 'Questionnaire.startSkincare(false)' : 'Questionnaire.startMakeup(false)';
  const updateFn = type === 'skincare' ? 'Questionnaire.startSkincare(true)'  : 'Questionnaire.startMakeup(true)';
  const hasAnalysis = !!AppState?.face?.skinAnalysis;
  openModal(`
    <button class="modal-close" onclick="closeModal()">×</button>
    <div class="routine-resume-modal">
      <div class="rr-icon">✨</div>
      <h2 class="rr-title">Générer une nouvelle<br>routine ${type === 'skincare' ? 'skincare' : 'make-up'}</h2>
      <p class="rr-sub">Comment veux-tu repartir ?</p>
      <button class="btn-orange-cta rr-btn" onclick="closeModal(); ${redoFn}">
        📸 Refaire mon analyse photo
      </button>
      ${hasAnalysis ? `
      <button class="btn btn-outline rr-btn" onclick="closeModal(); ${updateFn}">
        ✏️ Mettre à jour mes besoins
      </button>` : ''}
    </div>`);
}

// Navbar "Make-up" → questionnaire makeup directement
function goToMakeup() {
  if (AppState.user?.isGuest) {
    Auth.openRequiredAuthModal(() => _proceedToMakeup());
    return;
  }
  _proceedToMakeup();
}

function _proceedToMakeup() {
  const plan        = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
  const freeChoice  = AppState.user?.freeRoutineChoice;

  // Choix gratuit persisté = skincare → makeup verrouillée
  if (plan === 'free' && freeChoice === 'skincare') {
    Subscription.showPaywall('routine_second');
    return;
  }
  if (plan === 'free' && !freeChoice && AppState.routineChoice === 'skincare') {
    Subscription.showPaywall('routine_second');
    return;
  }
  AppState.routineChoice = 'makeup';
  // Routine make-up déjà enregistrée → proposer reprise ou nouvelle
  if (typeof RoutineSaver !== 'undefined' && RoutineSaver.hasSavedRoutine('makeup')) {
    _routineResumeModal('makeup');
    return;
  }
  Questionnaire.startMakeup();
}

// ─── Écran de choix de routine ────────────────────────────────
function initRoutineChoiceScreen() {
  const choice   = AppState.routineChoice;
  const isLocked = typeof Subscription !== 'undefined' ? !Subscription.isPlan('glow') : true;

  const lockSkincare = document.getElementById('lockSkincare');
  const lockMakeup   = document.getElementById('lockMakeup');
  const note         = document.getElementById('routineChoiceNote');
  const cardSkincare = document.getElementById('choiceCardSkincare');
  const cardMakeup   = document.getElementById('choiceCardMakeup');

  if (!lockSkincare) return;

  // Réinitialiser l'état visuel
  [lockSkincare, lockMakeup].forEach(el => el.style.display = 'none');
  [cardSkincare, cardMakeup].forEach(el => el.classList.remove('choice-card--locked', 'choice-card--selected'));
  if (note) note.style.display = 'none';

  // Si un choix a déjà été fait et que premium est verrouillé
  if (choice && isLocked) {
    const lockEl  = choice === 'skincare' ? lockMakeup   : lockSkincare;
    const lockCard= choice === 'skincare' ? cardMakeup   : cardSkincare;
    const freeCard= choice === 'skincare' ? cardSkincare : cardMakeup;
    lockEl.style.display = 'flex';
    lockCard.classList.add('choice-card--locked');
    freeCard.classList.add('choice-card--selected');
    if (note) note.style.display = 'block';
  }
}

async function _saveFreeRoutineChoice(choice) {
  if (!AppState.user?.uid || typeof firebase === 'undefined') return;
  try {
    AppState.user.freeRoutineChoice = choice;
    const db = firebase.firestore();
    await db.collection('users').doc(AppState.user.uid).set(
      { subscription: { freeRoutineChoice: choice } },
      { merge: true }
    );
    console.log('[RoutineChoice] Choix sauvegardé:', choice);
  } catch (e) {
    console.warn('[RoutineChoice] Erreur save:', e.message);
  }
}

function pickRoutine(type) {
  const plan     = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
  const isLocked = !Subscription.isPlan('glow');
  const freeChoice = AppState.user?.freeRoutineChoice;

  // Choix persisté différent → paywall
  if (plan === 'free' && freeChoice && freeChoice !== type) {
    Subscription.showPaywall('routine_second');
    return;
  }
  // Session courante — autre choix déjà fait
  if (AppState.routineChoice && AppState.routineChoice !== type && isLocked) {
    Subscription.showPaywall('routine_second');
    return;
  }

  AppState.routineChoice = type;

  // Sauvegarder le choix gratuit dans Firestore (une seule fois)
  if (plan === 'free' && !freeChoice && AppState.user?.uid) {
    _saveFreeRoutineChoice(type);
  }

  if (type === 'skincare') {
    Questionnaire.startSkincare();
  } else {
    Questionnaire.startMakeup();
  }
}

// ─── Skin Journey — accès abonnés ─────────────────────────────
function goToSkinJourney() {
  if (!AppState.user || AppState.user.isGuest) {
    Auth.openRequiredAuthModal(() => goToSkinJourney());
    return;
  }
  const plan = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
  if (plan !== 'glow' && plan !== 'glowplus') {
    Subscription.showPaywall('routine_second');
    return;
  }
  // Vérifier si au moins 2 analyses disponibles
  try {
    const data = JSON.parse(localStorage.getItem('glowup_journey_v1') || 'null');
    const analyses = data?.analyses || [];
    if (analyses.length < 2 && !data) {
      // Pas encore de Journey démarré → lancer normalement
      showScreen('journey');
      return;
    }
    if (analyses.length < 2) {
      showToast('Votre Skin Journey commencera après votre prochaine analyse.', 'info', 4000);
      return;
    }
  } catch {}
  showScreen('journey');
}

// ─── Paywall ──────────────────────────────────────────────────
function openPaywallModal() {
  if (typeof Subscription !== 'undefined') Subscription.showPaywall('routine_second');
}

document.addEventListener('DOMContentLoaded', initApp);
