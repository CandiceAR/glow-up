/* ============================================================
   routineSaver.js — Sauvegarde & reprise de routine (localStorage)
   Firebase-ready : migre automatiquement quand l'utilisateur se connecte
   GLOW UP
   ============================================================ */

'use strict';

const RoutineSaver = (() => {

  const KEY_GUEST = 'glow_routine_v1';

  // ─── Clé de stockage selon l'état de connexion ───────────────
  function _getKey() {
    const uid = AppState?.user?.uid;
    return uid ? `glow_routine_${uid}` : KEY_GUEST;
  }

  // ─── Sauvegarder la routine courante ─────────────────────────
  function save() {
    if (!AppState.routine?.ruleApplied) return; // rien à sauvegarder
    const data = {
      answers:       AppState.questionnaire.answers  || {},
      routine:       AppState.routine,
      routineChoice: AppState.routineChoice || 'skincare',
      savedAt:       new Date().toISOString()
    };
    try {
      localStorage.setItem(_getKey(), JSON.stringify(data));
      console.log('[RoutineSaver] Routine sauvegardée →', _getKey());
    } catch (e) {
      console.warn('[RoutineSaver] Erreur sauvegarde:', e);
    }
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

    // Recalculer les recommandations produits selon le type de peau
    if (data.answers?.skinType && typeof ProductCatalog !== 'undefined') {
      ProductCatalog.getRecommended(data.answers);
    }

    return true;
  }

  // ─── Effacer la routine sauvegardée ──────────────────────────
  function clear() {
    localStorage.removeItem(_getKey());
    localStorage.removeItem(KEY_GUEST);
    console.log('[RoutineSaver] Routine effacée');
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
  }

  // ─── Bannière de reprise (affichée sur l'écran home) ─────────
  function showResumeBanner() {
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

  return { save, load, restore, clear, migrateGuestToUser, showResumeBanner, resumeNow, dismissBanner };

})();
