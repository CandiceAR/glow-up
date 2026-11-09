/* ============================================================
   skinRetake.js — « Refaire mon analyse de peau »
   Relance UNIQUEMENT la photo (jamais le questionnaire : on réutilise les réponses déjà enregistrées), calcule un nouveau
   score de peau avec le détail par zone, le range dans l'historique (Skin Journey) et le compare à l'ancien score.
   Ensuite, on PROPOSE de mettre la routine à jour : rien n'est remplacé sans l'accord de l'utilisatrice.
   ============================================================ */
'use strict';

const SkinRetake = (() => {

  const FLAG = 'glow_retake';     // posé quand l'écran photo sert à « Refaire mon analyse » (voir handleCaptureNext dans app.js)
  let _from = 'profil';           // écran d'où elle vient (pour y revenir)
  let _prev = null;               // dernier score connu AVANT la nouvelle analyse
  let _next = null;               // nouvelle analyse (calculée, pas forcément enregistrée)
  let _saved = false;             // le nouveau score est-il dans l'historique ?
  let _hasMakeup = false;         // photo prise avec maquillage ?
  let _proposal = null;           // routine proposée d'après le nouveau résultat

  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _logged = () => !!(AppState && AppState.user && AppState.user.uid && !AppState.user.isGuest);
  const _isNative = () => { const C = window.Capacitor; return !!(C && (typeof C.isNativePlatform === 'function' ? C.isNativePlatform() : (C.platform && C.platform !== 'web'))); };

  // « 9 novembre 2026 » : une date seule (AAAA-MM-JJ) est lue telle quelle, un horodatage complet à l'heure de Paris
  function _fmtDate(s) {
    if (!s) return '';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const d = new Date(dateOnly ? s + 'T12:00:00Z' : s);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: dateOnly ? 'UTC' : 'Europe/Paris' });
  }
  const _fmtShort = s => { const t = _fmtDate(s); return t ? t.replace(/ \d{4}$/, '') : ''; };

  // ─── Données : dernier score connu et score d'avant ───────────
  const _metrics = a => (typeof SkinJourney !== 'undefined' && SkinJourney.metricsFromAnalysis) ? SkinJourney.metricsFromAnalysis(a) : null;
  function _entries() {
    try { return (typeof SkinJourney !== 'undefined' && SkinJourney.entries) ? SkinJourney.entries().filter(e => typeof e.globalScore === 'number') : []; }
    catch (e) { return []; }
  }
  function _savedDate() {
    try { const d = (typeof RoutineSaver !== 'undefined' && RoutineSaver.load) ? RoutineSaver.load() : null; return d && d.savedAt ? String(d.savedAt).slice(0, 10) : null; }
    catch (e) { return null; }
  }
  const _snapEntry = e => e ? { globalScore: e.globalScore, zones: e.zones || null, metrics: e.metrics || null, date: e.date } : null;

  // { cur : dernier score connu, prev : celui d'avant } — l'historique d'abord, sinon l'analyse gardée avec la routine
  function _two() {
    const es = _entries();
    const a = AppState && AppState.face && AppState.face.skinAnalysis;
    const last = es.length ? es[es.length - 1] : null;
    let cur = _snapEntry(last), prev = _snapEntry(es.length > 1 ? es[es.length - 2] : null);
    if (a && a.zones && typeof SkinScore !== 'undefined') {
      const newer = a.analyzedAt && (!last || Date.parse(a.analyzedAt) > (last.ts || 0) + 5000);
      if (newer || !cur) {
        const snap = SkinScore.snapshot(a, _metrics(a), a.analyzedAt ? String(a.analyzedAt).slice(0, 10) : _savedDate());
        if (snap) { if (cur && newer) prev = cur; cur = snap; }
      }
    }
    return { cur, prev };
  }

  // ─── Carte « Mon score de peau » (Mon profil + page routine) ───
  function cardHtml(where) {
    const { cur, prev } = _two();
    const w = _esc(where || 'profil');
    if (!cur) {
      return `<section class="sr-card" data-sr="${w}">
        <h2 class="sr-title">Mon score de peau</h2>
        <p class="sr-text">Tu n'as pas encore de score de peau. Une photo suffit pour le calculer.</p>
        <button class="btn btn-dark sr-btn" onclick="SkinRetake.start('${w}')">Faire mon analyse de peau</button>
      </section>`;
    }
    const delta = (prev && typeof SkinScore !== 'undefined') ? SkinScore.compare(prev, cur).global.delta : null;
    const badge = delta === null ? '' : `<span class="sr-badge ${delta >= 0 ? 'sr-pos' : 'sr-neg'}">${SkinScore.fmtDelta(delta)} point${Math.abs(delta) > 1 ? 's' : ''}</span>`;
    const when = cur.date ? `Analysé le ${_fmtDate(cur.date)}` : 'Dernière analyse';
    const before = (prev && prev.date) ? ` · avant : ${prev.globalScore} (${_fmtShort(prev.date)})` : '';
    const more = _entries().length >= 2 ? `<button class="sr-link" onclick="goToSkinJourney()">Voir mon historique →</button>` : '';
    return `<section class="sr-card" data-sr="${w}">
      <h2 class="sr-title">Mon score de peau</h2>
      <div class="sr-score-row"><span class="sr-score">${cur.globalScore}</span><span class="sr-score-max">/100</span>${badge}</div>
      <p class="sr-meta">${_esc(when)}${_esc(before)}</p>
      <button class="btn btn-dark sr-btn" onclick="SkinRetake.start('${w}')">Refaire mon analyse de peau</button>
      <p class="sr-note">Juste une photo : tu ne refais pas le questionnaire.</p>
      ${more}
    </section>`;
  }

  // ─── Lancer la nouvelle analyse (photo seulement) ──────────────
  function _ensureProfile() {
    try {
      const has = AppState.routine && AppState.routine.ruleApplied;
      if (!has && typeof RoutineSaver !== 'undefined' && RoutineSaver.restoreProfile) RoutineSaver.restoreProfile();
    } catch (e) { /* on continue sans */ }
  }

  function start(from) {
    _from = from || 'profil';
    if (!_logged()) {      // compte obligatoire (le score est rangé dans son historique)
      if (typeof Auth !== 'undefined' && Auth.openRequiredAuthModal) Auth.openRequiredAuthModal(() => start(from));
      return;
    }
    _ensureProfile();
    _prev = _two().cur;               // l'ancien score est gardé pour la comparaison
    // Aucun historique mais une analyse existante : elle devient le premier point de l'historique (date connue si possible)
    try {
      const a = AppState.face && AppState.face.skinAnalysis;
      if (a && _entries().length === 0 && typeof SkinJourney !== 'undefined') {
        SkinJourney.captureAnalysis({ silent: true, date: (a.analyzedAt ? String(a.analyzedAt).slice(0, 10) : (_savedDate() || undefined)) });
        _prev = _two().cur;
      }
    } catch (e) { /* l'historique est un confort */ }
    _next = null; _saved = false; _proposal = null; _hasMakeup = false;
    AppState.face = AppState.face || {};
    AppState.face.hasMakeup = false;
    AppState.face.photo = null;       // il faut une NOUVELLE photo (l'ancienne ne doit pas être ré-analysée par erreur)
    try { sessionStorage.removeItem('prephoto_seen'); } catch (e) { /* on redemandera simplement */ }   // « maquillée ? » est redemandé à chaque photo
    if (_isNative()) { _nativePhoto(); return; }
    try { sessionStorage.setItem(FLAG, '1'); } catch (e) { /* sans stockage, l'écran photo suivra le parcours normal */ }
    showScreen('capture');
  }

  // App iPhone : la caméra web est bloquée dans l'app, on utilise le plugin caméra natif (comme pour le questionnaire)
  async function _nativePhoto() {
    const C = window.Capacitor;
    let Camera = null;
    try { Camera = (typeof C.registerPlugin === 'function') ? C.registerPlugin('Camera') : (C.Plugins && C.Plugins.Camera); } catch (e) { /* plugin introuvable */ }
    if (!Camera || typeof Camera.getPhoto !== 'function') { if (typeof showToast === 'function') showToast('La caméra n’est pas disponible pour le moment.', 'error', 3500); return; }
    try {
      const photo = await Camera.getPhoto({ quality: 80, allowEditing: false, resultType: 'dataUrl', source: 'PROMPT', direction: 'FRONT', saveToGallery: false,
        promptLabelHeader: 'Refais ton analyse', promptLabelPicture: 'Prendre une photo', promptLabelPhoto: 'Choisir dans la galerie', promptLabelCancel: 'Annuler' });
      const dataUrl = photo && (photo.dataUrl || (photo.base64String ? 'data:image/jpeg;base64,' + photo.base64String : null));
      if (dataUrl) { AppState.face.photo = dataUrl; _process(); }
    } catch (e) {
      const msg = (e && (e.message || e.errorMessage)) ? (e.message || e.errorMessage) : String(e);
      if (!/cancel|annul/i.test(msg) && typeof showToast === 'function') showToast('La photo n’a pas pu être prise.', 'error', 3500);   // une annulation volontaire ne dérange pas
    }
  }

  function onCaptured() { try { sessionStorage.removeItem(FLAG); } catch (e) { /* rien */ } _process(); }
  function cancel()     { try { sessionStorage.removeItem(FLAG); } catch (e) { /* rien */ } back(); }
  function back() { showScreen(_from === 'routine' ? 'results' : (_from === 'journey' ? 'journey' : 'profil')); }

  // ─── Analyse de la nouvelle photo ──────────────────────────────
  async function _process() {
    const photo = AppState.face && AppState.face.photo;
    if (!photo) { back(); return; }
    showScreen('skin-retake');
    _renderLoading();
    AppState.face.landmarks = null;      // nouvelle photo → le visage est repéré à nouveau
    let result = null;
    try { result = (typeof SkinAnalysis !== 'undefined') ? await SkinAnalysis.analyzeFromPhoto(photo) : null; } catch (e) { result = null; }
    // Visage non lu (lumière insuffisante, photo floue…) : l'ancien score est conservé tel quel
    if (!result || !result.zones || !Object.keys(result.zones).length) { _renderFail(); return; }
    Object.values(result.zones).forEach(z => { delete z.pixels; });   // gros tableaux inutiles une fois le score calculé (allège la sauvegarde)
    result.analyzedAt = new Date().toISOString();
    _next = result;
    _hasMakeup = !!(AppState.face && AppState.face.hasMakeup);
    if (!_hasMakeup) _commit();           // avec maquillage : on demande avant d'enregistrer
    _proposal = _buildProposal();
    _render();
  }

  // Enregistre le nouveau score : analyse gardée avec le profil + historique
  function _commit() {
    if (_saved || !_next) return;
    AppState.face.skinAnalysis = _next;
    _saved = true;
    try { if (typeof SkinJourney !== 'undefined') SkinJourney.captureAnalysis({ silent: true, hasMakeup: _hasMakeup }); } catch (e) { /* l'historique est un confort */ }
    try {
      const answersLoaded = AppState.questionnaire && AppState.questionnaire.completed && Object.keys(AppState.questionnaire.answers || {}).length;
      if (typeof RoutineSaver !== 'undefined' && answersLoaded) {      // jamais d'enregistrement tant que les réponses ne sont pas rechargées (rien ne doit être écrasé)
        RoutineSaver.saveProfile();
        if (AppState.routine && AppState.routine.ruleApplied) RoutineSaver.save();
      }
    } catch (e) { /* sauvegarde silencieuse */ }
    try { if (window.Track && Track.ga) Track.ga('analyse_refaite', { ecran: _from, score: _next.globalScore }); } catch (e) { /* mesure facultative */ }
  }

  function saveAnyway() { _commit(); _render(); }

  // ─── Routine proposée d'après le nouveau résultat (jamais appliquée sans accord) ───
  function _buildProposal() {
    try {
      const cur = AppState.routine;
      const a = AppState.questionnaire && AppState.questionnaire.answers;
      if (!cur || !cur.ruleApplied || !a || !Object.keys(a).length || typeof RulesEngine === 'undefined') return { kind: 'none' };
      const answers = Object.assign({}, a, { photoData: _next });
      if (answers.complexes && !answers.concerns) answers.concerns = answers.complexes;
      if (!answers.ageGroup && answers.age) answers.ageGroup = answers.age;
      const { routine, log } = RulesEngine.evaluate(answers);
      const same = SkinScore.routineSignature(routine) === SkinScore.routineSignature(cur);
      const sameRule = routine.ruleApplied === cur.ruleApplied;
      return { kind: same ? 'same' : (sameRule ? 'adjust' : 'change'), routine, log, answers, ruleName: routine.ruleName || routine.ruleApplied, curName: cur.ruleName || cur.ruleApplied };
    } catch (e) { return { kind: 'none' }; }
  }

  function askUpdate() {
    const p = _proposal; if (!p || !p.routine) return;
    const what = p.kind === 'adjust'
      ? `Ta routine « ${_esc(p.curName)} » sera ajustée selon ton nouveau résultat.`
      : `Ta routine « ${_esc(p.curName)} » sera remplacée par « ${_esc(p.ruleName)} ».`;
    openModal(`
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="routine-resume-modal">
        <div class="rr-icon">✨</div>
        <h2 class="rr-title">Mettre ta routine à jour ?</h2>
        <p class="rr-sub">${what}<br>Tes produits ajoutés, tes dupes et tes favoris ne changent pas.</p>
        <button class="btn-orange-cta rr-btn" onclick="closeModal(); SkinRetake.applyRoutine()">Oui, mettre à jour</button>
        <button class="btn btn-outline rr-btn" onclick="closeModal(); SkinRetake.keep()">Non, garder ma routine actuelle</button>
      </div>`);
  }

  function applyRoutine() {
    const p = _proposal; if (!p || !p.routine) return;
    if (typeof Subscription !== 'undefined' && Subscription.canGenerateRoutine && !Subscription.canGenerateRoutine()) { Subscription.showRoutineLimit(); return; }
    AppState.routine = Object.assign({}, p.routine, { log: p.log });
    AppState.routine.seed = Math.random().toString(36).slice(2) + Date.now().toString(36);   // nouvelle sélection de produits pour cette routine
    AppState.routineChoice = 'skincare';
    try { ProductCatalog.getRecommended(p.answers); } catch (e) { /* la page routine recalcule */ }
    try { RoutineSaver.saveProfile(); RoutineSaver.save(); } catch (e) { /* sauvegarde silencieuse */ }
    try { if (typeof Subscription !== 'undefined' && Subscription.markRoutineGenerated) Subscription.markRoutineGenerated(); } catch (e) { /* compteur facultatif */ }
    try { if (window.Track && Track.ga) Track.ga('routine_mise_a_jour', { ecran: _from, regle: p.routine.ruleApplied }); } catch (e) { /* mesure facultative */ }
    if (typeof showToast === 'function') showToast('Ta routine est à jour ✨', 'success', 3000);
    showScreen('results');
  }

  function keep() {
    if (typeof showToast === 'function') showToast('Ta routine actuelle est conservée ✓', 'success', 2800);
    back();
  }

  // ─── Écrans ─────────────────────────────────────────────────────
  function _el() { return document.getElementById('skinRetakeContent'); }

  function _renderLoading() {
    const c = _el(); if (!c) return;
    c.innerHTML = `<div class="skin-loading-screen">
      <div class="skin-scan-anim"><div class="skin-scan-face"><div class="skin-scan-line"></div></div></div>
      <p class="skin-loading-title">Analyse de ta peau en cours…</p>
      <p class="skin-loading-sub">Détection des zones · Calcul de ton score ✦</p>
    </div>`;
  }

  function _renderFail() {
    const c = _el(); if (!c) return;
    c.innerHTML = `<div class="sr-wrap"><div class="sr-fail">
      <span class="sr-fail-ic">○</span>
      <h1 class="sr-h1">On n'a pas pu lire ton visage</h1>
      <p class="sr-text">Pour un bon résultat : lumière du jour (face à une fenêtre), visage de face, cheveux dégagés, sans lunettes de soleil.</p>
      <p class="sr-text"><strong>Ton score précédent n'a pas changé.</strong> Tu peux réessayer maintenant ou plus tard.</p>
      <button class="btn btn-dark sr-btn" onclick="SkinRetake.start('${_esc(_from)}')">Reprendre une photo</button>
      <button class="btn btn-outline sr-btn" onclick="SkinRetake.back()">Plus tard</button>
    </div></div>`;
  }

  const _MED_NOTE = `<p class="diag-disclaimer"><strong>Indicateurs cosmétiques, à titre informatif.</strong> Glow Up n'est pas un dispositif médical : il ne pose aucun diagnostic et ne remplace pas l'avis d'un médecin ou d'un dermatologue. Si une marque, un grain de beauté ou une irritation te préoccupe ou change, parles-en à un professionnel de santé.</p>`;

  function _routineBlock() {
    const p = _proposal || { kind: 'none' };
    if (!(AppState.routine && AppState.routine.ruleApplied)) {
      return `<section class="sr-section"><h2 class="sr-h2">Ta routine</h2>
        <p class="sr-text">Tu n'as pas encore de routine personnalisée.</p>
        <button class="btn btn-dark sr-btn" onclick="goToSkincare()">Créer ma routine ✦</button></section>`;
    }
    if (p.kind === 'same') {
      return `<section class="sr-section sr-routine"><h2 class="sr-h2">Ta routine</h2>
        <p class="sr-text">Bonne nouvelle : ta routine actuelle reste adaptée à ton nouveau résultat. Tu n'as rien à changer.</p>
        <button class="btn btn-outline sr-btn" onclick="SkinRetake.keep()">Garder ma routine actuelle ✓</button></section>`;
    }
    if (p.kind === 'change' || p.kind === 'adjust') {
      const txt = p.kind === 'adjust'
        ? `Ton nouveau résultat permet d'ajuster ta routine « ${_esc(p.curName)} » : quelques étapes changeraient.`
        : `Ton nouveau résultat correspond mieux à la routine « ${_esc(p.ruleName)} ».`;
      return `<section class="sr-section sr-routine"><h2 class="sr-h2">Ta routine</h2>
        <p class="sr-text">${txt} Tu peux la mettre à jour, ou garder ta routine actuelle. <strong>Rien ne change sans ton accord.</strong></p>
        <button class="btn btn-dark sr-btn" onclick="SkinRetake.askUpdate()">Mettre à jour ma routine</button>
        <button class="btn btn-outline sr-btn" onclick="SkinRetake.keep()">Garder ma routine actuelle</button></section>`;
    }
    return `<section class="sr-section sr-routine"><h2 class="sr-h2">Ta routine</h2>
      <p class="sr-text">Ta routine actuelle est conservée.</p>
      <button class="btn btn-outline sr-btn" onclick="SkinRetake.keep()">Voir ma routine</button></section>`;
  }

  function _render() {
    const c = _el(); if (!c || !_next) return;
    const snap = SkinScore.snapshot(_next, _metrics(_next), String(_next.analyzedAt).slice(0, 10));
    const cmp = SkinScore.compare(_prev, snap);
    const g = cmp.global, d = g.delta;
    const deltaLine = (d === null) ? '' :
      `<p class="sr-hero-delta ${d >= 0 ? 'sr-pos' : 'sr-neg'}">${SkinScore.fmtDelta(d)} point${Math.abs(d) > 1 ? 's' : ''} depuis ${cmp.prevDate ? 'le ' + _esc(_fmtDate(cmp.prevDate)) : 'ta dernière analyse'} <span>(avant : ${g.prev})</span></p>`;

    const zoneRows = cmp.zones.map(z => `
      <div class="sr-zone">
        <span class="sr-zone-l">${_esc(z.label)}</span>
        <div class="sr-bar"><div class="sr-bar-fill" style="width:${Math.max(4, Math.min(100, z.next))}%"></div></div>
        <strong class="sr-zone-v">${z.next}</strong>
        <span class="sr-zone-d ${z.delta === null ? '' : (z.delta >= 0 ? 'sr-pos' : 'sr-neg')}">${z.delta === null ? '' : SkinScore.fmtDelta(z.delta)}</span>
      </div>`).join('');

    const icons = { hydratation: '💧', rougeurs: '🌸', texture: '◍', eclat: '☀️' };
    const metricCards = cmp.metrics.map(m => `
      <div class="sr-metric">
        <span class="sr-metric-ic">${icons[m.key] || ''}</span>
        <span class="sr-metric-l">${_esc(m.label)}</span>
        <strong class="sr-metric-v">${m.next}%</strong>
        <span class="sr-metric-d ${m.delta === null ? '' : (m.delta >= 0 ? 'sr-pos' : 'sr-neg')}">${m.delta === null ? '&nbsp;' : SkinScore.fmtDelta(m.delta)}</span>
      </div>`).join('');

    const hist = _entries().slice(-5).reverse();
    const histHtml = hist.length >= 2 ? `<section class="sr-section"><h2 class="sr-h2">Mes derniers scores</h2>
      ${hist.map(e => `<div class="sr-hist-row"><span>${_esc(_fmtDate(e.date))}</span><strong>${e.globalScore}/100</strong></div>`).join('')}
      <button class="sr-link" onclick="goToSkinJourney()">Voir tout mon historique →</button></section>` : '';

    const makeupBlock = _hasMakeup ? `<div class="sr-warn">
        <p>⚠ Photo prise avec maquillage : le résultat peut être moins précis.</p>
        ${_saved
          ? '<p>Ce score est enregistré.</p>'
          : `<p>Ce score n'est pas encore enregistré : <strong>ton score précédent reste ta référence.</strong></p>
             <button class="btn btn-outline sr-btn" onclick="SkinRetake.saveAnyway()">Enregistrer ce score quand même</button>
             <button class="btn btn-ghost sr-btn" onclick="SkinRetake.start('${_esc(_from)}')">Refaire la photo sans maquillage</button>`}
      </div>` : '';

    c.innerHTML = `<div class="sr-wrap">
      <header class="sr-head"><span class="sr-eyebrow">Nouvelle analyse</span><h1 class="sr-h1">Ton nouveau score de peau</h1></header>
      ${makeupBlock}
      <section class="sr-hero">
        <div class="sr-hero-num">${g.next}<span>/100</span></div>
        ${deltaLine}
        <p class="sr-verdict">${_esc(SkinScore.verdict(d))}</p>
      </section>
      <div id="sr-overlay"></div>
      <section class="sr-section"><h2 class="sr-h2">Détail par zone</h2>${zoneRows}</section>
      ${metricCards ? `<section class="sr-section"><h2 class="sr-h2">Tes 4 critères</h2><div class="sr-metrics">${metricCards}</div></section>` : ''}
      ${histHtml}
      ${_routineBlock()}
      <div class="sr-actions"><button class="btn btn-ghost sr-btn" onclick="SkinRetake.back()">${_from === 'routine' ? 'Retour à ma routine' : (_from === 'journey' ? 'Retour à mon suivi' : 'Retour à mon profil')}</button></div>
      ${_MED_NOTE}
    </div>`;

    // Carte du visage avec les zones, comme à la première analyse
    try {
      const t = document.getElementById('sr-overlay');
      if (t && typeof SkinAnalysis !== 'undefined' && AppState.face.photo && AppState.face.landmarks) {
        SkinAnalysis.renderFaceOverlay(t, AppState.face.photo, AppState.face.landmarks, _next);
      }
    } catch (e) { /* la carte du visage est un plus */ }
    window.scrollTo(0, 0);
  }

  return { cardHtml, start, onCaptured, cancel, back, saveAnyway, askUpdate, applyRoutine, keep };
})();

if (typeof window !== 'undefined') window.SkinRetake = SkinRetake;
