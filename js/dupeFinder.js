/* ============================================================
   dupeFinder.js — « Trouver son dupe »
   Photo d'un produit → identification IA → recherche du vrai dupe
   dans le catalogue (classement IA) → résultats + note peau.
   Gratuit jusqu'à 3 recherches, puis abonnement.
   ============================================================ */

const DupeFinder = (() => {

  const FREE_LIMIT = 3;

  // Vue courante + données de la session de scan
  let S = { view: 'home', photo: null, identified: null,
            results: null, externalResults: [], noDupeMsg: '', bestAltId: null, trueDupe: false, busy: false };

  let _barcodeStream = null, _barcodeStop = false;

  // ─── Quota ────────────────────────────────────────────────────
  function _count()   { return parseInt(localStorage.getItem('glow_dupe_count') || '0', 10) || 0; }
  function _inc()      { localStorage.setItem('glow_dupe_count', String(_count() + 1)); }
  function _isPremium(){ return typeof Subscription !== 'undefined' && Subscription.getPlan && Subscription.getPlan() !== 'free'; }
  function _left()     { return _isPremium() ? Infinity : Math.max(0, FREE_LIMIT - _count()); }

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
    // Nouvelle session propre à chaque entrée
    S = { view: 'home', photo: null, identified: null, results: null, externalResults: [],
          noDupeMsg: '', bestAltId: null, trueDupe: false, busy: false };
    render();
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
      case 'searching': html = _vLoading('✨ Recherche du meilleur dupe…', 'On compare composition, texture, fini et prix'); break;
      case 'results':   html = _vResults(); break;
      case 'barcode':   html = _vBarcode(); break;
      case 'blocked':   html = _vBlocked(); break;
      default:          html = _vHome();
    }
    c.innerHTML = html;
    if (S.view === 'barcode') _startBarcode();
  }

  function _vHome() {
    const left = _left();
    const quota = _isPremium() ? '' :
      `<p class="df-quota">${left > 0 ? `Il te reste <strong>${left}</strong> recherche${left > 1 ? 's' : ''} gratuite${left > 1 ? 's' : ''}` : 'Tu as utilisé tes 3 recherches gratuites'}</p>`;
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
  const ROLE_LABEL = { closest: '🎯 Le dupe le plus proche', value: '💛 Meilleur rapport qualité-prix', cheapest: '🌱 L\'alternative la moins chère' };

  function _catalogProduct(id) { return (AppState.products.catalog || []).find(p => p.id === id); }
  function _compareUrl(p) { return `https://www.google.com/search?q=${encodeURIComponent((p.brand || '') + ' ' + (p.name || ''))}&tbm=shop`; }
  function _amazonSearch(brand, name) { return `https://www.amazon.fr/s?k=${encodeURIComponent(((brand || '') + ' ' + (name || '')).trim())}&tag=kan10ar-21`; }

  // Carte d'un dupe HORS catalogue (proposé par l'IA, lien Amazon affilié)
  function _externalCard(r) {
    const est = S.identified?.estPrice || 0;
    const savings = (est > 0 && r.approxPrice > 0 && r.approxPrice < est) ? (est - r.approxPrice) : 0;
    const fit = FIT[r.skinFit] || FIT.caution;
    const buyUrl = _amazonSearch(r.brand, r.name);
    return `
      <article class="df-result df-result--ext">
        <div class="df-result-role">${ROLE_LABEL[r.role] || ROLE_LABEL.closest} <span class="df-ext-tag">hors catalogue</span></div>
        <div class="df-result-top">
          <div class="df-result-img-wrap">
            <div class="df-result-noimg">🔎</div>
            ${r.similarity > 0 ? `<span class="df-sim">${r.similarity}%<small>similaire</small></span>` : ''}
          </div>
          <div class="df-result-info">
            <span class="df-result-brand">${r.brand || ''}</span>
            <h3 class="df-result-name">${r.name || ''}</h3>
            <div class="df-result-price">
              <strong>${r.approxPrice > 0 ? '≈ ' + r.approxPrice.toFixed(2) + ' €' : 'Prix à vérifier'}</strong>
              ${savings > 0 ? `<span class="df-save">≈ ${savings.toFixed(2)} € d'économie</span>` : ''}
            </div>
            <div class="df-fit ${fit.cls}">${fit.icon} ${fit.label}</div>
          </div>
        </div>
        ${r.why ? `<p class="df-why-line">${r.why}</p>` : ''}
        <details class="df-why">
          <summary>Pourquoi est-ce un dupe&nbsp;?</summary>
          <div class="df-why-body">
            ${r.commonPoints?.length ? `<p class="df-why-h">✓ Points communs</p><ul>${r.commonPoints.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
            ${r.differences?.length ? `<p class="df-why-h">≠ Différences</p><ul>${r.differences.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
            ${r.skinNote ? `<p class="df-why-h">🧴 Pour ta peau</p><p class="df-skinnote">${r.skinNote}</p>` : ''}
            <p class="df-ext-note">✨ Ce dupe ne fait pas encore partie de notre sélection — prix indicatif, à confirmer sur la boutique.</p>
          </div>
        </details>
        <div class="df-result-ctas">
          <a class="pc-cta pc-cta--compare" href="https://www.google.com/search?q=${encodeURIComponent((r.brand || '') + ' ' + (r.name || ''))}&tbm=shop" target="_blank" rel="noopener">🔍 Comparer les prix</a>
          <a class="pc-cta pc-cta--buy" href="${buyUrl}" target="_blank" rel="noopener nofollow sponsored">Voir sur Amazon →</a>
        </div>
      </article>`;
  }

  function _resultCard(r, idx) {
    const p = _catalogProduct(r.id);
    if (!p) return '';
    const est = S.identified?.estPrice || 0;
    const savings = (est > 0 && p.price != null && p.price < est) ? (est - p.price) : 0;
    const fit = FIT[r.skinFit] || FIT.caution;
    const buyUrl = p.amazonUrl || p.shopUrl || '#';
    const isAff = !!p.amazonUrl;
    return `
      <article class="df-result">
        <div class="df-result-role">${ROLE_LABEL[r.role] || ROLE_LABEL.closest}</div>
        <div class="df-result-top">
          <div class="df-result-img-wrap">
            ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="df-result-img" loading="lazy" onerror="this.style.display='none'">` : '<div class="df-result-noimg">🧴</div>'}
            <span class="df-sim">${r.similarity}%<small>similaire</small></span>
          </div>
          <div class="df-result-info">
            <span class="df-result-brand">${p.brand || ''}</span>
            <h3 class="df-result-name">${p.name || ''}</h3>
            <div class="df-result-price">
              <strong>${p.price != null ? p.price.toFixed(2) + ' €' : '—'}</strong>
              ${savings > 0 ? `<span class="df-save">Tu économises ${savings.toFixed(2)} €</span>` : ''}
            </div>
            <div class="df-fit ${fit.cls}">${fit.icon} ${fit.label}</div>
          </div>
        </div>
        ${r.why ? `<p class="df-why-line">${r.why}</p>` : ''}
        <details class="df-why">
          <summary>Pourquoi est-ce un dupe&nbsp;?</summary>
          <div class="df-why-body">
            ${r.commonPoints?.length ? `<p class="df-why-h">✓ Points communs</p><ul>${r.commonPoints.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
            ${r.differences?.length ? `<p class="df-why-h">≠ Différences</p><ul>${r.differences.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
            ${r.skinNote ? `<p class="df-why-h">🧴 Pour ta peau</p><p class="df-skinnote">${r.skinNote}</p>` : ''}
          </div>
        </details>
        <div class="df-result-ctas">
          <a class="pc-cta pc-cta--compare" href="${_compareUrl(p)}" target="_blank" rel="noopener">🔍 Comparer les prix</a>
          <a class="pc-cta pc-cta--buy" href="${buyUrl}" target="_blank" rel="noopener nofollow${isAff ? ' sponsored' : ''}"
             ${isAff ? `onclick="if(typeof trackAmazonClick==='function')trackAmazonClick('${p.id}')"` : ''}>${isAff ? 'Voir le prix →' : 'Voir le produit →'}</a>
        </div>
      </article>`;
  }

  function _vResults() {
    const id = S.identified || {};
    const left = _left();
    const header = `
      <div class="df-orig">
        ${S.photo ? `<img src="${S.photo}" class="df-orig-img" alt="produit">` : ''}
        <div>
          <span class="df-orig-label">Ton produit</span>
          <h2 class="df-orig-name">${(id.brand ? id.brand + ' ' : '') + (id.name || '')}</h2>
          ${id.estPrice > 0 ? `<span class="df-orig-price">~${id.estPrice.toFixed(2)} €</span>` : ''}
        </div>
      </div>`;

    const catRes = S.results || [];
    const extRes = S.externalResults || [];

    // Pas de vrai dupe (ni catalogue ni externe)
    if (!S.trueDupe || (!catRes.length && !extRes.length)) {
      const alt = S.bestAltId ? _catalogProduct(S.bestAltId) : null;
      return `
        <div class="df-results">
          ${header}
          <div class="df-nodupe">
            <span class="df-hero-emoji">💡</span>
            <p>${S.noDupeMsg || "Nous n'avons pas trouvé de véritable dupe pour ce produit."}</p>
          </div>
          ${alt ? `<p class="df-alt-h">Une alternative similaire, adaptée à ta peau :</p>${_resultCard({ id: alt.id, similarity: 0, role: 'value', skinFit: 'adapted', commonPoints: [], differences: [], why: '', skinNote: '' }, 0)}` : ''}
          ${_footer(left)}
        </div>`;
    }

    // Avertissement si le meilleur dupe (catalogue prioritaire, sinon externe) n'est pas adapté
    const best = catRes[0] || extRes[0];
    const warn = (best && best.skinFit === 'unfit')
      ? `<div class="df-warn">⚠️ C'est le dupe le plus proche de ton produit, mais il ne semble pas idéal pour ta peau.</div>` : '';

    const catHtml = catRes.map((r, i) => _resultCard(r, i)).join('');
    const extHtml = extRes.length
      ? `<div class="df-altsep"><span>Trouvés au-delà de notre sélection</span></div>${extRes.map(r => _externalCard(r)).join('')}`
      : '';

    // Alternative peau distincte du meilleur dupe (catalogue)
    let altBlock = '';
    if (S.bestAltId && (!best || S.bestAltId !== best.id)) {
      const alt = _catalogProduct(S.bestAltId);
      if (alt) altBlock = `
        <div class="df-altsep"><span>Mieux adapté à ta peau</span></div>
        <p class="df-alt-h">Découvrir une alternative similaire mieux adaptée à ta peau :</p>
        ${_resultCard({ id: alt.id, similarity: 0, role: 'value', skinFit: 'adapted', commonPoints: [], differences: [], why: '', skinNote: '' }, 99)}`;
    }

    return `
      <div class="df-results">
        ${header}
        ${warn}
        <div class="df-list">${catHtml}${extHtml}</div>
        ${altBlock}
        ${_footer(left)}
      </div>`;
  }

  function _footer(left) {
    const quota = _isPremium() ? '' :
      (left > 0
        ? `<p class="df-quota">Il te reste <strong>${left}</strong> recherche${left > 1 ? 's' : ''} gratuite${left > 1 ? 's' : ''}</p>`
        : `<p class="df-quota">C'était ta dernière recherche gratuite. <a href="#" onclick="showScreen('premium');return false;">Passer Premium ✦</a></p>`);
    return `${quota}<button class="btn btn-outline df-btn" onclick="DupeFinder.goHome()">📸 Scanner un autre produit</button>`;
  }

  // ─── Navigation UI ────────────────────────────────────────────
  function goHome()   { S.view = 'home'; _stopBarcode(); render(); }
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

  function _compress(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const target = 1100;
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
    S.view = 'analyzing'; render();
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 25000);
      const resp = await fetch('/api/identifyProduct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo }), signal: controller.signal
      });
      clearTimeout(tid);
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || (!data.brand && !data.name)) { S.view = 'notfound'; render(); return; }
      S.identified = data;
      S.view = data.recognized ? 'confirm' : 'notfound';
      render();
    } catch (err) {
      console.warn('[DupeFinder] identify échoué:', err.message);
      S.view = 'notfound'; render();
    }
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
    const catalog = AppState.products.catalog || [];
    let pool = catalog.filter(p => _normCat(p.category) === cat);
    if (!pool.length) pool = catalog.filter(p => p.category === id.category);
    if (!pool.length) return [];
    const acts = (id.keyActives || []).map(_slug).filter(Boolean);
    const scored = pool.map(p => {
      let s = 0;
      const ptags = (p.ingredientTags || []).map(_slug);
      s += acts.filter(a => ptags.some(t => t.includes(a) || a.includes(t))).length * 3;
      if (id.estPrice > 0 && p.price > 0 && p.price < id.estPrice) s += 2;
      s += (p.rating || 0) * 0.3;
      return { p, s };
    }).sort((a, b) => b.s - a.s).slice(0, 20).map(x => x.p);
    return scored.map(p => ({
      id: p.id, brand: p.brand, name: p.name, category: p.category, price: p.price,
      ingredientTags: p.ingredientTags || [], concernTags: p.concernTags || [], description: p.description || ''
    }));
  }

  async function startSearch() {
    if (_left() <= 0) { S.view = 'blocked'; render(); return; }
    const id = S.identified;
    if (!id) { S.view = 'home'; render(); return; }

    S.view = 'searching'; render();
    // Pré-filtre catalogue ; même vide, l'IA peut proposer un dupe hors catalogue
    const candidates = _shortlist(id);
    _saveScan(id, candidates.length > 0);

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 40000);
      const resp = await fetch('/api/dupeMatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: id, candidates, userSkin: _userSkin() }),
        signal: controller.signal
      });
      clearTimeout(tid);
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data) throw new Error('réponse invalide');
      S.trueDupe        = !!data.trueDupeExists;
      S.results         = data.results || [];
      S.externalResults = data.externalResults || [];
      S.noDupeMsg       = data.noDupeMessage || '';
      S.bestAltId       = data.bestSkinAlternativeId || null;
      _inc();
      S.view = 'results'; render();
    } catch (err) {
      console.warn('[DupeFinder] dupeMatch échoué:', err.message);
      showToast('La recherche a échoué, réessaie dans un instant', 'error');
      S.view = 'confirm'; render();
    }
  }

  // ─── Sauvegarde des scans (enrichissement catalogue / admin) ──
  async function _saveScan(id, matched) {
    try {
      if (typeof firebase === 'undefined' || !firebase.apps.length) return;
      const db = firebase.firestore();
      await db.collection('scannedProducts').add({
        brand: id.brand || '', name: id.name || '', category: id.category || 'other',
        productType: id.productType || 'skincare', shade: id.shade || '',
        keyActives: id.keyActives || [], estPrice: id.estPrice || 0,
        matchedInCatalog: !!matched, source: id.confidence === 'manual' ? 'manual' : 'photo',
        uid: AppState?.user?.uid || null, email: AppState?.user?.email || null,
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
          keyActives: [], texture: '', finish: '', coverage: '', estPrice: 0, confidence: 'barcode'
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

  return {
    initScreen, render, goHome, goManual, goBarcode,
    pickCamera, pickGallery, onPhoto, submitManual, startSearch
  };
})();

if (typeof window !== 'undefined') window.DupeFinder = DupeFinder;
