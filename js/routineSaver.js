/* ============================================================
   routineSaver.js — Sauvegarde & reprise de routine (localStorage)
   Firebase-ready : migre automatiquement quand l'utilisateur se connecte
   GLOW UP
   ============================================================ */

'use strict';

const RoutineSaver = (() => {

  const KEY_GUEST         = 'glow_routine_v1';
  const KEY_PROFILE_GUEST = 'glow_profile_v1';

  // ─── Clés de stockage ────────────────────────────────────────
  function _getKey() {
    const uid = AppState?.user?.uid;
    return uid ? `glow_routine_${uid}` : KEY_GUEST;
  }

  function _getProfileKey() {
    const uid = AppState?.user?.uid;
    return uid ? `glow_profile_${uid}` : KEY_PROFILE_GUEST;
  }

  // ─── Sauvegarder la routine courante (skincare OU makeup) ────
  // Fusionne avec l'existant : conserve les deux types séparément
  function save() {
    const choice = AppState.routineChoice || 'skincare';
    const isMakeup = choice === 'makeup';
    if (!isMakeup && !AppState.routine?.ruleApplied) return;

    const existing = load() || {};
    const data = {
      ...existing,
      answers:       AppState.questionnaire.answers || existing.answers || {},
      skinAnalysis:  AppState.face?.skinAnalysis    || existing.skinAnalysis || null,
      routineChoice: choice,
      completed:     true,
      savedAt:       new Date().toISOString(),
    };

    if (isMakeup) {
      data.makeup = { makeupQuiz: AppState.makeupQuiz || {} };
    } else {
      data.routine   = AppState.routine; // compat
      data.skincare  = { routine: AppState.routine, answers: AppState.questionnaire.answers || {} };
    }

    try {
      localStorage.setItem(_getKey(), JSON.stringify(data));
      console.log('[RoutineSaver] Routine sauvegardée →', _getKey(), `(${choice})`);
    } catch (e) {
      console.warn('[RoutineSaver] Erreur sauvegarde:', e);
    }
    const uid = AppState?.user?.uid;
    if (uid && typeof FirestoreProfile !== 'undefined') {
      FirestoreProfile.save(uid, data);
    }
  }

  // ─── Y a-t-il une routine enregistrée d'un type donné ? ──────
  function hasSavedRoutine(type) {
    const d = load();
    if (!d) return false;
    if (type === 'skincare') return !!(d.skincare?.routine?.ruleApplied || d.routine?.ruleApplied);
    if (type === 'makeup')   return !!(d.makeup?.makeupQuiz);
    return false;
  }

  // ─── Reprendre une routine enregistrée → affiche l'écran ─────
  function resumeSaved(type) {
    const d = load();
    if (!d) return false;

    if (d.skinAnalysis) {
      AppState.face = AppState.face || {};
      AppState.face.skinAnalysis = d.skinAnalysis;
    }

    if (type === 'skincare') {
      const r = d.skincare?.routine || d.routine;
      if (!r?.ruleApplied) return false;
      AppState.questionnaire.answers   = d.skincare?.answers || d.answers || {};
      AppState.questionnaire.completed = true;
      AppState.routine = { ...AppState.routine, ...r };
      AppState.routineChoice = 'skincare';
      if (AppState.questionnaire.answers?.skinType && typeof ProductCatalog !== 'undefined') {
        ProductCatalog.getRecommended(AppState.questionnaire.answers);
      }
      if (typeof showScreen === 'function') showScreen('results');
      return true;
    }

    if (type === 'makeup') {
      if (!d.makeup?.makeupQuiz) return false;
      AppState.makeupQuiz    = d.makeup.makeupQuiz;
      AppState.routineChoice = 'makeup';
      if (typeof showScreen === 'function') showScreen('makeup');
      return true;
    }
    return false;
  }

  // ─── Charger la routine sauvegardée ──────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(_getKey())
               || localStorage.getItem(KEY_GUEST); // fallback guest
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ─── Restaurer la routine dans AppState ──────────────────────
  function restore() {
    const data = load();
    if (!data || !data.routine?.ruleApplied) return false;

    AppState.questionnaire.answers   = data.answers || {};
    AppState.questionnaire.completed = true;
    AppState.routine = { ...AppState.routine, ...data.routine };
    AppState.routineChoice = data.routineChoice || 'skincare';
    if (data.skinAnalysis) {
      AppState.face = AppState.face || {};
      AppState.face.skinAnalysis = data.skinAnalysis;
    }

    if (data.answers?.skinType && typeof ProductCatalog !== 'undefined') {
      ProductCatalog.getRecommended(data.answers);
    }

    return true;
  }

  // ─── Effacer la routine sauvegardée ──────────────────────────
  function clear() {
    localStorage.removeItem(_getKey());
    localStorage.removeItem(KEY_GUEST);
    localStorage.removeItem(_getProfileKey());
    localStorage.removeItem(KEY_PROFILE_GUEST);
    console.log('[RoutineSaver] Routine + profil effacés');
  }

  // ─── Sauvegarder uniquement le profil (questionnaire + analyse) ─
  function saveProfile() {
    if (!AppState.questionnaire?.completed) return;
    const data = {
      answers:     AppState.questionnaire.answers || {},
      completed:   true,
      skinAnalysis: AppState.face?.skinAnalysis || null,
      savedAt:     new Date().toISOString()
    };
    try {
      localStorage.setItem(_getProfileKey(), JSON.stringify(data));
      console.log('[RoutineSaver] Profil sauvegardé →', _getProfileKey());
    } catch (e) {
      console.warn('[RoutineSaver] Erreur saveProfile:', e);
    }
    // Sync Firestore si connecté (cross-device)
    const uid = AppState?.user?.uid;
    if (uid && typeof FirestoreProfile !== 'undefined') {
      FirestoreProfile.save(uid, data); // async non-bloquant
    }
  }

  // ─── Charger le profil sauvegardé ─────────────────────────────
  function loadProfile() {
    try {
      const uid = AppState?.user?.uid;
      const raw = (uid && localStorage.getItem(`glow_profile_${uid}`))
               || localStorage.getItem(KEY_PROFILE_GUEST);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ─── Le profil est-il complet ? ───────────────────────────────
  function hasCompletedProfile() {
    return !!loadProfile()?.completed;
  }

  // ─── Restaurer le profil complet dans AppState ────────────────
  function restoreProfile() {
    const profile = loadProfile();
    if (!profile?.completed) return false;

    AppState.questionnaire.answers   = profile.answers || {};
    AppState.questionnaire.completed = true;

    if (profile.skinAnalysis) {
      AppState.face = AppState.face || {};
      AppState.face.skinAnalysis = profile.skinAnalysis;
    }

    // Restaurer le quiz makeup s'il existe
    if (profile.makeup?.makeupQuiz) {
      AppState.makeupQuiz = profile.makeup.makeupQuiz;
    }

    // Restaurer la routine skincare depuis le profil cloud (fiable cross-device)
    const skincareRoutine = profile.skincare?.routine || profile.routine;
    if (skincareRoutine?.ruleApplied) {
      AppState.routine = { ...AppState.routine, ...skincareRoutine };
      AppState.routineChoice = profile.routineChoice || 'skincare';
      const ans = profile.skincare?.answers || profile.answers;
      if (ans?.skinType && typeof ProductCatalog !== 'undefined') {
        ProductCatalog.getRecommended(ans);
      }
    } else {
      restore();
    }

    console.log('[RoutineSaver] Profil restauré ✓');
    return true;
  }

  // ─── Migrer routine guest → compte connecté ──────────────────
  function migrateGuestToUser(uid) {
    if (!uid) return;
    const guestData = localStorage.getItem(KEY_GUEST);
    if (guestData) {
      localStorage.setItem(`glow_routine_${uid}`, guestData);
      localStorage.removeItem(KEY_GUEST);
      console.log('[RoutineSaver] Routine migrée vers le compte utilisateur');
    }
    const guestProfile = localStorage.getItem(KEY_PROFILE_GUEST);
    if (guestProfile) {
      localStorage.setItem(`glow_profile_${uid}`, guestProfile);
      localStorage.removeItem(KEY_PROFILE_GUEST);
      console.log('[RoutineSaver] Profil migré vers le compte utilisateur');
    }
  }

  // ─── Bannière de reprise (affichée sur l'écran home) ─────────
  function showResumeBanner() {
    // Désactivée : remplacée par le modal "Reprendre / Nouvelle" au clic sur l'onglet
    return;
    const data = load();
    if (!data || !data.routine?.ruleApplied) return;

    // Ne pas afficher si la bannière est déjà là
    if (document.getElementById('resumeBanner')) return;

    const days    = Math.floor((Date.now() - new Date(data.savedAt)) / 86400000);
    const daysLabel = days === 0
      ? "aujourd'hui"
      : `il y a ${days} jour${days > 1 ? 's' : ''}`;

    const banner = document.createElement('div');
    banner.id = 'resumeBanner';
    banner.className = 'resume-banner';
    banner.innerHTML = `
      <div class="resume-banner-inner">
        <span class="resume-banner-icon">✦</span>
        <div class="resume-banner-text">
          <strong>Ta routine est sauvegardée</strong>
          <p>Enregistrée ${daysLabel} · ${data.routine.ruleName || 'Routine personnalisée'}</p>
        </div>
        <div class="resume-banner-actions">
          <button class="btn btn-dark btn-sm" onclick="RoutineSaver.resumeNow()">Reprendre</button>
          <button class="resume-banner-close" onclick="RoutineSaver.dismissBanner()" aria-label="Fermer">×</button>
        </div>
      </div>`;

    // Insérer juste après la barre de navigation
    const nav = document.querySelector('nav');
    if (nav) nav.insertAdjacentElement('afterend', banner);
    else document.body.prepend(banner);
  }

  // ─── Reprendre la routine sauvegardée ────────────────────────
  function resumeNow() {
    if (restore()) {
      dismissBanner();
      if (typeof showScreen === 'function') showScreen('results');
    }
  }

  // ─── Masquer la bannière ─────────────────────────────────────
  function dismissBanner() {
    document.getElementById('resumeBanner')?.remove();
  }

  return { save, load, restore, clear, migrateGuestToUser,
           saveProfile, loadProfile, hasCompletedProfile, restoreProfile,
           showResumeBanner, resumeNow, dismissBanner,
           hasSavedRoutine, resumeSaved };

})();
