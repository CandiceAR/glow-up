/* ============================================================
   auth.js — Firebase Auth (Google + Email) Phase 0
   ============================================================ */

'use strict';

const Auth = (() => {

  // Config Firebase — à remplacer par ta config réelle
  const FIREBASE_CONFIG = {
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
    projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID"
  };

  let auth = null;

  function init() {
    // Vérifier que Firebase est chargé
    if (typeof firebase === 'undefined') {
      console.warn('[Auth] Firebase SDK non trouvé — mode guest seulement');
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();

      auth.onAuthStateChanged(user => {
        if (user) {
          AppState.user = {
            uid:         user.uid,
            email:       user.email,
            displayName: user.displayName,
            photoURL:    user.photoURL,
            isGuest:     false
          };
          console.log('[Auth] Connecté:', user.email);
        } else {
          AppState.user = { uid: null, email: null, displayName: null, photoURL: null, isGuest: true };
          console.log('[Auth] Mode guest');
        }
        updateAuthUI();
      });
    } catch (err) {
      console.error('[Auth] Erreur init Firebase:', err);
    }
  }

  async function signInWithGoogle() {
    if (!auth) return;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      closeModal();
      showToast('Connexion réussie !', 'success');
    } catch (err) {
      console.error('[Auth] Google sign-in error:', err);
      showToast('Erreur de connexion Google', 'error');
    }
  }

  async function signInWithEmail(email, password) {
    if (!auth) return;
    try {
      await auth.signInWithEmailAndPassword(email, password);
      closeModal();
      showToast('Connexion réussie !', 'success');
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Tenter inscription
        await signUpWithEmail(email, password);
      } else {
        showToast('Email ou mot de passe incorrect', 'error');
      }
    }
  }

  async function signUpWithEmail(email, password) {
    if (!auth) return;
    try {
      await auth.createUserWithEmailAndPassword(email, password);
      closeModal();
      showToast('Compte créé ! Bienvenue sur Glow Up ✦', 'success');
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

  function openAuthModal() {
    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="auth-modal">
        <h2>Connexion</h2>
        <p>Sauvegarde ta routine et retrouve-la à tout moment.</p>

        <button class="btn btn-google" onclick="Auth.signInWithGoogle()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </button>

        <div class="auth-divider"><span>ou</span></div>

        <input type="email" id="authEmail" placeholder="Ton adresse email" class="auth-input">
        <input type="password" id="authPassword" placeholder="Mot de passe" class="auth-input">
        <button class="btn btn-dark full-width" onclick="Auth.submitEmail()">Connexion / Inscription</button>

        <button class="btn-ghost auth-guest" onclick="closeModal()">
          Continuer sans compte →
        </button>
      </div>`;
    openModal(html);
  }

  function submitEmail() {
    const email    = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value;
    if (!email || !password) {
      showToast('Merci de remplir email et mot de passe', 'warning');
      return;
    }
    signInWithEmail(email, password);
  }

  function openProfileMenu() {
    const { displayName, email } = AppState.user;
    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="auth-modal">
        <h2>Mon profil</h2>
        <p>${displayName || email}</p>
        <button class="btn btn-outline full-width" onclick="Auth.signOut(); closeModal();">
          Se déconnecter
        </button>
      </div>`;
    openModal(html);
  }

  return { init, signInWithGoogle, signInWithEmail, signOut, openAuthModal, submitEmail, openProfileMenu };

})();

// Alias globaux
function openAuthModal()   { Auth.openAuthModal(); }
function openProfileMenu() { Auth.openProfileMenu(); }
