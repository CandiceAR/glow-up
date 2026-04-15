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

  // ─── Charger le plan depuis Firestore ─────────────────────────
  async function loadPlan(uid) {
    if (!uid || typeof firebase === 'undefined') return;
    try {
      if (!firebase.apps.length) return;
      const db  = firebase.firestore();
      const doc = await db.collection('users').doc(uid).get();
      const plan = doc.data()?.subscription?.plan || 'free';
      AppState.user.plan = plan;
      console.log('[Subscription] Plan chargé:', plan);
      updateGatingUI();
    } catch (e) {
      console.warn('[Subscription] loadPlan:', e.message);
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
      const res = await fetch('/.netlify/functions/createCheckout', {
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
    const messages = {
      'routine_second':      { title: 'Débloquer la 2ᵉ routine', desc: 'Accède à ta routine skincare ET make-up avec Glow.' },
      'skinpedia_ai':        { title: 'Skinpedia IA', desc: 'Analyse personnalisée des ingrédients selon ta peau avec Glow.' },
      'recommendations_adv': { title: 'Recommandations avancées', desc: 'Des produits encore plus ciblés selon ton profil avec Glow.' },
      'coach':               { title: 'GlowUp Coach', desc: 'Ton assistante beauté IA ultra-personnalisée avec Glow+.' }
    };
    const msg = messages[feature] || { title: 'Fonctionnalité Premium', desc: 'Passe à Glow pour débloquer cette fonctionnalité.' };

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="paywall-modal">
        <div class="paywall-badge">✦ Premium</div>
        <h2>${msg.title}</h2>
        <p>${msg.desc}</p>

        <div class="paywall-plans">
          <div class="paywall-plan">
            <div class="paywall-plan-name">Glow</div>
            <div class="paywall-plan-price">3,99€<span>/mois</span></div>
            <button class="btn btn-dark full-width" onclick="Subscription.openCheckout('glow_monthly'); closeModal();">
              Choisir Glow mensuel
            </button>
            <button class="btn btn-outline full-width" style="margin-top:8px" onclick="Subscription.openCheckout('glow_yearly'); closeModal();">
              30€/an — économise 18€
            </button>
          </div>

          ${feature === 'coach' ? `
          <div class="paywall-plan paywall-plan-premium">
            <div class="paywall-plan-name">Glow+ <span class="paywall-best">Meilleur choix</span></div>
            <div class="paywall-plan-price">100€<span>/an</span></div>
            <button class="btn btn-gold full-width" onclick="Subscription.openCheckout('glowplus'); closeModal();">
              Choisir Glow+
            </button>
          </div>` : ''}
        </div>

        <button class="btn-ghost" onclick="closeModal()">Continuer avec Free →</button>
      </div>`;
    openModal(html);
  }

  // ─── Gating UI (verrouiller visuellement les éléments) ────────
  function updateGatingUI() {
    // Bouton Coach
    const coachBtn = document.querySelector('[data-feature="coach"]');
    if (coachBtn) {
      coachBtn.classList.toggle('locked', !canAccess('coach'));
    }
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
    const plan = getPlan();
    const container = document.getElementById('plansContent');
    if (!container) return;

    container.innerHTML = `
      <div class="plans-header">
        <h2>Choisis ton offre</h2>
        <p>Commence gratuitement, évolue quand tu veux.</p>
      </div>
      <div class="plans-grid">

        <div class="plan-card ${plan === 'free' ? 'plan-current' : ''}">
          <div class="plan-name">Free</div>
          <div class="plan-price">0€<span>/mois</span></div>
          <ul class="plan-features">
            <li>✓ 1 routine (skincare ou make-up)</li>
            <li>✓ Skinpedia dictionnaire</li>
            <li>✓ Découverte de l'app</li>
          </ul>
          ${plan === 'free' ? '<div class="plan-badge-current">Ton offre actuelle</div>' : ''}
        </div>

        <div class="plan-card plan-featured ${plan === 'glow' ? 'plan-current' : ''}">
          <div class="plan-badge-top">✦ Recommandé</div>
          <div class="plan-name">Glow</div>
          <div class="plan-price">3,99€<span>/mois</span></div>
          <div class="plan-price-alt">ou 30€/an — 2,50€/mois</div>
          <ul class="plan-features">
            <li>✓ Tout ce qui est inclus dans Free</li>
            <li>✓ Skincare + Make-up</li>
            <li>✓ Routines personnalisées</li>
            <li>✓ Recommandations avancées</li>
            <li>✓ Skinpedia IA</li>
          </ul>
          ${plan === 'glow'
            ? '<div class="plan-badge-current">Ton offre actuelle</div>'
            : `<button class="btn btn-dark full-width" onclick="Subscription.openCheckout('glow_monthly')">Commencer — 3,99€/mois</button>
               <button class="btn btn-outline full-width" style="margin-top:8px" onclick="Subscription.openCheckout('glow_yearly')">30€/an</button>`
          }
        </div>

        <div class="plan-card ${plan === 'glowplus' ? 'plan-current' : ''}">
          <div class="plan-name">Glow+</div>
          <div class="plan-price">100€<span>/an</span></div>
          <ul class="plan-features">
            <li>✓ Tout ce qui est inclus dans Glow</li>
            <li>✓ GlowUp Coach IA</li>
            <li>✓ Accompagnement ultra-personnalisé</li>
            <li>✓ Historique & évolution de ta peau</li>
          </ul>
          ${plan === 'glowplus'
            ? '<div class="plan-badge-current">Ton offre actuelle</div>'
            : `<button class="btn btn-dark full-width" onclick="Subscription.openCheckout('glowplus')">Choisir Glow+</button>`
          }
        </div>

      </div>`;
  }

  return { getPlan, isPlan, canAccess, loadPlan, openCheckout, showPaywall, updateGatingUI, handleCheckoutReturn, renderPlansPage };

})();
