/* ============================================================
   subscription.js — Gestion des abonnements GLOW UP
   Plans : free / glow / glowplus
   ============================================================ */

'use strict';

const Subscription = (() => {

  // ─── Tarifs 2026 (source unique de vérité pour l'affichage) ──
  // L'annuel est mis en avant comme l'offre la plus avantageuse.
  const PRICING = {
    premium: {
      label: 'Glow Up Premium',
      monthly: '4,99', yearly: '39,99', yearlyPerMonth: '3,33', save: '33%',
      keyMonthly: 'premium_monthly', keyYearly: 'premium_yearly'
    },
    coach: {
      label: 'Glow Up Coach',
      monthly: '15,99', yearly: '149,99', yearlyPerMonth: '12,50', save: '22%',
      keyMonthly: 'coach_monthly', keyYearly: 'coach_yearly'
    }
  };

  // ─── Plan courant ─────────────────────────────────────────────
  function getPlan() {
    return AppState?.user?.plan || 'free';
  }

  function isPlan(plan) {
    const current = getPlan();
    if (plan === 'free')     return true;
    if (plan === 'glow')     return current === 'glow' || current === 'glowplus';
    if (plan === 'glowplus') return current === 'glowplus';
    return false;
  }

  // ─── Emails admin — accès glowplus complet pour les tests ───────
  const ADMIN_EMAILS = ['candice_arav@hotmail.com'];

  // ─── Charger le plan depuis Firestore ─────────────────────────
  async function loadPlan(uid) {
    if (!uid || typeof firebase === 'undefined') return;

    if (ADMIN_EMAILS.includes(AppState?.user?.email)) {
      AppState.user.plan = 'glowplus';
      console.log('[Subscription] Admin override → glowplus');
      updateGatingUI();
      _refreshCurrentScreen();
      return;
    }

    try {
      if (!firebase.apps.length) return;
      const db   = firebase.firestore();
      const doc  = await db.collection('users').doc(uid).get();
      const sub  = doc.data()?.subscription || {};
      const plan = sub.plan || 'free';
      AppState.user.plan = plan;

      // Charger le choix de routine gratuite — effacé si abonné
      AppState.user.freeRoutineChoice = (plan === 'free') ? (sub.freeRoutineChoice || null) : null;
      AppState.user.freeRoutineUsed   = (plan === 'free') ? !!sub.freeRoutineUsed : false;
      // Synchroniser le flag local (cross-device) si déjà utilisé côté cloud
      if (AppState.user.freeRoutineUsed) { try { localStorage.setItem(_routineFlagKey(), '1'); } catch {} }
      // Compteur mensuel de routines (Premium) — cross-device
      AppState.user.routineMonth = sub.routineMonth || null;
      if (AppState.user.routineMonth) { try { localStorage.setItem(_routineMonthKey(), JSON.stringify(AppState.user.routineMonth)); } catch {} }

      console.log('[Subscription] Plan chargé:', plan, '| freeRoutineChoice:', AppState.user.freeRoutineChoice);
      updateGatingUI();
      _refreshCurrentScreen();
    } catch (e) {
      console.warn('[Subscription] loadPlan:', e.message);
    }
  }

  // ─── Compteur fondatrices (approximatif côté client) ──────────
  // 100 spots max · deadline 30 juin 2026
  const FOUNDERS_DEADLINE = new Date('2026-06-30T23:59:59');
  const FOUNDERS_MAX      = 100;
  let _foundersCount  = null;
  let _foundersLoaded = false;

  async function loadFoundersData() {
    if (_foundersLoaded) return;
    try {
      if (typeof firebase === 'undefined' || !firebase.apps.length) return;
      const db  = firebase.firestore();
      const doc = await db.collection('config').doc('stats').get();
      _foundersCount = doc.data()?.foundersCount ?? 0;
    } catch { _foundersCount = 0; }
    _foundersLoaded = true;
  }

  function _foundersEligible() {
    const withinDate = Date.now() < FOUNDERS_DEADLINE.getTime();
    const hasSpots   = _foundersCount === null || _foundersCount < FOUNDERS_MAX;
    return withinDate && hasSpots;
  }

  function _spotsLeft() {
    if (_foundersCount === null) return null;
    return Math.max(0, FOUNDERS_MAX - _foundersCount);
  }

  // ─── Quotas de génération de routine ─────────────────────────
  // Free = 1 routine au total · Premium = 3 routines / mois · Coach = illimité.
  const PREMIUM_MONTHLY_LIMIT = 3;

  function _routineFlagKey() {
    const uid = AppState?.user?.uid;
    return uid ? `glow_routine_done_${uid}` : 'glow_routine_done';
  }
  function _routineMonthKey() {
    const uid = AppState?.user?.uid;
    return uid ? `glow_routine_month_${uid}` : 'glow_routine_month';
  }
  function _monthStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function hasUsedFreeRoutine() {
    if (AppState?.user?.freeRoutineUsed) return true;
    try { return localStorage.getItem(_routineFlagKey()) === '1'; } catch { return false; }
  }
  // Nombre de routines générées ce mois-ci (Premium)
  function _monthCount() {
    let rec = AppState?.user?.routineMonth;
    if (!rec) { try { rec = JSON.parse(localStorage.getItem(_routineMonthKey()) || 'null'); } catch {} }
    if (!rec || rec.month !== _monthStr()) return 0;   // nouveau mois → compteur remis à 0
    return rec.count || 0;
  }
  function _setMonthCount(n) {
    const rec = { month: _monthStr(), count: n };
    if (AppState?.user) AppState.user.routineMonth = rec;
    try { localStorage.setItem(_routineMonthKey(), JSON.stringify(rec)); } catch {}
    const uid = AppState?.user?.uid;
    if (uid && typeof firebase !== 'undefined' && firebase.apps?.length) {
      try { firebase.firestore().collection('users').doc(uid).set({ subscription: { routineMonth: rec } }, { merge: true }); } catch {}
    }
  }
  function routinesLeftThisMonth() {
    return Math.max(0, PREMIUM_MONTHLY_LIMIT - _monthCount());
  }
  function canGenerateRoutine() {
    const plan = getPlan();
    if (plan === 'glowplus') return true;                         // Coach : illimité
    if (plan === 'glow')     return _monthCount() < PREMIUM_MONTHLY_LIMIT; // Premium : 3/mois
    return !hasUsedFreeRoutine();                                 // Free : 1 au total
  }
  function markRoutineGenerated() {
    const plan = getPlan();
    if (plan === 'glowplus') return;                              // Coach : rien à compter
    if (plan === 'glow') { _setMonthCount(_monthCount() + 1); return; } // Premium : +1 ce mois
    // Free : marquer la routine unique consommée
    try { localStorage.setItem(_routineFlagKey(), '1'); } catch {}
    if (AppState?.user) AppState.user.freeRoutineUsed = true;
    const uid = AppState?.user?.uid;
    if (uid && typeof firebase !== 'undefined' && firebase.apps?.length) {
      try {
        firebase.firestore().collection('users').doc(uid)
          .set({ subscription: { freeRoutineUsed: true } }, { merge: true });
      } catch {}
    }
  }

  // Affiche le bon blocage selon le plan (free → Premium · Premium → Coach)
  function showRoutineLimit() {
    if (getPlan() === 'glow') {
      const html = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div class="paywall-lux">
          <div class="paywall-lux-icon">✦</div>
          <div class="paywall-lux-tag">Limite mensuelle atteinte</div>
          <h2 class="paywall-lux-title">Tes 3 routines du mois<br>sont utilisées ✦</h2>
          <p class="paywall-lux-desc">Ton forfait Premium inclut 3 routines par mois. Ton compteur se réinitialise le mois prochain — ou passe à Glow Up Coach pour des routines <strong>illimitées</strong>.</p>
          <div class="paywall-lux-card">
            <div class="paywall-lux-plan-name">${PRICING.coach.label}</div>
            <div class="paywall-billing-best">✦ Routines illimitées + coach beauté IA</div>
            <div class="paywall-price-wrap"><span class="paywall-price-new">${PRICING.coach.yearly}€</span><span class="paywall-price-period">/an</span></div>
            <p class="paywall-price-permonth">soit ${PRICING.coach.yearlyPerMonth} €/mois · ou ${PRICING.coach.monthly} €/mois</p>
            <button class="btn btn-dark full-width paywall-lux-btn" onclick="Subscription.openCheckout('${PRICING.coach.keyYearly}'); closeModal();">Passer à Glow Up Coach ✦</button>
          </div>
          <button class="btn-ghost paywall-lux-skip" onclick="closeModal()">Je reviens le mois prochain →</button>
        </div>`;
      openModal(html);
    } else {
      showPaywall('routine_regenerate');   // free → upsell Premium
    }
  }

  // ─── Vérifier accès à une fonctionnalité ─────────────────────
  function canAccess(feature) {
    const plan = getPlan();
    const rules = {
      'routine_second':       plan === 'glow' || plan === 'glowplus',
      'skinpedia_ai':         plan === 'glow' || plan === 'glowplus',
      'recommendations_adv':  plan === 'glow' || plan === 'glowplus',
      'coach':                plan === 'glowplus'
    };
    return rules[feature] ?? true;
  }

  // ─── Ouvrir Stripe Checkout ───────────────────────────────────
  async function openCheckout(priceKey) {
    const uid   = AppState?.user?.uid;
    const email = AppState?.user?.email;

    if (!uid) {
      if (typeof Auth !== 'undefined') Auth.openAuthModal();
      return;
    }

    showToast('Redirection vers le paiement…', 'info', 2000);

    try {
      const res = await fetch('/api/createCheckout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceKey, uid, email })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast('Erreur lors de la création du paiement', 'error');
      }
    } catch (err) {
      showToast('Erreur de connexion', 'error');
    }
  }

  // ─── Modal paywall ────────────────────────────────────────────
  function showPaywall(feature) {
    const CFG = {
      routine_second:      { tier:'premium', tag:'Offre complète',      title:'Ta deuxième routine<br>t\'attend.',    desc:'Skincare + Make-up · Profil cross-device · Historique de ta peau' },
      routine_regenerate:  { tier:'premium', tag:'Plus de routines', title:'Envie d\'une nouvelle<br>routine ?',   desc:'Ta 1ʳᵉ routine est offerte. Avec Premium, génère jusqu\'à 3 routines par mois — à chaque changement de peau, de saison ou d\'envie.' },
      skinpedia_ai:        { tier:'premium', tag:'Skinpedia IA',        title:'L\'analyse IA de tes<br>ingrédients.', desc:'Comprends chaque actif selon ton profil peau unique.' },
      recommendations_adv: { tier:'premium', tag:'Recommandations',     title:'Des produits encore<br>plus ciblés.',  desc:'Sélection avancée selon ton analyse, ta carnation et tes préférences.' },
      coach:               { tier:'coach',   tag:'Glow Up Coach',       title:'La seule vendeuse<br>beauté qui te connaît.', desc:'Elle connaît déjà ton profil, ta routine et ton budget. Disponible à tout moment.' }
    };
    const cfg = CFG[feature] || CFG.routine_second;
    const p   = PRICING[cfg.tier];
    const isCoach = cfg.tier === 'coach';

    const saveBadge = p.save ? `<span class="paywall-save-badge">−${p.save}</span>` : '';
    const perMonth  = p.yearlyPerMonth ? `<p class="paywall-price-permonth">soit ${p.yearlyPerMonth} €/mois · sans engagement</p>` : '';

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="paywall-lux">
        <div class="paywall-lux-icon">✦</div>
        <div class="paywall-lux-tag">${cfg.tag}</div>
        <h2 class="paywall-lux-title">${cfg.title}</h2>
        <p class="paywall-lux-desc">${cfg.desc}</p>
        <div class="paywall-lux-card">
          <div class="paywall-lux-plan-name">${p.label}</div>
          <div class="paywall-billing-best">✦ Formule annuelle — la plus avantageuse ${saveBadge}</div>
          <div class="paywall-price-wrap">
            <span class="paywall-price-new">${p.yearly}€</span>
            <span class="paywall-price-period">/an</span>
          </div>
          ${perMonth}
          <button class="btn btn-dark full-width paywall-lux-btn" onclick="Subscription.openCheckout('${p.keyYearly}'); closeModal();">
            ${isCoach ? 'Accéder au Coach · Annuel ✦' : 'Choisir l\'annuel ✦'}
          </button>
          <button class="btn-ghost paywall-monthly-alt" onclick="Subscription.openCheckout('${p.keyMonthly}'); closeModal();">
            ou ${p.monthly} €/mois →
          </button>
        </div>
        ${isCoach ? `
        <div class="paywall-coach-perks">
          <span>✨ Échanges illimités avec ton coach beauté</span>
          <span>✨ Glow Up connaît déjà ta peau, tes habitudes, ton budget</span>
          <span>🎁 Programme Ambassadrice · gagne 2 € par filleul validé</span>
        </div>` : ''}
        ${!isCoach ? `<button class="btn-ghost paywall-see-all" onclick="closeModal(); showScreen('premium');">Voir tous les avantages de Glow Up Premium →</button>` : ''}
        <p class="paywall-lux-fine">Annulable à tout moment</p>
        <button class="btn-ghost paywall-lux-skip" onclick="closeModal()">Continuer avec Free →</button>
      </div>`;
    openModal(html);
  }

  // ─── Re-render l'écran courant après chargement du plan ──────
  // Évite que la page résultats/makeup affiche des offres si le plan
  // arrive après le premier rendu (timing async)
  function _refreshCurrentScreen() {
    const screen = AppState?.screen;
    if (screen === 'results' && typeof RoutineRenderer !== 'undefined') {
      RoutineRenderer.renderResults();
    } else if (screen === 'makeup' && typeof MakeupRoutine !== 'undefined') {
      MakeupRoutine.initScreen();
    }
  }

  // ─── Gating UI (verrouiller visuellement les éléments) ────────
  function updateGatingUI() {
    const plan = getPlan();
    const isSubscriber = plan === 'glow' || plan === 'glowplus';

    // Bouton Coach
    const coachBtn = document.querySelector('[data-feature="coach"]');
    if (coachBtn) coachBtn.classList.toggle('locked', !canAccess('coach'));

    // Skin Journey — visible dans la nav uniquement pour les abonnés
    const sjNav = document.getElementById('navSkinJourney');
    if (sjNav) sjNav.style.display = isSubscriber ? '' : 'none';
  }

  // ─── Gérer le retour de Stripe Checkout ──────────────────────
  function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      showToast('Abonnement activé ! Bienvenue dans Glow ✦', 'success', 5000);
      window.history.replaceState({}, '', window.location.pathname);
      // Recharger le plan depuis Firestore
      const uid = AppState?.user?.uid;
      if (uid) setTimeout(() => loadPlan(uid), 2000);
    }
    if (params.get('checkout') === 'cancel') {
      showToast('Paiement annulé', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // ─── Page abonnements ─────────────────────────────────────────
  function renderPlansPage() {
    const container = document.getElementById('plansContent');
    if (!container) return;

    const plan = getPlan();
    const P = PRICING.premium, C = PRICING.coach;

    // Bloc prix : annuel mis en avant + mensuel en secondaire
    const priceBlock = (t, save, perMonth) => `
      <div class="plan-lux-price">
        <span class="plan-lux-price-main">${t.yearly}€</span>
        <span class="plan-lux-price-per">/an</span>
        ${save ? `<span class="plan-lux-save">−${save}</span>` : ''}
      </div>
      ${perMonth ? `<p class="plan-lux-permonth">soit ${perMonth} €/mois</p>` : ''}
      <p class="plan-lux-monthly-alt">ou ${t.monthly} €/mois</p>`;

    const premiumCTA = (plan === 'glow' || plan === 'glowplus')
      ? (plan === 'glow' ? '<div class="plan-lux-active">Ton offre actuelle ✦</div>' : '')
      : `<button class="btn btn-dark full-width" onclick="Subscription.openCheckout('${P.keyYearly}')">Choisir l'annuel ✦</button>
         <button class="btn-ghost plan-lux-monthly-btn" onclick="Subscription.openCheckout('${P.keyMonthly}')">Prendre au mois · ${P.monthly} €/mois</button>`;

    const coachCTA = plan === 'glowplus'
      ? '<div class="plan-lux-active">Ton offre actuelle ✦</div>'
      : `<button class="btn btn-dark full-width" onclick="Subscription.openCheckout('${C.keyYearly}')">Accéder au Coach · Annuel ✦</button>
         <button class="btn-ghost plan-lux-monthly-btn" onclick="Subscription.openCheckout('${C.keyMonthly}')">Prendre au mois · ${C.monthly} €/mois</button>`;

    container.innerHTML = `
      <div class="plans-page-lux">

        <div class="plans-hero-lux">
          <span class="plans-hero-tag">✦ Glow Up</span>
          <h1 class="plans-hero-title">Tes routines,<br><em>au complet.</em></h1>
          <p class="plans-hero-sub">Commence gratuitement. Développe ton expertise beauté à ton rythme.</p>
          <div class="plans-annual-hint">💛 Le tarif annuel est le plus avantageux</div>
        </div>

        <div class="plans-grid-lux">

          <div class="plan-lux ${plan === 'free' ? 'plan-lux--active' : ''}">
            <div class="plan-lux-name">Essentiel</div>
            <div class="plan-lux-price"><span class="plan-lux-price-main">Gratuit</span></div>
            <p class="plan-lux-tagline">Pour découvrir</p>
            <ul class="plan-lux-features">
              <li>1 routine sur-mesure</li>
              <li>Analyse beauté IA offerte</li>
              <li>Catalogue 300+ produits</li>
              <li>Skinpedia dictionnaire</li>
            </ul>
            ${plan === 'free' ? '<div class="plan-lux-active">Ton offre actuelle</div>' : ''}
          </div>

          <div class="plan-lux plan-lux--featured ${plan === 'glow' ? 'plan-lux--active' : ''}">
            ${plan !== 'glow' && plan !== 'glowplus' ? '<div class="plan-lux-badge">Le plus choisi</div>' : ''}
            <div class="plan-lux-name">${P.label}</div>
            ${priceBlock(P, P.save, P.yearlyPerMonth)}
            <ul class="plan-lux-features">
              <li>Routines skincare + make-up illimitées</li>
              <li>Analyse IA + profil cross-device</li>
              <li>Recommandations avancées</li>
              <li>Skinpedia IA</li>
              <li>Historique de ta peau</li>
            </ul>
            ${premiumCTA}
          </div>

          <div class="plan-lux plan-lux--coach ${plan === 'glowplus' ? 'plan-lux--active' : ''}">
            <div class="plan-lux-name">${C.label}</div>
            ${priceBlock(C, C.save, C.yearlyPerMonth)}
            <p class="plan-lux-tagline">La seule vendeuse beauté qui te connaît déjà.</p>
            <ul class="plan-lux-features">
              <li>Tout Premium inclus</li>
              <li>Coach beauté IA personnalisé</li>
              <li>Suivi beauté & résumés de séances</li>
              <li>Profil enrichi & mémoire long terme</li>
              <li>Accès prioritaire aux nouveautés</li>
              <li class="plan-lux-feat-highlight">✨ Programme Ambassadrice · réservé aux membres Coach</li>
            </ul>
            <div class="plan-coach-ambassador">
              <span class="plan-coach-ambassador-gift">🎁</span>
              <span>Deviens Ambassadrice : <strong>2 € de Crédit Beauté</strong> pour chaque amie qui s'abonne grâce à ton lien.</span>
            </div>
            ${coachCTA}
          </div>

        </div>

        <p class="plans-fine-print">Sans engagement · Annulable à tout moment</p>

        <!-- Skin Journey feature card -->
        <div class="sj-feature-card" onclick="Subscription.showSkinJourneyDetail()">
          <div class="sj-feature-icon">✨</div>
          <div class="sj-feature-body">
            <div class="sj-feature-tag">Inclus dans Premium · dès ${P.yearlyPerMonth} €/mois</div>
            <h3 class="sj-feature-title">Skin Journey</h3>
            <p class="sj-feature-desc">Suivez l'évolution de votre peau dans le temps.</p>
          </div>
          <span class="sj-feature-arrow">›</span>
        </div>

      </div>`;
  }

  // ─── Skin Journey — modal de détail ─────────────────────────
  function showSkinJourneyDetail() {
    const plan = getPlan();
    const isSubscriber = plan === 'glow' || plan === 'glowplus';
    const cta = isSubscriber
      ? `<button class="btn-orange-cta" onclick="showScreen('journey'); closeModal()">Ouvrir mon Skin Journey →</button>`
      : `<button class="btn-orange-cta" onclick="Subscription.showPaywall('routine_second'); closeModal()">Débloquer Premium · ${PRICING.premium.yearly} €/an</button>`;

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="sj-modal">
        <div class="sj-modal-icon">✨</div>
        <div class="sj-modal-tag">Inclus dans Glow Up Premium · dès ${PRICING.premium.yearlyPerMonth} €/mois</div>
        <h2 class="sj-modal-title">Skin Journey</h2>
        <p class="sj-modal-intro">Suivez l'évolution de votre peau au fil du temps grâce à des analyses régulières et comparez vos résultats mois après mois.</p>
        <p class="sj-modal-desc">Skin Journey vous aide à comprendre ce qui fonctionne réellement sur votre peau et à mesurer l'impact de votre routine beauté.</p>
        <ul class="sj-modal-list">
          <li>✔ Historique de vos analyses photo</li>
          <li>✔ Évolution de vos indicateurs peau</li>
          <li>✔ Suivi des résultats de votre routine</li>
          <li>✔ Identification des produits les plus efficaces</li>
          <li>✔ Visualisation de vos progrès dans le temps</li>
        </ul>
        <p class="sj-modal-quote">Parce qu'une belle peau ne se construit pas en un jour, Skin Journey vous permet de suivre votre transformation et d'adapter votre routine en fonction de résultats concrets.</p>
        ${cta}
        ${!isSubscriber ? '<p class="sj-modal-note">Paiement annuel · Annulable à tout moment</p>' : ''}
      </div>`;
    openModal(html);
  }

  // ─── Parrainage — afficher le dashboard ──────────────────────
  async function showReferralDashboard() {
    const uid  = AppState?.user?.uid;
    const plan = getPlan();
    if (!uid || (plan !== 'glowplus')) {
      showPaywall('coach');
      return;
    }
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;

    try {
      const db      = firebase.firestore();
      const userDoc = await db.collection('users').doc(uid).get();
      const ref     = userDoc.data()?.referral || {};
      const code    = ref.code || '—';
      const count   = ref.count || 0;
      const credit  = ref.credit || 0;
      const pendingRewards = ref.pendingRewards || 0;
      const link    = `https://glowupskin.app?ref=${code}`;
      const THRESHOLD = 10;
      const inCycle    = credit % THRESHOLD;            // crédit dans le palier courant
      const remaining  = THRESHOLD - inCycle;           // € restants avant la carte
      const cardsEarned = Math.floor(credit / THRESHOLD);
      const progress    = Math.round((inCycle / THRESHOLD) * 100);

      const shareText = encodeURIComponent(`Je te recommande Glow Up ✨ ma routine beauté personnalisée. Rejoins-moi : ${link}`);

      const couponsHtml = pendingRewards > 0
        ? `<div class="ref-coupons">
             <p class="ref-coupons-label">🎁 Carte${pendingRewards > 1 ? 's' : ''} Cadeau en cours d'envoi</p>
             <p style="font-size:0.82rem;color:var(--muted);margin:0;">Ta carte cadeau Amazon de 10 € arrive très bientôt par email ✨</p>
           </div>`
        : '';

      const html = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div class="ref-modal">
          <div class="ref-modal-icon">🎁</div>
          <h2 class="ref-modal-title">Programme Ambassadrice<br>Glow Up</h2>
          <p class="ref-modal-sub">Recommande Glow Up à tes amies et offre-toi ton prochain produit beauté ✨</p>

          <div class="ref-progress">
            <div class="ref-progress-header">
              <span class="ref-progress-count">${count} amie${count > 1 ? 's' : ''} ont rejoint Glow Up</span>
            </div>
            <div class="ref-bars-track"><div class="ref-bars-fill" style="width:${progress}%"></div></div>
            <p class="ref-progress-note">${remaining > 0 && remaining < THRESHOLD
              ? `Plus que <strong>${remaining} €</strong> pour débloquer ta prochaine Carte Cadeau Beauté de 10 €`
              : `Invite tes amies pour débloquer ta Carte Cadeau Beauté de 10 €`}</p>
            <p class="ref-progress-hint">Chaque filleul validé = <strong>+2 € de Crédit Beauté</strong></p>
          </div>

          ${cardsEarned > 0 ? `<div class="ref-earned">🎉 ${cardsEarned} Carte${cardsEarned > 1 ? 's' : ''} Cadeau Beauté gagnée${cardsEarned > 1 ? 's' : ''} · ${cardsEarned * 10} €</div>` : ''}

          <div class="ref-code-block">
            <p class="ref-code-label">Ton lien Ambassadrice</p>
            <div class="ref-code">${code}</div>
            <p class="ref-link">${link}</p>
            <button class="btn-orange-cta" onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('Lien copié !','success',2000))">
              Inviter mes amies
            </button>
            <a class="ref-share-wa" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener">Partager sur WhatsApp</a>
          </div>

          ${couponsHtml}
        </div>`;
      openModal(html);
    } catch (e) {
      console.warn('[Referral] Dashboard:', e.message);
    }
  }

  // ─── Page vitrine « Tous les avantages de Glow Up Premium » ──
  function _exitPremium() {
    showScreen(AppState.routine?.ruleApplied ? 'results' : 'home');
  }

  // Révélation douce au scroll (animations discrètes)
  function _observeReveal(root) {
    const els = root.querySelectorAll('.pv-reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('pv-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('pv-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }

  function renderPremiumPage() {
    const container = document.getElementById('premiumContent');
    if (!container) return;
    const P     = PRICING.premium;
    const plan  = getPlan();
    const isSub = plan === 'glow' || plan === 'glowplus';

    const CATS = [
      { emoji: '💫', tag: 'Routines personnalisées', items: [
        { i: '🧴', t: 'Skincare + Make-up', d: 'Tes deux routines complètes, pensées pour ton visage.' },
        { i: '🔁', t: 'Jusqu\'à 3 routines / mois', d: 'Régénère ta routine à chaque changement de peau ou d\'envie.' },
        { i: '🎚️', t: 'Minimaliste ou détaillée', d: 'Choisis le niveau : l\'essentiel, ou le rituel complet.' },
        { i: '✨', t: 'Adaptation automatique', d: 'Ta routine évolue selon les résultats observés sur ta peau.' },
      ]},
      { emoji: '📅', tag: 'Suivi de peau · Skin Journey', items: [
        { i: '📈', t: 'Évolution sur 30 jours', d: 'Un vrai suivi, jour après jour, de ta transformation.' },
        { i: '📸', t: 'Avant / Après', d: 'Comparaison photo Jour 1 · 5 · 15 · 30.' },
        { i: '🔬', t: 'Analyse détaillée', d: 'Hydratation, rougeurs, imperfections, éclat, texture, zones sèches, brillance.' },
        { i: '🌡️', t: 'Réactions dans le temps', d: 'On repère ce qui apaise ta peau et ce qui la dérange.' },
        { i: '✅', t: 'Ta routine fonctionne-t-elle ?', d: 'Comprends enfin si ta routine agit vraiment sur ta peau.' },
      ]},
      { emoji: '🗂️', tag: 'Profil beauté & historique', items: [
        { i: '💾', t: 'Profil beauté sauvegardé', d: 'Retrouve tout, à chaque connexion, sur tous tes appareils.' },
        { i: '🧠', t: 'Diagnostic IA enregistré', d: 'Ton analyse de peau conservée et réutilisée.' },
        { i: '🎨', t: 'Profil colorimétrique', d: 'Ta saison et tes couleurs, gardées en mémoire.' },
        { i: '📚', t: 'Historique complet', d: 'Toutes tes routines et analyses de peau passées, accessibles.' },
        { i: '⭐', t: 'Produits qui marchent', d: 'Ce qui fonctionne le mieux — et ce que ta peau tolère ou non.' },
        { i: '🧪', t: 'Ingrédients efficaces / à éviter', d: 'Glow Up mémorise les actifs qui te réussissent et ceux à écarter.' },
      ]},
      { emoji: '⚙️', tag: 'Personnalisation avancée', items: [
        { i: '🚫', t: 'Ingrédients à éviter', d: 'Indique les molécules à bannir : on les exclut de tes routines.' },
        { i: '✍️', t: 'Option « Autre » · champ libre', d: 'Précise tout ce qui compte pour toi, dans tes mots.' },
        { i: '💸', t: 'Alternatives selon budget', d: 'Des variantes moins chères ou premium, selon tes préférences.' },
        { i: '☀️', t: 'Alternatives SPF', d: 'Le bon SPF pour ta peau — et des options de rechange.' },
        { i: '🎯', t: 'Routines adaptées à tes besoins', d: 'Chaque étape est ajustée à ton profil et tes objectifs.' },
      ]},
      { emoji: '💰', tag: 'Économies & recommandations', items: [
        { i: '🔎', t: 'Comparateur de prix', d: 'On compare tout le marché pour que tu paies le juste prix.' },
        { i: '📝', t: 'Conseils avancés', d: 'Sur chaque produit : pourquoi, comment, à quel moment.' },
        { i: '🖐️', t: 'Gestes d\'application', d: 'Des visuels qui montrent comment appliquer chaque produit.' },
        { i: '📐', t: 'Quantité, ordre & fréquence', d: 'Combien, dans quel ordre, matin ou soir, à quelle fréquence.' },
      ]},
    ];

    const catsHtml = CATS.map((c, idx) => `
      <section class="pv-cat pv-reveal" style="--d:${idx * 60}ms">
        <div class="pv-cat-head">
          <span class="pv-cat-emoji">${c.emoji}</span>
          <h2 class="pv-cat-title">${c.tag}</h2>
        </div>
        <div class="pv-cat-grid">
          ${c.items.map(it => `
            <div class="pv-item">
              <span class="pv-item-i">${it.i}</span>
              <div class="pv-item-body">
                <h3 class="pv-item-t">${it.t}</h3>
                <p class="pv-item-d">${it.d}</p>
              </div>
              <span class="pv-item-check">✓</span>
            </div>`).join('')}
        </div>
      </section>`).join('');

    const FAQ = [
      ['Puis-je annuler à tout moment ?', 'Oui, sans engagement. Tu résilies en un clic depuis ton compte et tu gardes l\'accès jusqu\'à la fin de la période payée.'],
      ['Quelle est la différence entre mensuel et annuel ?', `Le contenu est identique. L'annuel (39,99 €) revient à 3,33 €/mois, soit −33% par rapport au mensuel (4,99 €). C'est la formule la plus avantageuse.`],
      ['Glow Up est-il vraiment impartial ?', 'Oui. On ne fabrique ni ne vend nos propres produits. On référence tout le marché et on ne recommande que ce qui correspond à ton profil — jamais une marque qui paierait plus.'],
      ['Que se passe-t-il si je reste gratuite ?', 'Tu gardes 1 routine et ton analyse beauté. Premium débloque les routines illimitées, le Skin Journey, l\'historique et la personnalisation avancée.'],
      ['Mes données et photos sont-elles en sécurité ?', 'Tes analyses restent privées et ne sont jamais revendues. Tu peux supprimer ton compte et tes données à tout moment.'],
      ['Serai-je débitée automatiquement ?', 'Le paiement est géré de façon sécurisée par Stripe. L\'abonnement se renouvelle automatiquement, et tu peux l\'arrêter quand tu veux.'],
    ];
    const faqHtml = FAQ.map(([q, a]) => `
      <details class="pv-faq-item">
        <summary class="pv-faq-q">${q}<span class="pv-faq-plus">+</span></summary>
        <p class="pv-faq-a">${a}</p>
      </details>`).join('');

    // Bloc tarifs / CTA (ou état « déjà abonnée »)
    const pricingHtml = isSub ? `
      <div class="pv-already">
        <span class="pv-already-badge">✦ Tu es déjà membre ${plan === 'glowplus' ? 'Glow Up Coach' : 'Glow Up Premium'}</span>
        <p>Profite de tous tes avantages ✨</p>
        <button class="btn btn-dark" onclick="Subscription._exitPremiumPublic()">Revenir à ma routine →</button>
      </div>` : `
      <div class="pv-pricing pv-reveal" id="pv-pricing">
        <h2 class="pv-section-title">Choisis ta formule</h2>
        <p class="pv-section-sub">Même contenu, deux rythmes. L'annuel est le plus avantageux.</p>
        <div class="pv-plans">
          <div class="pv-plan pv-plan--best">
            <div class="pv-plan-badge">★ Le plus avantageux · −${P.save}</div>
            <div class="pv-plan-name">Annuel</div>
            <div class="pv-plan-price"><span class="pv-plan-amount">${P.yearly}€</span><span class="pv-plan-per">/an</span></div>
            <div class="pv-plan-permonth">soit ${P.yearlyPerMonth} €/mois</div>
            <button class="btn btn-dark full-width" onclick="Subscription.openCheckout('${P.keyYearly}')">Débloquer Glow Up Premium ✦</button>
            <div class="pv-plan-note">2 mois offerts vs mensuel</div>
          </div>
          <div class="pv-plan">
            <div class="pv-plan-name">Mensuel</div>
            <div class="pv-plan-price"><span class="pv-plan-amount">${P.monthly}€</span><span class="pv-plan-per">/mois</span></div>
            <div class="pv-plan-permonth">flexible, sans engagement</div>
            <button class="btn btn-outline full-width" onclick="Subscription.openCheckout('${P.keyMonthly}')">Prendre au mois</button>
          </div>
        </div>
        <button class="btn-ghost pv-free-link" onclick="Subscription._exitPremiumPublic()">Continuer gratuitement</button>
      </div>`;

    container.innerHTML = `
      <div class="pv-wrap">

        <!-- HERO -->
        <header class="pv-hero pv-reveal">
          <span class="pv-hero-eyebrow">✦ Glow Up Premium</span>
          <h1 class="pv-hero-title">Toute ta beauté,<br><em>débloquée.</em></h1>
          <p class="pv-hero-sub">Des routines illimitées, le suivi de ta peau dans le temps, ton profil beauté sauvegardé et les meilleurs prix comparés pour toi — sans aucun favoritisme de marque.</p>
          <div class="pv-hero-cta">
            <button class="btn btn-dark pv-hero-primary" onclick="document.getElementById('pv-pricing')?.scrollIntoView({behavior:'smooth'}); if(${isSub}) Subscription._exitPremiumPublic();">Débloquer Glow Up Premium</button>
            <button class="btn btn-outline" onclick="Subscription._exitPremiumPublic()">Continuer gratuitement</button>
          </div>
          <div class="pv-hero-price">dès <strong>${P.yearlyPerMonth} €/mois</strong> · sans engagement</div>
        </header>

        <!-- VALEUR EN UN COUP D'ŒIL -->
        <div class="pv-strip pv-reveal">
          <div class="pv-strip-item"><span>🔁</span>Routines illimitées</div>
          <div class="pv-strip-item"><span>📅</span>Skin Journey 30 j</div>
          <div class="pv-strip-item"><span>💰</span>Prix comparés</div>
          <div class="pv-strip-item"><span>🤍</span>100% impartial</div>
        </div>

        <!-- AVANTAGES PAR CATÉGORIE -->
        <div class="pv-cats">${catsHtml}</div>

        <!-- DIFFÉRENCIATION -->
        <section class="pv-diff pv-reveal">
          <span class="pv-diff-eyebrow">Pourquoi nous faire confiance</span>
          <h2 class="pv-section-title">La beauté sans conflit d'intérêt</h2>
          <div class="pv-diff-grid">
            <div class="pv-diff-card"><span class="pv-diff-i">🤍</span><p>Aucun intérêt à te vendre un produit plutôt qu'un autre.</p></div>
            <div class="pv-diff-card"><span class="pv-diff-i">🌍</span><p>On référence <strong>tous</strong> les produits du marché.</p></div>
            <div class="pv-diff-card"><span class="pv-diff-i">💰</span><p>On compare automatiquement les prix pour toi.</p></div>
            <div class="pv-diff-card"><span class="pv-diff-i">🎯</span><p>On recommande uniquement ce qui convient à <strong>ton</strong> profil.</p></div>
          </div>
        </section>

        <!-- TARIFS -->
        ${pricingHtml}

        <!-- Comparer toutes les offres (dont Coach) -->
        <button class="btn-ghost pv-compare-link" onclick="showScreen('plans')">Comparer toutes les offres (dont Glow Up Coach) →</button>

        <!-- FAQ -->
        <section class="pv-faq pv-reveal">
          <h2 class="pv-section-title">Questions fréquentes</h2>
          <div class="pv-faq-list">${faqHtml}</div>
        </section>

        <!-- CTA FINAL -->
        ${isSub ? '' : `
        <section class="pv-final pv-reveal">
          <h2 class="pv-final-title">Prête à révéler ton glow ?</h2>
          <p class="pv-final-sub">Rejoins Glow Up Premium et prends soin de ta peau, vraiment.</p>
          <button class="btn btn-dark" onclick="Subscription.openCheckout('${P.keyYearly}')">Débloquer Glow Up Premium · ${P.yearly}€/an ✦</button>
          <button class="btn-ghost pv-free-link" onclick="Subscription._exitPremiumPublic()">Continuer gratuitement</button>
          <p class="pv-final-fine">Sans engagement · Annulable à tout moment · Paiement sécurisé Stripe</p>
        </section>`}

      </div>`;

    _observeReveal(container);
  }

  // Exposé pour les onclick inline
  function _exitPremiumPublic() { _exitPremium(); }

  // ─── Composant réutilisable : PremiumLockCard ────────────────
  // Chaque fonctionnalité verrouillée devient une opportunité de conversion.
  // opts : { preset, icon, title, text, compact }
  const LOCK_PRESETS = {
    alternatives:       { icon: '🔓', title: 'Débloquez les alternatives produits',        text: 'Trouvez des produits moins chers, plus adaptés à votre peau ou plus proches de vos préférences.' },
    'price-comparator': { icon: '💰', title: 'Comparez les prix sur tout le marché',        text: 'Glow Up vous aide à trouver vos produits au meilleur prix, sans favoriser une marque plutôt qu\'une autre.' },
    'skin-journey':     { icon: '📅', title: 'Suivez l\'évolution de votre peau sur 30 jours', text: 'Comparez vos photos Jour 1, 5, 15 et 30 pour voir si votre routine fonctionne réellement.' },
    routine:            { icon: '✨', title: 'Débloquez votre routine complète',            text: 'Accédez à votre routine Skincare et Make-up personnalisée avec Glow Up Premium.' },
    history:            { icon: '🗂️', title: 'Retrouvez tout votre historique beauté',       text: 'Gardez vos diagnostics, routines, photos de suivi et produits testés au même endroit.' },
    'advanced-advice':  { icon: '📝', title: 'Comprenez mieux chaque recommandation',        text: 'Accédez aux conseils avancés, aux explications détaillées et aux images d\'application des produits.' },
    molecules:          { icon: '🧪', title: 'Découvre les molécules faites pour ta peau',    text: 'Quels actifs choisir selon ton diagnostic — niacinamide, rétinol, vitamine C… et pourquoi.' },
    associations:       { icon: '⚗️', title: 'Associe tes actifs sans risque',                text: 'Quels actifs combiner, lesquels séparer matin/soir, et comment éviter les irritations.' },
  };
  function lockCard(opts = {}) {
    const P = PRICING.premium;
    const preset = LOCK_PRESETS[opts.preset] || {};
    const icon  = opts.icon  || preset.icon  || '🔒';
    const title = opts.title || preset.title || 'Débloquez Glow Up Premium';
    const text  = opts.text  || preset.text  || 'Accédez à tout ce que Glow Up Premium débloque pour ta peau.';
    return `
      <div class="premium-lock${opts.compact ? ' premium-lock--compact' : ''}">
        <div class="premium-lock-head">
          <span class="premium-lock-icon">${icon}</span>
          <div class="premium-lock-body">
            <h3 class="premium-lock-title">${title}</h3>
            <p class="premium-lock-text">${text}</p>
          </div>
        </div>
        <div class="premium-lock-price">dès <strong>${P.yearlyPerMonth} €/mois</strong> · ${P.yearly} €/an</div>
        <div class="premium-lock-actions">
          <button class="btn-orange-cta premium-lock-cta" onclick="Subscription.openCheckout('${P.keyYearly}')">Débloquer Glow Up Premium</button>
          <button class="btn-ghost premium-lock-see" onclick="if(typeof closeModal==='function')closeModal(); showScreen('premium')">Voir tous les avantages →</button>
        </div>
      </div>`;
  }

  // Ouvre le composant lock dans une modale (ex : alternatives floutées cliquées)
  function openLock(preset) {
    if (typeof openModal !== 'function') return;
    openModal(`<button class="modal-close" onclick="closeModal()">×</button><div class="lock-modal-wrap">${lockCard({ preset })}</div>`);
  }

  return { getPlan, isPlan, canAccess, canGenerateRoutine, hasUsedFreeRoutine, routinesLeftThisMonth, markRoutineGenerated, showRoutineLimit, lockCard, openLock, loadPlan, openCheckout, showPaywall, updateGatingUI, handleCheckoutReturn, renderPlansPage, renderPremiumPage, _exitPremiumPublic, loadFoundersData, showSkinJourneyDetail, showReferralDashboard };

})();
