/* ============================================================
   routineAnalyzer.js — « Analyser ma routine actuelle »
   Produits + photo + mini-quiz → analyse experte IA :
   verdict par produit, cohérence globale, routine optimisée, score /100.
   Aperçu gratuit (score + 3 actions) · détail Premium.
   ============================================================ */

const RoutineAnalyzer = (() => {

  let S = { view: 'intro', products: [], quiz: { objectives: [], skinDesc: [], bother: [], duration: '', notes: '' },
            faceSummary: null, photo: null, result: null, busy: false };

  // ─── Mini-questionnaire (4 questions) ─────────────────────────
  const QUIZ = [
    { key: 'objectives', label: 'Quel est ton objectif principal ?', max: 3, multi: true, options: [
      ['acne', 'Acné / imperfections'], ['rides', 'Rides'], ['ridules', 'Ridules'], ['taches', 'Taches pigmentaires'],
      ['rougeurs', 'Rougeurs'], ['hydratation', 'Hydratation'], ['eclat', 'Éclat'], ['pores', 'Pores visibles'],
      ['sebum', 'Excès de sébum'], ['sensibilite', 'Sensibilité'] ] },
    { key: 'skinDesc', label: 'Comment décrirais-tu ta peau ?', max: 3, multi: true, options: [
      ['seche', 'Sèche'], ['mixte', 'Mixte'], ['grasse', 'Grasse'], ['normale', 'Normale'], ['deshydratee', 'Déshydratée'],
      ['sensible', 'Sensible'], ['reactive', 'Réactive'], ['mature', 'Mature'], ['jenesaispas', 'Je ne sais pas'] ] },
    { key: 'bother', label: 'Qu\'est-ce qui te dérange le plus aujourd\'hui ?', max: 3, multi: true, options: [
      ['boutons', 'Boutons'], ['points_noirs', 'Points noirs'], ['rougeurs', 'Rougeurs'], ['tiraillements', 'Tiraillements'],
      ['brillance', 'Brillance'], ['rides', 'Rides'], ['taches', 'Taches'], ['manque_eclat', 'Manque d\'éclat'],
      ['texture', 'Texture irrégulière'], ['pores', 'Pores visibles'] ] },
    { key: 'duration', label: 'Depuis combien de temps utilises-tu cette routine ?', max: 1, multi: false, options: [
      ['commence', 'Je viens de commencer'], ['moins1mois', 'Moins d\'un mois'], ['1a3mois', '1 à 3 mois'],
      ['plus3mois', 'Plus de 3 mois'], ['plus6mois', 'Plus de 6 mois'], ['plus1an', 'Plus d\'un an'] ] }
  ];

  function _isPremium() { return typeof Subscription !== 'undefined' && Subscription.getPlan && Subscription.getPlan() !== 'free'; }
  function _catProd(p) { return p.id ? (AppState.products.catalog || []).find(x => x.id === p.id) : null; }
  function _mkKey() { return 'ra_' + Math.random().toString(36).slice(2, 9); }

  // ─── Cycle de vie ─────────────────────────────────────────────
  function initScreen() {
    S = { view: 'intro', products: [], quiz: { objectives: [], skinDesc: [], bother: [], duration: '', notes: '' },
          faceSummary: null, photo: null, result: null, busy: false };
    render();
  }

  function render() {
    const c = document.getElementById('routineAnalyzerContent');
    if (!c) return;
    let html = '';
    switch (S.view) {
      case 'intro':     html = _vIntro(); break;
      case 'products':  html = _vProducts(); break;
      case 'photo':     html = _vPhoto(); break;
      case 'quiz':      html = _vQuiz(); break;
      case 'analyzing': html = _vLoading(); break;
      case 'results':   html = _vResults(); break;
      default:          html = _vIntro();
    }
    c.innerHTML = html;
    if (S.view === 'analyzing') _startLoadingAnim(); else _stopLoadingAnim();
  }

  function _vIntro() {
    return `
      <div class="ra-intro">
        <span class="ra-hero-emoji">🔬</span>
        <h1>Analyser ma routine</h1>
        <p>Ajoute les produits que tu utilises, prends une photo (optionnel) et réponds à 4 questions. Glow Up analyse toute ta routine comme un vrai expert : ce qui te va, ce qu'il faut changer, et ta note sur 100.</p>
        <div class="ra-steps-preview">
          <div class="ra-step-prev"><span>1</span> Ta routine</div>
          <div class="ra-step-prev"><span>2</span> Photo + 4 questions</div>
          <div class="ra-step-prev"><span>3</span> Ton analyse</div>
        </div>
        <button class="btn btn-dark ra-btn-main" onclick="RoutineAnalyzer.go('products')">Commencer ✦</button>
      </div>`;
  }

  // ─── Étape 1 : produits ───────────────────────────────────────
  function _vProducts() {
    return `
      <div class="ra-products">
        <div class="ra-head"><span class="ra-step-badge">Étape 1/3</span><h2>Ta routine actuelle</h2>
          <p>Ajoute tes produits : nettoyant, sérum, crème, contour des yeux, SPF, huiles, traitements…</p></div>

        <button type="button" class="btn btn-dark ra-photo-add" onclick="RoutineAnalyzer.pickProductPhoto()">📷 Ajouter un produit en photo</button>
        <div id="raProdIdMsg" class="ra-prodid-msg"></div>
        <div class="ra-or"><span>ou</span></div>

        <div class="ra-search-wrap">
          <input type="text" id="raSearch" class="ra-input" autocomplete="off"
                 placeholder="🔍 Rechercher un produit (ex : CeraVe, Effaclar…)" oninput="RoutineAnalyzer.search(this.value)">
          <div id="raSearchResults" class="ra-search-results"></div>
        </div>
        <div id="raManualZone" class="ra-manual-zone"></div>
        <button type="button" class="ra-manual-toggle" onclick="RoutineAnalyzer.toggleManual()">⌨️ Saisir à la main (marque, nom, type)</button>
        <div id="raList" class="ra-list">${_renderList()}</div>
        <div class="ra-nav">
          <button class="btn btn-ghost" onclick="RoutineAnalyzer.go('intro')">← Retour</button>
          <button class="btn btn-dark" onclick="RoutineAnalyzer.toStep2()">Continuer →</button>
        </div>
        <input type="file" id="raProdPhoto" accept="image/*" style="display:none" onchange="RoutineAnalyzer.onProductPhoto(this)">
      </div>`;
  }

  // Image d'un produit : photo prise par l'utilisatrice (prioritaire) sinon image catalogue
  function _prodImg(e) {
    if (e.photo) return e.photo;
    if (e.id) { const p = (AppState.products.catalog || []).find(x => x.id === e.id); if (p?.imageUrl) return p.imageUrl; }
    return null;
  }

  function _renderList() {
    if (!S.products.length) return '<p class="ra-empty">Aucun produit pour l\'instant.</p>';
    return S.products.map(e => {
      const img = _prodImg(e);
      return `
      <div class="ra-item">
        ${img ? `<img src="${img}" class="ra-item-img" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="ra-item-img ra-item-noimg">🧴</div>'}
        <div class="ra-item-main">
          <span class="ra-item-cat">${_catLabel(e.category)}</span>
          <span class="ra-item-name">${e.brand ? e.brand + ' ' : ''}${e.name}</span>
        </div>
        <button type="button" class="ra-remove" onclick="RoutineAnalyzer.removeProduct('${e._key}')">×</button>
      </div>`;
    }).join('');
  }

  function _catLabel(c) { return (typeof CurrentRoutine !== 'undefined') ? CurrentRoutine.catLabel(c) : c; }

  function search(q) {
    const box = document.getElementById('raSearchResults');
    if (!box) return;
    const res = (typeof CurrentRoutine !== 'undefined') ? CurrentRoutine.searchCatalog(q) : [];
    if (!q || q.trim().length < 2) { box.innerHTML = ''; return; }
    if (!res.length) { box.innerHTML = '<div class="ra-noresult">Aucun résultat — ajoute-le à la main 👇</div>'; return; }
    box.innerHTML = res.map(p => `
      <div class="ra-result" onclick="RoutineAnalyzer.addFromCatalog('${p.id}')">
        <span class="ra-result-brand">${p.brand || ''}</span>
        <span class="ra-result-name">${p.name || ''}</span>
        <span class="ra-result-add">+ Ajouter</span>
      </div>`).join('');
  }

  function addFromCatalog(id) {
    const p = (AppState.products.catalog || []).find(x => x.id === id);
    if (!p || S.products.some(e => e.id === id)) return;
    S.products.push({ _key: _mkKey(), id: p.id, brand: p.brand || '', name: p.name || '', category: p.category || 'other', fromCatalog: true });
    const inp = document.getElementById('raSearch'); if (inp) inp.value = '';
    const box = document.getElementById('raSearchResults'); if (box) box.innerHTML = '';
    _refreshList();
  }

  function toggleManual() {
    const zone = document.getElementById('raManualZone');
    if (!zone) return;
    if (zone.dataset.open === '1') { zone.dataset.open = '0'; zone.innerHTML = ''; return; }
    zone.dataset.open = '1';
    const cats = (typeof CurrentRoutine !== 'undefined') ? CurrentRoutine.CATEGORIES : [{ value: 'other', label: 'Autre' }];
    const opts = cats.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
    zone.innerHTML = `
      <div class="ra-manual-form">
        <input type="text" id="raBrand" class="ra-input" placeholder="Marque (ex : CeraVe)">
        <input type="text" id="raName"  class="ra-input" placeholder="Nom du produit *">
        <select id="raCat" class="ra-input">${opts}</select>
        <button type="button" class="btn btn-dark" onclick="RoutineAnalyzer.addManual()">Ajouter</button>
      </div>`;
  }

  function addManual() {
    const brand = document.getElementById('raBrand')?.value?.trim() || '';
    const name  = document.getElementById('raName')?.value?.trim() || '';
    const cat   = document.getElementById('raCat')?.value || 'other';
    if (!name) { showToast('Indique au moins le nom du produit', 'warning'); return; }
    S.products.push({ _key: _mkKey(), id: null, brand, name, category: cat, fromCatalog: false });
    const zone = document.getElementById('raManualZone'); if (zone) { zone.dataset.open = '0'; zone.innerHTML = ''; }
    showToast('Produit ajouté ✦', 'success', 1500);
    _refreshList();
  }

  function removeProduct(key) { S.products = S.products.filter(e => e._key !== key); _refreshList(); }
  function _refreshList() { const el = document.getElementById('raList'); if (el) el.innerHTML = _renderList(); }

  // ─── Ajout d'un produit par PHOTO (identification IA) ─────────
  function pickProductPhoto() { document.getElementById('raProdPhoto')?.click(); }

  function _compress(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1100 / Math.max(img.naturalWidth, img.naturalHeight), 1);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * scale);
        cv.height = Math.round(img.naturalHeight * scale);
        const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Petite vignette (~220px) légère, conservée pour l'afficher dans la routine
  function _thumb(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(220 / Math.max(img.naturalWidth, img.naturalHeight), 1);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * scale);
        cv.height = Math.round(img.naturalHeight * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function _openManualPrefill(d) {
    const zone = document.getElementById('raManualZone');
    if (zone && zone.dataset.open !== '1') toggleManual();
    setTimeout(() => {
      const b = document.getElementById('raBrand'); if (b) b.value = d.brand || '';
      const n = document.getElementById('raName');  if (n) n.value = d.name || '';
      const c = document.getElementById('raCat');   if (c && d.category) c.value = d.category;
    }, 0);
  }

  function onProductPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const msg = document.getElementById('raProdIdMsg');
    if (msg) msg.innerHTML = '<div class="ra-prodid-loading"><span class="ra-mini-spin"></span> 🔍 Identification du produit…</div>';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const photo = await _compress(e.target.result);
      const thumb = await _thumb(e.target.result);   // petite vignette conservée pour la routine
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 25000);
        const resp = await fetch(apiUrl('/api/identifyProduct'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo }), signal: controller.signal
        });
        clearTimeout(tid);
        const data = await resp.json().catch(() => null);
        if (msg) msg.innerHTML = '';
        if (!resp.ok || !data || (!data.brand && !data.name)) {
          showToast('Produit non reconnu — ajoute-le à la main', 'info', 3000);
          _openManualPrefill(data || {});
          return;
        }
        // Corriger la catégorie à partir du nom (l'IA se trompe parfois : sérum ↔ crème…)
        const cat = (typeof CurrentRoutine !== 'undefined') ? CurrentRoutine.inferCategory(data.name, data.category) : (data.category || 'other');
        S.products.push({ _key: _mkKey(), id: null, brand: data.brand || '', name: data.name || '',
                          category: cat, fromCatalog: false, photo: thumb });
        showToast(`✓ ${(data.brand ? data.brand + ' ' : '') + data.name} ajouté`, 'success', 2600);
        _refreshList();
      } catch (err) {
        if (msg) msg.innerHTML = '';
        showToast('Identification impossible — ajoute-le à la main', 'error');
        _openManualPrefill({});
      }
    };
    reader.readAsDataURL(file);
  }

  function toStep2() {
    if (!S.products.length) { showToast('Ajoute au moins un produit', 'warning'); return; }
    S.view = 'photo'; render();
  }

  // Analyse visage déjà disponible (création de routine / précédemment)
  function _existingFace() {
    return AppState?.face?.skinAnalysis
      || ((typeof RoutineSaver !== 'undefined' && RoutineSaver.load) ? RoutineSaver.load()?.skinAnalysis : null);
  }

  // Réutiliser l'analyse visage existante → on saute directement au quiz
  function reuseFace() {
    const ex = _existingFace();
    if (!ex) { S.view = 'photo'; render(); return; }
    S.faceAnalysis = ex;
    S.faceSummary = {
      skinType:  ex.skinType?.type || null,
      undertone: ex.undertone?.type || null,
      cernes:    ex.cernes?.detected ? (ex.cernes.type || 'oui') : 'non',
      rougeurs:  ex.rougeurs?.niveau || null,
      eclat:     ex.eclat || null,
      taches:    ex.taches || null
    };
    S.view = 'quiz'; render();
  }

  // ─── Étape 2a : photo (optionnelle) ───────────────────────────
  function _vPhoto() {
    const hasExisting = !!_existingFace();
    // Si une analyse existe déjà → proposer de la réutiliser OU d'en refaire une
    const reuseBlock = hasExisting ? `
        <div class="ra-reuse">
          <p class="ra-reuse-txt">✦ Tu as déjà une analyse de ton visage. Tu peux la réutiliser, ou en refaire une nouvelle.</p>
          <button class="btn btn-dark ra-btn-main" onclick="RoutineAnalyzer.reuseFace()">Réutiliser mon analyse ✓</button>
        </div>` : '';
    return `
      <div class="ra-photo">
        <div class="ra-head"><span class="ra-step-badge">Étape 2/3</span><h2>Une photo de ton visage&nbsp;?</h2>
          <p>Optionnel — ça affine l'analyse. Tu peux passer, l'analyse marche aussi sans.</p></div>
        <span class="ra-hero-emoji">📸</span>
        ${reuseBlock}
        <div class="ra-actions">
          <button class="btn ${hasExisting ? 'btn-outline' : 'btn-dark ra-btn-main'}" onclick="RoutineAnalyzer.pickCam()">📷 ${hasExisting ? 'Reprendre une photo' : 'Prendre une photo'}</button>
          <button class="btn btn-outline" onclick="RoutineAnalyzer.pickGal()">🖼 Importer une photo</button>
          <button class="btn btn-ghost" onclick="RoutineAnalyzer.skipPhoto()">Passer cette étape →</button>
        </div>
        <input type="file" id="raCamIn" accept="image/*" capture="user" style="display:none" onchange="RoutineAnalyzer.onPhoto(this)">
        <input type="file" id="raGalIn" accept="image/*" style="display:none" onchange="RoutineAnalyzer.onPhoto(this)">
      </div>`;
  }

  function pickCam() { document.getElementById('raCamIn')?.click(); }
  function pickGal() { document.getElementById('raGalIn')?.click(); }
  function skipPhoto() { S.faceSummary = null; S.view = 'quiz'; render(); }

  function onPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    S.view = 'analyzing'; S._loadingMsg = 'Analyse de ta photo…'; render();
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (typeof SkinAnalysis !== 'undefined' && SkinAnalysis.analyzeFromPhoto) {
          const an = await SkinAnalysis.analyzeFromPhoto(e.target.result);
          if (an) {
            S.faceAnalysis = an;              // analyse complète (réutilisée dans le questionnaire)
            S.photo = e.target.result;
            S.faceSummary = {
              skinType:  an.skinType?.type || null,
              undertone: an.undertone?.type || null,
              cernes:    an.cernes?.detected ? (an.cernes.type || 'oui') : 'non',
              rougeurs:  an.rougeurs?.niveau || null,
              eclat:     an.eclat || null,
              taches:    an.taches || null
            };
          }
        }
      } catch (err) { console.warn('[RoutineAnalyzer] analyse photo échouée:', err.message); }
      S._loadingMsg = null;
      S.view = 'quiz'; render();
    };
    reader.readAsDataURL(file);
  }

  // ─── Étape 2b : mini-quiz ─────────────────────────────────────
  function _vQuiz() {
    const blocks = QUIZ.map(q => {
      const sel = q.multi ? (S.quiz[q.key] || []) : [S.quiz[q.key]];
      const chips = q.options.concat([['autre', 'Autre']]).map(([v, l]) => {
        const on = sel.includes(v);
        return `<button type="button" class="ra-chip${on ? ' selected' : ''}" data-q="${q.key}" data-v="${v}"
                   onclick="RoutineAnalyzer.qToggle('${q.key}','${v}',${q.multi},${q.max})">${l}</button>`;
      }).join('');
      return `<div class="ra-q">
        <p class="ra-q-label">${q.label}${q.multi ? ` <span class="ra-q-hint">(jusqu'à ${q.max})</span>` : ''}</p>
        <div class="ra-chips">${chips}</div>
      </div>`;
    }).join('');
    return `
      <div class="ra-quiz">
        <div class="ra-head"><span class="ra-step-badge">Étape 2/3</span><h2>4 petites questions</h2></div>
        ${blocks}
        <div class="ra-q">
          <p class="ra-q-label">Autre chose à préciser ? <span class="ra-q-hint">(optionnel)</span></p>
          <textarea id="raNotes" class="ra-input" rows="2" placeholder="Allergies, grossesse, contexte…" oninput="RoutineAnalyzer.setNotes(this.value)">${S.quiz.notes || ''}</textarea>
        </div>
        <div class="ra-nav">
          <button class="btn btn-ghost" onclick="RoutineAnalyzer.go('photo')">← Retour</button>
          <button class="btn btn-dark" onclick="RoutineAnalyzer.analyze()">Analyser ma routine ✦</button>
        </div>
      </div>`;
  }

  function qToggle(key, val, multi, max) {
    if (!multi) {
      S.quiz[key] = val;
      document.querySelectorAll(`.ra-chip[data-q="${key}"]`).forEach(c => c.classList.toggle('selected', c.dataset.v === val));
      return;
    }
    const arr = S.quiz[key] = Array.isArray(S.quiz[key]) ? S.quiz[key] : [];
    const el = document.querySelector(`.ra-chip[data-q="${key}"][data-v="${val}"]`);
    const i = arr.indexOf(val);
    if (i >= 0) { arr.splice(i, 1); el?.classList.remove('selected'); }
    else { if (arr.length >= max) { showToast(`Maximum ${max} réponses`, 'warning'); return; } arr.push(val); el?.classList.add('selected'); }
  }
  function setNotes(v) { S.quiz.notes = v; }

  // ─── Étape 3 : analyse ────────────────────────────────────────
  let _loadTimer = null;
  const _LOAD_STEPS = [
    '🔍 Lecture de tes produits…',
    '🧪 Analyse des actifs et de la composition…',
    '⚗️ Vérification des associations et doublons…',
    '🧴 Comparaison avec ton profil de peau…',
    '📊 Calcul de ton score…'
  ];

  function _vLoading() {
    // Photo (rapide) : simple spinner. Analyse routine (~25s) : barre + étapes.
    if (S._loadingMsg) {
      return `<div class="ra-loading"><div class="ra-spinner"></div><h2>${S._loadingMsg}</h2></div>`;
    }
    return `<div class="ra-loading">
      <div class="ra-spinner"></div>
      <h2>🔬 Analyse experte de ta routine…</h2>
      <div class="ra-progress"><div class="ra-progress-fill" id="raProgress"></div></div>
      <p id="raLoadStep" class="ra-load-step">On démarre l'analyse…</p>
      <p class="ra-load-sub">Un vrai expert regarde toute ta routine — ça prend quelques secondes ✦</p>
    </div>`;
  }

  function _startLoadingAnim() {
    const bar = document.getElementById('raProgress');
    if (!bar) return;                        // pas la vue analyse routine
    requestAnimationFrame(() => { bar.style.width = '92%'; }); // 0 → 92% en ~24s (CSS)
    const step = document.getElementById('raLoadStep');
    if (step) step.textContent = _LOAD_STEPS[0];
    _stopLoadingAnim();
    let i = 0;
    _loadTimer = setInterval(() => {
      i = (i + 1) % _LOAD_STEPS.length;
      const s = document.getElementById('raLoadStep');
      if (s) s.textContent = _LOAD_STEPS[i];
    }, 4800);
  }
  function _stopLoadingAnim() { if (_loadTimer) { clearInterval(_loadTimer); _loadTimer = null; } }

  async function analyze() {
    S.view = 'analyzing'; S._loadingMsg = null; render();
    const payloadProducts = S.products.map(p => {
      const cat = _catProd(p);
      return { brand: p.brand, name: p.name, category: p.category,
               ingredientTags: cat?.ingredientTags || [], description: cat?.description || '' };
    });
    _saveUnknowns();
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 55000);
      const resp = await fetch(apiUrl('/api/analyzeRoutine'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: payloadProducts, quiz: S.quiz, skin: S.faceSummary }),
        signal: controller.signal
      });
      clearTimeout(tid);
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || typeof data.score !== 'number') throw new Error('réponse invalide');
      S.result = data;
      _persistAnalysis(data);        // garde l'analyse + les bons produits à réintégrer
      S.view = 'results'; render();
    } catch (err) {
      console.warn('[RoutineAnalyzer] analyse échouée:', err.message);
      showToast('L\'analyse a échoué, réessaie dans un instant', 'error');
      S.view = 'quiz'; render();
    }
  }

  // Produits jugés adaptés (verdict "adapted" ou dans la routine optimisée "keep")
  function _computeKeep(result) {
    const refs = new Set();
    (result.optimized?.keep || []).forEach(r => refs.add(r));
    (result.products || []).forEach(p => { if (p.verdict === 'adapted') refs.add(p.ref); });
    return [...refs].map(ref => S.products[ref]).filter(Boolean).map(p => ({
      id: p.id || null, brand: p.brand || '', name: p.name || '', category: p.category || 'other', fromCatalog: !!p.id,
      photo: p.photo || null   // vignette de la photo prise par l'utilisatrice
    }));
  }

  function _persistAnalysis(result) {
    const payload = {
      score: result.score,
      keepProducts: _computeKeep(result),
      products: S.products.map(p => ({ id: p.id || null, brand: p.brand || '', name: p.name || '', category: p.category || 'other', fromCatalog: !!p.id })),
      quiz: S.quiz ? JSON.parse(JSON.stringify(S.quiz)) : null,   // réponses du mini-quiz
      faceAnalysis: S.faceAnalysis || null,                       // analyse peau (photo)
      photo: S.photo || null,
      savedAt: Date.now()
    };
    AppState.routineAnalysis = payload;
    // localStorage : sans l'image base64 (trop lourde) — l'analyse suffit à la réutilisation
    try { localStorage.setItem('glow_routine_analysis', JSON.stringify({ ...payload, photo: null })); } catch (e) {}
    _saveAnalysisFirestore(result);
  }

  async function _saveAnalysisFirestore(result) {
    try {
      const uid = AppState?.user?.uid;
      if (!uid || typeof firebase === 'undefined' || !firebase.apps.length) return;
      await firebase.firestore().collection('users').doc(uid).set({
        routineAnalysis: {
          score: result.score, keepProducts: AppState.routineAnalysis.keepProducts,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });
    } catch (err) { console.warn('[RoutineAnalyzer] save analyse Firestore échoué:', err.message); }
  }

  function saveAndRegister() {
    if (typeof openAuthModal === 'function') {
      openAuthModal('register', () => {
        _saveAnalysisFirestore(S.result || {});
        showToast('Analyse enregistrée ✦', 'success');
        render();
      });
    }
  }

  async function _saveUnknowns() {
    const manual = S.products.filter(p => !p.fromCatalog);
    if (!manual.length) return;
    try {
      if (typeof firebase === 'undefined' || !firebase.apps.length) return;
      const db = firebase.firestore();
      const batch = db.batch();
      manual.forEach(p => {
        const ref = db.collection('userProducts').doc();
        batch.set(ref, { brand: p.brand || '', name: p.name || '', category: p.category || 'other',
          source: 'routine-analysis', uid: AppState?.user?.uid || null, email: AppState?.user?.email || null,
          createdAt: new Date().toISOString(), status: 'pending_review' });
      });
      await batch.commit();
    } catch (err) { console.warn('[RoutineAnalyzer] save unknowns échoué:', err.message); }
  }

  // ─── Résultats ────────────────────────────────────────────────
  const VERDICT = {
    adapted:     { icon: '✅', label: 'Adapté à ta peau',  cls: 'ra-v-ok' },
    weak:        { icon: '⚠️', label: 'Peu adapté',        cls: 'ra-v-warn' },
    discouraged: { icon: '❌', label: 'Déconseillé',       cls: 'ra-v-bad' }
  };
  const ACT = { keep: '✅', replace: '🔄', add: '➕' };

  function _pName(ref) { const p = S.products[ref]; return p ? ((p.brand ? p.brand + ' ' : '') + p.name) : `produit ${ref + 1}`; }

  function _scoreColor(s) { return s >= 80 ? 'var(--success)' : s >= 55 ? 'var(--orange)' : 'var(--error)'; }

  function _vResults() {
    const r = S.result || {};
    const col = _scoreColor(r.score);
    const ring = `
      <div class="ra-score" style="background: conic-gradient(${col} ${r.score * 3.6}deg, var(--sand) 0);">
        <div class="ra-score-inner"><strong>${r.score}</strong><span>/100</span></div>
      </div>`;

    const actions = (r.priorityActions || []).map(a => `
      <div class="ra-action"><span class="ra-action-ic">${ACT[a.type] || '✅'}</span><p>${a.text}</p></div>`).join('');

    const freeBlock = `
      <div class="ra-result-head">
        <span class="ra-step-badge">Ton analyse</span>
        <h2>Score de ta routine</h2>
        ${ring}
      </div>
      ${r.strengths?.length ? `<div class="ra-panel"><h3>💪 Points forts</h3><ul class="ra-ul-ok">${r.strengths.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}
      ${r.improvements?.length ? `<div class="ra-panel"><h3>🎯 Axes d'amélioration</h3><ul class="ra-ul-warn">${r.improvements.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}
      ${actions ? `<div class="ra-panel ra-actions-panel"><h3>⚡ Tes 3 actions prioritaires</h3>${actions}</div>` : ''}`;

    // Détail : Premium
    let detail;
    if (!_isPremium()) {
      detail = `
        <div class="ra-lock">
          <span class="ra-lock-ic">🔒</span>
          <h3>Débloque l'analyse complète</h3>
          <p>Analyse produit par produit (✅/⚠️/❌ + ingrédients), incompatibilités, doublons d'actifs et ta <strong>routine optimisée</strong> — on garde ce qui te va, on remplace seulement le nécessaire.</p>
          <button class="btn btn-dark ra-btn-main" onclick="showScreen('premium')">Passer Premium ✦</button>
        </div>`;
    } else {
      detail = _renderDetail(r);
    }

    return `<div class="ra-results">
      ${_saveBanner()}
      ${freeBlock}${detail}
      <div class="ra-newroutine">
        <h3>✨ Passe à ta routine améliorée</h3>
        <p>On garde automatiquement tes produits adaptés et on complète seulement ce qu'il manque.</p>
        <button class="btn btn-dark ra-btn-main" onclick="RoutineAnalyzer.buildNewRoutine()">Créer ma nouvelle routine →</button>
      </div>
      <button class="btn btn-ghost ra-btn" onclick="RoutineAnalyzer.go('intro')">🔬 Analyser une autre routine</button>
    </div>`;
  }

  function _saveBanner() {
    if (AppState?.user?.uid) return `<div class="ra-saved">✓ Ton analyse est enregistrée dans ton compte</div>`;
    return `<div class="ra-savecta">
      <span class="ra-savecta-ic">💾</span>
      <div class="ra-savecta-txt">
        <strong>Garde ton analyse</strong>
        <p>Crée ton compte pour la retrouver et intégrer tes bons produits à ta prochaine routine.</p>
      </div>
      <button class="btn btn-dark" onclick="RoutineAnalyzer.saveAndRegister()">Enregistrer</button>
    </div>`;
  }

  function buildNewRoutine() {
    if (typeof goToSkincare === 'function') goToSkincare();
    else if (typeof Questionnaire !== 'undefined') Questionnaire.startSkincare();
  }

  function _renderDetail(r) {
    // Cartes produit
    const cards = (r.products || []).map(p => {
      const v = VERDICT[p.verdict] || VERDICT.weak;
      const img = S.products[p.ref] ? _prodImg(S.products[p.ref]) : null;
      return `
        <div class="ra-pcard ${v.cls}">
          <div class="ra-pcard-head">
            ${img ? `<img src="${img}" class="ra-pcard-img" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="ra-pcard-img ra-pcard-noimg">🧴</div>'}
            <span class="ra-pcard-name">${_pName(p.ref)}</span>
            <span class="ra-pcard-verdict">${v.icon} ${v.label}</span>
          </div>
          ${p.why ? `<p class="ra-pcard-why">${p.why}</p>` : ''}
          ${p.goodIngredients?.length ? `<div class="ra-ing"><span class="ra-ing-h ra-ing-good">Actifs +</span>${p.goodIngredients.map(x => `<span class="ra-tag ra-tag-good">${x}</span>`).join('')}</div>` : ''}
          ${p.problemIngredients?.length ? `<div class="ra-ing"><span class="ra-ing-h ra-ing-bad">À surveiller</span>${p.problemIngredients.map(x => `<span class="ra-tag ra-tag-bad">${x}</span>`).join('')}</div>` : ''}
          ${p.redundantWith != null ? `<p class="ra-pcard-note">🔁 Fait doublon avec <strong>${_pName(p.redundantWith)}</strong></p>` : ''}
          ${p.missingNote ? `<p class="ra-pcard-note">➕ ${p.missingNote}</p>` : ''}
        </div>`;
    }).join('');

    // Analyse globale
    const R = r.routine || {};
    const globalRows = [
      R.comment ? `<p class="ra-global-comment">${R.comment}</p>` : '',
      R.incompatibilities?.length ? `<p class="ra-global-h">⚠️ Incompatibilités</p><ul>${R.incompatibilities.map(x => `<li>${x}</li>`).join('')}</ul>` : '',
      R.duplicateActives?.length ? `<p class="ra-global-h">🔁 Actifs en double</p><ul>${R.duplicateActives.map(x => `<li>${x}</li>`).join('')}</ul>` : '',
      R.uselessProducts?.length ? `<p class="ra-global-h">🗑 Produits redondants</p><ul>${R.uselessProducts.map(ref => `<li>${_pName(ref)}</li>`).join('')}</ul>` : '',
      R.missingSteps?.length ? `<p class="ra-global-h">➕ Étapes manquantes</p><ul>${R.missingSteps.map(x => `<li>${x}</li>`).join('')}</ul>` : '',
      `<p class="ra-coherence">${R.amCoherent ? '✅' : '⚠️'} Matin cohérent&nbsp;·&nbsp;${R.pmCoherent ? '✅' : '⚠️'} Soir cohérent</p>`
    ].join('');

    // Routine optimisée
    const O = r.optimized || {};
    const opt = [
      O.keep?.length ? `<div class="ra-opt-row ra-opt-keep"><span>✅ On garde</span><p>${O.keep.map(_pName).join(' · ')}</p></div>` : '',
      ...(O.replace || []).map(x => `<div class="ra-opt-row ra-opt-replace"><span>🔄 On remplace</span><p><strong>${_pName(x.ref)}</strong> → ${x.suggestion}${x.reason ? ` <em>(${x.reason})</em>` : ''}</p></div>`),
      ...(O.add || []).map(x => `<div class="ra-opt-row ra-opt-add"><span>➕ On ajoute</span><p><strong>${x.what}</strong>${x.reason ? ` <em>(${x.reason})</em>` : ''}</p></div>`)
    ].join('');

    return `
      <div class="ra-panel"><h3>🧴 Produit par produit</h3><div class="ra-pcards">${cards}</div></div>
      <div class="ra-panel"><h3>⚗️ Cohérence de ta routine</h3><div class="ra-global">${globalRows}</div></div>
      <div class="ra-panel ra-opt"><h3>✨ Ta routine optimisée</h3>
        <p class="ra-opt-intro">On garde ce qui te va, on ne change que le nécessaire.</p>${opt}</div>`;
  }

  // ─── Navigation ───────────────────────────────────────────────
  function go(view) { S.view = view; render(); }

  return {
    initScreen, render, go,
    search, addFromCatalog, toggleManual, addManual, removeProduct, toStep2,
    pickProductPhoto, onProductPhoto,
    pickCam, pickGal, skipPhoto, onPhoto, reuseFace,
    qToggle, setNotes, analyze, saveAndRegister, buildNewRoutine
  };
})();

if (typeof window !== 'undefined') window.RoutineAnalyzer = RoutineAnalyzer;
