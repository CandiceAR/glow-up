/* ============================================================
   contest.js — Carte « 🎁 Concours » (jeu concours Instagram, 30/10 → 08/11/2026, heure de Paris).
   Affichée sous la routine (écran résultat) et dans « Mon profil ». Toutes les règles sont vérifiées côté SERVEUR
   (lib/contest.js via /api/saveProducts, modes contest…) : ici, on ne fait qu'afficher et envoyer.
   Aperçu visuel avant le 30/10 : ajouter ?concours=apercu à l'adresse (la participation reste refusée par le serveur).
   ============================================================ */
'use strict';

const Contest = (() => {

  const START = '2026-10-30 00:00:00', END = '2026-11-08 23:59:59', HIDE = '2026-11-20 00:00:00';   // heure de Paris
  const DRAW = '12 novembre', ACCOUNT = '@glowupandshiny', RULES_URL = '/reglement-concours/';

  const _parisNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
  const _preview = () => { try { return /[?&]concours=apercu/.test(location.search); } catch (e) { return false; } };

  // 'before' (rien d'affiché) · 'open' · 'closed' (message « Concours terminé ») · 'hidden' (après le tirage)
  function phase() {
    if (_preview()) return 'open';
    const n = _parisNow();
    if (n < START) return 'before';
    if (n <= END) return 'open';
    return n < HIDE ? 'closed' : 'hidden';
  }

  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function _post(payload) {
    const u = (typeof firebase !== 'undefined') && firebase.auth && firebase.auth().currentUser;
    const idToken = u ? await u.getIdToken() : null;
    const resp = await fetch(apiUrl('/api/saveProducts'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, payload, { idToken }))
    });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, ok: resp.ok, data };
  }

  // Coque de la carte (le contenu est chargé par mount()). Retourne '' hors période d'affichage.
  function html(where) {
    const ph = phase();
    if (ph === 'before' || ph === 'hidden') return '';
    return `<section class="contest-card" data-contest="${_esc(where || '')}" aria-live="polite"><div class="contest-body"><p class="contest-muted">…</p></div></section>`;
  }

  const _intro = () => `<h3 class="contest-title">🎁 Concours</h3>
    <p class="contest-text">Gagne une carte Sephora de 50&nbsp;€&nbsp;! Écris ton pseudo Instagram pour participer.</p>`;
  const _info = () => `Tirage au sort le ${DRAW}, annonce en story sur ${ACCOUNT}. Vérifie que tu es bien abonnée au compte.`;

  function _set(root, inner) { const b = root.querySelector('.contest-body'); if (b) b.innerHTML = inner; }

  function _viewClosed(root) {
    _set(root, `<h3 class="contest-title">🎁 Concours</h3><p class="contest-text">Concours terminé, tirage le ${DRAW}.</p>`);
  }
  function _viewDone(root, handle, justNow) {
    _set(root, `<h3 class="contest-title">🎁 Concours</h3>` + (justNow
      ? `<p class="contest-ok">C'est bon, tu participes&nbsp;! ${_esc(_info())}</p>`
      : `<p class="contest-ok">Tu participes déjà avec ${_esc(handle)}</p><p class="contest-muted">${_esc(_info())}</p>`));
  }
  function _viewLogin(root) {
    _set(root, _intro() + `<button class="btn btn-dark contest-btn" onclick="Contest.login()">Me connecter pour participer</button>`);
  }
  function _viewNoRoutine(root) {
    _set(root, _intro() + `<p class="contest-note">Pour participer, il faut d'abord <strong>générer ta routine personnalisée</strong>.</p>
      <button class="btn btn-dark contest-btn" onclick="showScreen('home')">Créer ma routine</button>`);
  }
  function _viewForm(root) {
    const id = 'ct' + Math.random().toString(36).slice(2, 7);
    _set(root, _intro() + `
      <label class="contest-label" for="${id}h">Ton pseudo Instagram</label>
      <input id="${id}h" class="contest-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
             maxlength="31" placeholder="@tonpseudo" oninput="Contest.fmt(this)">
      <label class="contest-check" for="${id}c">
        <input id="${id}c" type="checkbox">
        <span>J'ai 18 ans ou plus, je réside en France métropolitaine et j'accepte <a href="${RULES_URL}" target="_blank" rel="noopener">le règlement du jeu</a></span>
      </label>
      <p class="contest-error" role="alert" hidden></p>
      <button class="btn btn-dark contest-btn" onclick="Contest.join(this)">Je participe</button>`);
  }

  // Le champ garde toujours un « @ » devant, en minuscules, sans caractère interdit, 30 caractères au plus
  function fmt(input) {
    let v = String(input.value || '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30);
    input.value = v ? '@' + v : '';
  }

  function login() {
    if (typeof Auth !== 'undefined' && Auth.openRequiredAuthModal) Auth.openRequiredAuthModal(() => mount());
    else if (typeof openAuthModal === 'function') openAuthModal();
  }

  async function _status() { return _post({ mode: 'contestStatus' }); }

  // Remplit toutes les cartes présentes dans la page
  async function mount() {
    const roots = document.querySelectorAll('.contest-card');
    if (!roots.length) return;
    const ph = phase();
    roots.forEach(r => { if (ph === 'closed') _viewClosed(r); });
    if (ph === 'closed') return;
    if (!(AppState && AppState.user && AppState.user.uid)) { roots.forEach(_viewLogin); return; }
    try {
      let r = await _status();
      // Routine tout juste générée mais pas encore enregistrée sur le compte : on l'enregistre puis on revérifie
      if (r.ok && !r.data.hasRoutine && AppState.routine && AppState.routine.ruleApplied && typeof RoutineSaver !== 'undefined') {
        try { RoutineSaver.save(); } catch (e) { /* on retente ci-dessous */ }
        for (let i = 0; i < 4 && r.ok && !r.data.hasRoutine; i++) { await new Promise(res => setTimeout(res, 900)); r = await _status(); }
      }
      if (r.status === 401) { roots.forEach(_viewLogin); return; }
      if (!r.ok) { roots.forEach(x => _set(x, `<h3 class="contest-title">🎁 Concours</h3><p class="contest-muted">Indisponible pour le moment, réessaie dans un instant.</p>`)); return; }
      roots.forEach(x => {
        if (r.data.entry) _viewDone(x, r.data.entry.instagram_handle, false);
        else if (!r.data.hasRoutine) _viewNoRoutine(x);
        else _viewForm(x);
      });
    } catch (e) {
      roots.forEach(x => _set(x, `<h3 class="contest-title">🎁 Concours</h3><p class="contest-muted">Indisponible pour le moment, réessaie dans un instant.</p>`));
    }
  }

  async function join(btn) {
    const root = btn.closest('.contest-card');
    const input = root.querySelector('.contest-input'), cb = root.querySelector('input[type=checkbox]'), err = root.querySelector('.contest-error');
    const show = m => { err.textContent = m; err.hidden = !m; };
    fmt(input);
    if (!input.value) { show('Écris ton pseudo Instagram.'); return; }
    if (!cb.checked) { show('Coche la case pour accepter le règlement.'); return; }
    show(''); btn.disabled = true; btn.textContent = 'Un instant…';
    try {
      const r = await _post({ mode: 'contestJoin', handle: input.value, consent: true });
      if (r.ok && r.data.ok) { document.querySelectorAll('.contest-card').forEach(x => _viewDone(x, r.data.entry.instagram_handle, true)); return; }
      if (r.data && r.data.error === 'already') { document.querySelectorAll('.contest-card').forEach(x => _viewDone(x, r.data.handle, false)); return; }
      if (r.status === 401) { login(); }
      show((r.data && r.data.message) || 'Un souci est survenu, réessaie dans un instant.');
    } catch (e) {
      show('Connexion impossible pour le moment. Réessaie.');
    }
    btn.disabled = false; btn.textContent = 'Je participe';
  }

  return { html, mount, join, fmt, login, phase };
})();

if (typeof window !== 'undefined') window.Contest = Contest;
