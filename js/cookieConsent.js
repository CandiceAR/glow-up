/* ============================================================
   cookieConsent.js — Bandeau de consentement cookies (RGPD / CNIL)
   • Aucun cookie analytics avant le clic « Accepter »
   • Choix mémorisé (localStorage) · modifiable via openCookieSettings()
   ============================================================ */

'use strict';

const CookieConsent = (() => {

  const KEY = 'glow_cookie_consent';   // 'accepted' | 'refused'

  function _get()        { try { return localStorage.getItem(KEY); } catch { return null; } }
  function hasConsent()  { return _get() === 'accepted'; }

  function _html() {
    return `
      <div class="cookie-consent-inner">
        <div class="cookie-consent-text">
          <strong>🍪 On respecte ta vie privée</strong>
          <p>Glow Up utilise des cookies de mesure d'audience (Google Analytics) pour comprendre
             combien de personnes utilisent l'app et l'améliorer. Aucune donnée n'est partagée à des fins publicitaires.
             Tu peux accepter ou refuser — ton choix est modifiable à tout moment.</p>
        </div>
        <div class="cookie-consent-actions">
          <button class="cookie-btn cookie-btn--refuse" onclick="CookieConsent.refuse()">Refuser</button>
          <button class="cookie-btn cookie-btn--accept" onclick="CookieConsent.accept()">Accepter</button>
        </div>
      </div>`;
  }

  function show() {
    if (document.getElementById('cookieConsent')) return;
    const el = document.createElement('div');
    el.id = 'cookieConsent';
    el.className = 'cookie-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Consentement aux cookies');
    el.innerHTML = _html();
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('cookie-consent--visible'));
  }

  function hide() {
    const el = document.getElementById('cookieConsent');
    if (!el) return;
    el.classList.remove('cookie-consent--visible');
    setTimeout(() => el.remove(), 350);
  }

  function accept() {
    try { localStorage.setItem(KEY, 'accepted'); } catch {}
    if (typeof Auth !== 'undefined' && Auth.enableAnalytics) Auth.enableAnalytics();
    hide();
  }

  function refuse() {
    try { localStorage.setItem(KEY, 'refused'); } catch {}
    hide();
  }

  // Rouvrir le bandeau pour changer d'avis (lien « Gérer les cookies »)
  function reopen() {
    try { localStorage.removeItem(KEY); } catch {}
    hide();
    setTimeout(show, 360);
  }

  function init() {
    if (!_get()) show();   // pas encore de choix → afficher le bandeau
  }

  // Lien public pour le pied de page / menu
  window.openCookieSettings = reopen;

  window.addEventListener('DOMContentLoaded', init);

  return { init, accept, refuse, reopen, hasConsent };

})();
