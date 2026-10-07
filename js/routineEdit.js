/* ============================================================
   routineEdit.js — « Modifier ma routine »
   Remplacer le produit d'une étape précise (matin / soir) sans refaire la routine.

   Principes :
   • On NE touche PAS aux étapes ni au moteur de routine : on enregistre seulement, par étape,
     le produit choisi (clé = section | type d'étape | n° d'occurrence).
   • Les choix sont stockés à part (localStorage + synchronisés avec la sauvegarde de routine /
     Firestore via RoutineSaver) : une NOUVELLE routine ne les efface jamais sans action de l'utilisatrice.
   • Produit hors catalogue : marque + nom saisis par l'utilisatrice, RIEN d'autre n'est ajouté
     (ni actifs, ni prix, ni explication) tant que ce n'est pas vérifié.
   ============================================================ */

const RoutineEdit = (() => {
  'use strict';

  const KEY = 'glow_routine_edits_v1';
  let _ov = null;            // { clé: { id } | { custom:{brand,name,category} } }
  let _moment = 'matin';
  let _ctx = null;           // étape en cours de remplacement
  let _q = '';               // recherche en cours

  // Catégories du catalogue acceptables pour chaque type d'étape (« même rôle »)
  const PICK_CATS = {
    cleanser: ['cleanser'], toner: ['toner', 'mist'], serum: ['serum'], treatment: ['serum'],
    exfoliant: ['exfoliant'], eye: ['eye', 'eye_cream'], eyepatch: ['eye'], moisturizer: ['moisturizer'],
    oil: ['oil'], mask: ['mask'], nightmask: ['nightmask', 'mask'], spf: ['spf', 'sunscreen'], lipbalm: ['lipbalm']
  };
  const CAT_LABEL = { cleanser: 'Nettoyant', toner: 'Tonique', serum: 'Sérum', exfoliant: 'Exfoliant', eye: 'Contour des yeux',
    eye_cream: 'Contour des yeux', moisturizer: 'Crème', oil: 'Huile', mask: 'Masque', nightmask: 'Masque de nuit',
    spf: 'Protection solaire', sunscreen: 'Protection solaire', lipbalm: 'Baume lèvres', mist: 'Brume' };

  // ─── Stockage ────────────────────────────────────────────────
  const _uid = () => (typeof AppState !== 'undefined' && AppState.user && AppState.user.uid) || null;
  const _lsKey = () => (_uid() ? KEY + '_' + _uid() : KEY);

  function _load() {
    if (_ov) return _ov;
    try { _ov = JSON.parse(localStorage.getItem(_lsKey()) || localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { _ov = {}; }
    if (typeof _ov !== 'object' || Array.isArray(_ov)) _ov = {};
    return _ov;
  }
  function _persist() {
    try { localStorage.setItem(_lsKey(), JSON.stringify(_load())); } catch (e) { /* stockage plein / bloqué */ }
    // Synchronise avec la sauvegarde de routine (Firestore si connectée)
    try { if (typeof RoutineSaver !== 'undefined' && RoutineSaver.save) RoutineSaver.save(); } catch (e) {}
  }
  function exportAll() { return JSON.parse(JSON.stringify(_load())); }
  // Reprise depuis la sauvegarde cloud / locale : on FUSIONNE (les choix de cet appareil gardent la priorité)
  function importAll(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    _ov = { ...o, ..._load() };
    try { localStorage.setItem(_lsKey(), JSON.stringify(_ov)); } catch (e) {}
  }
  function migrateGuestToUser(uid) {
    if (!uid) return;
    try {
      const g = localStorage.getItem(KEY);
      if (g) {
        const merged = { ...(JSON.parse(g) || {}), ...(JSON.parse(localStorage.getItem(KEY + '_' + uid) || '{}') || {}) };
        localStorage.setItem(KEY + '_' + uid, JSON.stringify(merged));
        localStorage.removeItem(KEY);
      }
    } catch (e) {}
    _ov = null;
  }

  // ─── Résolution d'un choix → produit prêt à afficher ─────────
  const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const _esc  = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function _hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function resolve(key) {
    const e = _load()[key];
    if (!e || e.reset) return null;        // « reset » = choix annulé (marque conservée pour que l'annulation se synchronise)
    if (e.id) {
      const p = ((AppState.products && AppState.products.catalog) || []).find(x => x.id === e.id && x.active !== false);
      return p ? { ...p, userChoice: true } : null;      // produit retiré du catalogue → retour au choix Glow Up
    }
    if (e.custom && e.custom.name) {
      const c = e.custom;
      const q = encodeURIComponent(((c.brand || '') + ' ' + c.name).trim());
      return { id: 'custom_' + _hash(((c.brand || '') + '|' + c.name).toLowerCase()), brand: c.brand || '', name: c.name,
               category: c.category || 'other', custom: true, userChoice: true, price: null, imageUrl: '',
               amazonUrl: 'https://www.amazon.fr/s?k=' + q + '&tag=glowupapp-21' };
    }
    return null;
  }
  // Enregistre directement un choix pour une étape (utilisé par « Ajouter à ma routine » du scan)
  function setChoice(key, entry) {
    if (!key || !entry) return;
    _load()[key] = entry;
    _persist();
    _refreshScreens();
  }
  function hasChoice(key) { const e = _load()[key]; return !!e && !e.reset; }

  // ─── Rafraîchir l'écran visible après un changement ──────────
  function _refreshScreens() {
    try {
      const s = AppState && AppState.screen;
      if (s === 'results' && typeof RoutineRenderer !== 'undefined') RoutineRenderer.renderResults();
      else if (s === 'profil' && typeof Profil !== 'undefined' && Profil.render) Profil.render();
    } catch (e) { console.warn('[RoutineEdit] rafraîchissement:', e.message); }
  }

  // ─── Vue 1 : liste des étapes ────────────────────────────────
  function _hasRoutine() { return !!(AppState && AppState.routine && AppState.routine.ruleApplied); }

  function open(moment) {
    if (!_hasRoutine()) {
      if (typeof showToast === 'function') showToast("Crée d'abord ta routine, tu pourras ensuite la modifier ✦", 'info', 3500);
      return;
    }
    if (moment === 'matin' || moment === 'soir') _moment = moment;
    _ctx = null; _q = '';
    _renderList();
  }
  function close() {
    if (typeof closeModal === 'function') closeModal();
    _ctx = null;
    _refreshScreens();
  }
  function setMoment(m) { _moment = m; _renderList(); }

  function _thumb(p) {
    return p && p.imageUrl
      ? `<img src="${_esc(p.imageUrl)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('🧴'))">`
      : '🧴';
  }

  function _renderList() {
    const rows = RoutineRenderer.resolveSection(_moment);
    const body = rows.length ? rows.map((r, i) => {
      const p = r.product;
      const who = r.kept
        ? `<span class="re-prod-name">Ton produit actuel</span><span class="re-prod-sub">${_esc((r.kept.brand ? r.kept.brand + ' ' : '') + (r.kept.name || ''))}</span>`
        : p
          ? `<span class="re-prod-brand">${_esc(p.brand)}</span><span class="re-prod-name">${_esc(p.name)}</span>`
          : '<span class="re-prod-name re-muted">Aucun produit pour cette étape</span>';
      return `
        <div class="re-row${r.overridden ? ' re-row--mine' : ''}">
          <span class="re-num">${String(i + 1).padStart(2, '0')}</span>
          <div class="re-row-main">
            <div class="re-step">${_esc(r.step.step === 'serum' ? 'Sérum' : r.step.label)}${r.overridden ? ' <em class="re-badge">Ton choix</em>' : ''}</div>
            <div class="re-prod"><span class="re-thumb">${_thumb(p)}</span><span class="re-prod-txt">${who}</span></div>
          </div>
          <div class="re-row-actions">
            <button type="button" class="re-btn" data-key="${_esc(r.key)}" onclick="RoutineEdit.pick(this.dataset.key)">Changer</button>
            ${r.overridden ? `<button type="button" class="re-link" data-key="${_esc(r.key)}" onclick="RoutineEdit.reset(this.dataset.key)">Rétablir</button>` : ''}
          </div>
        </div>`;
    }).join('') : '<p class="re-muted">Aucune étape pour ce moment de la journée.</p>';

    _modal(`
      <button class="modal-close" onclick="RoutineEdit.close()" aria-label="Fermer">×</button>
      <div class="re-wrap">
        <h2 class="re-title">Modifier ma routine</h2>
        <p class="re-sub">Choisis l'étape à changer. Ta routine et tes autres produits ne bougent pas, et ton choix est enregistré.</p>
        <div class="re-tabs">
          <button type="button" class="re-tab${_moment === 'matin' ? ' active' : ''}" onclick="RoutineEdit.setMoment('matin')">☀️ Matin</button>
          <button type="button" class="re-tab${_moment === 'soir' ? ' active' : ''}" onclick="RoutineEdit.setMoment('soir')">🌙 Soir</button>
        </div>
        <div class="re-list">${body}</div>
        <button type="button" class="btn btn-dark re-done" onclick="RoutineEdit.close()">Terminé</button>
      </div>`);
  }

  function reset(key) {
    const o = _load();
    if (hasChoice(key)) { o[key] = { reset: true }; _persist(); if (typeof showToast === 'function') showToast('Choix de Glow Up rétabli', 'info', 2200); }
    _renderList(); _refreshScreens();
  }

  // ─── Vue 2 : choisir le produit de remplacement ──────────────
  function pick(key) {
    const row = RoutineRenderer.resolveSection(_moment).find(r => r.key === key);
    if (!row) return;
    const type = row.step.step;
    _ctx = { key, step: row.step, type, label: row.step.label, cats: PICK_CATS[type] || [type], currentId: row.product && row.product.id };
    _q = '';
    _renderPicker();
  }

  function _candidates() {
    const answers = (AppState.questionnaire && AppState.questionnaire.answers) || {};
    let pool = ((AppState.products && AppState.products.catalog) || []).filter(p => p.active !== false);
    if (typeof AgeGuard !== 'undefined') { try { pool = AgeGuard.filter(pool, AgeGuard.age(answers)); } catch (e) {} }
    const req = RoutineRenderer.stepRequiredActives(_ctx.step);
    const hasReq = p => req.some(a => RoutineRenderer.productHasActive(p, a));
    const sortFn = (a, b) => ((b.rating || 0) - (a.rating || 0)) || ((a.price || 999) - (b.price || 999));
    const qn = _norm(_q).trim();
    if (qn) {
      const words = qn.split(/\s+/);
      const hits = pool.filter(p => { const t = _norm((p.brand || '') + ' ' + (p.name || '')); return words.every(w => t.includes(w)); });
      const same = hits.filter(p => _ctx.cats.includes(p.category)).sort(sortFn);
      const other = hits.filter(p => !_ctx.cats.includes(p.category)).sort(sortFn);
      return [{ title: same.length ? 'Résultats — même type de produit' : '', items: same }, { title: other.length ? 'Autres catégories' : '', items: other }];
    }
    const same = pool.filter(p => _ctx.cats.includes(p.category));
    const best = req.length ? same.filter(hasReq).sort(sortFn) : [];
    const rest = same.filter(p => !best.includes(p)).sort(sortFn);
    return [
      { title: best.length ? 'Même rôle dans ta routine' : '', items: best },
      { title: best.length ? 'Autres produits de cette catégorie' : 'Produits de cette catégorie', items: rest }
    ];
  }

  function _candHtml(p) {
    const mine = p.id === _ctx.currentId;
    const price = p.price != null ? `<span class="re-cand-price">${p.price.toFixed(2).replace('.', ',')} €</span>` : '';
    const cat = CAT_LABEL[p.category] ? `<span class="re-cand-cat">${CAT_LABEL[p.category]}</span>` : '';
    return `
      <button type="button" class="re-cand${mine ? ' is-current' : ''}" data-id="${_esc(p.id)}" onclick="RoutineEdit.choose(this.dataset.id)">
        <span class="re-thumb">${_thumb(p)}</span>
        <span class="re-cand-txt"><span class="re-prod-brand">${_esc(p.brand)}</span><span class="re-prod-name">${_esc(p.name)}</span>${cat}</span>
        ${price}${mine ? '<span class="re-check" aria-label="Produit actuel">✓</span>' : ''}
      </button>`;
  }
  function _listHtml() {
    const groups = _candidates();
    const total = groups.reduce((s, g) => s + g.items.length, 0);
    if (!total) return `<p class="re-muted re-empty">Aucun produit trouvé${_q ? ' pour « ' + _esc(_q) + ' »' : ''}. Tu peux l'ajouter toi-même juste en dessous.</p>`;
    return groups.filter(g => g.items.length).map(g =>
      `${g.title ? `<h3 class="re-group">${g.title}</h3>` : ''}${g.items.slice(0, 40).map(_candHtml).join('')}${g.items.length > 40 ? '<p class="re-muted">Affine ta recherche pour voir les autres produits.</p>' : ''}`
    ).join('');
  }

  function _renderPicker() {
    const req = RoutineRenderer.stepRequiredActives(_ctx.step);
    _modal(`
      <button class="modal-close" onclick="RoutineEdit.close()" aria-label="Fermer">×</button>
      <div class="re-wrap">
        <button type="button" class="re-back" onclick="RoutineEdit.back()">← Retour</button>
        <h2 class="re-title">Remplacer : ${_esc(_ctx.type === 'serum' ? 'Sérum' : _ctx.label)}</h2>
        <p class="re-sub">${req.length ? 'Nous mettons en premier les produits qui remplissent le même rôle que l\'étape.' : 'Choisis un produit de cette catégorie, ou cherche dans tout le catalogue.'}</p>
        <input type="search" id="reSearch" class="re-search" placeholder="Rechercher une marque ou un produit…" value="${_esc(_q)}" oninput="RoutineEdit.search(this.value)" autocomplete="off">
        <div class="re-cands" id="reCands">${_listHtml()}</div>
        <details class="re-custom">
          <summary>Mon produit n'est pas dans la liste</summary>
          <p class="re-muted">Indique simplement la marque et le nom. Nous n'ajoutons aucune autre information sur ce produit (ni actifs, ni prix, ni avis) tant qu'elle n'est pas vérifiée.</p>
          <input type="text" id="reCustBrand" class="re-search" placeholder="Marque" maxlength="60" autocomplete="off">
          <input type="text" id="reCustName" class="re-search" placeholder="Nom du produit" maxlength="90" autocomplete="off">
          <button type="button" class="btn btn-dark re-done" onclick="RoutineEdit.useCustom()">Utiliser ce produit</button>
        </details>
      </div>`);
  }
  function back() { _ctx = null; _renderList(); }
  function search(v) {
    _q = v || '';
    const el = document.getElementById('reCands');   // on ne redessine que la liste (le champ garde le focus)
    if (el) el.innerHTML = _listHtml();
  }

  function choose(id) {
    if (!_ctx || !id) return;
    _load()[_ctx.key] = { id };
    _persist();
    if (typeof showToast === 'function') showToast('Produit remplacé ✦', 'success', 2200);
    _ctx = null; _renderList(); _refreshScreens();
  }
  function useCustom() {
    if (!_ctx) return;
    const brand = ((document.getElementById('reCustBrand') || {}).value || '').trim();
    const name  = ((document.getElementById('reCustName') || {}).value || '').trim();
    if (name.length < 2) { if (typeof showToast === 'function') showToast('Indique au moins le nom du produit', 'warning', 2600); return; }
    _load()[_ctx.key] = { custom: { brand, name, category: (_ctx.cats[0] || 'other') } };
    _persist();
    if (typeof showToast === 'function') showToast('Produit ajouté à ta routine ✦', 'success', 2400);
    _ctx = null; _renderList(); _refreshScreens();
  }

  function _modal(html) {
    if (typeof openModal !== 'function') return;
    openModal(html);
    const box = document.getElementById('modalBox');
    if (box) box.scrollTop = 0;
  }

  return { open, close, setMoment, pick, back, search, choose, useCustom, reset,
           resolve, hasChoice, setChoice, exportAll, importAll, migrateGuestToUser };
})();

if (typeof window !== 'undefined') window.RoutineEdit = RoutineEdit;
