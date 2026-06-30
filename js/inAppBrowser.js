/* ============================================================
   inAppBrowser.js — Détection des navigateurs intégrés (webview)
   Instagram / Facebook / TikTok / Snapchat… bloquent la caméra
   live ET la connexion Google. On NE bloque PAS : on adapte
   l'expérience (upload de photo + inscription par email).
   → ajoute la classe body.is-inapp + expose isInApp().
   ============================================================ */

'use strict';

const InAppBrowser = (() => {

  // ─── Détection webview réseau social ──────────────────────────
  function isInApp() {
    const ua = navigator.userAgent || navigator.vendor || '';
    return /(FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|\bLine\/|Pinterest|LinkedInApp)/i.test(ua);
  }

  function init() {
    // Marque le contexte : la photo (upload) et l'auth (email) s'adaptent
    // via InAppBrowser.isInApp() dans questionnaire.js et auth.js.
    if (isInApp()) document.body.classList.add('is-inapp');
  }

  window.addEventListener('DOMContentLoaded', init);

  return { isInApp, init };

})();
