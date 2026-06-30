/* ============================================================
   inAppBrowser.js — Détection des navigateurs intégrés (webview)
   Instagram / Facebook / TikTok / Snapchat… bloquent la caméra
   ET la connexion Google. On invite la visiteuse à ouvrir
   Glow Up dans son vrai navigateur (Safari / Chrome).
   ============================================================ */

'use strict';

const InAppBrowser = (() => {

  const SITE = 'https://glowupskin.app';
  const KEY  = 'glow_inapp_dismissed';

  // ─── Détection webview réseau social ──────────────────────────
  function isInApp() {
    const ua = navigator.userAgent || navigator.vendor || '';
    // Instagram, Facebook (FBAN/FBAV/FB_IAB), TikTok, Snapchat, Line, Pinterest, LinkedIn
    return /(FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|\bLine\/|Pinterest|LinkedInApp)/i.test(ua);
  }

  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }

  function _html() {
    return `
      <div class="inapp-inner">
        <span class="inapp-icon">🌐</span>
        <div class="inapp-text">
          <strong>Ouvre Glow Up dans ton navigateur</strong>
          <span>Depuis l'app Instagram, la <b>caméra</b> et la <b>connexion Google</b> sont bloquées. Ouvre Glow Up dans Safari ou Chrome pour tout débloquer.</span>
        </div>
        <div class="inapp-actions">
          <button class="inapp-btn inapp-btn--copy" onclick="InAppBrowser.copyLink(this)">Copier le lien</button>
          <button class="inapp-btn inapp-btn--close" onclick="InAppBrowser.dismiss()" aria-label="Fermer">✕</button>
        </div>
      </div>
      <div class="inapp-hint">
        Astuce : appuie sur <b>⋯</b> (en haut à droite) puis <b>« Ouvrir dans le navigateur »</b>.
      </div>`;
  }

  function show() {
    if (document.getElementById('inAppBanner')) return;
    const el = document.createElement('div');
    el.id = 'inAppBanner';
    el.className = 'inapp-banner';
    el.setAttribute('role', 'dialog');
    el.innerHTML = _html();
    document.body.appendChild(el);
    document.body.classList.add('has-inapp-banner');
    requestAnimationFrame(() => el.classList.add('inapp-banner--visible'));

    // Android : tentative d'ouverture directe dans Chrome via intent
    if (isAndroid()) {
      const open = document.createElement('button');
      open.className = 'inapp-btn inapp-btn--open';
      open.textContent = 'Ouvrir dans Chrome';
      open.onclick = openInChrome;
      el.querySelector('.inapp-actions').prepend(open);
    }
  }

  function openInChrome() {
    // Intent Android : force l'ouverture dans Chrome
    window.location.href =
      'intent://glowupskin.app/#Intent;scheme=https;package=com.android.chrome;end';
  }

  async function copyLink(btn) {
    try {
      await navigator.clipboard.writeText(SITE);
      if (btn) { btn.textContent = '✓ Lien copié !'; setTimeout(() => { btn.textContent = 'Copier le lien'; }, 2500); }
    } catch {
      // Fallback : sélection manuelle
      if (typeof showToast === 'function') showToast('Copie le lien : glowupskin.app', 'info', 5000);
    }
  }

  function dismiss() {
    try { sessionStorage.setItem(KEY, '1'); } catch {}
    const el = document.getElementById('inAppBanner');
    if (el) { el.classList.remove('inapp-banner--visible'); setTimeout(() => el.remove(), 300); }
    document.body.classList.remove('has-inapp-banner');
  }

  function init() {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(KEY) === '1'; } catch {}
    if (isInApp() && !dismissed) show();
  }

  window.addEventListener('DOMContentLoaded', init);

  return { isInApp, show, dismiss, copyLink, init };

})();
