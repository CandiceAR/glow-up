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

  // ─── Limite routine gratuite : 1 seule génération ────────────
  // Un compte free peut générer UNE routine. Toute nouvelle génération
  // (autre routine, refaire l'analyse, mettre à jour les besoins) → abonnement.
  function _routineFlagKey() {
    const uid = AppState?.user?.uid;
    return uid ? `glow_routine_done_${uid}` : 'glow_routine_done';
  }
  function hasUsedFreeRoutine() {
    if (AppState?.user?.freeRoutineUsed) return true;
    try { return localStorage.getItem(_routineFlagKey()) === '1'; } catch { return false; }
  }
  function canGenerateRoutine() {
    return getPlan() !== 'free' || !hasUsedFreeRoutine();
  }
  function markRoutineGenerated() {
    if (getPlan() !== 'free') return;               // abonnées : illimité
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
      routine_regenerate:  { tier:'premium', tag:'Routines illimitées', title:'Envie d\'une nouvelle<br>routine ?',   desc:'Ta 1ʳᵉ routine est offerte. Avec Premium, génère autant de routines que tu veux — à chaque changement de peau, de saison ou d\'envie.' },
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

  return { getPlan, isPlan, canAccess, canGenerateRoutine, hasUsedFreeRoutine, markRoutineGenerated, loadPlan, openCheckout, showPaywall, updateGatingUI, handleCheckoutReturn, renderPlansPage, loadFoundersData, showSkinJourneyDetail, showReferralDashboard };

})();
