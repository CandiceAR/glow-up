/* ============================================================
   dupeFinder.js — « Trouver son dupe »
   Photo d'un produit → identification IA → recherche du vrai dupe
   dans le catalogue (classement IA) → résultats + note peau.
   Gratuit jusqu'à 3 recherches, puis abonnement.
   ============================================================ */

const DupeFinder = (() => {



  // Vue courante + données de la session de scan
  let S = { view: 'home', photo: null, identified: null,
            results: null, externalResults: [], noDupeMsg: '', bestAltId: null, trueDupe: false, busy: false };

  let _barcodeStream = null, _barcodeStop = false;

  // ─── Quota (décidé et contrôlé par le SERVEUR : lib/aiGuard.js) ─
  // Gratuit 5 dupes/mois · Premium 15 · Premium+ illimité. Un dupe n'est décompté que si un résultat s'affiche.
  // S.quota = { plan, limit (null = illimité), used, remaining (null = illimité) } renvoyé par le serveur.
  function _left() { return (S.quota && S.quota.remaining != null) ? S.quota.remaining : Infinity; }
  function _quotaLine() {
    const q = S.quota;
    if (!q || q.limit == null || q.remaining == null) return '';
    const n = q.remaining;
    return `<p class="df-quota">${n > 0 ? `Il te reste <strong>${n}</strong> dupe${n > 1 ? 's' : ''} ce mois-ci` : 'Tu as utilisé tous tes dupes ce mois-ci'}</p>`;
  }

  // Jeton d'identité Firebase : les routes protégées vérifient le compte (et lui appliquent son quota)
  async function _idToken() {
    try { const u = (typeof firebase !== 'undefined') && firebase.auth && firebase.auth().currentUser; return u ? await u.getIdToken() : null; }
    catch (e) { return null; }
  }
  // Appel d'une route protégée : ajoute jeton + identifiant de recherche. Retourne { status, data }.
  async function _post(path, payload, timeoutMs) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs || 30000);
    try {
      const idToken = await _idToken();
      const resp = await fetch(apiUrl(path), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, payload, { idToken, searchId: S.identified && S.identified._searchId })),
        signal: controller.signal
      });
      const data = await resp.json().catch(() => null);
      if (data && data.quota) S.quota = data.quota;
      return { status: resp.status, ok: resp.ok, data };
    } finally { clearTimeout(tid); }
  }
  // Réponses « limite » : 401 (compte), 429 (quota, produits inconnus, trop de demandes), 503 (plafond de coût du jour)
  function _limitFrom(r) {
    if (!r || r.ok) return false;
    if (r.status === 401) {
      if (typeof Auth !== 'undefined' && Auth.openRequiredAuthModal) Auth.openRequiredAuthModal(() => startSearch());
      return true;
    }
    if (r.status === 429 || r.status === 503) {
      S.limitMsg = (r.data && r.data.message) || 'Réessaie dans quelques instants.';
      S.view = 'limit'; render();
      return true;
    }
    return false;
  }

  // ─── Catégories : normalisation vers un « bucket » ────────────
  const NORM = {
    sunscreen: 'spf', spf: 'spf', eye_cream: 'eye', eye: 'eye',
    nightmask: 'moisturizer', oil: 'moisturizer', moisturizer: 'moisturizer',
    mask: 'serum', toner: 'serum', exfoliant: 'serum', serum: 'serum', mist: 'serum',
    cleanser: 'cleanser', lipbalm: 'lipbalm'
  };
  function _normCat(c) { return NORM[c] || c; }
  function _slug(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }

  const CAT_LABEL = {
    cleanser: 'Nettoyant', toner: 'Tonique', serum: 'Sérum', exfoliant: 'Exfoliant',
    moisturizer: 'Crème', oil: 'Huile', mask: 'Masque', nightmask: 'Masque de nuit',
    eye: 'Contour des yeux', eye_cream: 'Contour des yeux', spf: 'Protection solaire',
    sunscreen: 'Protection solaire', lipbalm: 'Baume à lèvres', mist: 'Brume',
    foundation: 'Fond de teint', concealer: 'Correcteur', corrector: 'Correcteur coloré',
    powder: 'Poudre', primer: 'Base', blush: 'Blush', bronzer: 'Bronzer',
    highlighter: 'Enlumineur', mascara: 'Mascara', eyeliner: 'Eyeliner',
    eyebrow: 'Sourcils', eyeshadow: 'Fard à paupières', lipstick: 'Rouge à lèvres',
    lipgloss: 'Gloss', lipliner: 'Crayon lèvres', set: 'Coffret', tools: 'Accessoire',
    multi_usage: 'Multi-usage', other: 'Autre'
  };
  const MAKEUP_CATS = ['foundation', 'concealer', 'corrector', 'powder', 'primer', 'blush', 'bronzer', 'highlighter',
    'mascara', 'eyeliner', 'eyebrow', 'eyeshadow', 'lipstick', 'lipgloss', 'lipliner'];
  const MANUAL_CATS = ['cleanser','toner','serum','exfoliant','moisturizer','oil','mask','eye','spf','lipbalm',
    'foundation','concealer','powder','primer','blush','bronzer','highlighter','mascara','eyeliner','eyebrow','lipstick','lipgloss','other'];

  // ─── Profil peau (info complémentaire) ────────────────────────
  function _userSkin() {
    const a = AppState?.questionnaire?.answers || {};
    const p = AppState?.profile || {};
    return { skinType: a.skinType || p.skinType || null,
             sensitivity: (a.sensitivity != null ? a.sensitivity : null),
             concerns: a.complexes || p.concerns || [] };
  }

  // ─── Rendu ────────────────────────────────────────────────────
  function initScreen() {
    _stopBarcode();
    const q = S && S.quota;
    // Nouvelle session propre à chaque entrée
    S = { view: 'home', photo: null, identified: null, results: null, externalResults: [],
          noDupeMsg: '', bestAltId: null, trueDupe: false, busy: false, quota: q || null };
    render();
    _loadQuota();
  }

  // Où en est le compte ce mois-ci : « Il te reste N dupes ce mois-ci » (donnée du serveur)
  async function _loadQuota() {
    try {
      const r = await _post('/api/inci', { mode: 'quota' }, 8000);
      if (r.ok && r.data && r.data.quota) { S.quota = r.data.quota; if (S.view === 'home') render(); }
    } catch (e) { /* le compteur est un confort */ }
  }

  function render() {
    const c = document.getElementById('dupeFinderContent');
    if (!c) return;
    let html = '';
    switch (S.view) {
      case 'home':      html = _vHome(); break;
      case 'analyzing': html = _vLoading('🔍 Identification du produit…', 'On lit la marque et le nom sur ta photo'); break;
      case 'confirm':   html = _vConfirm(); break;
      case 'manual':    html = _vManual(); break;
      case 'notfound':  html = _vNotFound(); break;
      case 'searching': html = _vLoading('✨ Recherche du meilleur dupe…', 'On cherche la composition et on relève les prix chez les revendeurs. Cela peut prendre quelques secondes.'); break;
      case 'compoConfirm': html = _vCompoConfirm(); break;
      case 'compoPhoto':   html = _vCompoPhoto(); break;
      case 'priceAsk':     html = _vPriceAsk(); break;
      case 'reading':      html = _vLoading('📷 Lecture de la liste d\'ingrédients…', 'On recopie ce qui est écrit sur ta photo'); break;
      case 'results':   html = _vResults(); break;
      case 'nodupe':    html = _vResults(); break;   // aucun dupe fiable (branche dédiée dans _vResults)
      case 'error':     html = _vError(); break;     // erreur technique + Réessayer
      case 'insufficient': html = _vInsufficient(); break; // infos produit insuffisantes
      case 'barcode':   html = _vBarcode(); break;
      case 'blocked':   html = _vBlocked(); break;
      case 'limit':     html = _vLimit(); break;
      default:          html = _vHome();
    }
    c.innerHTML = html;
    if (S.view === 'barcode') _startBarcode();
  }

  function _vHome() {
    const quota = _quotaLine();
    return `
      <div class="df-home">
        <div class="df-hero">
          <span class="df-hero-emoji">📸</span>
          <h1>Trouver son dupe</h1>
          <p>Prends un produit en photo et Glow Up te trouve ses dupes les plus proches, au meilleur prix.</p>
        </div>
        <div class="df-actions">
          <button class="btn btn-dark df-btn-main" onclick="DupeFinder.pickCamera()">📷 Prendre une photo</button>
          <button class="btn btn-outline df-btn" onclick="DupeFinder.pickGallery()">🖼 Importer depuis ma galerie</button>
          <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.goBarcode()">📊 Scanner le code-barres</button>
          <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.goManual()">⌨️ Saisir le produit à la main</button>
        </div>
        ${quota}
        <input type="file" id="dfCam" accept="image/*" capture="environment" style="display:none" onchange="DupeFinder.onPhoto(this)">
        <input type="file" id="dfGal" accept="image/*" style="display:none" onchange="DupeFinder.onPhoto(this)">
      </div>`;
  }

  function _vLoading(title, sub) {
    return `<div class="df-loading">
      <div class="df-spinner"></div>
      <h2>${title}</h2>
      <p>${sub}</p>
    </div>`;
  }

  function _vConfirm() {
    const p = S.identified || {};
    const bits = [
      p.brand ? `<span class="df-id-brand">${p.brand}</span>` : '',
      p.name ? `<h2 class="df-id-name">${p.name}</h2>` : '',
      `<div class="df-id-meta">
        <span class="df-chip">${CAT_LABEL[p.category] || 'Produit'}</span>
        ${p.shade ? `<span class="df-chip">Teinte : ${p.shade}</span>` : ''}
        ${p.range ? `<span class="df-chip">${p.range}</span>` : ''}
      </div>`
    ].join('');
    return `
      <div class="df-confirm">
        ${S.photo ? `<img src="${S.photo}" class="df-shot" alt="produit">` : ''}
        <div class="df-id-card">${bits}</div>
        <p class="df-confirm-q">Est-ce bien ce produit&nbsp;?</p>
        <button class="btn btn-dark df-btn-main" onclick="DupeFinder.startSearch()">✅ Oui, trouver ses dupes</button>
        <button class="btn btn-outline df-btn" onclick="DupeFinder.goManual(true)">✏️ Non, modifier le produit</button>
      </div>`;
  }

  function _vNotFound() {
    return `
      <div class="df-notfound">
        <span class="df-hero-emoji">🤔</span>
        <h2>Je n'ai pas réussi à identifier ce produit</h2>
        <p>Réessaie avec une photo bien nette de l'étiquette (marque + nom), ou saisis-le.</p>
        <button class="btn btn-dark df-btn-main" onclick="DupeFinder.pickCamera()">📷 Reprendre une photo</button>
        <button class="btn btn-outline df-btn" onclick="DupeFinder.goBarcode()">📊 Scanner le code-barres</button>
        <button class="btn btn-outline df-btn" onclick="DupeFinder.goManual()">⌨️ Saisir la marque et le nom</button>
      </div>`;
  }

  function _vManual() {
    const p = S.identified || {};
    const opts = MANUAL_CATS.map(c => `<option value="${c}"${p.category === c ? ' selected' : ''}>${CAT_LABEL[c]}</option>`).join('');
    return `
      <div class="df-manual">
        <h2>Ton produit</h2>
        <input type="text" id="dfBrand" class="df-input" placeholder="Marque *" value="${p.brand || ''}">
        <input type="text" id="dfName"  class="df-input" placeholder="Nom du produit *" value="${p.name || ''}">
        <select id="dfCat" class="df-input">${opts}</select>
        <div class="df-type-row">
          <label class="df-radio"><input type="radio" name="dfType" value="skincare" ${p.productType !== 'makeup' ? 'checked' : ''}> Soin</label>
          <label class="df-radio"><input type="radio" name="dfType" value="makeup" ${p.productType === 'makeup' ? 'checked' : ''}> Maquillage</label>
        </div>
        <button class="btn btn-dark df-btn-main" onclick="DupeFinder.submitManual()">Trouver ses dupes ✦</button>
        <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.goHome()">← Retour</button>
      </div>`;
  }

  function _vBarcode() {
    return `
      <div class="df-barcode">
        <h2>📊 Scanner le code-barres</h2>
        <div class="df-cam-wrap">
          <video id="dfVideo" class="df-video" playsinline muted></video>
          <div class="df-scan-line"></div>
        </div>
        <p id="dfBarcodeMsg" class="df-barcode-msg">Vise le code-barres du produit…</p>
        <button class="btn btn-outline df-btn" onclick="DupeFinder.goHome()">← Annuler</button>
      </div>`;
  }

  function _vBlocked() {
    return `
      <div class="df-blocked">
        <span class="df-hero-emoji">🔒</span>
        <h2>Tu as utilisé tes 3 recherches gratuites</h2>
        <p>Passe à Glow Up Premium pour trouver les dupes de tous tes produits, sans limite.</p>
        <button class="btn btn-dark df-btn-main" onclick="showScreen('premium')">Découvrir Premium ✦</button>
        <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.goHome()">← Retour</button>
      </div>`;
  }

  // ─── Résultats ────────────────────────────────────────────────
  const FIT = {
    adapted: { icon: '✅', label: 'Adapté à ta peau',            cls: 'df-fit-ok' },
    caution: { icon: '⚠️', label: 'Peut convenir, avec précautions', cls: 'df-fit-warn' },
    unfit:   { icon: '🚫', label: 'Peu adapté à ta peau',        cls: 'df-fit-bad' }
  };
  // Niveaux (règle du prix au millilitre) : « dupe » seulement si moins cher à l'unité PROUVÉ
  const LEVEL = {
    reliable: { icon: '🎯', label: 'Dupe fiable',                         cls: 'df-lv-reliable' },
    similar:  { icon: '≈',  label: 'Dupe similaire',                      cls: 'df-lv-similar' },
    probable: { icon: '≈',  label: 'Dupe probable · composition non vérifiée', cls: 'df-lv-probable' },
    other:    { icon: '•',  label: 'Autre option · pas prouvée moins chère', cls: 'df-lv-other' }
  };
  // POURQUOI une « Autre option » n'est pas un dupe : s = court (sur la carte), l = long (dans le détail). Dit toujours la vraie raison.
  const REASON = {
    format:                { s: 'Format différent', l: 'Format différent : ton produit et celui-ci ne se présentent pas sous la même forme, le prix au millilitre n\'est pas comparable.' },
    ref_price:             { s: 'Prix de ton produit non renseigné', l: 'Tu n\'as pas indiqué le prix de ton produit : nous ne pouvons pas comparer les prix.' },
    ref_amount:            { s: 'Contenance de ton produit non renseignée', l: 'La contenance de ton produit n\'est pas renseignée : nous ne pouvons pas calculer son prix au millilitre.' },
    cand_price_missing:    { s: 'Prix non renseigné', l: 'Le prix de ce produit n\'est pas renseigné.' },
    cand_amount:           { s: 'Contenance non renseignée', l: 'La contenance de ce produit n\'est pas renseignée : pas de prix au millilitre.' },
    cand_price_unverified: { s: 'Prix non vérifié', l: 'Le prix de ce produit n\'a pas été relevé chez un revendeur (avec sa source et sa date) : nous ne pouvons pas affirmer qu\'il est moins cher.' },
    unit_mismatch:         { s: 'Unités différentes (ml / g)', l: 'L\'un se mesure en millilitres, l\'autre en grammes : pas de comparaison possible.' },
    not_cheaper:           { s: 'Plus cher au ml', l: 'Il coûte plus cher à l\'unité que ton produit.' },
    formula_unknown:       { s: 'Composition non vérifiée', l: 'La composition de ce produit n\'est pas vérifiée : les formules n\'ont pas été comparées.' },
    formula_far:           { s: 'Formule moins proche', l: 'La formule est trop différente de celle de ton produit pour parler de dupe.' }
  };
  function _lvLabel(r) {
    if (r.level !== 'other') return (LEVEL[r.level] || LEVEL.other).label;
    const first = (r.reasons || [])[0];
    return 'Autre option · ' + ((REASON[first] && REASON[first].s) || 'pas prouvée moins chère');
  }
  const ROLE_LABEL = { closest: '🎯 Le dupe le plus proche', value: '💛 Meilleur rapport qualité-prix', cheapest: '🌱 L\'alternative la moins chère' };

  // (Phase 1) Plus de pourcentage ni de palier « très proche » : ces notes venaient en partie de
  // l'estimation de l'IA. On indique à la place si les compositions ont été comparées ou non.

  // Prix à la française : « 19,90 € » ; prix à l'unité : « 0,23 €/ml » (per100 = prix pour 100 ml ou 100 g)
  function _eur(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function _perUnit(per100, unit) { const v = Number(per100) / 100; return (v < 0.1 ? v.toFixed(3) : v.toFixed(2)).replace('.', ',') + ' €/' + unit; }
  // Images propres seulement : fichiers de notre site, site de la marque ou Open Beauty Facts.
  // Les images Amazon peuvent contenir des bandeaux publicitaires (« Sponsored Products ») → icône neutre à la place.
  function _cleanImg(u) {
    if (!u) return '';
    if (/^assets\//.test(u)) return u;
    try {
      const h = new URL(u, location.origin).hostname;
      if (/(^|\.)openbeautyfacts\.org$/.test(h) || /(^|\.)dlaparis\.com$/.test(h) || /(^|\.)victoriabeckhambeauty\.com$/.test(h)) return u;
    } catch (e) { /* adresse illisible : pas d'image */ }
    return '';
  }

  // Le prix du produit scanné n'est un FAIT que s'il vient de notre catalogue (jamais de l'estimation de l'IA)
  function _refPrice() {
    const id = S.identified || {};
    return (id.priceVerified && id.estPrice > 0) ? id.estPrice : 0;
  }

  function _catalogProduct(id) { return (AppState.products.catalog || []).find(p => p.id === id); }
  function _compareUrl(p) { return `https://www.google.com/search?q=${encodeURIComponent((p.brand || '') + ' ' + (p.name || ''))}&tbm=shop`; }

  // ─── Lignes compactes repliables : photo + nom + prix, détail au clic ──
  // Un seul menu ouvert à la fois (ouvrir un menu referme les autres).
  const _TOG = "var t=this;if(t.open){document.querySelectorAll('.df-row[open]').forEach(function(d){if(d!==t)d.open=false;});}";

  function _row(o) {
    return `
      <details class="df-row${o.ext ? ' df-row--ext' : ''}" ontoggle="${_TOG}">
        <summary class="df-row-sum">
          <span class="df-row-img">${o.img}</span>
          <span class="df-row-main">
            <span class="df-row-brand">${o.brand || ''}</span>
            <span class="df-row-name">${o.name || ''}</span>
            ${o.meta ? `<span class="df-row-meta2">${o.meta}</span>` : ''}
          </span>
          <span class="df-row-price">${o.price}</span>
          <svg class="df-row-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div class="df-row-body">${o.body}</div>
      </details>`;
  }

  // Contenu du menu déroulant (identique pour catalogue et hors catalogue)
  function _rowBody(o) {
    const r = o.r, fit = r.skinFit ? (FIT[r.skinFit] || FIT.caution) : null;   // pas de pastille « peau » si l'IA ne s'est pas prononcée
    const lv = r.level ? (LEVEL[r.level] || LEVEL.other) : null;   // pas de niveau pour « l'alternative adaptée à ta peau »
    const up = r.unitPrice;
    const unitLine = up
      ? `<div class="df-vol">${_perUnit(up.cand, up.unit)} <small>contre</small> ${_perUnit(up.ref, up.unit)} <small>pour ton produit</small></div>`
      : '';
    // Raison(s) pour lesquelles ce n'est pas un dupe : jamais une phrase vague
    const proofLine = (r.level === 'other' && (r.reasons || []).length)
      ? `<p class="df-why-h">Pourquoi ce n'est pas un dupe</p><ul class="df-row-ul">${r.reasons.map(k => `<li>${_esc((REASON[k] && REASON[k].l) || k)}</li>`).join('')}</ul>`
      : '';
    // « Prix relevé le [date] chez [revendeur] » (prix sourcé et daté), sinon « Prix non vérifié »
    const pi = r.priceInfo;
    const priceLine = !pi ? '' : (pi.verified
      ? `<p class="df-row-meta df-price-src">🏷️ Prix relevé le ${_frDate(pi.date)} chez ${pi.url ? `<a href="${_esc(pi.url)}" target="_blank" rel="noopener">${_esc(pi.source)}</a>` : _esc(pi.source)}${pi.note ? ` <small>(${_esc(pi.note)})</small>` : ''}</p>`
      : '<p class="df-row-meta df-price-src">🏷️ Prix non vérifié (indicatif)</p>');
    return `
      <div class="df-row-pills">
        ${lv ? `<span class="df-pill df-lv ${lv.cls}">${lv.icon} ${_esc(_lvLabel(r))}</span>` : ''}
        ${fit ? `<span class="df-pill df-fit ${fit.cls}">${fit.icon} ${fit.label}</span>` : ''}
      </div>
      ${unitLine}
      ${priceLine}
      ${proofLine}
      ${o.savings ? `<p class="df-row-save">💰 ${o.savings}</p>` : ''}
      ${o.volLine || ''}
      ${o.descr ? `<p class="df-row-h">Le produit</p><p class="df-row-txt">${o.descr}</p>` : ''}
      <p class="df-row-h">${(r.level === 'reliable' || r.level === 'similar') ? 'Pourquoi est-ce un dupe&nbsp;?' : (r.level === 'probable' ? 'Pourquoi est-ce un dupe probable&nbsp;?' : 'Pourquoi cette option&nbsp;?')}</p>
      ${r.why ? `<p class="df-row-txt">${r.why}</p>` : ''}
      ${r.commonPoints?.length ? `<p class="df-why-h">✓ Points communs</p><ul class="df-row-ul">${r.commonPoints.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      ${r.differences?.length ? `<p class="df-why-h">≠ Différences</p><ul class="df-row-ul">${r.differences.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      ${r.skinNote ? `<p class="df-why-h">🧴 Pour ta peau</p><p class="df-skinnote">${r.skinNote}</p>` : ''}
      ${r.compositionNote ? `<p class="df-row-meta df-compo-note">${r.compositionNote}</p>` : ''}
      <div class="df-result-ctas">
        <a class="pc-cta pc-cta--compare" href="${o.compareUrl}" target="_blank" rel="noopener">🔍 Comparer les prix</a>
        <a class="pc-cta pc-cta--buy" href="${o.buyUrl}" target="_blank" rel="noopener nofollow${o.isAff ? ' sponsored' : ''}"${o.buyAttrs || ''}>Acheter →</a>
      </div>`;
  }

  // (Phase 1) Plus aucun dupe « hors catalogue » proposé de mémoire par l'IA : seuls les produits
  // de notre catalogue (prix et fiches connus) sont affichés comme dupes.

  // Dupe du catalogue
  function _resultCard(r, idx) {
    const p = _catalogProduct(r.id);
    if (!p) return '';
    // Prix affiché : celui relevé par le serveur (revendeur + date) s'il existe, sinon celui du catalogue
    const price = (r.priceInfo && r.priceInfo.verified && r.priceInfo.value > 0) ? r.priceInfo.value : p.price;
    const est = _refPrice();
    let savings = (est > 0 && price != null && price < est) ? (est - price) : 0;
    const isAff = !!p.amazonUrl;
    // Prix à volume égal — uniquement si les 2 contenances sont connues
    const refVol  = (S.identified && S.identified.volumeMl) || 0;
    const candVol = p.volumeMl || 0;
    let volLine = '';
    // Format différent (pads ↔ lotion) : pas de comparaison de prix, donc pas d'« économie »
    if (r.formatDiff) savings = 0;
    else if (refVol > 0 && candVol > 0 && price != null) {
      const normCand = price / candVol * refVol;
      volLine = `<div class="df-vol">${_eur(price)} / ${candVol} ml → ≈ <strong>${_eur(normCand)}</strong> pour ${refVol} ml</div>`;
      if (est > 0 && normCand < est) savings = est - normCand;
    }
    const descr = (p.description || '').length > 220 ? p.description.slice(0, 219) + '…' : (p.description || '');
    // Sous le nom : niveau · contenance · prix au millilitre (visibles sans ouvrir la carte)
    const lvInfo = r.level ? (LEVEL[r.level] || LEVEL.other) : null;
    const amount = p.volumeMl > 0 ? `${p.volumeMl} ml` : (p.netWeightG > 0 ? `${p.netWeightG} g` : 'contenance non renseignée');
    const cu = r.candUnit || (price > 0 && p.volumeMl > 0 ? { unit: 'ml', per100: price / p.volumeMl * 100 } : (price > 0 && p.netWeightG > 0 ? { unit: 'g', per100: price / p.netWeightG * 100 } : null));
    const meta = [
      lvInfo ? `<span class="df-meta-lv ${lvInfo.cls}">${lvInfo.icon} ${_esc(_lvLabel(r))}</span>` : '',
      `<span>${amount}</span>`,
      cu ? `<span>${_perUnit(cu.per100, cu.unit)}</span>` : ''
    ].filter(Boolean).join(' · ');
    return _row({
      img: _cleanImg(p.imageUrl) ? `<img src="${_cleanImg(p.imageUrl)}" alt="${_esc(p.name)}" loading="lazy" onerror="this.style.display='none'">` : '<span class="df-row-noimg">🧴</span>',
      brand: p.brand, name: p.name, meta,
      price: price != null ? _eur(price) : '—',
      body: _rowBody({
        r, descr, volLine,
        savings: savings > 0 ? `Tu économises ${_eur(savings)}${volLine ? ' (à volume égal)' : ''}` : '',
        compareUrl: _compareUrl(p), buyUrl: p.amazonUrl || p.shopUrl || '#', isAff,
        buyAttrs: isAff ? ` onclick="if(typeof trackAmazonClick==='function')trackAmazonClick('${p.id}')"` : ''
      })
    });
  }

  // Message doux si l'utilisatrice jeune scanne un produit non adapté à son âge
  function _ageNote() {
    if (typeof AgeGuard === 'undefined') return '';
    const id = S.identified || {};
    const a = AppState.questionnaire?.answers;
    if (!AgeGuard.isYoung(a)) return '';
    const check = AgeGuard.isRestricted(
      { name: id.name || '', category: id.category || 'other', ingredientTags: id.keyActives || [] },
      AgeGuard.age(a)
    );
    if (!check.restricted) return '';
    return `<div class="df-agenote">💛 ${AgeGuard.scanMessage()}</div>`;
  }

  // Badge « composition » : seule une liste lue via le code-barres (Open Beauty Facts) est dite vérifiée.
  // Une liste trouvée seulement d'après le nom peut concerner un autre produit : on ne l'affiche pas comme un fait.
  function _inciBadge(id) {
    const c = id && id.inciConfidence;
    const src = id && id.inciSourceUrl
      ? `<a href="${_esc(id.inciSourceUrl)}" target="_blank" rel="noopener">${_esc(id.inciSourceLabel || 'source')}</a>`
      : _esc((id && id.inciSourceLabel) || 'source');
    const dt = id && id.inciDate ? ' · ' + _frDate(id.inciDate) : '';
    // Open Beauty Facts est une base collaborative : on ne dit jamais « vérifiée », on cite la source et la date
    const lic = (id && id.inciSource === 'openbeautyfacts') ? ' <small>(licence ODbL)</small>' : '';
    const own = id && id.inciSource === 'glowup';
    if (c === 'high' && own) return `<span class="df-inci-badge df-inci-high">✅ Composition issue de notre fiche (${src})${dt}</span>`;
    if (c === 'high')      return `<span class="df-inci-badge df-inci-high">✅ Composition trouvée sur ${src}${lic}${dt}</span>`;
    if (c === 'confirmed') return `<span class="df-inci-badge df-inci-high">✅ Composition confirmée par toi · trouvée sur ${src}${lic}${dt}</span>`;
    if (c === 'photo') {
      return `<span class="df-inci-badge df-inci-low">📷 Lue sur ta photo, à vérifier</span>
        <details class="df-inci-read"><summary>Voir la liste lue</summary><p>${_esc((id.inciList || []).join(', '))}</p></details>`;
    }
    // Niveau 3 : aucune composition vérifiée, seulement un actif probable (estimation)
    if (id && id.estimateFamily && typeof MainActive !== 'undefined') {
      return `<span class="df-inci-badge df-inci-low">ℹ️ Composition non vérifiée · actif probable : ${_esc(MainActive.label(id.estimateFamily))}</span>`;
    }
    return '<span class="df-inci-badge df-inci-low">ℹ️ Composition non vérifiée</span>';
  }

  // Prix du produit de la personne, avec sa source : « Prix relevé le 20/10/2026 chez Sephora » ou « prix indiqué par toi »
  function _headerPrice(id) {
    const edit = ' <a href="#" class="df-edit-price" onclick="DupeFinder.editPrice();return false;">Modifier</a>';
    if (_refPrice() > 0) {
      const lbl = id.priceSource === 'user'
        ? 'prix indiqué par toi'
        : `Prix relevé le ${_frDate(id.priceDate)} chez ${id.priceSourceUrl ? `<a href="${_esc(id.priceSourceUrl)}" target="_blank" rel="noopener">${_esc(id.priceSourceName)}</a>` : _esc(id.priceSourceName)}${id.priceNote ? ' · ' + _esc(id.priceNote) : ''}`;
      return `<span class="df-orig-price">${_eur(_refPrice())} <small>(${lbl})</small>${edit}</span>`;
    }
    if (id.catalogPriceHint > 0) return `<span class="df-orig-price df-price-unverified">≈ ${_eur(id.catalogPriceHint)} <small>(prix indicatif, non vérifié)</small></span>`;
    return '<span class="df-orig-price df-price-unverified">Prix non renseigné</span>';
  }

  function _vResults() {
    const id = S.identified || {};
    const left = _left();
    const header = `
      ${_ageNote()}
      <div class="df-orig">
        ${S.photo ? `<img src="${S.photo}" class="df-orig-img" alt="produit">` : ''}
        <div>
          <span class="df-orig-label">Ton produit</span>
          <h2 class="df-orig-name">${(id.brand ? id.brand + ' ' : '') + (id.name || '')}</h2>
          ${_headerPrice(id)}
          ${_inciBadge(id)}
        </div>
      </div>`;

    const catRes = S.results || [];
    const extRes = [];   // plus de dupes hors catalogue (phase 1)

    // Le produit scanné est lui-même une alternative abordable à un produit plus cher
    const sd = S.selfDupe;
    const selfBanner = sd ? `
      <div class="df-selfdupe">
        <span class="df-hero-emoji">✅</span>
        <div>
          <strong>Ce produit est déjà une alternative abordable à ${sd.ofBrand} ${sd.ofName}${sd.approxPrice > 0 ? ` (~${sd.approxPrice.toFixed(2).replace('.', ',')} €)` : ''}.</strong>
          <p>Pas besoin de chercher un dupe.</p>
          ${sd.why ? `<p class="df-selfdupe-why">${sd.why}</p>` : ''}
        </div>
      </div>` : '';

    // Aucun produit de notre sélection ne partage l'actif principal : l'écran reste utile (jamais « rien trouvé »)
    if (!catRes.length) {
      const alt = S.bestAltId ? _catalogProduct(S.bestAltId) : null;
      const fam = id.mainFamily && typeof MainActive !== 'undefined' ? MainActive.label(id.mainFamily) : '';
      const list = (id.inciList || []).slice(0, 12);
      // Ce que contient le produit : composition trouvée (ou lue sur photo), avec son actif principal
      const compoCard = list.length ? `
        <div class="df-compo-card">
          <h3>Ce que contient ton produit</h3>
          ${fam ? `<p>Actif principal : <strong>${_esc(fam)}</strong></p>` : ''}
          <p class="df-compo-list">${_esc(list.join(', '))}${(id.inciList || []).length > list.length ? '…' : ''}</p>
        </div>` : '';
      // Pas de composition : on peut encore la faire lire sur une photo de la liste d'ingrédients
      const photoCta = (!list.length && S.status !== 'makeup-soon')
        ? `<button class="btn btn-dark df-btn-main" onclick="DupeFinder.goPhoto()">📷 Photographier la liste d'ingrédients</button>` : '';
      const queued = (id._queued === true && S.status !== 'makeup-soon')
        ? `<p class="df-queued">📝 On ajoute ton produit à notre liste de recherche : nous enrichirons notre sélection pour te proposer des alternatives.</p>` : '';
      return `
        <div class="df-results">
          ${header}
          ${selfBanner || `<div class="df-nodupe">
            <span class="df-hero-emoji">💡</span>
            <p>${_esc(S.noDupeMsg || "Nous n'avons pas encore de produit de notre sélection à te proposer pour celui-ci.")}</p>
          </div>`}
          ${compoCard}
          ${photoCta}
          ${queued}
          ${alt ? `<p class="df-alt-h">Une alternative similaire, adaptée à ta peau :</p>${_resultCard({ id: alt.id, similarity: 0, role: 'value', skinFit: 'adapted', commonPoints: [], differences: [], why: '', skinNote: '' }, 0)}` : ''}
          ${_footer(left)}
        </div>`;
    }

    // Avertissement si le meilleur dupe (catalogue prioritaire, sinon externe) n'est pas adapté
    const best = catRes[0] || extRes[0];
    const warn = (best && best.skinFit === 'unfit')
      ? `<div class="df-warn">⚠️ C'est le dupe le plus proche de ton produit, mais il ne semble pas idéal pour ta peau.</div>` : '';

    // Les dupes prouvés moins chers d'abord, puis les « autres options » (jamais appelées « dupes »)
    const realDupes = catRes.filter(r => r.level === 'reliable' || r.level === 'similar');
    const probables = catRes.filter(r => r.level === 'probable');
    const others    = catRes.filter(r => !(r.level === 'reliable' || r.level === 'similar' || r.level === 'probable'));
    // Dupes probables : même actif et moins chers (prix relevé), mais la composition n'a pas pu être vérifiée
    const probHtml = probables.length
      ? `${realDupes.length ? '<div class="df-altsep"><span>Dupes probables</span></div>' : ''}
         <p class="df-alt-h">Même type de produit et moins chers au ${probables.some(o => o.unitPrice && o.unitPrice.unit === 'g') ? 'gramme' : 'millilitre'}, mais nous n'avons pas pu vérifier la composition. Regarde la liste d'ingrédients avant d'acheter.</p>`
        + probables.map((r, i) => _resultCard(r, realDupes.length + i)).join('')
      : '';
    // La personne a le produit en main : la photo de la liste d'ingrédients rend le résultat plus précis (facultatif)
    const preciseCta = (!(id.inciList || []).length && id.inciConfidence !== 'photo')
      ? `<p class="df-precise">Tu as le produit en main&nbsp;? <a href="#" onclick="DupeFinder.goPhoto();return false;">Photographie sa liste d'ingrédients</a> pour un résultat plus précis.</p>` : '';
    const catHtml = realDupes.map((r, i) => _resultCard(r, i)).join('')
      + probHtml
      + (others.length
        ? ((realDupes.length || probables.length)
            ? `<div class="df-altsep"><span>Autres options</span></div>
               <p class="df-alt-h">Même actif principal, mais nous ne pouvons pas prouver qu'elles coûtent moins cher au ${others.some(o => o.unitPrice && o.unitPrice.unit === 'g') ? 'gramme' : 'millilitre'} que ton produit.</p>`
            : '')
          + others.map((r, i) => _resultCard(r, realDupes.length + i)).join('')
        : '');
    const extHtml = '';

    // Alternative peau distincte du meilleur dupe (catalogue)
    let altBlock = '';
    if (S.bestAltId && (!best || S.bestAltId !== best.id)) {
      const alt = _catalogProduct(S.bestAltId);
      if (alt) altBlock = `
        <div class="df-altsep"><span>Mieux adapté à ta peau</span></div>
        <p class="df-alt-h">Découvrir une alternative similaire mieux adaptée à ta peau :</p>
        ${_resultCard({ id: alt.id, similarity: 0, role: 'value', skinFit: 'adapted', commonPoints: [], differences: [], why: '', skinNote: '' }, 99)}`;
    }

    // Titre de section : sépare « Ton produit » des propositions (seulement s'il y a des dupes du catalogue)
    const _t = String((id.brand ? id.brand + ' ' : '') + (id.name || '')).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // « à partir de » : seulement parmi les dupes prouvés moins chers (jamais parmi les options non comparables)
    const _prices = realDupes.map(r => { const cp = _catalogProduct(r.id); return cp && cp.price != null ? cp.price : null; }).filter(x => x != null && x > 0);
    const _from = _prices.length ? Math.min.apply(null, _prices) : 0;
    const _count = realDupes.length;
    // « Les dupes de… » seulement s'il y a au moins un dupe fiable ou similaire ; sinon « Des options avec le même actif que… »
    const _priceKnown = _refUnitKnown();
    const dupesTitle = _count ? `
        <div class="df-dupes-title">
          <span class="df-dupes-eyebrow">✦ Les dupes de ✦</span>
          <h3 class="df-dupes-h">« ${_t} »</h3>
          <p class="df-dupes-sub">Des produits de notre sélection qui partagent l'actif principal de ton produit, s'utilisent de la même façon et coûtent moins cher à l'unité.</p>
          <span class="df-dupes-count">${_count} dupe${_count > 1 ? 's' : ''} trouvé${_count > 1 ? 's' : ''}${_from ? ' · à partir de ' + _eur(_from) : ''}</span>
        </div>` : probables.length ? `
        <div class="df-dupes-title">
          <span class="df-dupes-eyebrow">✦ Des dupes probables de ✦</span>
          <h3 class="df-dupes-h">« ${_t} »</h3>
          <p class="df-dupes-sub">Moins chers que ton produit et du même type, mais sa composition n'a pas pu être vérifiée : ce sont des dupes <strong>probables</strong>, pas des dupes confirmés.</p>
          <span class="df-dupes-count">${probables.length} dupe${probables.length > 1 ? 's' : ''} probable${probables.length > 1 ? 's' : ''}${(function () { const pp = probables.map(r => { const cp = _catalogProduct(r.id); return cp && cp.price > 0 ? cp.price : null; }).filter(Boolean); return pp.length ? ' · à partir de ' + _eur(Math.min.apply(null, pp)) : ''; })()}</span>
        </div>` : (catRes.length ? `
        <div class="df-dupes-title">
          <span class="df-dupes-eyebrow">✦ Des options avec le même actif que ✦</span>
          <h3 class="df-dupes-h">« ${_t} »</h3>
          <p class="df-dupes-sub">Même actif principal et même façon de les utiliser. ${_priceKnown ? 'Aucune n\'est prouvée moins chère que ton produit.' : 'Indique ton prix pour savoir lesquelles te font économiser.'}</p>
          <span class="df-dupes-count">${catRes.length} option${catRes.length > 1 ? 's' : ''}</span>
        </div>` : '');

    return `
      <div class="df-results">
        ${header}
        ${selfBanner}
        ${warn}
        ${_vPriceForm()}
        ${dupesTitle}
        <div class="df-list">${catHtml}${extHtml}</div>
        ${preciseCta}
        ${altBlock}
        ${_footer(left)}
      </div>`;
  }

  function _footer() {
    return `${_quotaLine()}<button class="btn btn-outline df-btn" onclick="DupeFinder.goHome()">📸 Scanner un autre produit</button>`;
  }

  // Limite atteinte (quota du mois, trop de demandes, plafond de coût du jour) : message doux du serveur
  function _vLimit() {
    return `
      <div class="df-blocked">
        <span class="df-hero-emoji">⏳</span>
        <h2>On fait une pause</h2>
        <p>${_esc(S.limitMsg || 'Réessaie dans quelques instants.')}</p>
        <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.goHome()">← Retour</button>
      </div>`;
  }

  // ── État ERREUR TECHNIQUE (≠ absence de dupe) — avec bouton Réessayer ──
  function _vError() {
    return `
      <div class="df-results">
        <div class="df-state df-state--error">
          <span class="df-hero-emoji">⚠️</span>
          <h2>Recherche momentanément indisponible</h2>
          <p>Nous n'avons pas pu rechercher les dupes pour le moment. Vérifie ta connexion puis réessaie.</p>
          <div class="df-state-ctas">
            <button class="btn btn-dark df-btn-main" onclick="DupeFinder.retry()">🔄 Réessayer</button>
            <button class="btn btn-outline df-btn" onclick="DupeFinder.goHome()">← Retour</button>
          </div>
        </div>
      </div>`;
  }

  // ── État INFOS INSUFFISANTES sur le produit ──
  function _vInsufficient() {
    return `
      <div class="df-results">
        <div class="df-state df-state--insufficient">
          <span class="df-hero-emoji">🔍</span>
          <h2>Produit pas assez identifié</h2>
          <p>Nous n'avons pas assez d'informations sur ce produit pour trouver un dupe fiable. Reprends une photo nette de la face avant, scanne le code-barres, ou saisis le produit à la main.</p>
          <div class="df-state-ctas">
            <button class="btn btn-dark df-btn-main" onclick="DupeFinder.goHome()">📸 Reprendre une photo</button>
            <button class="btn btn-outline df-btn" onclick="DupeFinder.goBarcode()">📊 Scanner le code-barres</button>
            <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.goManual(true)">⌨️ Saisir à la main</button>
          </div>
        </div>
      </div>`;
  }

  // ─── Composition : confirmation d'une fiche proche, ou photo de la liste d'ingrédients ──
  const _esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const _frDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : (d || '');

  function _vCompoConfirm() {
    const id = S.identified || {};
    const link = id.inciSourceUrl ? ` <a href="${_esc(id.inciSourceUrl)}" target="_blank" rel="noopener">voir la page</a>` : '';
    return `
      <div class="df-confirm">
        <h2>On a trouvé une fiche proche</h2>
        <div class="df-id-card"><span class="df-id-brand">Ton produit</span><h2 class="df-id-name">${_esc((id.brand ? id.brand + ' ' : '') + (id.name || ''))}</h2></div>
        <div class="df-id-card"><span class="df-id-brand">Fiche trouvée (${_esc(id.inciSourceLabel)})</span><h2 class="df-id-name">${_esc(id.inciTitle)}</h2>${link}</div>
        <p class="df-confirm-q">C'est bien le même produit&nbsp;?</p>
        <p class="df-compo-note">Certaines versions (baby, nuit, mini…) n'ont pas la même composition. Si ce n'est pas exactement le tien, mieux vaut ne pas l'utiliser.</p>
        <button class="btn btn-dark df-btn-main" onclick="DupeFinder.confirmCompo(true)">✅ Oui, c'est le même</button>
        <button class="btn btn-outline df-btn" onclick="DupeFinder.confirmCompo(false)">Non, ce n'est pas le même</button>
      </div>`;
  }

  function _vCompoPhoto() {
    return `
      <div class="df-notfound">
        <span class="df-hero-emoji">📷</span>
        <h2>Photographie la liste d'ingrédients</h2>
        <p>Nous n'avons pas trouvé de composition fiable pour ce produit. Prends en photo la liste des ingrédients (souvent au dos de la boîte ou sur le tube) : c'est elle qui permettra de comparer.</p>
        ${S.photoMsg ? `<p class="df-compo-note">${_esc(S.photoMsg)}</p>` : ''}
        <button class="btn btn-dark df-btn-main" onclick="document.getElementById('dfIngPhoto').click()">📷 Prendre ou choisir la photo</button>
        <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.skipCompo()">Continuer sans la composition</button>
        <input type="file" id="dfIngPhoto" accept="image/*" style="display:none" onchange="DupeFinder.onIngredientsPhoto(this)">
      </div>`;
  }

  function confirmCompo(yes) {
    const id = S.identified;
    if (!id) { goHome(); return; }
    if (yes) { id.inciConfidence = 'confirmed'; _afterCompo(); return; }
    // « Ce n'est pas le même » : on n'utilise pas cette fiche, et on ne demande pas de photo → recherche avec l'actif probable
    id.inciConfidence = 'none'; id.inciList = []; id.mainFamily = null; id.inci = ''; _afterCompo();
  }

  function goPhoto() { S.photoMsg = ''; S.view = 'compoPhoto'; render(); }

  function skipCompo() {
    const id = S.identified;
    if (id) { id.inciConfidence = 'none'; id.inciList = []; id.mainFamily = null; }
    _afterCompo();
  }

  function onIngredientsPhoto(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    input.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const photo = await _compress(e.target.result, 1600);   // le texte est petit : on garde plus de définition
      _readIngredients(photo);
    };
    reader.readAsDataURL(file);
  }

  // Lecture de la liste photographiée : l'IA ne fait que recopier ce qui est écrit
  async function _readIngredients(photo) {
    if (typeof AIConsent !== 'undefined' && !(await AIConsent.ensure())) {
      S.photoMsg = "Sans ton accord, la photo n'est pas envoyée. Tu peux continuer sans la composition."; S.view = 'compoPhoto'; render(); return;
    }
    S.view = 'reading'; render();
    try {
      const resp = await _post('/api/inci', { mode: 'photo', photo }, 30000);
      if (_limitFrom(resp)) return;
      const r = resp, d = resp.data;
      if (!r.ok || !d || !d.found || !d.inciList || d.inciList.length < 5) {
        S.photoMsg = "Je n'ai pas pu lire la liste. Reprends la photo plus près, bien nette, sans reflet."; S.view = 'compoPhoto'; render(); return;
      }
      const id = S.identified;
      id.inci = d.inci; id.inciList = d.inciList; id.mainFamily = d.mainFamily || null; id.inciConfidence = 'photo'; id.inciSource = 'photo';
      id.inciSourceLabel = d.sourceLabel || 'lue sur ta photo'; id.inciDate = d.retrievedAt || ''; id.inciSourceUrl = ''; id.inciTitle = '';
      _afterCompo();
    } catch (e) {
      S.photoMsg = 'Lecture impossible pour le moment. Réessaie dans un instant.'; S.view = 'compoPhoto'; render();
    }
  }

  // Prix et contenance de TON produit (facultatif) : nécessaires pour prouver qu'un produit coûte moins cher au ml
  function _refUnitKnown() {
    const id = S.identified || {};
    return _refPrice() > 0 && (id.volumeMl > 0 || id.netWeightG > 0);
  }
  // Juste au-dessus des résultats. On ne demande que le PRIX : la contenance est remplie quand la fiche la donne.
  // (La contenance n'est demandée que si aucune fiche ne l'indique.)
  function _vPriceForm() {
    const id = S.identified || {};
    const needPrice  = !(_refPrice() > 0) || !!S.forcePriceForm;    // « Modifier » rouvre le champ prix
    const needAmount = !(id.volumeMl > 0 || id.netWeightG > 0);
    if (!needPrice && !needAmount) return '';
    const intro = needPrice
      ? 'Combien as-tu payé ton produit ? Entre le prix pour voir ce que tu économises.'
      : 'Quelle est la contenance de ton produit ? Elle permet de comparer les prix au millilitre.';
    return `
      <div class="df-priceform">
        <p><strong>${intro}</strong></p>
        <div class="df-priceform-row">
          ${needPrice ? '<input id="dfRefPrice" type="number" inputmode="decimal" step="0.01" min="0" class="df-input" placeholder="Prix payé (€)">' : ''}
          ${needAmount ? '<input id="dfRefAmount" type="number" inputmode="decimal" step="0.1" min="0" class="df-input" placeholder="Contenance"><select id="dfRefUnit" class="df-input df-unit"><option value="ml">ml</option><option value="g">g</option></select>' : ''}
        </div>
        <button class="btn btn-dark df-btn-main" onclick="DupeFinder.recompute()">Voir mes économies</button>
        <p class="df-priceform-note">Ce prix sert uniquement à calculer : il n'est enregistré nulle part.</p>
      </div>`;
  }
  // ─── Étape « prix » : avant les résultats, on demande le prix payé (et la contenance si on ne la connaît pas) ───
  // Sans le prix de SON produit, impossible de prouver qu'un autre est moins cher : c'est la clé pour obtenir de vrais dupes.
  function _afterCompo() {
    const id = S.identified;
    if (!id) { S.view = 'home'; render(); return; }
    _applyUserRef(id);
    if (!_refUnitKnown() && !S.priceSkipped) { S.view = 'priceAsk'; render(); return; }
    return _runMatch();
  }
  function _vPriceAsk() {
    const id = S.identified || {};
    const needPrice  = !(_refPrice() > 0);
    const needAmount = !(id.volumeMl > 0 || id.netWeightG > 0);
    return `
      <div class="df-priceask">
        <span class="df-hero-emoji">💶</span>
        <h2>Combien as-tu payé ce produit&nbsp;?</h2>
        <p class="df-ask-name">${_esc((id.brand ? id.brand + ' ' : '') + (id.name || ''))}</p>
        <p>C'est ce prix qui permet de <strong>prouver</strong> qu'un autre produit coûte moins cher. Sans lui, nous ne pouvons pas te proposer de vrais dupes.</p>
        <div class="df-priceform-row">
          ${needPrice ? '<input id="dfRefPrice" type="number" inputmode="decimal" step="0.01" min="0" class="df-input" placeholder="Prix (€)">' : ''}
          ${needAmount ? '<input id="dfRefAmount" type="number" inputmode="decimal" step="0.1" min="0" class="df-input" placeholder="Contenance"><select id="dfRefUnit" class="df-input df-unit"><option value="ml">ml</option><option value="g">g</option></select>' : ''}
        </div>
        <button class="btn btn-dark df-btn-main" onclick="DupeFinder.recompute()">Voir les dupes</button>
        <button class="btn btn-ghost df-btn-alt" onclick="DupeFinder.skipPrice()">Je ne connais pas le prix</button>
        <p class="df-priceform-note">Le prix sert uniquement à calculer : il n'est enregistré nulle part.</p>
      </div>`;
  }
  function skipPrice() { S.priceSkipped = true; _runMatch(); }
  function recompute() {
    const id = S.identified || {};
    const pEl = document.getElementById('dfRefPrice'), aEl = document.getElementById('dfRefAmount');
    const num = el => parseFloat(String((el && el.value) || '').replace(',', '.'));
    const price  = pEl ? num(pEl) : id.estPrice;
    const amount = aEl ? num(aEl) : (id.volumeMl > 0 ? id.volumeMl : id.netWeightG);
    const unit   = aEl ? (document.getElementById('dfRefUnit')?.value === 'g' ? 'g' : 'ml') : (id.netWeightG > 0 ? 'g' : 'ml');
    if (!(price > 0 && price < 5000) || !(amount > 0 && amount < 5000)) {
      if (typeof showToast === 'function') showToast(pEl ? 'Indique le prix que tu as payé' : 'Indique la contenance', 'warning');
      return;
    }
    S.userRef = { price, amount, unit };
    S.forcePriceForm = false;
    _runMatch();
  }
  // « Modifier » : ce n'est pas le prix que la personne a payé → on rouvre le champ prix
  function editPrice() { S.forcePriceForm = true; render(); }

  // Contenance écrite dans le nom du produit (« … 30 ml ») : remplie automatiquement
  function _volumeFromName(name) {
    const m = String(name || '').toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(ml|g)\b/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return (n > 0 && n < 5000) ? { amount: n, unit: m[2] } : null;
  }

  // ─── Navigation UI ────────────────────────────────────────────
  function goHome()   { S.view = 'home'; S.userRef = null; _stopBarcode(); render(); }
  function goManual(prefill) { if (!prefill) S.identified = null; S.view = 'manual'; render(); }
  function pickCamera()  { document.getElementById('dfCam')?.click(); }
  function pickGallery() { document.getElementById('dfGal')?.click(); }
  function goBarcode()   { S.view = 'barcode'; render(); }

  // ─── Photo → identification ───────────────────────────────────
  function onPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const compressed = await _compress(e.target.result);
      S.photo = compressed;
      _identify(compressed);
    };
    reader.readAsDataURL(file);
  }

  function _compress(dataUrl, target0) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const target = target0 || 1100;
        const scale = Math.min(target / Math.max(img.naturalWidth, img.naturalHeight), 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function _identify(photo) {
    // La photo part vers l'IA : uniquement avec l'accord de l'utilisatrice
    if (typeof AIConsent !== 'undefined' && !(await AIConsent.ensure())) {
      S.view = 'home'; render();
      if (typeof showToast === 'function') showToast("Sans ton accord, la photo n'est pas envoyée — tu peux saisir le produit à la main.", 'info', 4500);
      return;
    }
    S.view = 'analyzing'; render();
    console.info('[DupeFinder] identify: envoi de la photo…');
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 25000);
      const t0  = Date.now();
      const resp = await fetch(apiUrl('/api/identifyProduct'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo }), signal: controller.signal
      });
      clearTimeout(tid);
      console.info('[DupeFinder] identify HTTP', resp.status, '·', (Date.now() - t0) + 'ms');
      // Erreur serveur/technique → état ERREUR (pas « non identifié »)
      if (resp.status >= 500) { S.lastError = 'HTTP ' + resp.status; S.view = 'error'; render(); return; }
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || (!data.brand && !data.name)) {
        console.warn('[DupeFinder] identify: produit non reconnu');
        S.view = 'notfound'; render(); return;
      }
      // Corriger la catégorie à partir du nom (l'IA se trompe parfois)
      if (typeof CurrentRoutine !== 'undefined') data.category = CurrentRoutine.inferCategory(data.name, data.category);
      S.identified = data;
      console.info('[DupeFinder] identify OK:', { brand: data.brand, name: data.name, recognized: data.recognized });
      S.view = data.recognized ? 'confirm' : 'notfound';
      render();
    } catch (err) {
      // Réseau / timeout → état ERREUR technique (avec Réessayer via reprise photo)
      const kind = (err.name === 'AbortError') ? 'timeout (25s)' : (err.message || 'réseau');
      console.error('[DupeFinder] ECHEC technique identify:', err.name || '', '·', kind);
      S.lastError = kind;
      S.view = 'error'; render();
    }
  }

  // ─── INCI réel via Open Beauty Facts (best-effort, non bloquant) ──
  async function _fetchInci(id) {
    try {
      // la recherche de composition sur le web peut prendre quelques secondes
      const r = await _post('/api/inci', { barcode: id.barcode || '', brand: id.brand || '', name: id.name || '' }, 50000);
      if (_limitFrom(r)) return { limited: true };     // compte requis, quota épuisé, limite de produits inconnus du jour…
      if (!r.ok) return null;
      return r.data;
    } catch (e) { console.warn('[DupeFinder] INCI fetch échoué:', e.message); return null; }
  }

  // ─── Saisie manuelle ──────────────────────────────────────────
  function submitManual() {
    const brand = document.getElementById('dfBrand')?.value?.trim() || '';
    const name  = document.getElementById('dfName')?.value?.trim() || '';
    const cat   = document.getElementById('dfCat')?.value || 'other';
    const type  = document.querySelector('input[name="dfType"]:checked')?.value || 'skincare';
    if (!brand && !name) { showToast('Indique au moins la marque et le nom', 'warning'); return; }
    S.identified = { recognized: true, brand, name, range: '', category: cat, productType: type,
                     shade: '', keyActives: [], texture: '', finish: '', coverage: '', estPrice: 0, confidence: 'manual' };
    startSearch();
  }

  // ─── Recherche de dupe ────────────────────────────────────────
  function _shortlist(id) {
    const cat = _normCat(id.category);
    // Le produit scanné ne peut pas être son propre dupe (même fiche, accents/tailles ignorés)
    // (même marque + nom proche, ou même marque + composition quasi identique : pluriel, « 2.0 », contenance, format…)
    const refList = (id.inciList && id.inciList.length >= 8) ? id.inciList : (id.catalogInci && id.catalogInci.length >= 8 ? id.catalogInci : null);
    const _notSelf = p => !(typeof SameProduct !== 'undefined' &&
      (SameProduct.sameWithCompo ? SameProduct.sameWithCompo(id, p, refList, p.inciNormalized) : SameProduct.same(id, p)));
    // Les produits « plus vendus » ou désactivés ne sont jamais proposés
    const catalog = (AppState.products.catalog || []).filter(p => !p.discontinued && p.active !== false).filter(_notSelf);
    // Même USAGE que le produit de la personne (pads / lotion, sérum, crème, masque à rincer, peeling…) :
    // plus précis que la catégorie, qui range pads, peelings et sérums dans le même « bucket ».
    const refUsage = (typeof UsageType !== 'undefined') ? UsageType.usageOf({ name: id.name, category: id.category }) : null;
    let pool = refUsage
      ? catalog.filter(p => UsageType.compatible(refUsage, UsageType.usageOf(p)).ok)
      : catalog.filter(p => _normCat(p.category) === cat);
    if (!pool.length) pool = catalog.filter(p => p.category === id.category);
    if (!pool.length) return [];
    const acts = (id.keyActives || []).map(_slug).filter(Boolean);
    // Actif principal du produit scanné d'après son NOM (ou sa fiche catalogue) : les produits qui le
    // partagent passent en tête de liste. Le serveur applique ensuite la règle de façon stricte.
    const refMain = (typeof MainActive !== 'undefined') ? MainActive.resolve({ name: id.name, tags: id.catalogTags }) : null;
    // Famille d'actif : d'après le nom / la fiche catalogue, sinon d'après la composition trouvée (calculée par le serveur)
    const refFam = (refMain && refMain.family) || id.mainFamily || id.estimateFamily || null;
    // Produit sans actif vedette (crème de base, huile…) : on privilégie les produits qui n'en ont pas non plus
    const generic = !refFam && (id.estimated === true || (id.inciList || []).length >= 3);
    const scored = pool.map(p => {
      let s = 0;
      const ptags = (p.ingredientTags || []).map(_slug);
      s += acts.filter(a => ptags.some(t => t.includes(a) || a.includes(t))).length * 3;
      if (refFam && typeof MainActive !== 'undefined') { const m = MainActive.resolve({ name: p.name, tags: p.ingredientTags }); if (m && m.family === refFam) s += 20; }
      if (generic && typeof MainActive !== 'undefined') { const m = MainActive.resolve({ name: p.name, tags: p.ingredientTags }); if (!m || !MainActive.isHero(m.family)) s += 20; }
      if (_refPrice() > 0 && p.price > 0 && p.price < _refPrice()) s += 2;
      s += (p.rating || 0) * 0.3;
      return { p, s };
    }).sort((a, b) => b.s - a.s).slice(0, 30).map(x => x.p);
    // Adéquation à l'âge — ne pas proposer de dupe catalogue non adapté (règle centrale)
    const _pool = (typeof AgeGuard !== 'undefined')
      ? AgeGuard.filter(scored, AgeGuard.age(AppState.questionnaire?.answers)) : scored;
    return _pool.map(p => ({
      id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price,
      volumeMl: p.volumeMl || undefined, netWeightG: p.netWeightG || undefined,   // prix à l'unité (règle du prix au ml)
      barcode: p.barcode || '',
      // INCI structuré du catalogue → similarité de FORMULE côté serveur (fait autorité)
      inciNormalized: Array.isArray(p.inciNormalized) ? p.inciNormalized.slice(0, 45) : undefined,
      inciVerificationStatus: p.inciVerificationStatus || undefined,
      dupeEligible: p.dupeEligible === true ? true : undefined,
      ingredientTags: p.ingredientTags || [], concernTags: p.concernTags || [], description: p.description || ''
    }));
  }

  async function startSearch() {
    const id = S.identified;
    console.info('[DupeFinder] startSearch', id ? { brand: id.brand, name: id.name, category: id.category, confidence: id.confidence } : 'null');
    if (!id) { S.view = 'home'; render(); return; }

    // État « infos insuffisantes » : sans nom ni marque, impossible de chercher un dupe fiable
    const hasName  = (id.name  || '').trim().length >= 2;
    const hasBrand = (id.brand || '').trim().length >= 2;
    if (!hasName && !hasBrand) {
      console.warn('[DupeFinder] infos insuffisantes (ni nom ni marque) -> etat insufficient');
      S.view = 'insufficient'; render(); return;
    }

    S.priceSkipped = false;
    if (!id._searchId) id._searchId = 'r' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);   // une recherche = un seul décompte
    if (_left() <= 0 && !id._counted) {
      S.limitMsg = 'Tu as utilisé tous tes dupes ce mois-ci. Ils reviennent le 1er du mois prochain.';
      S.view = 'limit'; render(); return;
    }

    // Maquillage : pas d'actif principal, donc pas de dupe pour l'instant (à venir). On garde la demande
    // (scan enregistré, sans e-mail) pour savoir quels produits sont recherchés, mais on n'appelle pas l'IA.
    if (id.productType === 'makeup' || MAKEUP_CATS.indexOf(id.category) >= 0) {
      S.trueDupe = false; S.results = []; S.externalResults = []; S.bestAltId = null; S.selfDupe = null;
      S.status = 'makeup-soon'; S.noDupeMsg = 'Les dupes maquillage arrivent bientôt.';
      id.priceVerified = false; id.estPrice = 0;
      _saveScan(id, false);
      S.view = 'nodupe'; render(); return;
    }

    S.view = 'searching'; S.lastError = null; S.selfDupe = null; render();

    // 1) Fiche du produit dans NOTRE catalogue, si elle existe (prix, mots-clés, composition vérifiée)
    _applyCatalogOwn(id);

    // 2) Composition de la référence : nos fiches → cache → Open Beauty Facts → INCIDecoder.
    //    Jamais inventée : chaque liste garde sa page source et sa date.
    const inci = await _fetchInci(id);
    if (inci && inci.limited) return;                  // un message de limite est déjà affiché
    _applyInci(id, inci);

    // Page au nom proche mais pas identique (ex. version « baby », « nuit ») : on demande de CONFIRMER
    if (id.inciConfidence === 'medium') { S.view = 'compoConfirm'; render(); return; }
    // Rien de vérifié : on ne demande RIEN à la personne. Le serveur a cherché la composition sur le web ; à défaut, on
    // continue avec l'actif probable (« dupe probable »). La photo de la liste reste proposée, mais facultative.
    return _afterCompo();
  }

  // ─── Fiche catalogue du produit scanné ────────────────────────
  // Prix : seul un prix de NOTRE catalogue ou celui que l'utilisatrice indique est un fait. L'estimation de
  // l'IA n'est jamais affichée.
  function _applyCatalogOwn(id) {
    id.priceVerified = false; id.estPrice = 0; id.priceSource = ''; id.catalogTags = undefined; id.catalogInci = undefined;
    id.priceSourceName = ''; id.priceSourceUrl = ''; id.priceDate = ''; id.priceNote = ''; id.catalogPriceHint = 0;
    const vn = _volumeFromName(id.name);
    if (vn && !id.volumeMl && !id.netWeightG) { if (vn.unit === 'g') id.netWeightG = vn.amount; else id.volumeMl = vn.amount; }
    try {
      if (typeof SameProduct !== 'undefined') {
        const own = (AppState.products.catalog || []).find(p => SameProduct.same(id, p));
        if (own) {
          id.catalogId = own.id;
          // Le prix du catalogue ne sert de référence QUE s'il est sourcé et daté (revendeur + date). Sinon : indicatif seulement.
          if (own.price > 0) {
            if (own.priceVerified && own.priceSource && own.priceSource.name && own.priceRetrievedAt) {
              id.estPrice = own.price; id.priceVerified = true; id.priceSource = 'catalogue';
              id.priceSourceName = own.priceSource.name; id.priceSourceUrl = own.priceSource.url || ''; id.priceDate = own.priceRetrievedAt; id.priceNote = own.priceNote || '';
            } else { id.catalogPriceHint = own.price; }
          }
          if (own.volumeMl > 0 && !id.volumeMl) id.volumeMl = own.volumeMl;
          if (own.netWeightG > 0 && !id.netWeightG) id.netWeightG = own.netWeightG;
          id.catalogTags = own.ingredientTags || [];
          if (Array.isArray(own.inciNormalized) && own.inciNormalized.length && (!own.inciVerificationStatus || own.inciVerificationStatus === 'verified')) {
            id.catalogInci = own.inciNormalized.slice(0, 45);
          }
        }
      }
    } catch (e) {}
    _applyUserRef(id);
  }

  // Prix et contenance indiqués par l'utilisatrice (facultatif) : ils passent avant ceux du catalogue
  function _applyUserRef(id) {
    const u = S.userRef;
    if (!u) return;
    if (u.price > 0) { id.estPrice = u.price; id.priceVerified = true; id.priceSource = 'user'; id.priceSourceName = ''; id.priceDate = ''; id.priceNote = ''; }
    if (u.amount > 0) {
      if (u.unit === 'g') { id.netWeightG = u.amount; id.volumeMl = 0; } else { id.volumeMl = u.amount; id.netWeightG = 0; }
    }
  }

  function _applyInci(id, inci) {
    id.inciSourceUrl = ''; id.inciSourceLabel = ''; id.inciDate = ''; id.inciTitle = ''; id.mainFamily = null;
    // Niveau 3 : actif principal PROBABLE estimé par le serveur (jamais une composition). `estimated` = le serveur a répondu, même « aucun actif vedette ».
    id.estimated = !!(inci && inci.estimate); id.estimateFamily = (inci && inci.estimate && inci.estimate.family) || '';
    if (inci && inci.found && inci.inciList && inci.inciList.length >= 3) {
      id.inci = inci.inci; id.inciList = inci.inciList; id.mainFamily = inci.mainFamily || null;
      id.inciSource = inci.source; id.inciConfidence = inci.confidence;   // 'high' | 'medium'
      id.inciSourceUrl = inci.sourceUrl || ''; id.inciSourceLabel = inci.sourceLabel || ''; id.inciDate = inci.retrievedAt || ''; id.inciTitle = inci.matchedName || '';
      // La contenance n'est retenue que si la fiche est sûre (même produit à coup sûr)
      if (inci.volumeMl && inci.confidence === 'high' && !id.volumeMl && !id.netWeightG) id.volumeMl = inci.volumeMl;
      // Prix de référence relevé (revendeur + date) dans nos fiches : repris tel quel, la personne peut le modifier
      if (!id.priceVerified && inci.refPrice > 0 && inci.refPriceSource && inci.refPriceDate) {
        id.estPrice = inci.refPrice; id.priceVerified = true; id.priceSource = 'fiche';
        id.priceSourceName = inci.refPriceSource.name || ''; id.priceSourceUrl = inci.refPriceSource.url || ''; id.priceDate = inci.refPriceDate; id.priceNote = inci.refPriceNote || '';
      }
      console.info('[DupeFinder] INCI référence:', inci.confidence, '·', inci.source, '·', inci.inciList.length, 'ingrédients');
    } else {
      id.inciConfidence = 'none'; id.inciList = [];
      console.info('[DupeFinder] INCI référence: non trouvé');
    }
  }

  // L'actif principal est-il déjà connu sans composition ? (nom du produit ou fiche catalogue)
  function _knowsActive(id) {
    return !!id.mainFamily || ((typeof MainActive !== 'undefined') && !!MainActive.resolve({ name: id.name, tags: id.catalogTags }));
  }

  // ─── Recherche des dupes (une fois la composition connue) ─────
  async function _runMatch() {
    const id = S.identified;
    if (!id) { S.view = 'home'; render(); return; }
    S.view = 'searching'; S.lastError = null; render();
    _applyUserRef(id);
    id.refPrice = (id.priceVerified && id.estPrice > 0) ? id.estPrice : undefined;

    // Pré-filtre catalogue (le serveur ne propose que des produits du catalogue)
    const candidates = _shortlist(id);
    console.info('[DupeFinder] shortlist:', candidates.length, 'candidat(s) catalogue');
    if (!id._scanSaved) { id._scanSaved = true; _saveScan(id, candidates.length > 0); }

    let data;
    try {
      const t0  = Date.now();
      const r = await _post('/api/dupeMatch', { product: id, candidates, userSkin: _userSkin(),
        ageConstraint: (typeof AgeGuard !== 'undefined') ? AgeGuard.aiConstraint(AppState.questionnaire?.answers) : null }, 60000);
      console.info('[DupeFinder] dupeMatch HTTP', r.status, '·', (Date.now() - t0) + 'ms');
      if (_limitFrom(r)) return;                       // compte requis, quota épuisé, trop de demandes, plafond du jour
      data = r.data;
      if (!r.ok || !data) throw new Error('HTTP ' + r.status + (data && data.error ? ' · ' + data.error : ' · reponse illisible'));
    } catch (err) {
      // ── ÉTAT ERREUR TECHNIQUE (réseau / timeout / serveur) — distinct de « aucun dupe » ──
      const kind = (err.name === 'AbortError') ? 'timeout (40s)' : (err.message || 'réseau');
      console.error('[DupeFinder] ECHEC technique dupeMatch:', err.name || '', '·', kind);
      S.lastError = kind;
      S.view = 'error'; render();
      return;
    }

    // ── SUCCÈS HTTP : distinguer « résultats » vs « aucun dupe fiable » ──
    S.trueDupe        = !!data.trueDupeExists;
    S.results         = Array.isArray(data.results) ? data.results : [];
    S.externalResults = [];   // plus de dupes hors catalogue proposés de mémoire (phase 1)
    S.status          = data.status || '';
    S.noDupeMsg       = data.noDupeMessage || '';
    S.bestAltId       = data.bestSkinAlternativeId || null;
    S.selfDupe        = null; // plus de « ce produit est un dupe de… » issu de la mémoire de l'IA (phase 1)
    // (le décompte du dupe est fait par le serveur : une seule fois par recherche, et seulement si un résultat s'affiche)

    // Règle n°1 : l'écran ne finit jamais sur « rien trouvé ». Dès qu'il y a UN produit du même actif, on l'affiche
    // (dupes d'abord, puis « autres options »). Sinon, écran utile : ce que contient le produit + mise de côté.
    if (S.results.length > 0) {
      console.info('[DupeFinder] resultats:', S.results.length, 'produit(s) du catalogue');
      S.view = 'results';
    } else {
      console.info('[DupeFinder] aucun produit du même actif (statut ' + S.status + ')');
      S.view = 'nodupe';
      if (S.status !== 'makeup-soon') _queueProduct(id, S.status);    // gardé de côté pour l'enrichir plus tard
    }
    render();
  }

  // « On ajoute ton produit à notre liste de recherche » : marque, nom, catégorie (jamais de compte ni d'adresse IP)
  async function _queueProduct(id, reason) {
    if (!id || id._queued !== undefined) return;
    id._queued = false;
    try {
      const r = await _post('/api/inci', { mode: 'queue', brand: id.brand || '', name: id.name || '', category: id.category || '', barcode: id.barcode || '', reason: reason || '' }, 12000);
      id._queued = !!(r.ok && r.data && r.data.ok);
      if (S.identified === id && (S.view === 'nodupe')) render();
    } catch (e) { id._queued = false; }
  }

  // ─── Sauvegarde des scans (enrichissement catalogue / admin) ──
  async function _saveScan(id, matched) {
    try {
      if (typeof firebase === 'undefined' || !firebase.apps.length) return;
      const db = firebase.firestore();
      await db.collection('scannedProducts').add({
        brand: id.brand || '', name: id.name || '', category: id.category || 'other',
        productType: id.productType || 'skincare', shade: id.shade || '',
        keyActives: id.keyActives || [], estPrice: (id.priceVerified && id.priceSource === 'catalogue') ? id.estPrice : 0,
        matchedInCatalog: !!matched, source: id.confidence === 'manual' ? 'manual' : 'photo',
        // Le scan est relié au compte par son identifiant (uid) uniquement : l'e-mail reste dans le compte (Firebase Auth)
        uid: AppState?.user?.uid || null,
        createdAt: new Date().toISOString(), status: 'pending_review'
      });
    } catch (err) { console.warn('[DupeFinder] saveScan échoué:', err.message); }
  }

  // ─── Code-barres (BarcodeDetector + Open Beauty Facts) ────────
  async function _startBarcode() {
    _barcodeStop = false;
    const video = document.getElementById('dfVideo');
    const msg   = document.getElementById('dfBarcodeMsg');
    if (!('BarcodeDetector' in window)) {
      if (msg) msg.innerHTML = "Ton navigateur ne gère pas le scan. <a href='#' onclick=\"DupeFinder.goManual();return false;\">Saisir à la main</a> ou <a href='#' onclick=\"DupeFinder.pickCamera();return false;\">prendre une photo</a>.";
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      _barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = _barcodeStream;
      await video.play();
      const loop = async () => {
        if (_barcodeStop) return;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            const code = codes[0].rawValue;
            _stopBarcode();
            _lookupBarcode(code);
            return;
          }
        } catch {}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (err) {
      if (msg) msg.innerHTML = "Impossible d'ouvrir la caméra. <a href='#' onclick=\"DupeFinder.pickCamera();return false;\">Prendre une photo</a> à la place.";
    }
  }

  function _stopBarcode() {
    _barcodeStop = true;
    if (_barcodeStream) { _barcodeStream.getTracks().forEach(t => t.stop()); _barcodeStream = null; }
  }

  async function _lookupBarcode(code) {
    S.view = 'analyzing'; render();
    try {
      const r = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
      const d = await r.json().catch(() => null);
      if (d && d.status === 1 && d.product) {
        const pr = d.product;
        S.identified = {
          recognized: true, brand: (pr.brands || '').split(',')[0].trim(),
          name: pr.product_name || pr.generic_name || '', range: '',
          category: 'other', productType: 'skincare', shade: '',
          keyActives: [], texture: '', finish: '', coverage: '', estPrice: 0, confidence: 'barcode',
          barcode: String(code)
        };
        S.photo = pr.image_front_url || null;
        S.view = 'confirm'; render();
        return;
      }
      showToast('Code-barres non trouvé — saisis le produit', 'info');
      S.view = 'manual'; render();
    } catch {
      S.view = 'manual'; render();
    }
  }

  // Réessayer contextuel : relance la recherche si un produit est identifié,
  // sinon renvoie à l'accueil pour reprendre une photo.
  function retry() {
    console.info('[DupeFinder] retry (identified=' + !!S.identified + ')');
    if (S.identified) startSearch();
    else goHome();
  }

  return {
    initScreen, render, goHome, goManual, goBarcode,
    pickCamera, pickGallery, onPhoto, submitManual, startSearch, retry,
    confirmCompo, skipCompo, skipPrice, goPhoto, onIngredientsPhoto, recompute, editPrice
  };
})();

if (typeof window !== 'undefined') window.DupeFinder = DupeFinder;
