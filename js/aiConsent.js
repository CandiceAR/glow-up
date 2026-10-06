/* ============================================================
   aiConsent.js — Accord avant d'envoyer une photo à l'IA
   Une photo (visage ou produit) est transmise à notre prestataire d'intelligence artificielle
   (Anthropic) pour produire l'analyse. Avant le PREMIER envoi, on demande l'accord de
   l'utilisatrice ; elle peut le retirer à tout moment (Profil).
   Sans accord : l'analyse du visage reste 100 % locale (MediaPipe) et l'identification
   de produit par photo n'est pas lancée.
   ============================================================ */

const AIConsent = (() => {
  'use strict';
  const KEY = 'glow_ai_photo_consent_v1';

  function granted() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function revoke()  { try { localStorage.removeItem(KEY); } catch (e) {} }
  function _grant()  { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  // Retourne une Promise<boolean> : true si l'envoi est autorisé.
  function ensure() {
    if (granted()) return Promise.resolve(true);
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'aic-overlay';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-labelledby', 'aicTitle');
      wrap.innerHTML = `
        <div class="aic-box">
          <h2 id="aicTitle">Avant d'analyser ta photo</h2>
          <p>Pour analyser ta peau ou identifier un produit, Glow Up envoie ta photo, de façon sécurisée, à notre prestataire d'<strong>intelligence artificielle (Anthropic)</strong>.</p>
          <ul>
            <li>Elle sert uniquement à produire ton analyse.</li>
            <li>Nos serveurs d'analyse ne la stockent pas.</li>
            <li>Tu peux retirer ton accord à tout moment depuis ton Profil.</li>
          </ul>
          <p class="aic-small">Plus de détails dans notre <a href="/confidentialite/" target="_blank" rel="noopener">politique de confidentialité</a>.</p>
          <button type="button" class="btn btn-dark aic-yes">J'accepte</button>
          <button type="button" class="btn btn-outline aic-no">Pas maintenant</button>
        </div>`;
      const done = ok => { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(ok); };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      wrap.querySelector('.aic-yes').onclick = () => { _grant(); done(true); };
      wrap.querySelector('.aic-no').onclick  = () => done(false);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      const y = wrap.querySelector('.aic-yes'); if (y && y.focus) y.focus();
    });
  }

  return { ensure, granted, revoke };
})();

if (typeof window !== 'undefined') window.AIConsent = AIConsent;
