/* ============================================================
   subscription.js — Gestion des abonnements GLOW UP
   Plans : free / glow / glowplus
   ============================================================ */

'use strict';

const Subscription = (() => {

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

      console.log('[Subscription] Plan chargé:', plan, '| freeRoutineChoice:', AppState.user.freeRoutineChoice);
      updateGatingUI();
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
  async function showPaywall(feature) {
    await loadFoundersData();
    const isF   = _foundersEligible();
    const spots = _spotsLeft();

    const CFG = {
      routine_second:      { tag:'Offre complète',  title:'Ta deuxième routine<br>t\'attend.',       desc:'Skincare + Make-up · Profil cross-device · Historique de ta peau',             plan:'Glow',       price:'19,99', fPrice:'15,99', key:'glow_year',  fKey:'glow_found'  },
      skinpedia_ai:        { tag:'Skinpedia IA',     title:'L\'analyse IA de tes<br>ingrédients.',    desc:'Comprends chaque actif selon ton profil peau unique.',                          plan:'Glow',       price:'19,99', fPrice:'15,99', key:'glow_year',  fKey:'glow_found'  },
      recommendations_adv: { tag:'Recommandations',  title:'Des produits encore<br>plus ciblés.',     desc:'Sélection avancée selon ton analyse, ta carnation et tes préférences.',          plan:'Glow',       price:'19,99', fPrice:'15,99', key:'glow_year',  fKey:'glow_found'  },
      coach:               { tag:'Glow Coach',       title:'La seule vendeuse<br>beauté qui te connaît.', desc:'La seule vendeuse beauté qui te connaît déjà. Elle connaît ton profil, ta routine et ton budget. Disponible à tout moment.', plan:'Glow Coach', price:'199,99',fPrice:'49,99',key:'coach_year', fKey:'coach_found' }
    };
    const cfg = CFG[feature] || CFG.routine_second;
    const priceKey = isF ? cfg.fKey : cfg.key;

    const foundersHtml = isF ? `
      <div class="paywall-founders-strip">
        <span class="paywall-founders-tag">✦ Offre Fondatrices</span>
        ${spots !== null ? `<span class="paywall-founders-spots">${spots} place${spots !== 1 ? 's' : ''} restante${spots !== 1 ? 's' : ''}</span>` : ''}
        <span class="paywall-founders-date">jusqu'au 30 juin</span>
      </div>` : '';

    const priceHtml = isF
      ? `<div class="paywall-price-wrap">
           <span class="paywall-price-old">${cfg.price}€</span>
           <span class="paywall-price-new">${cfg.fPrice}€</span>
           <span class="paywall-price-period">/an</span>
         </div>
         <p class="paywall-price-founders-note">Offre fondatrices · réservée aux 50 premières membres</p>`
      : `<div class="paywall-price-wrap">
           <span class="paywall-price-new">${cfg.price}€</span>
           <span class="paywall-price-period">/an</span>
         </div>`;

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="paywall-lux">
        <div class="paywall-lux-icon">✦</div>
        <div class="paywall-lux-tag">${cfg.tag}</div>
        <h2 class="paywall-lux-title">${cfg.title}</h2>
        <p class="paywall-lux-desc">${cfg.desc}</p>
        ${foundersHtml}
        <div class="paywall-lux-card">
          <div class="paywall-lux-plan-name">${cfg.plan}</div>
          ${priceHtml}
          <button class="btn btn-dark full-width paywall-lux-btn" onclick="Subscription.openCheckout('${priceKey}'); closeModal();">
            ${cfg.plan === 'Glow Coach' ? 'Accéder au Coach ✦' : 'Commencer Glow ✦'}
          </button>
        </div>
        <p class="paywall-lux-fine">Paiement annuel · Annulable à tout moment</p>
        <button class="btn-ghost paywall-lux-skip" onclick="closeModal()">Continuer avec Free →</button>
      </div>`;
    openModal(html);
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
  async function renderPlansPage() {
    const container = document.getElementById('plansContent');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:60px 0;color:var(--muted);font-size:0.9rem;">Chargement…</div>';

    await loadFoundersData();

    const plan   = getPlan();
    const isF    = _foundersEligible();
    const spots  = _spotsLeft();
    const glowKey  = isF ? 'glow_found'  : 'glow_year';
    const coachKey = isF ? 'coach_found' : 'coach_year';

    const foundersStrip = isF ? `
      <div class="founders-strip">
        <span class="founders-strip-tag">✦ Offre Fondatrices</span>
        <span class="founders-strip-text">
          Réservée aux 50 premières membres
          ${spots !== null ? `· <strong>${spots} place${spots !== 1 ? 's' : ''} restante${spots !== 1 ? 's' : ''}</strong>` : ''}
          · Jusqu'au 30 juin
        </span>
      </div>` : '';

    const glowPriceHtml = isF
      ? `<div class="plan-lux-price"><span class="plan-lux-price-old">19,99€</span><span class="plan-lux-price-main">15,99€</span><span class="plan-lux-price-per">/an</span></div><p class="plan-lux-found-note">Offre fondatrices</p>`
      : `<div class="plan-lux-price"><span class="plan-lux-price-main">19,99€</span><span class="plan-lux-price-per">/an</span></div>`;

    const coachPriceHtml = isF
      ? `<div class="plan-lux-price"><span class="plan-lux-price-old">199,99€</span><span class="plan-lux-price-main">49,99€</span><span class="plan-lux-price-per">/an</span></div><p class="plan-lux-found-note">Offre fondatrices · 100 premières</p>`
      : `<div class="plan-lux-price"><span class="plan-lux-price-main">199,99€</span><span class="plan-lux-price-per">/an</span></div>`;

    const glowCTA = plan === 'glow' || plan === 'glowplus'
      ? (plan === 'glow' ? '<div class="plan-lux-active">Ton offre actuelle ✦</div>' : '')
      : `<button class="btn btn-dark full-width" onclick="Subscription.openCheckout('${glowKey}')">Commencer Glow ✦</button>`;

    const coachCTA = plan === 'glowplus'
      ? '<div class="plan-lux-active">Ton offre actuelle ✦</div>'
      : `<button class="btn btn-dark full-width" onclick="Subscription.openCheckout('${coachKey}')">Accéder au Coach ✦</button>`;

    container.innerHTML = `
      <div class="plans-page-lux">

        <div class="plans-hero-lux">
          <span class="plans-hero-tag">✦ Glow Up</span>
          <h1 class="plans-hero-title">Tes routines,<br><em>au complet.</em></h1>
          <p class="plans-hero-sub">Commence gratuitement. Développe ton expertise beauté à ton rythme.</p>
        </div>

        ${foundersStrip}

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
            <div class="plan-lux-name">Glow</div>
            ${glowPriceHtml}
            <ul class="plan-lux-features">
              <li>Skincare + Make-up complètes</li>
              <li>Analyse IA + profil cross-device</li>
              <li>Recommandations avancées</li>
              <li>Skinpedia IA</li>
              <li>Historique de ta peau</li>
            </ul>
            ${glowCTA}
          </div>

          <div class="plan-lux plan-lux--coach ${plan === 'glowplus' ? 'plan-lux--active' : ''}">
            <div class="plan-lux-name">Glow Coach</div>
            ${coachPriceHtml}
            <p class="plan-lux-tagline">La seule vendeuse beauté qui te connaît déjà.</p>
            <ul class="plan-lux-features">
              <li>Tout Glow inclus</li>
              <li>Coach beauté IA personnalisé</li>
              <li>Suivi beauté & résumés de séances</li>
              <li>Profil enrichi & mémoire long terme</li>
              <li>Accès prioritaire aux nouveautés</li>
            </ul>
            ${coachCTA}
          </div>

        </div>

        <p class="plans-fine-print">Paiement annuel · Annulable à tout moment</p>

        <!-- Skin Journey feature card -->
        <div class="sj-feature-card" onclick="Subscription.showSkinJourneyDetail()">
          <div class="sj-feature-icon">✨</div>
          <div class="sj-feature-body">
            <div class="sj-feature-tag">Inclus dans Glow · 15,99 €/an</div>
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
      : `<button class="btn-orange-cta" onclick="Subscription.showPaywall('routine_second'); closeModal()">Débloquer Glow Up · 15,99 €/an</button>`;

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="sj-modal">
        <div class="sj-modal-icon">✨</div>
        <div class="sj-modal-tag">Inclus dans l'abonnement Glow · 15,99 €/an</div>
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
      const coupons = ref.coupons || [];
      const link    = `https://glowupskin.app?ref=${code}`;
      const progress = Math.min(count % 5, 5);
      const nextMilestone = 5 - progress;
      const cardsEarned = Math.floor(count / 5);

      // Étoiles de progression ⭐⭐⭐☆☆
      const stars = Array.from({length: 5}, (_, i) =>
        i < progress ? '⭐' : '☆'
      ).join('');

      const shareText = encodeURIComponent(`Je te recommande Glow Up ✨ ma routine beauté personnalisée. Rejoins-moi : ${link}`);

      const couponsHtml = coupons.length
        ? `<div class="ref-coupons">
             <p class="ref-coupons-label">🎁 Tes Cartes Cadeaux Beauté</p>
             ${coupons.map(c => `<div class="ref-coupon-code">${c} · 15 €</div>`).join('')}
           </div>`
        : '';

      const html = `
        <button class="modal-close" onclick="closeModal()">×</button>
        <div class="ref-modal">
          <div class="ref-modal-icon">🎁</div>
          <h2 class="ref-modal-title">Programme Ambassadrice<br>Glow Up</h2>
          <p class="ref-modal-sub">Recommande Glow Up à tes amies et offre-toi ton prochain produit beauté ✨</p>

          <div class="ref-progress">
            <div class="ref-stars">${stars}</div>
            <div class="ref-progress-header">
              <span class="ref-progress-count">${count} / ${(cardsEarned + 1) * 5} filleule${count > 1 ? 's' : ''} validée${count > 1 ? 's' : ''}</span>
            </div>
            <div class="ref-bars">${Array.from({length: 5}, (_, i) => `<div class="ref-bar ${i < progress ? 'ref-bar--filled' : ''}"></div>`).join('')}</div>
            <p class="ref-progress-note">${nextMilestone > 0
              ? `Plus que <strong>${nextMilestone} filleule${nextMilestone > 1 ? 's' : ''}</strong> pour débloquer ta prochaine Carte Cadeau Beauté de 15 €`
              : '🎉 Carte Cadeau débloquée !'}</p>
          </div>

          ${cardsEarned > 0 ? `<div class="ref-earned">🎉 ${cardsEarned} Carte${cardsEarned > 1 ? 's' : ''} Cadeau Beauté gagnée${cardsEarned > 1 ? 's' : ''} · ${cardsEarned * 15} €</div>` : ''}

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

  return { getPlan, isPlan, canAccess, loadPlan, openCheckout, showPaywall, updateGatingUI, handleCheckoutReturn, renderPlansPage, loadFoundersData, showSkinJourneyDetail, showReferralDashboard };

})();
