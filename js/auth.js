/* ============================================================
   auth.js — Firebase Auth (Google + Email) Phase 0
   ============================================================ */

'use strict';

const Auth = (() => {

  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyDrpKPZf8qA_M86pOlChzBbOddGjGQoYiM",
    authDomain:        "glow-up-9f0d2.firebaseapp.com",
    projectId:         "glow-up-9f0d2",
    storageBucket:     "glow-up-9f0d2.firebasestorage.app",
    messagingSenderId: "808394116548",
    appId:             "1:808394116548:web:6075126d3d7a41edff6891",
    measurementId:     "G-HLB50Z689S"
  };

  let auth = null;
  let _authFlowCallback = null; // callback à déclencher après auth ou "continuer sans compte"

  function _runAuthFlowCallback() {
    if (typeof _authFlowCallback === 'function') {
      const cb = _authFlowCallback;
      _authFlowCallback = null;
      cb();
    }
  }

  function init() {
    if (typeof firebase === 'undefined') {
      console.warn('[Auth] Firebase SDK non trouvé — mode guest seulement');
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();

      // Maintenir la session active indéfiniment sur le même appareil
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

      // Initialiser Firestore pour la sauvegarde cross-device
      if (typeof firebase.firestore === 'function') {
        const db = firebase.firestore();
        if (typeof FirestoreProfile !== 'undefined') FirestoreProfile.init(db);
      }

      auth.onAuthStateChanged(user => {
        if (user) {
          // Migrer les données guest vers le compte connecté
          if (typeof RoutineSaver !== 'undefined') RoutineSaver.migrateGuestToUser(user.uid);

          AppState.user = {
            uid:         user.uid,
            email:       user.email,
            displayName: user.displayName,
            photoURL:    user.photoURL,
            isGuest:     false,
            plan:        'free'
          };
          console.log('[Auth] Connecté:', user.email);

          // Prénom : displayName ou première partie de l'email
          const prenom = user.displayName
            ? user.displayName.split(' ')[0]
            : (user.email ? user.email.split('@')[0] : '');

          // Toast de bienvenue — une seule fois par session
          const sessionKey = `glow_greeted_${user.uid}`;
          if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, '1');
            setTimeout(() => showToast(`Bonjour ${prenom} ✦`, 'success', 3000), 600);
          }

          // Charger le plan d'abonnement
          if (typeof Subscription !== 'undefined') Subscription.loadPlan(user.uid);

          // Charger le profil Firestore (cross-device), puis restaurer
          if (typeof FirestoreProfile !== 'undefined' && typeof RoutineSaver !== 'undefined') {
            FirestoreProfile.load(user.uid).then(cloudProfile => {
              if (cloudProfile) {
                localStorage.setItem(`glow_profile_${user.uid}`, JSON.stringify(cloudProfile));
              }
              const profileRestored = RoutineSaver.restoreProfile();
              if (profileRestored) {
                RoutineSaver.showResumeBanner();
              } else {
                // Nouveau compte → associer le parrain si présent
                _associateReferral(user.uid);
                // Lancer le questionnaire automatiquement
                setTimeout(() => {
                  if (AppState.screen === 'home' || AppState.screen === 'intention') {
                    setTimeout(() => {
                      if (typeof showScreen === 'function') showScreen('questionnaire');
                    }, 2000);
                  }
                }, 800);
              }
            });
          }
        } else {
          AppState.user = { uid: null, email: null, displayName: null, photoURL: null, isGuest: true };
          console.log('[Auth] Mode guest');
          // Tenter de restaurer un profil guest
          if (typeof RoutineSaver !== 'undefined') RoutineSaver.restoreProfile();
        }
        updateAuthUI();
      });
    } catch (err) {
      console.error('[Auth] Erreur init Firebase:', err);
    }
  }

  async function signInWithGoogle() {
    if (!auth) { closeModal(); _runAuthFlowCallback(); return; }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      closeModal();
      showToast('Connexion réussie !', 'success');
      _runAuthFlowCallback();
    } catch (err) {
      console.error('[Auth] Google sign-in error:', err);
      showToast('Erreur de connexion Google', 'error');
    }
  }

  async function signInWithEmail(email, password) {
    if (!auth) { closeModal(); _runAuthFlowCallback(); return; }
    try {
      await auth.signInWithEmailAndPassword(email, password);
      closeModal();
      showToast('Connexion réussie !', 'success');
      _runAuthFlowCallback();
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        await signUpWithEmail(email, password);
      } else {
        showToast('Email ou mot de passe incorrect', 'error');
      }
    }
  }

  async function signUpWithEmail(email, password) {
    if (!auth) { closeModal(); _runAuthFlowCallback(); return; }
    try {
      await auth.createUserWithEmailAndPassword(email, password);
      closeModal();
      showToast('Compte créé ! Bienvenue sur Glow Up ✦', 'success');
      _runAuthFlowCallback();
    } catch (err) {
      showToast('Erreur lors de la création du compte', 'error');
    }
  }

  async function signOut() {
    if (!auth) return;
    try {
      await auth.signOut();
      showToast('Déconnectée', 'info');
    } catch (err) {
      console.error('[Auth] Sign-out error:', err);
    }
  }

  // Continuer sans compte — déclenche le callback de flow si défini
  function continueFlow() {
    closeModal();
    _runAuthFlowCallback();
  }

  function openAuthModal(mode = 'login', onContinue = null) {
    if (onContinue) _authFlowCallback = onContinue;
    const googleSVG = `<svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>`;

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="auth-modal">
        <div class="auth-tabs">
          <button class="auth-tab ${mode === 'login' ? 'active' : ''}" onclick="Auth.openAuthModal('login')">Connexion</button>
          <button class="auth-tab ${mode === 'register' ? 'active' : ''}" onclick="Auth.openAuthModal('register')">Créer un compte</button>
        </div>

        ${mode === 'reset' ? `
          <h2>Mot de passe oublié</h2>
          <p>Entre ton email, on t'envoie un lien de réinitialisation.</p>
          <input type="email" id="authEmail" placeholder="Ton adresse email" class="auth-input">
          <button class="btn btn-dark full-width" onclick="Auth.submitReset()">Envoyer le lien</button>
          <button class="btn-ghost auth-guest" onclick="Auth.openAuthModal('login')">← Retour</button>
        ` : `
          <button class="btn btn-google" onclick="Auth.signInWithGoogle()">${googleSVG} Continuer avec Google</button>
          <div class="auth-divider"><span>ou par email</span></div>
          <input type="email" id="authEmail" placeholder="Ton adresse email" class="auth-input">
          <input type="password" id="authPassword" placeholder="${mode === 'register' ? 'Choisis un mot de passe (6 car. min)' : 'Ton mot de passe'}" class="auth-input">
          ${mode === 'register'
            ? `<button class="btn btn-dark full-width" onclick="Auth.submitRegister()">Créer mon compte ✦</button>`
            : `<button class="btn btn-dark full-width" onclick="Auth.submitLogin()">Se connecter</button>
               <button class="btn-ghost auth-forgot" onclick="Auth.openAuthModal('reset')">Mot de passe oublié ?</button>`
          }
          <button class="btn-ghost auth-guest" onclick="Auth.continueFlow()">Continuer sans compte →</button>
        `}
      </div>`;
    openModal(html);
  }

  function submitEmail() {
    const email    = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) { showToast('Merci de remplir email et mot de passe', 'warning'); return; }
    signInWithEmail(email, password);
  }

  function submitLogin() {
    const email    = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) { showToast('Merci de remplir email et mot de passe', 'warning'); return; }
    signInWithEmail(email, password);
  }

  async function submitRegister() {
    const email    = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) { showToast('Merci de remplir email et mot de passe', 'warning'); return; }
    if (password.length < 6) { showToast('Mot de passe : 6 caractères minimum', 'warning'); return; }
    await signUpWithEmail(email, password);
  }

  async function submitReset() {
    const email = document.getElementById('authEmail')?.value?.trim();
    if (!email) { showToast('Entre ton adresse email', 'warning'); return; }
    if (!auth) { showToast('Service non disponible', 'error'); return; }
    try {
      await auth.sendPasswordResetEmail(email);
      closeModal();
      showToast('Email envoyé ! Vérifie ta boîte mail ✦', 'success', 4000);
    } catch (err) {
      const msgs = { 'auth/user-not-found': 'Aucun compte avec cet email', 'auth/invalid-email': 'Email invalide' };
      showToast(msgs[err.code] || 'Erreur lors de l\'envoi', 'error');
    }
  }

  // ─── Associer un parrain au nouveau compte ───────────────────
  async function _associateReferral(uid) {
    const refCode = sessionStorage.getItem('glow_pending_ref');
    if (!refCode || !uid) return;
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;

    try {
      const db      = firebase.firestore();
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();

      // Ne pas écraser si déjà un parrain ou si c'est son propre code
      if (userDoc.data()?.referral?.referredBy) return;

      // Trouver le parrain via son code
      const q = await db.collection('users')
        .where('referral.code', '==', refCode)
        .limit(1)
        .get();
      if (q.empty) return;

      const referrerUid = q.docs[0].id;
      if (referrerUid === uid) return; // auto-parrainage interdit

      // Sauvegarder le lien parrain → filleule
      await userRef.set({ referral: { referredBy: refCode } }, { merge: true });

      // Créer le document de parrainage en attente
      await db.collection('referrals').add({
        referrerCode:  refCode,
        referrerUid,
        refereeUid:    uid,
        refereeEmail:  AppState.user?.email || '',
        status:        'pending',
        createdAt:     new Date().toISOString(),
        validatedAt:   null
      });

      sessionStorage.removeItem('glow_pending_ref');
      console.log('[Referral] Lien créé: filleule', uid, '← parrain', referrerUid);
    } catch (e) {
      console.warn('[Referral] Erreur association:', e.message);
    }
  }

  function openProfileMenu() {
    const { displayName, email } = AppState.user;
    const profile = typeof RoutineSaver !== 'undefined' ? RoutineSaver.loadProfile() : null;
    const sa      = profile?.skinAnalysis || AppState.face?.skinAnalysis || null;

    const skinTypeLabels    = { normale: 'Normale', grasse: 'Grasse', seche: 'Sèche', mixte: 'Mixte', sensible: 'Sensible' };
    const undertoneLabels   = { warm: 'Chaud ☀️', cool: 'Froid 🌙', neutral: 'Neutre' };
    const carnationLabels   = { light: 'Claire', medium: 'Medium', dark: 'Foncée' };
    const faceShapeLabels   = { oval: 'Ovale', round: 'Rond', square: 'Carré', heart: 'Cœur', long: 'Allongé' };

    const recapHtml = sa ? `
      <div class="profile-recap">
        <div class="profile-recap-title">✦ Mon analyse de peau</div>
        <div class="profile-recap-grid">
          ${sa.skinType?.type    ? `<div class="profile-recap-item"><span class="recap-label">Type de peau</span><span class="recap-val">${skinTypeLabels[sa.skinType.type] || sa.skinType.type}</span></div>` : ''}
          ${sa.undertone?.type   ? `<div class="profile-recap-item"><span class="recap-label">Sous-ton</span><span class="recap-val">${undertoneLabels[sa.undertone.type] || sa.undertone.type}</span></div>` : ''}
          ${sa.carnation?.type   ? `<div class="profile-recap-item"><span class="recap-label">Carnation</span><span class="recap-val">${carnationLabels[sa.carnation.type] || sa.carnation.type}</span></div>` : ''}
          ${sa.faceShape?.shape  ? `<div class="profile-recap-item"><span class="recap-label">Forme du visage</span><span class="recap-val">${faceShapeLabels[sa.faceShape.shape] || sa.faceShape.shape}</span></div>` : ''}
          ${sa.eyeShape          ? `<div class="profile-recap-item"><span class="recap-label">Yeux</span><span class="recap-val">${sa.eyeShape}</span></div>` : ''}
        </div>
        ${profile?.savedAt ? `<p class="profile-recap-date">Analysée le ${new Date(profile.savedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}</p>` : ''}
      </div>` : `
      <div class="profile-recap profile-recap--empty">
        <p>Aucune analyse de peau enregistrée.</p>
        <button class="btn btn-outline" onclick="closeModal(); startGlowUp();">Commencer mon analyse ✦</button>
      </div>`;

    const isCoach = typeof Subscription !== 'undefined' && Subscription.getPlan() === 'glowplus';
    const ambassadorHtml = isCoach ? `
      <button class="btn-orange-cta full-width" style="margin-top:16px" onclick="closeModal(); Subscription.showReferralDashboard();">
        🎁 Programme Ambassadrice Glow Up
      </button>` : '';

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="auth-modal">
        <h2>Mon profil</h2>
        <p class="profile-email">${displayName || email}</p>
        ${recapHtml}
        ${ambassadorHtml}
        <button class="btn btn-outline full-width" style="margin-top:16px" onclick="Auth.signOut(); closeModal();">
          Se déconnecter
        </button>
      </div>`;
    openModal(html);
  }

  // ─── Modal spécifique Skin Journey ───────────────────────────
  function openJourneyAuthModal(onSuccess) {
    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="auth-modal auth-modal-journey">
        <div class="auth-journey-badge">✦ Skin Journey · 100% Gratuit</div>
        <h2>Crée ton compte<br><em>pour commencer</em></h2>
        <p class="auth-journey-desc">
          Crée ton compte gratuit pour enregistrer ta progression et suivre l'évolution de ta peau jour après jour.
        </p>

        <button class="btn btn-google" onclick="Auth.journeyGoogle()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </button>

        <div class="auth-divider"><span>ou par email</span></div>

        <input type="email"    id="journeyEmail"    placeholder="Ton adresse email"  class="auth-input">
        <input type="password" id="journeyPassword" placeholder="Choisis un mot de passe" class="auth-input">

        <div class="auth-reminder-prefs">
          <p class="auth-reminder-title">🔔 Rappels de routine</p>
          <div class="auth-reminder-row">
            <label class="auth-reminder-opt">
              <input type="radio" name="reminderFreq" value="daily" checked> Chaque jour
            </label>
            <label class="auth-reminder-opt">
              <input type="radio" name="reminderFreq" value="3days"> Tous les 3 jours
            </label>
            <label class="auth-reminder-opt">
              <input type="radio" name="reminderFreq" value="weekly"> Hebdomadaire
            </label>
          </div>
        </div>

        <button class="btn btn-dark full-width journey-auth-submit" onclick="Auth.submitJourney()">
          Créer mon compte & commencer ✦
        </button>

        <button class="btn-ghost auth-guest" onclick="Auth.startJourneyGuest()">
          Continuer sans compte →
        </button>
        <p class="auth-journey-note">Données sécurisées · Jamais revendues</p>
      </div>`;

    _journeyCallback = onSuccess || null;
    openModal(html);
  }

  let _journeyCallback = null;

  async function journeyGoogle() {
    if (!auth) { _runJourneyCallback(); return; }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      closeModal();
      _saveReminderPrefs();
      showToast('Compte créé ! Bienvenue sur Glow Up ✦', 'success');
      _runJourneyCallback();
    } catch (err) {
      console.error('[Auth] Google sign-in error:', err);
      showToast('Erreur de connexion Google', 'error');
    }
  }

  async function submitJourney() {
    const email    = document.getElementById('journeyEmail')?.value?.trim();
    const password = document.getElementById('journeyPassword')?.value;
    if (!email || !password) {
      showToast('Merci de remplir email et mot de passe', 'warning');
      return;
    }
    if (password.length < 6) {
      showToast('Le mot de passe doit contenir au moins 6 caractères', 'warning');
      return;
    }
    _saveReminderPrefs();
    if (!auth) { closeModal(); _runJourneyCallback(); return; }
    try {
      try {
        await auth.createUserWithEmailAndPassword(email, password);
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          await auth.signInWithEmailAndPassword(email, password);
        } else throw e;
      }
      closeModal();
      showToast('Compte créé ! Bienvenue sur Glow Up ✦', 'success');
      _runJourneyCallback();
    } catch (err) {
      const msgs = {
        'auth/invalid-email':     'Adresse email invalide',
        'auth/wrong-password':    'Mot de passe incorrect',
        'auth/weak-password':     'Mot de passe trop faible (6 caractères min)'
      };
      showToast(msgs[err.code] || 'Erreur lors de la création du compte', 'error');
    }
  }

  function startJourneyGuest() {
    _saveReminderPrefs();
    closeModal();
    _runJourneyCallback();
  }

  function _saveReminderPrefs() {
    const checked = document.querySelector('input[name="reminderFreq"]:checked');
    if (checked) {
      localStorage.setItem('glowup_reminder_freq', checked.value);
    }
  }

  function _runJourneyCallback() {
    if (typeof _journeyCallback === 'function') {
      _journeyCallback();
      _journeyCallback = null;
    }
  }

  // ─── Modal auth obligatoire (analyse + routine) ─────────────
  // Sans "Continuer sans compte" — gate des points de conversion
  function openRequiredAuthModal(onSuccess) {
    if (onSuccess) _authFlowCallback = onSuccess;

    const googleSVG = `<svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>`;

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="auth-modal auth-modal-gate">

        <div class="auth-gate-visual">
          <span class="auth-gate-glow">✦</span>
        </div>

        <div class="auth-gate-badge">Analyse beauté IA · Gratuit</div>
        <h2 class="auth-gate-title">Découvre ta routine<br><em>sur-mesure</em></h2>
        <p class="auth-gate-desc">
          Ton analyse de peau personnalisée t'attend.<br>
          Crée ton compte gratuit pour la découvrir.
        </p>

        <button class="btn btn-google" onclick="Auth.signInWithGoogle()">${googleSVG} Continuer avec Google</button>
        <div class="auth-divider"><span>ou par email</span></div>
        <input type="email"    id="authEmail"    placeholder="Ton adresse email"        class="auth-input">
        <input type="password" id="authPassword" placeholder="Choisis un mot de passe"  class="auth-input">

        <button class="btn btn-dark full-width" onclick="Auth.submitRegister()">
          Créer mon compte ✦
        </button>

        <button class="btn-ghost auth-gate-login" onclick="Auth.openAuthModal('login', Auth._getFlowCallback())">
          Déjà un compte ? Se connecter →
        </button>

        <p class="auth-gate-note">Gratuit · Données sécurisées · Jamais revendues</p>
      </div>`;
    openModal(html);
  }

  // Exposer le callback pour la modal de login en chaîne
  function _getFlowCallback() { return _authFlowCallback; }

  return { init, signInWithGoogle, signInWithEmail, signOut, openAuthModal, continueFlow, submitEmail, submitLogin, submitRegister, submitReset, openProfileMenu, openJourneyAuthModal, journeyGoogle, submitJourney, startJourneyGuest, openRequiredAuthModal, _getFlowCallback };

})();

// Alias globaux
function openAuthModal()   { Auth.openAuthModal(); }
function openProfileMenu() { Auth.openProfileMenu(); }
