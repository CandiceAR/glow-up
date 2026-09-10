/* ============================================================
   skinJourney.js — « Skin Journey · Évolution de ta peau »
   Suivi simple : une photo de référence (J0), puis une nouvelle
   analyse tous les 4 jours. On compare 4 critères dans le temps.
   • Données stockées sur le compte (Firestore) + cache local
   • 4 vues : Résumé · Détail · Comparaison photos · Timeline
   ============================================================ */

'use strict';

const SkinJourney = (() => {

  const STORAGE_KEY = 'glowup_journey_v2';
  const CADENCE     = 4;      // jours entre deux analyses
  const MAX_THUMBS  = 8;      // nb max de photos conservées

  // 4 critères suivis (tous 0-100, + = amélioration)
  const METRICS = [
    { key: 'hydratation', label: 'Hydratation', icon: '💧', color: '#4a90d9' },
    { key: 'rougeurs',    label: 'Rougeurs',    icon: '🌸', color: '#cf7b6b' },
    { key: 'texture',     label: 'Texture',     icon: '◍',  color: '#7a9e7e' },
    { key: 'eclat',       label: 'Éclat',       icon: '☀️', color: '#e0a04d' }
  ];

  let _view      = 'resume';   // resume | detail | compare | timeline
  let _metricKey = 'hydratation';
  let _selIdx    = -1;         // entrée sélectionnée (compare/timeline) ; -1 = dernière
  let _justRecorded = false;

  // ─── Dérivation des 4 critères depuis une analyse de peau ──────
  // (source unique — réutilisée par profil.js)
  function metricsFromAnalysis(r) {
    const zv = Object.values(r?.zones || {});
    if (!zv.length) return null;
    const n = zv.length;
    const m = k => zv.reduce((s, z) => s + (z[k] != null ? z[k] : 60), 0) / n;
    const clamp = v => Math.max(20, Math.min(98, Math.round(v)));
    const eclat   = m('eclat');
    const pores   = m('pores');
    const texture = m('texture');
    const redness = m('redness');
    const st = r?.skinType?.type || 'normale';
    const hydraBase = { seche: 52, sensible: 60, normale: 70, mixte: 66, grasse: 76 }[st] || 68;
    return {
      hydratation: clamp(hydraBase * 0.6 + eclat * 0.25 + (100 - redness) * 0.15),
      rougeurs:    clamp(100 - redness),          // moins de rougeurs = mieux
      texture:     clamp((pores + texture) / 2),
      eclat:       clamp(eclat)
    };
  }

  // ─── Persistance (local + Firestore) ──────────────────────────
  function load() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  function save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('[SkinJourney] localStorage:', e.message); }
    try {
      const uid = AppState?.user?.uid;
      if (uid && !AppState.user.isGuest && typeof FirestoreProfile !== 'undefined' && FirestoreProfile.saveJourney) {
        FirestoreProfile.saveJourney(uid, data);
      }
    } catch (e) {}
  }
  function _eligible() { return !!(AppState?.user && !AppState.user.isGuest); }

  // ─── Dates ────────────────────────────────────────────────────
  function getToday() { return new Date().toISOString().split('T')[0]; }
  function daysBetween(d1, d2) { return Math.max(0, Math.round((new Date(d2) - new Date(d1)) / 86400000)); }
  function _daysSinceLast(data) {
    const last = data.entries.at(-1);
    return last ? daysBetween(last.date, getToday()) : 0;
  }
  function _dayLabel(day) { return day === 0 ? 'J0' : 'J+' + day; }
  function _prettyDate(d) {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ─── Compression photo (320px, JPEG 55%) ─────────────────────
  function compressPhoto(dataUrl, cb) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale  = Math.min(1, 320 / img.width);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/jpeg', 0.55));
    };
    img.onerror = () => cb(null);
    img.src = dataUrl;
  }

  // ─── Enregistrement d'une analyse (appelé après chaque analyse) ─
  // opts.silent : amorçage discret de J0 (pas de toast ni d'écran de confirmation)
  function captureAnalysis(opts = {}) {
    if (!_eligible()) return;                       // besoin d'un compte
    const r = AppState?.face?.skinAnalysis;
    if (!r) return;
    const metrics = metricsFromAnalysis(r);
    if (!metrics) return;

    let data = load() || { startDate: getToday(), entries: [] };
    const today = getToday();

    data.entries = (data.entries || []).filter(e => e.date !== today);   // dédup jour
    data.entries.push({ date: today, ts: Date.now(), day: 0, metrics, globalScore: r.globalScore || null, thumb: null });
    data.entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    data.startDate = data.entries[0].date;
    data.entries.forEach(e => { e.day = daysBetween(data.startDate, e.date); });
    _capEntries(data);
    save(data);
    if (!opts.silent) _justRecorded = true;

    const photo = AppState?.face?.photo;
    if (photo) compressPhoto(photo, thumb => {
      if (!thumb) return;
      const d = load(); if (!d) return;
      const e = d.entries.find(x => x.date === today);
      if (!e) return;
      e.thumb = thumb;
      _capThumbs(d);
      save(d);
      if (AppState.screen === 'journey') render();
    });

    if (!opts.silent) showToast('Analyse enregistrée dans ton Skin Journey ✨');
  }

  // Garde J0 + les analyses récentes (métriques légères, on peut en garder beaucoup)
  function _capEntries(data) {
    const MAX = 30;
    if (data.entries.length > MAX) {
      const first = data.entries[0];
      data.entries = [first, ...data.entries.slice(-(MAX - 1))];
    }
  }
  // Limite le nombre de photos stockées (J0 + plus récentes)
  function _capThumbs(data) {
    const withThumb = data.entries.filter(e => e.thumb);
    if (withThumb.length <= MAX_THUMBS) return;
    const keep = new Set([withThumb[0], ...withThumb.slice(-(MAX_THUMBS - 1))]);
    data.entries.forEach(e => { if (e.thumb && !keep.has(e)) e.thumb = null; });
  }

  // ─── Calculs ──────────────────────────────────────────────────
  function _deltas(data) {
    const first = data.entries[0].metrics, last = data.entries.at(-1).metrics;
    const d = {};
    METRICS.forEach(m => { d[m.key] = Math.round((last[m.key] || 0) - (first[m.key] || 0)); });
    d._global = Math.round(METRICS.reduce((s, m) => s + d[m.key], 0) / METRICS.length);
    return d;
  }
  function _avgMetric(entry) {
    return Math.round(METRICS.reduce((s, m) => s + (entry.metrics[m.key] || 0), 0) / METRICS.length);
  }
  function _sign(n) { return (n >= 0 ? '+' : '') + n; }

  // ─── Graphique SVG (ligne) ────────────────────────────────────
  function _chart(values, labels, color, big) {
    const w = 320, h = big ? 150 : 66;
    const padT = big ? 10 : 8, padB = big ? 20 : 8, padL = big ? 26 : 6, padR = 8;
    const n = values.length;
    const x = i => padL + (i * (w - padL - padR) / Math.max(1, n - 1));
    const y = v => padT + (h - padT - padB) * (1 - v / 100);
    const pts  = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${big ? 3.5 : 2.8}" fill="${color}"/>`).join('');
    const grid = big ? [0, 25, 50, 75, 100].map(g =>
      `<line x1="${padL}" x2="${w - padR}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="var(--sand)" stroke-width="1"/>
       <text x="0" y="${(y(g) + 3).toFixed(1)}" font-size="8" fill="var(--muted)">${g}</text>`).join('') : '';
    const xlab = big ? labels.map((l, i) =>
      `<text x="${x(i).toFixed(1)}" y="${h - 4}" font-size="8.5" fill="var(--muted)" text-anchor="middle">${l}</text>`).join('') : '';
    return `<svg class="sj-chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block">
      ${grid}
      <polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>
      ${dots}${xlab}
    </svg>`;
  }

  // ─── Rendu principal / routeur d'états ────────────────────────
  async function initScreen() {
    const content = document.getElementById('skinJourneyContent');
    if (!content) return;
    content.innerHTML = `<p class="loading-placeholder">Chargement…</p>`;
    await _ensureLoaded();
    // Amorçage J0 depuis une analyse d'onboarding existante
    if (!load() && _eligible() && AppState?.face?.skinAnalysis) {
      captureAnalysis({ silent: true });
    }
    render();
  }
  async function _ensureLoaded() {
    if (load()) return;
    const uid = AppState?.user?.uid;
    if (uid && !AppState.user?.isGuest && typeof FirestoreProfile !== 'undefined' && FirestoreProfile.loadJourney) {
      try {
        const remote = await FirestoreProfile.loadJourney(uid);
        if (remote && Array.isArray(remote.entries)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        }
      } catch (e) {}
    }
  }

  function render() {
    const content = document.getElementById('skinJourneyContent');
    if (!content) return;
    const data = load();
    const entries = data?.entries || [];

    if (_justRecorded && entries.length) { _justRecorded = false; content.innerHTML = _vRecorded(data); return; }
    if (!entries.length)     { content.innerHTML = _vEmpty();       return; }
    if (entries.length === 1){ content.innerHTML = _vStarted(data); return; }

    let html;
    switch (_view) {
      case 'detail':   html = _vDetail(data);   break;
      case 'compare':  html = _vCompare(data);  break;
      case 'timeline': html = _vTimeline(data); break;
      default:         html = _vResume(data);
    }
    content.innerHTML = html;
  }

  // ─── En-tête commun ───────────────────────────────────────────
  function _head(sub) {
    return `<header class="sj-head">
      <div class="sj-head-title">SKIN JOURNEY</div>
      <div class="sj-head-sub">${sub || 'Évolution de ta peau'}</div>
    </header>`;
  }

  // ─── État : aucune analyse encore ─────────────────────────────
  function _vEmpty() {
    return `<div class="sj-wrap">
      ${_head()}
      <div class="sj-state">
        <div class="sj-state-ic">📷</div>
        <h1 class="sj-state-title">Commence ton Skin Journey</h1>
        <p class="sj-state-sub">Ta première analyse photo devient ton point de départ. On suivra l'évolution de ta peau au fil du temps ✦</p>
        <button class="btn btn-dark" onclick="SkinJourney.takePhoto()">Faire ma première analyse →</button>
      </div>
    </div>`;
  }

  // ─── État : J0 enregistré, pas encore de 2ᵉ analyse ───────────
  function _vStarted(data) {
    const j0 = data.entries[0];
    const ready = _daysSinceLast(data) >= CADENCE;
    return `<div class="sj-wrap">
      ${_head()}
      <div class="sj-state">
        ${j0.thumb ? `<img class="sj-j0-photo" src="${j0.thumb}" alt="J0">` : `<div class="sj-state-ic">⏳</div>`}
        <div class="sj-badge">J0 · ta photo de référence</div>
        ${ready ? `
          <h1 class="sj-state-title">Il est temps d'une nouvelle photo 📷</h1>
          <p class="sj-state-sub">Reprends une photo dans les mêmes conditions pour voir ta première évolution.</p>
          <button class="btn btn-dark" onclick="SkinJourney.takePhoto()">Prendre une photo →</button>
          <p class="sj-tip" onclick="showScreen('capture')">Comment prendre une bonne photo ?</p>
        ` : `
          <h1 class="sj-state-title">Ton suivi a commencé ✨</h1>
          <p class="sj-state-sub">Prochaine analyse disponible à <strong>J+${CADENCE}</strong> (${_prettyDate(_nextDate(data))}).<br>Reviens bientôt pour reprendre une photo.</p>
        `}
      </div>
    </div>`;
  }
  function _nextDate(data) {
    const last = new Date(data.entries.at(-1).date);
    last.setDate(last.getDate() + CADENCE);
    return last.toISOString().split('T')[0];
  }

  // ─── Bannière (waiting / ready) en tête de résumé ─────────────
  function _banner(data) {
    if (_daysSinceLast(data) >= CADENCE) {
      return `<div class="sj-cta-banner sj-ready">
        <div><strong>Il est temps d'une nouvelle photo 📷</strong><span>Vois comment ta peau a évolué.</span></div>
        <button class="btn btn-dark btn-sm" onclick="SkinJourney.takePhoto()">Prendre</button>
      </div>`;
    }
    return `<div class="sj-cta-banner sj-waiting">
      <span>⏳ Prochaine analyse à J+${data.entries.at(-1).day + CADENCE} · ${_prettyDate(_nextDate(data))}</span>
    </div>`;
  }

  // ─── Vue A : Résumé ───────────────────────────────────────────
  function _vResume(data) {
    const d = _deltas(data);
    const g = d._global;
    const title = g >= 3 ? 'Ta peau s\'améliore ✨' : g <= -3 ? 'Ta peau demande un peu d\'attention' : 'Ta peau se stabilise';
    const values = data.entries.map(_avgMetric);
    const labels = data.entries.map(e => _dayLabel(e.day));
    const cards = METRICS.map(m => `
      <div class="sj-mcard">
        <span class="sj-mcard-ic" style="color:${m.color}">${m.icon}</span>
        <span class="sj-mcard-label">${m.label}</span>
        <strong class="sj-mcard-val ${d[m.key] >= 0 ? 'sj-pos' : 'sj-neg'}">${_sign(d[m.key])}%</strong>
      </div>`).join('');
    return `<div class="sj-wrap">
      ${_head()}
      ${_banner(data)}
      <div class="sj-hero">
        <p class="sj-hero-label">${title}</p>
        <div class="sj-hero-num ${g >= 0 ? 'sj-pos' : 'sj-neg'}">${_sign(g)}%</div>
        <p class="sj-hero-sub">depuis J0</p>
      </div>
      <div class="sj-mcards">${cards}</div>
      <div class="sj-card">
        ${_chart(values, labels, 'var(--orange)', false)}
        <p class="sj-chart-note">Score global · ${data.entries.length} analyses</p>
      </div>
      <div class="sj-actions">
        <button class="btn btn-outline" onclick="SkinJourney.setView('detail')">Voir le détail</button>
        <button class="btn btn-dark" onclick="SkinJourney.takePhoto()">Prendre une photo</button>
      </div>
      <div class="sj-links">
        <button class="sj-link" onclick="SkinJourney.setView('compare')">📸 Comparer les photos</button>
        <button class="sj-link" onclick="SkinJourney.setView('timeline')">📋 Toutes mes analyses</button>
      </div>
    </div>`;
  }

  // ─── Vue B : Détail par critère ───────────────────────────────
  function _vDetail(data) {
    const m = METRICS.find(x => x.key === _metricKey) || METRICS[0];
    const d = _deltas(data);
    const delta = d[m.key];
    const values = data.entries.map(e => e.metrics[m.key] || 0);
    const labels = data.entries.map(e => _dayLabel(e.day));
    const tabs = METRICS.map(x =>
      `<button class="sj-pill${x.key === m.key ? ' active' : ''}" onclick="SkinJourney.setMetric('${x.key}')">${x.label}</button>`).join('');
    return `<div class="sj-wrap">
      ${_backHead('Détail')}
      <div class="sj-pills">${tabs}</div>
      <div class="sj-detail-hero">
        <span class="sj-detail-ic" style="color:${m.color}">${m.icon}</span>
        <div>
          <p class="sj-detail-name">${m.label}</p>
          <div class="sj-detail-num ${delta >= 0 ? 'sj-pos' : 'sj-neg'}">${_sign(delta)}%</div>
          <p class="sj-hero-sub">depuis J0</p>
        </div>
      </div>
      <div class="sj-card">${_chart(values, labels, m.color, true)}</div>
      <p class="sj-interpret">${_interpret(m.key, delta)}</p>
    </div>`;
  }
  function _interpret(key, delta) {
    if (key === 'rougeurs') {
      if (delta >= 8) return 'Tes rougeurs diminuent nettement — ta peau est visiblement plus apaisée ✨';
      if (delta >= 2) return 'Tes rougeurs s\'atténuent doucement. Continue sur cette lancée.';
      if (delta > -2) return 'Tes rougeurs restent stables pour le moment.';
      return 'Tes rougeurs demandent un peu d\'attention en ce moment — on pourra ajuster ta routine.';
    }
    const name = { hydratation: 'Ton hydratation', texture: 'Ta texture', eclat: 'Ton éclat' }[key] || 'Ce critère';
    if (delta >= 8) return `${name} progresse nettement. Ta routine semble bien adaptée ✨`;
    if (delta >= 2) return `${name} s'améliore doucement. Continue comme ça.`;
    if (delta > -2) return `${name} reste stable pour le moment.`;
    return `${name} demande un peu d'attention en ce moment — on pourra ajuster ta routine.`;
  }

  // ─── Vue C : Comparaison photos ───────────────────────────────
  function _vCompare(data) {
    const withThumb = data.entries.filter(e => e.thumb);
    const j0 = data.entries[0];
    let sel = _selEntry(data);
    if (sel === j0) sel = data.entries.at(-1);   // toujours comparer J0 ↔ une analyse ultérieure
    const tabs = data.entries.slice(1).map((e, i) => {
      const idx = i + 1;
      return `<button class="sj-pill${e === sel ? ' active' : ''}" onclick="SkinJourney.setSel(${idx})">${_dayLabel(e.day)}</button>`;
    }).join('');
    const deltaRows = METRICS.map(m => {
      const val = Math.round((sel.metrics[m.key] || 0) - (j0.metrics[m.key] || 0));
      return `<div class="sj-cmp-row">
        <span>${m.icon} ${m.label}</span>
        <strong class="${val >= 0 ? 'sj-pos' : 'sj-neg'}">${_sign(val)}%</strong>
      </div>`;
    }).join('');
    const slot = (e, tag) => `<div class="sj-cmp-slot">
      ${e.thumb ? `<img src="${e.thumb}" alt="${tag}">` : `<div class="sj-cmp-ph">📷<span>pas de photo</span></div>`}
      <span class="sj-cmp-day">${_dayLabel(e.day)}</span>
    </div>`;
    return `<div class="sj-wrap">
      ${_backHead('Comparaison')}
      ${data.entries.length > 2 ? `<div class="sj-pills">${tabs}</div>` : ''}
      <div class="sj-cmp">
        ${slot(j0, 'J0')}
        <div class="sj-cmp-arrow">→</div>
        ${slot(sel, 'sel')}
      </div>
      <div class="sj-card sj-cmp-metrics">${deltaRows}</div>
      ${withThumb.length < 2 ? `<p class="sj-chart-note">Reprends une photo pour enrichir ta comparaison.</p>` : ''}
    </div>`;
  }
  function _selEntry(data) {
    if (_selIdx >= 0 && _selIdx < data.entries.length) return data.entries[_selIdx];
    return data.entries.at(-1);
  }

  // ─── Vue D : Timeline ─────────────────────────────────────────
  function _vTimeline(data) {
    const sel = _selEntry(data);
    const dots = data.entries.map((e, i) => {
      const active = e === sel;
      return `<button class="sj-tl-dot${active ? ' active' : ''}" onclick="SkinJourney.setSel(${i})">
        <span class="sj-tl-mark">${active ? '◉' : '○'}</span>
        <span class="sj-tl-lab">${_dayLabel(e.day)}</span>
      </button>`;
    }).join('<span class="sj-tl-line"></span>');
    const j0 = data.entries[0];
    const rows = METRICS.map(m => {
      const val = Math.round((sel.metrics[m.key] || 0) - (j0.metrics[m.key] || 0));
      return `<div class="sj-cmp-row"><span>${m.icon} ${m.label}</span><strong class="${val >= 0 ? 'sj-pos' : 'sj-neg'}">${_sign(val)}%</strong></div>`;
    }).join('');
    return `<div class="sj-wrap">
      ${_backHead('Mes analyses')}
      <div class="sj-timeline">${dots}</div>
      <div class="sj-card">
        <p class="sj-tl-date">Analyse du ${_prettyDate(sel.date)}</p>
        ${sel === j0 ? `<p class="sj-chart-note">Ton point de départ.</p>` : rows}
      </div>
      ${sel !== j0 ? `<button class="btn btn-outline sj-full" onclick="SkinJourney.setView('compare')">Voir la comparaison →</button>` : ''}
    </div>`;
  }

  // ─── Confirmation (après nouvelle analyse) ────────────────────
  function _vRecorded(data) {
    const last = data.entries.at(-1);
    const hasEvo = data.entries.length >= 2;
    const d = hasEvo ? _deltas(data) : null;
    const recap = hasEvo ? `
      <div class="sj-card sj-recap">
        <p class="sj-recap-title">Résumé de ton évolution</p>
        ${METRICS.map(m => `<div class="sj-cmp-row"><span>${m.icon} ${m.label}</span><strong class="${d[m.key] >= 0 ? 'sj-pos' : 'sj-neg'}">${_sign(d[m.key])}%</strong></div>`).join('')}
      </div>
      <button class="btn btn-dark sj-full" onclick="SkinJourney.setView('resume')">Voir mon évolution →</button>` :
      `<button class="btn btn-dark sj-full" onclick="SkinJourney.initScreen()">Continuer</button>`;
    return `<div class="sj-wrap">
      ${_head()}
      <div class="sj-state">
        <div class="sj-state-ic">✨</div>
        <h1 class="sj-state-title">Nouvelle analyse enregistrée !</h1>
        <p class="sj-state-sub">${_dayLabel(last.day)} ajouté à ton Skin Journey.</p>
      </div>
      ${recap}
    </div>`;
  }

  function _backHead(sub) {
    return `<header class="sj-head sj-head--back">
      <button class="sj-back" onclick="SkinJourney.setView('resume')" aria-label="Retour">‹</button>
      <div><div class="sj-head-title">SKIN JOURNEY</div><div class="sj-head-sub">${sub}</div></div>
    </header>`;
  }

  // ─── Toast ────────────────────────────────────────────────────
  function showToast(msg) {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) { window.showToast(msg); return; }
    const el = document.createElement('div');
    el.className = 'glow-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 400); }, 2600);
  }

  // ─── Actions ──────────────────────────────────────────────────
  function setView(v)  { _view = v; _justRecorded = false; render(); }
  function setMetric(k){ _metricKey = k; render(); }
  function setSel(i)   { _selIdx = i; render(); }
  function takePhoto() { showScreen('capture'); }
  function resetConfirm() {
    if (confirm('Effacer tout ton Skin Journey ? Cette action est définitive.')) {
      localStorage.removeItem(STORAGE_KEY);
      const data = { startDate: getToday(), entries: [] };
      save(data); localStorage.removeItem(STORAGE_KEY);
      _view = 'resume'; _selIdx = -1;
      initScreen();
    }
  }

  return {
    initScreen,
    metricsFromAnalysis,
    captureAnalysis,
    setView, setMetric, setSel, takePhoto,
    resetConfirm,
    render,
    isActive: () => { const d = load(); return !!(d && d.entries && d.entries.length); },
    hasEvolution: () => { const d = load(); return !!(d && d.entries && d.entries.length >= 2); },
    summary: () => { const d = load(); return (d && d.entries && d.entries.length >= 2) ? _deltas(d) : null; },
    METRICS
  };

})();

if (typeof window !== 'undefined') window.SkinJourney = SkinJourney;
