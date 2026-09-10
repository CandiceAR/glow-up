/* ============================================================
   analytics.js — Balises GA4 (Firebase Analytics)
   • Envoie les events UNIQUEMENT si le consentement cookies est donné
     (window._glowAnalyticsOn passé à true par auth.js enableAnalytics()).
   • screen_view à chaque changement d'écran (appelé depuis showScreen).
   • Capture automatique de TOUS les clics boutons/liens, avec des noms
     clairs pour les actions clés (analyse, achat, dupe, coach, abonnement,
     articles…). Destination : Google Analytics (G-HLB50Z689S).
   ============================================================ */
'use strict';
(function () {

  function _on() { return !!window._glowAnalyticsOn; }

  function ga(name, params) {
    try {
      if (_on() && typeof firebase !== 'undefined' && typeof firebase.analytics === 'function') {
        firebase.analytics().logEvent(name, params || {});
      }
    } catch (e) {}
  }

  function screen(name) {
    if (!name) return;
    ga('screen_view', { screen_name: name, firebase_screen: name });
  }

  function _label(el) {
    const t = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('data-track-label'))) ||
              el.textContent || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  // ─── Nom d'événement : data-track explicite, sinon heuristiques clés ──
  function _eventName(el, href, onclick) {
    const dt = el.getAttribute && el.getAttribute('data-track');
    if (dt) return dt;
    if (/startGlowUp|goToSkincare|goToMakeup/.test(onclick)) return 'analyse_start';
    if (/amazon\./i.test(href) || ((el.className || '') + '').includes('btn-amazon')) return 'achat_produit';
    if (/^\/blog/.test(href)) return 'article_ouvrir';
    if (/dupe-finder/.test(onclick)) return 'dupe_ouvrir';
    if (/routine-analyzer/.test(onclick)) return 'routine_analyzer_ouvrir';
    if (/'coach'/.test(onclick)) return 'coach_ouvrir';
    if (/'premium'|showPaywall/.test(onclick)) return 'abonnement_clic';
    return 'clic_bouton';
  }

  document.addEventListener('click', function (e) {
    const el = e.target.closest && e.target.closest('a, button, [role="button"], [data-track]');
    if (!el) return;
    const href    = (el.getAttribute && el.getAttribute('href')) || '';
    const onclick = (el.getAttribute && el.getAttribute('onclick')) || '';
    const name    = _eventName(el, href, onclick);

    const params = { ecran: (window.AppState && AppState.screen) || 'home' };
    const lbl = _label(el);
    if (lbl) params.libelle = lbl;
    const pid = el.getAttribute && el.getAttribute('data-track-id');
    if (pid) params.produit = pid;
    if (name === 'achat_produit' && href) params.lien = href.slice(0, 120);

    ga(name, params);
  }, true);

  window.Track = { ga, screen };

})();
