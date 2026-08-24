/* ============================================================
   profil.js — « Mon Profil » : tableau de bord central.
   En-tête (3 mesures) + sous-onglets (Ta peau · Mes produits ·
   Mon évolution · Mes dupes). Réutilise les données/features
   existantes — ne recode pas la routine/dupe/analyse.
   ============================================================ */

const Profil = (() => {

  let _tab = 'overview';          // overview | peau | produits | evolution | dupe
  let _moment = 'matin';

  function initScreen() {
    _tab = 'overview';
    _ensureProfileLoaded();   // ne pas reproposer le questionnaire s'il est déjà fait
    render();
  }

  // Si le profil est déjà complété (sauvegardé) mais pas chargé en mémoire → le restaurer
  function _ensureProfileLoaded() {
    try {
      const loaded = AppState?.questionnaire?.answers?.skinType || AppState?.routine?.ruleApplied;
      if (loaded) return;
      if (typeof RoutineSaver !== 'undefined' && RoutineSaver.hasCompletedProfile && RoutineSaver.hasCompletedProfile()
          && RoutineSaver.restoreProfile) {
        RoutineSaver.restoreProfile();
      }
    } catch (e) {}
  }
  function setTab(t)   { _tab = t; render(); }
  function setMoment(m){ _moment = m; render(); }

  const _answers = () => AppState?.questionnaire?.answers || {};
  const _face    = () => AppState?.face?.skinAnalysis || null;
  function _name() {
    const d = AppState?.user?.displayName;
    if (d) return d.split(' ')[0];
    const e = AppState?.user?.email;
    if (e) return e.split('@')[0];
    return 'toi';
  }
  function _today() {
    return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  }

  // ─── 3 mesures (estimées depuis l'analyse photo) ──────────────
  function _metrics() {
    const f = _face();
    if (!f) return null;
    const z = f.zones || {};
    const cl = v => Math.max(20, Math.min(98, Math.round(v)));
    const eclat   = cl((z.glow != null ? z.glow : (f.eclat === 'très_terne' ? 0.4 : f.eclat === 'terne' ? 0.55 : 0.7)) * 100);
    const texture = cl((f.texture === 'irrégulière' ? 0.55 : f.texture === 'légèrement_irrégulière' ? 0.7 : 0.85) * 100 - (z.pores || 0) * 15);
    const hydra   = cl((f.skinType?.type === 'seche' ? 62 : f.skinType?.type === 'grasse' ? 80 : 74) - (z.redness || 0) * 10);
    return { hydra, eclat, texture };
  }
  function _renderMetrics() {
    const m = _metrics();
    if (!m) return `<div class="pf-metrics-empty" onclick="startGlowUp()">📸 Fais ton analyse de peau pour voir tes indicateurs →</div>`;
    const card = (ic, label, val, color) => `
      <div class="pf-metric">
        <span class="pf-metric-ic">${ic}</span>
        <span class="pf-metric-label">${label}</span>
        <strong class="pf-metric-val">${val}%</strong>
        <div class="pf-bar"><div class="pf-bar-fill" style="width:${val}%;background:${color}"></div></div>
      </div>`;
    return `<div class="pf-metrics">
      ${card('💧', 'Hydratation', m.hydra, '#4a90d9')}
      ${card('☀️', 'Éclat', m.eclat, 'var(--orange)')}
      ${card('◍', 'Texture', m.texture, 'var(--success)')}
    </div>`;
  }

  // ─── Sous-onglets ─────────────────────────────────────────────
  const TABS = [['peau', '💧', 'Ta peau'], ['produits', '🧴', 'Mes produits'], ['evolution', '📈', 'Mon évolution'], ['dupe', '✨', 'Mes dupes']];
  function _renderTabs() {
    return `<div class="pf-tabs">${TABS.map(([k, e, l]) =>
      `<button class="pf-tab${_tab === k ? ' active' : ''}" onclick="Profil.setTab('${k}')"><span class="pf-tab-ic">${e}</span><span class="pf-tab-l">${l}</span></button>`).join('')}</div>`;
  }

  // ─── Contenus ─────────────────────────────────────────────────
  function _renderContent() {
    switch (_tab) {
      case 'peau':      return _cPeau();
      case 'produits':  return _cProduits();
      case 'evolution': return _cEvolution();
      case 'dupe':      return _cDupe();
      default:          return _cOverview();
    }
  }

  function _cOverview() { return _routineActuelle() + _evolutionTeaser(); }

  function _routineActuelle() {
    const r = AppState.routine;
    if (!r || !r.ruleApplied) {
      return `<section class="pf-section pf-empty">
        <p>Tu n'as pas encore de routine personnalisée.</p>
        <button class="btn btn-dark" onclick="goToSkincare()">Créer ma routine ✦</button>
      </section>`;
    }
    const steps = (_moment === 'soir' ? (r.soir || []) : (r.matin || []));
    const prods = steps
      .map(s => (typeof RoutineRenderer !== 'undefined' && RoutineRenderer.findBestProductForStep) ? RoutineRenderer.findBestProductForStep(s.step) : null)
      .filter(Boolean).slice(0, 4);
    const thumbs = prods.length
      ? prods.map(p => `<div class="pf-rprod">${p.imageUrl ? `<img src="${p.imageUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="pf-rprod-ph">🧴</div>'}</div>`).join('')
      : '<p class="pf-muted">—</p>';
    return `<section class="pf-section">
      <h2 class="pf-h2">Ta routine actuelle</h2>
      <div class="pf-moment">
        <button class="pf-moment-btn${_moment === 'matin' ? ' active' : ''}" onclick="Profil.setMoment('matin')">Matin</button>
        <button class="pf-moment-btn${_moment === 'soir' ? ' active' : ''}" onclick="Profil.setMoment('soir')">Soir</button>
      </div>
      <div class="pf-routine-prods">${thumbs}</div>
      <button class="btn btn-outline pf-cta" onclick="goToRoutine()">Voir ma routine complète →</button>
    </section>`;
  }

  function _evolutionTeaser() {
    return `<section class="pf-section pf-evo" onclick="Profil.setTab('evolution')" role="button" tabindex="0">
      <div class="pf-evo-head"><h2 class="pf-h2">Évolution de ta peau</h2><span class="pf-evo-arrow">→</span></div>
      <p class="pf-muted">Suis ta progression dans le temps.</p>
    </section>`;
  }

  function _cPeau() {
    const a = _answers(), f = _face();
    const stLabel = { normale: 'Normale', grasse: 'Grasse', seche: 'Sèche', mixte: 'Mixte', sensible: 'Sensible' };
    const ageLabel = { 'moins-15': 'Moins de 15 ans', 'moins-20': '15 – 20 ans', '20-25': '20 – 25 ans', '25-30': '25 – 30 ans', '30-40': '30 – 40 ans', '40+': '40 ans et plus' };
    const row = (l, v) => v ? `<div class="pf-row"><span class="pf-row-l">${l}</span><span class="pf-row-v">${v}</span></div>` : '';
    const besoins = (a.complexes || []).join(' · ');
    const prefs = [...(a.labels || []), ...((a.avoidIngredients || []).map(x => 'sans ' + x))].join(' · ');
    const hasData = a.skinType || f?.skinType?.type || a.ageGroup;
    return `<section class="pf-section">
      <h2 class="pf-h2">Ta peau</h2>
      ${hasData ? `
        ${row('Âge', ageLabel[a.ageGroup] || a.ageGroup)}
        ${row('Type de peau', stLabel[a.skinType || f?.skinType?.type] || a.skinType)}
        ${row('Besoins', besoins)}
        ${row('Texture préférée', a.texture)}
        ${row('Budget', a.budget)}
        ${row('Préférences', prefs)}
      ` : `<div class="pf-empty"><p>Fais ton diagnostic pour compléter ton profil.</p><button class="btn btn-dark" onclick="startGlowUp()">Commencer ✦</button></div>`}
    </section>`;
  }

  function _cProduits() {
    const list = (typeof CurrentRoutine !== 'undefined' && CurrentRoutine.list) ? CurrentRoutine.list() : [];
    const ra = AppState.routineAnalysis;
    const prods = list.length ? list : (ra?.products || []);
    if (!prods.length) {
      return `<section class="pf-section"><h2 class="pf-h2">Mes produits utilisés</h2>
        <div class="pf-empty"><p>Ajoute les produits que tu utilises pour un suivi personnalisé.</p>
        <button class="btn btn-dark" onclick="showScreen('routine-analyzer')">Analyser ma routine 🔬</button></div></section>`;
    }
    const img = p => p.photo || (p.id ? (AppState.products.catalog || []).find(x => x.id === p.id)?.imageUrl : null);
    return `<section class="pf-section"><h2 class="pf-h2">Mes produits utilisés</h2>
      <div class="pf-prod-list">${prods.map(p => {
        const src = img(p);
        return `<div class="pf-prod">${src ? `<img src="${src}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="pf-prod-ph">🧴</div>'}
          <span class="pf-prod-name">${p.brand ? p.brand + ' ' : ''}${p.name}</span></div>`;
      }).join('')}</div></section>`;
  }

  function _cEvolution() {
    return `<section class="pf-section"><h2 class="pf-h2">Évolution de ta peau</h2>
      <div class="pf-empty"><span class="pf-empty-ic">📈</span>
        <p>Ta courbe de progression apparaîtra ici après plusieurs analyses. Reviens dans quelques semaines pour voir ta peau évoluer ✦</p>
        ${typeof goToSkinJourney === 'function' ? `<button class="btn btn-outline" onclick="goToSkinJourney()">Mon Skin Journey →</button>` : ''}
      </div></section>`;
  }

  function _cDupe() {
    return `<section class="pf-section"><h2 class="pf-h2">Mes produits dupe</h2>
      <p class="pf-muted">Les équivalents malins des produits qui te font envie.</p>
      <div class="pf-empty"><span class="pf-empty-ic">✨</span>
        <p>Scanne un produit que tu veux acheter — on te trouve son dupe au meilleur prix.</p>
        <button class="btn btn-dark" onclick="showScreen('dupe-finder')">Trouver un dupe 🔍</button>
      </div></section>`;
  }

  function render() {
    const c = document.getElementById('profilContent');
    if (!c) return;
    c.innerHTML = `
      <div class="pf-header">
        <div class="pf-hello">
          <h1>Bonjour ${_name()} ✨</h1>
          <div class="pf-today"><span>Ta peau aujourd'hui</span><span class="pf-date">${_today()}</span></div>
        </div>
        ${_renderMetrics()}
      </div>
      <div class="pf-body">${_renderContent()}</div>
      ${_renderTabs()}`;
  }

  return { initScreen, render, setTab, setMoment };
})();

if (typeof window !== 'undefined') window.Profil = Profil;
