/* ============================================================
   scanProduct.js — « Scanner un produit »
   Je vois un produit (influenceuse, TikTok, magasin…) : est-il fait
   pour MA peau ? Glow Up répond à partir de MON profil + MA routine.

   RÉUTILISE l'existant (ne recrée rien) :
   • caméra native Capacitor / input photo
   • /api/identifyProduct (photo → marque/nom/catégorie/actifs)
   • SkinConcern (besoins ↔ actifs), AgeGuard (sécurité âge/grossesse)
   • AppState.routine (matin/soir) pour le numéro d'étape réel
   Les FAITS sont calculés ici (fiables) ; /api/scanVerdict ne fait que rédiger.
   ============================================================ */

const ScanProduct = (() => {

  let S = { view: 'intro', busy: false, product: null, facts: null, verdict: null };

  // ── Détection actifs (pour conflits/doublons/placement) ──
  const ACT = {
    retinol: /(retinol|retinoide|retinal|bakuchiol|retinyl|retinaldehyde)/,
    vitc:    /(vitamine c|vitaminec|ascorb|3-o-ethyl|ethyl ascorbic|tetrahexyldecyl)/,
    exfo:    /(salicyl|glycol|lactique|mandeli|\baha\b|\bbha\b|exfoli|peeling|gommage)/,
    niacin:  /niacinamide|nicotinamide/,
    ha:      /hyaluron/,
    peptide: /peptide|matrixyl|argireline/
  };
  const _norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function _answers() { return (AppState.questionnaire && AppState.questionnaire.answers) || {}; }

  // Profil nécessaire ? (routine générée OU questionnaire renseigné)
  function hasProfile() {
    if (AppState.routine && AppState.routine.ruleApplied) return true;
    const a = _answers();
    return !!(a.skinType || (Array.isArray(a.complexes) && a.complexes.length) || (Array.isArray(a.concerns) && a.concerns.length));
  }

  // ─── Cycle de vie ─────────────────────────────────────────────
  function initScreen() {
    S = { view: hasProfile() ? 'intro' : 'gate', busy: false, product: null, facts: null, verdict: null };
    render();
  }

  function render() {
    const c = document.getElementById('scanProductContent');
    if (!c) return;
    let html = '';
    switch (S.view) {
      case 'gate':        html = _vGate(); break;
      case 'identifying': html = _vLoading(); break;
      case 'confirm':     html = _vConfirm(); break;
      case 'result':      html = _vResult(); break;
      default:            html = _vIntro();
    }
    c.innerHTML = html;
  }

  // ─── Vues ─────────────────────────────────────────────────────
  function _vGate() {
    return `
      <div class="scan-wrap">
        <div class="scan-hero">
          <span class="scan-hero-emoji">📷</span>
          <h1 class="scan-title">Scanner un produit</h1>
        </div>
        <div class="scan-gate">
          <p class="scan-gate-txt">Pour savoir si ce produit est <strong>vraiment fait pour ta peau</strong>, Glow Up doit d'abord connaître ta peau.</p>
          <button class="btn btn-dark scan-cta" onclick="ScanProduct.goCreateRoutine()">Créer ma routine skincare</button>
          <p class="scan-gate-sub">C'est rapide, et ensuite tu pourras scanner autant de produits que tu veux ✦</p>
        </div>
      </div>`;
  }

  function _vIntro() {
    return `
      <div class="scan-wrap">
        <div class="scan-hero">
          <span class="scan-hero-emoji">📷</span>
          <h1 class="scan-title">Scanner un produit</h1>
          <p class="scan-sub">Tu désires un produit, mais est-il vraiment fait pour toi ? Prends-le en photo, Glow Up te dit s'il est adapté à <strong>ta</strong> peau.</p>
        </div>
        <div class="scan-actions">
          <button class="btn btn-dark scan-cta" onclick="ScanProduct.scan()">📸 Prendre une photo</button>
          <label class="btn btn-outline scan-cta" style="cursor:pointer;text-align:center;">📂 Choisir dans la galerie
            <input type="file" accept="image/*" style="display:none" onchange="ScanProduct.onFile(this)">
          </label>
        </div>
        <p class="scan-tip">Astuce : photographie le <strong>packaging</strong> ou l'étiquette bien lisible (ou une capture d'écran du produit).</p>
      </div>`;
  }

  function _vLoading() {
    return `
      <div class="scan-wrap scan-wrap--center">
        <div class="scan-spin"></div>
        <p class="scan-loading-txt">🔍 Glow Up identifie le produit et le compare à ta peau…</p>
      </div>`;
  }

  // Types proposés à la cliente (elle a toujours le dernier mot sur le type)
  const TYPE_CHOICES = [
    ['cleanser', 'Nettoyant / eau micellaire / démaquillant'], ['toner', 'Lotion / tonique'], ['serum', 'Sérum / ampoule / essence'],
    ['moisturizer', 'Crème / soin hydratant'], ['eye', 'Contour des yeux'], ['spf', 'Protection solaire'], ['mask', 'Masque'],
    ['exfoliant', 'Exfoliant / gommage / peeling'], ['oil', 'Huile visage'], ['lipbalm', 'Baume à lèvres'], ['other', 'Autre / je ne sais pas']
  ];
  function _esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function _vConfirm() {
    const p = S.product || {};
    const cur = _normStep(p.category || 'other');
    const sure = S.catSure && cur !== 'other' && TYPE_CHOICES.some(t => t[0] === cur);
    const opts = TYPE_CHOICES.map(t => '<option value="' + t[0] + '"' + (sure && t[0] === cur ? ' selected' : '') + '>' + t[1] + '</option>').join('');
    return `
      <div class="scan-wrap">
        <div class="scan-hero">
          <span class="scan-hero-emoji">🔎</span>
          <h1 class="scan-title">Vérifions ensemble</h1>
          <p class="scan-sub">Pour être sûre de ne pas me tromper, confirme le <strong>produit</strong> et son <strong>type</strong> avant l'analyse.</p>
        </div>
        <div class="scan-block">
          <label class="scan-block-h" for="scanConfName">Produit lu sur la photo</label>
          <input id="scanConfName" type="text" maxlength="120" value="${_esc((p.brand ? p.brand + ' ' : '') + (p.name || ''))}" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px;box-sizing:border-box;">
          <label class="scan-block-h" for="scanConfType" style="display:block;margin-top:14px;">Quel type de produit est-ce ?</label>
          <select id="scanConfType" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px;box-sizing:border-box;">
            ${sure ? '' : '<option value="" selected disabled>— Choisis le type —</option>'}${opts}
          </select>
          <p class="scan-tip" style="margin-top:10px;">${sure ? "J'ai détecté ce type d'après le nom. Change-le si ce n'est pas le bon." : "Je ne suis pas certaine du type : choisis-le pour que l'analyse soit juste."}</p>
        </div>
        <div class="scan-result-ctas">
          <button class="btn btn-dark scan-cta" onclick="ScanProduct.confirmType()">✓ Confirmer et analyser</button>
          <button class="btn btn-outline scan-cta" onclick="ScanProduct.reset()">↩ Reprendre une photo</button>
        </div>
      </div>`;
  }

  function _vResult() {
    const p = S.product || {};
    const r = S.result || {};
    const v = S.verdict;
    const badge = v === 'green'  ? { cls: 'green',  ic: '🟢' }
                : v === 'orange' ? { cls: 'orange', ic: '🟠' }
                :                  { cls: 'red',    ic: '🔴' };
    const f = S.facts || {};
    const canAdd = v === 'green' && !f.replaceOffer;
    const offer = v !== 'red' && f.replaceOffer && f.replaceKey;
    const reasons = (r.reasons || []).map(x => `<li>${x}</li>`).join('');
    return `
      <div class="scan-wrap">
        <div class="scan-prod-head" style="display:flex;align-items:center;gap:12px;">
          ${S.photo ? `<img src="${S.photo}" alt="Photo de ton produit" style="width:64px;height:64px;object-fit:cover;border-radius:12px;flex:none;border:1px solid rgba(0,0,0,.1);">` : ''}
          <div class="scan-prod-id">
            <span class="scan-prod-brand">${p.brand || ''}</span>
            <span class="scan-prod-name">${p.name || 'Produit'}</span>
          </div>
        </div>

        <div class="scan-verdict scan-verdict--${badge.cls}">
          <span class="scan-verdict-ic">${badge.ic}</span>
          <h2 class="scan-verdict-title">${r.title || ''}</h2>
        </div>

        ${reasons ? `<div class="scan-block"><h3 class="scan-block-h">Pourquoi</h3><ul class="scan-reasons">${reasons}</ul></div>` : ''}

        ${(r.expected && (r.expected.purpose || r.expected.results || r.expected.forYou)) ? `
          <div class="scan-block scan-expected">
            <h3 class="scan-block-h">Résultats attendus</h3>
            ${r.expected.purpose ? `<p class="scan-line"><span class="scan-line-ic">🎯</span> <span><strong>À quoi il sert :</strong> ${r.expected.purpose}</span></p>` : ''}
            ${r.expected.results ? `<p class="scan-line"><span class="scan-line-ic">✨</span> <span><strong>Ce que tu peux en attendre :</strong> ${r.expected.results}${r.expected.timeline ? ` <em>(en général ${r.expected.timeline})</em>` : ''}</span></p>` : ''}
            ${r.expected.forYou ? `<p class="scan-line"><span class="scan-line-ic">👤</span> <span><strong>Pour toi :</strong> ${r.expected.forYou}</span></p>` : ''}
          </div>` : ''}

        ${(v !== 'red' && (r.timing || r.step)) ? `
          <div class="scan-block">
            <h3 class="scan-block-h">Comment l'utiliser</h3>
            ${r.timing ? `<p class="scan-line"><span class="scan-line-ic">⏰</span> ${r.timing}</p>` : ''}
            ${r.step   ? `<p class="scan-line"><span class="scan-line-ic">📍</span> ${r.step}</p>` : ''}
          </div>` : ''}

        ${r.note ? `<div class="scan-note">⚠️ ${r.note}</div>` : ''}

        ${offer ? `
          <div class="scan-block scan-replace">
            <h3 class="scan-block-h">🔁 Veux-tu le remplacer ?</h3>
            <p class="scan-line">Ce produit fait doublon avec <strong>« ${_esc(f.replacesLabel || 'ton produit actuel')} »</strong>, déjà dans ta routine${f.slotState === 'suggestion' ? ' (proposé par Glow Up)' : ''}. Tu peux le remplacer : ta routine sera modifiée et enregistrée.</p>
            <button class="btn btn-dark scan-cta" onclick="ScanProduct.addToRoutine()">✓ Oui, le remplacer dans ma routine</button>
            <button class="btn btn-outline scan-cta" onclick="ScanProduct.reset()">Non, garder ma routine telle quelle</button>
          </div>` : ''}

        <div class="scan-result-ctas">
          ${canAdd ? `<button class="btn btn-dark scan-cta" onclick="ScanProduct.addToRoutine()">✦ Ajouter à ma routine${f.slotState === 'suggestion' && f.replacesLabel ? ' (à la place de « ' + _esc(f.replacesLabel) + ' »)' : (f.slotState === 'empty' ? ' (étape libre)' : '')}</button>` : ''}
          <button class="btn btn-outline scan-cta" onclick="ScanProduct.reset()">📷 Scanner un autre produit</button>
        </div>
      </div>`;
  }

  // ─── Navigation ───────────────────────────────────────────────
  function goCreateRoutine() {
    try { sessionStorage.setItem('glow_after_routine_scan', '1'); } catch (e) {}
    if (typeof startGlowUp === 'function') startGlowUp(); else showScreen('questionnaire');
  }
  function reset() { S = { view: 'intro', busy: false, product: null, facts: null, verdict: null, photo: null }; render(); }

  // ─── Capture photo (caméra native en app, input fichier sinon) ──
  async function _capturePhoto() {
    const C = window.Capacitor;
    const native = !!(C && (typeof C.isNativePlatform === 'function' ? C.isNativePlatform() : (C.platform && C.platform !== 'web')));
    if (native && typeof C.registerPlugin === 'function') {
      try {
        const Camera = C.registerPlugin('Camera');
        const photo = await Camera.getPhoto({
          quality: 80, allowEditing: false, resultType: 'dataUrl', source: 'PROMPT', saveToGallery: false,
          promptLabelHeader: 'Scanner un produit', promptLabelPicture: 'Prendre une photo',
          promptLabelPhoto: 'Choisir dans la galerie', promptLabelCancel: 'Annuler'
        });
        return photo && (photo.dataUrl || (photo.base64String ? 'data:image/jpeg;base64,' + photo.base64String : null));
      } catch (e) {
        const msg = (e && (e.message || e.errorMessage)) ? (e.message || e.errorMessage) : String(e);
        if (!/cancel|annul/i.test(msg)) { try { alert('Photo — erreur : ' + msg); } catch (_) {} }
        return null;
      }
    }
    // Web / navigateur : input fichier
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return resolve(null);
        const rd = new FileReader();
        rd.onload = e => resolve(e.target.result);
        rd.onerror = () => resolve(null);
        rd.readAsDataURL(f);
      };
      input.click();
    });
  }

  // Réduit l'image avant envoi (perf + coût)
  function _compress(dataUrl, maxW = 1100) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(cv.toDataURL('image/jpeg', 0.82)); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Galerie via input fichier (geste utilisateur direct → fiable dans la WebView iOS)
  function onFile(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = e => scan(e.target.result);
    rd.onerror = () => { try { alert('Lecture de la photo impossible'); } catch (_) {} };
    rd.readAsDataURL(f);
  }

  // ─── Flux principal : scan ───────────────────────────────────
  async function scan(rawIn) {
    if (S.busy) return;
    if (!hasProfile()) { S.view = 'gate'; render(); return; }
    const raw = rawIn || await _capturePhoto();
    if (!raw) return;                       // annulé
    // La photo part vers l'IA : uniquement avec l'accord de l'utilisatrice
    if (typeof AIConsent !== 'undefined' && !(await AIConsent.ensure())) {
      if (typeof showToast === 'function') showToast("Sans ton accord, la photo n'est pas envoyée à notre IA.", 'info', 4500);
      return;
    }
    S.busy = true; S.view = 'identifying'; render();
    try {
      const photo = await _compress(raw);
      S.photo = photo;                         // gardée en mémoire seulement, pour l'afficher en petit dans la fiche
      // 1) Identifier le produit (brique existante)
      const idResp = await fetch(apiUrl('/api/identifyProduct'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo })
      });
      const prod = await idResp.json().catch(() => null);
      if (!idResp.ok || !prod || (!prod.brand && !prod.name)) {
        S.busy = false; S.view = 'intro'; render();
        if (typeof showToast === 'function') showToast('Produit non reconnu — réessaie avec une photo plus nette du packaging', 'info', 4000);
        return;
      }
      // Le TYPE du produit ne doit jamais dépendre de la seule IA : catalogue, puis règles sur le NOM
      // (ex. « eau micellaire » = nettoyant, jamais une crème).
      prod.category = _fixCategory(prod);
      S.product = prod;
      // Le type est toujours CONFIRMÉ par l'utilisatrice avant l'analyse (aucune erreur silencieuse)
      S.catSure = prod.confidence !== 'low' && prod.category !== 'other';
      S.busy = false; S.view = 'confirm'; render();
    } catch (e) {
      console.warn('[ScanProduct] scan échoué:', e.message);
      S.busy = false; S.view = 'intro'; render();
      try { alert('Analyse impossible : ' + (e && e.message ? e.message : e)); } catch (_) {}
    }
  }

  // Étape 2 : après confirmation du type par l'utilisatrice
  async function confirmType() {
    if (S.busy || !S.product) return;
    const nameEl = document.getElementById('scanConfName'), typeEl = document.getElementById('scanConfType');
    const cat = typeEl && typeEl.value;
    if (!cat) { if (typeof showToast === 'function') showToast('Choisis d’abord le type de produit.', 'info', 3000); return; }
    const prod = S.product;
    const typed = nameEl ? nameEl.value.trim() : '';
    const orig = ((prod.brand ? prod.brand + ' ' : '') + (prod.name || '')).trim();
    if (typed && typed !== orig) { prod.brand = ''; prod.name = typed.slice(0, 120); }   // nom corrigé par elle : on le prend tel quel
    prod.category = cat;                                                                  // le type choisi par elle fait foi
    prod.userConfirmedType = true;
    S.busy = true; S.view = 'identifying'; render();
    try {
      // 2) Calculer les FAITS (fiables, côté app)
      const facts = computeFacts(prod);
      S.facts = facts;
      S.verdict = facts.verdict;

      // 3) Rédaction du verdict par l'IA (ne décide rien, met en mots)
      const a = _answers();
      const profile = {
        skinType: (AppState.face && AppState.face.skinAnalysis && AppState.face.skinAnalysis.skinType && AppState.face.skinAnalysis.skinType.type) || a.skinType || null,
        concerns: a.concerns || a.complexes || [],
        objective: a.objectives || null,
        age: (typeof AgeGuard !== 'undefined' && AgeGuard.age) ? AgeGuard.age(a) : null,
        pregnant: Array.isArray(a.labels) && a.labels.includes('grossesse')
      };
      try {
        const vResp = await fetch(apiUrl('/api/identifyProduct'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'verdict', product: prod, verdict: facts.verdict, facts, profile })
        });
        S.result = await vResp.json().catch(() => null);
      } catch (e) { S.result = null; }
      if (!S.result || !S.result.title) S.result = _localText(prod, facts);

      // analytics (funnel)
      try { if (window.Analytics && Analytics.event) Analytics.event('scan_product', { verdict: facts.verdict }); } catch (e) {}

      S.busy = false; S.view = 'result'; render();
    } catch (e) {
      console.warn('[ScanProduct] scan échoué:', e.message);
      S.busy = false; S.view = 'intro'; render();
      try { alert('Analyse impossible : ' + (e && e.message ? e.message : e)); } catch (_) {}
    }
  }

  // ─── Type du produit : jamais « deviné » par l'IA seule ──────────
  function _fixCategory(prod) {
    // 1) produit connu du catalogue → sa catégorie fait foi
    try {
      if (typeof SameProduct !== 'undefined') {
        const own = ((AppState.products && AppState.products.catalog) || []).find(p => p.category && SameProduct.same(prod, p));
        if (own) return own.category;
      }
    } catch (e) {}
    // 2) sinon : déduit du NOM (règles déterministes)
    try {
      if (typeof CurrentRoutine !== 'undefined' && CurrentRoutine.inferCategory) return CurrentRoutine.inferCategory(prod.name || '', prod.category);
    } catch (e) {}
    return prod.category || 'other';
  }
  const KIND_FR = {
    cleanser: "nettoyant / démaquillant (produit de nettoyage : il nettoie la peau, ce n'est pas un soin qui reste sur le visage)",
    toner: 'tonique / lotion', serum: 'sérum', moisturizer: 'crème ou soin hydratant', spf: 'protection solaire',
    eye: 'soin contour des yeux', mask: 'masque', exfoliant: 'exfoliant', oil: 'huile', lipbalm: 'baume à lèvres', treatment: 'soin ciblé'
  };
  function _kindFr(prod) {
    if (/micellaire|micellar/i.test(prod.name || '')) return "eau micellaire (nettoyant démaquillant : elle nettoie la peau, ce n'est PAS une crème ni un soin qui reste sur le visage)";
    return KIND_FR[_normStep(prod.category || 'other')] || '';
  }

  // Repli texte local si l'IA échoue (toujours cohérent avec les faits)
  function _localText(product, facts) {
    const title = facts.verdict === 'green'  ? 'Oui, ce produit peut te convenir'
                : facts.verdict === 'orange' ? 'Oui, mais avec quelques précautions'
                :                              "Non, ce produit n'est pas idéal pour toi";
    const reasons = [];
    if ((facts.addresses || []).length) reasons.push('Il répond à ' + facts.addresses.join(', ') + '.');
    if (facts.replaceOffer && facts.replacesLabel) reasons.push('Il fait doublon avec « ' + facts.replacesLabel + ' » : tu peux le remplacer dans ta routine.');
    (facts.conflicts || []).forEach(c => reasons.push(c));
    if (facts.safety)                   reasons.push(facts.safety);
    if (facts.basic) reasons.unshift("C'est un produit de base de la routine : il ne cible pas un besoin précis, il a un rôle (nettoyer, tonifier ou protéger).");
    if (!reasons.length)                reasons.push("Aucun besoin clair identifié dans ton profil pour ce produit.");
    return { title, reasons: reasons.slice(0, 3), timing: facts.moment || '', step: facts.stepText || '', note: facts.safety || (facts.conflicts || [])[0] || '' };
  }

  // ─── Calcul des FAITS (cœur fiable) ───────────────────────────
  function _pseudo(prod) {
    return {
      name: (prod.brand || '') + ' ' + (prod.name || ''),
      brand: prod.brand || '', category: prod.category || 'other',
      ingredientTags: (prod.keyActives || []).map(s => String(s))
    };
  }

  function _actives(hay) {
    const h = _norm(hay); const out = {};
    Object.keys(ACT).forEach(k => out[k] = ACT[k].test(h));
    return out;
  }

  function _currentHay() {
    const r = AppState.routine || {};
    let hay = [...(r.matin || []), ...(r.soir || [])].map(s => (s.label || '') + ' ' + (s.note || '')).join(' ');
    (AppState.products && AppState.products.recommended || []).forEach(p => { hay += ' ' + (p.name || '') + ' ' + ((p.ingredientTags || []).join(' ')); });
    if (typeof CurrentRoutine !== 'undefined' && CurrentRoutine.list) {
      try { CurrentRoutine.list().forEach(e => { hay += ' ' + (e.name || '') + ' ' + (e.brand || ''); }); } catch (e) {}
    }
    return hay;
  }

  // Produits que l'utilisatrice UTILISE VRAIMENT (choisis par elle dans « Modifier ma routine » ou déjà possédés).
  // Les suggestions de Glow Up ne comptent pas : ce ne sont pas des produits qu'elle a.
  function _ownedInfo() {
    const out = { hay: '', products: [] };
    try {
      if (typeof RoutineRenderer === 'undefined' || !RoutineRenderer.resolveSection) return out;
      ['matin', 'soir'].forEach(sec => (RoutineRenderer.resolveSection(sec) || []).forEach(row => {
        if (row.removed) return;
        if (row.kept) out.hay += ' ' + (row.kept.name || '') + ' ' + (row.kept.brand || '');
        else if (row.overridden && row.product) {
          out.hay += ' ' + (row.product.name || '') + ' ' + (row.product.brand || '') + ' ' + ((row.product.ingredientTags || []).join(' '));
          out.products.push(row.product);
        }
      }));
    } catch (e) {}
    return out;
  }

  // Étape de la routine où le produit scanné irait : étape libre > suggestion de Glow Up > produit déjà choisi par elle.
  // state : 'empty' (étape libre) | 'suggestion' (suggestion Glow Up, remplaçable sans doublon) | 'mine' (son produit)
  function _slotFor(prod, prodActives, preferSection) {
    try {
      if (typeof RoutineRenderer === 'undefined' || !RoutineRenderer.resolveSection) return null;
      const cat = _normStep(prod.category || 'other');
      if (cat === 'other') return null;
      const SER = ['serum', 'treatment'];
      const SINGLE = ['cleanser', 'moisturizer', 'spf'];
      const actKeys = Object.keys(prodActives).filter(k => prodActives[k]);
      const secs = preferSection === 'soir' ? ['soir', 'matin'] : ['matin', 'soir'];
      let best = null;
      for (const section of secs) {
        const rows = RoutineRenderer.resolveSection(section) || [];
        rows.forEach((row, i) => {
          const t = _normStep(row.step.step);
          if (!(t === cat || (SER.includes(t) && SER.includes(cat)))) return;
          let state = 'suggestion', txt = '', label = '';
          if (row.removed) state = 'empty';
          else if (row.kept) { state = 'mine'; txt = (row.kept.name || '') + ' ' + (row.kept.brand || ''); label = ((row.kept.brand ? row.kept.brand + ' ' : '') + (row.kept.name || '')).trim(); }
          else if (row.product) {
            txt = (row.product.name || '') + ' ' + (row.product.brand || '') + ' ' + ((row.product.ingredientTags || []).join(' '));
            label = ((row.product.brand ? row.product.brand + ' ' : '') + (row.product.name || '')).trim();
            if (row.overridden) state = 'mine';
          }
          const have = txt ? _actives(txt) : {};
          const same = actKeys.some(k => have[k]);
          // Un produit déjà choisi par elle, d'un autre type d'actif (ex. 2e sérum différent) : on ne le remplace pas
          if (state === 'mine' && !same && !SINGLE.includes(cat)) return;
          const score = state === 'empty' ? 0 : (state === 'suggestion' ? (same ? 1 : 2) : (same ? 3 : 4));
          const rank = secs.indexOf(section) * 10 + score;      // la section préférée passe d'abord
          if (!best || rank < best.rank) best = { rank, key: row.key, label: label || row.step.label, state, section, pos: i + 1, same };
        });
        if (best && best.rank < 10) break;                       // trouvé dans la section préférée
      }
      return best;
    } catch (e) { return null; }
  }

  function computeFacts(prod) {
    const a = _answers();
    const pseudo = _pseudo(prod);
    const prodActives = _actives(pseudo.name + ' ' + (prod.keyActives || []).join(' '));
    const curActives  = _actives(_currentHay());
    const owned = _ownedInfo();
    const ownedActives = _actives(owned.hay);

    // 1) Besoins du profil couverts par le produit
    const userTags = a.concerns || a.complexes || [];
    let addresses = [];
    try {
      const keys = SkinConcern.concernsForTags(userTags);
      addresses = keys.filter(k => (SkinConcern.scoreProductForConcern(pseudo, k).score || 0) > 0)
                      .map(k => { const c = SkinConcern.concern(k); return c && c.label; })
                      .filter(Boolean);
    } catch (e) {}

    // 2) Sécurité (grossesse / âge)
    let restricted = false, safety = null;
    const pregnant = Array.isArray(a.labels) && a.labels.includes('grossesse');
    if (pregnant && (prodActives.retinol || prodActives.exfo)) {
      restricted = true;
      safety = "Grossesse : ce produit contient un actif déconseillé (rétinol ou acides). À éviter — demande l'avis de ton médecin.";
    } else if (typeof AgeGuard !== 'undefined' && AgeGuard.isRestricted) {
      try {
        const age = AgeGuard.age ? AgeGuard.age(a) : null;
        const rr = AgeGuard.isRestricted(pseudo, age);
        if (rr && rr.restricted) { restricted = true; safety = rr.reason || (AgeGuard.scanMessage && AgeGuard.scanMessage()); }
      } catch (e) {}
    }

    // 3) Ingrédient que l'utilisatrice veut éviter
    const avoid = Array.isArray(a.avoidIngredients) ? a.avoidIngredients : [];
    const AVOID = { parfum: /parfum|fragrance/, alcool: /alcool|alcohol denat/, silicones: /silicone|dimethicone/, parabens: /paraben/ };
    let avoidHit = null;
    const prodHay = _norm(pseudo.name + ' ' + (prod.keyActives || []).join(' '));
    avoid.forEach(x => { if (AVOID[x] && AVOID[x].test(prodHay)) avoidHit = x; });
    if (avoidHit && !safety) safety = "Ce produit contient " + avoidHit + ", que tu préfères éviter.";

    // 4) Conflits d'actifs avec la routine actuelle
    const conflicts = [];
    if (prodActives.retinol && curActives.exfo)    conflicts.push("Ta routine contient déjà des acides (AHA/BHA) : n'utilise pas rétinol + acides le même soir, alterne.");
    if (prodActives.exfo && curActives.retinol)    conflicts.push("Tu as déjà un rétinol le soir : alterne, n'ajoute pas d'acides le même soir.");

    // 5) Doublon : indiqué APRÈS le verdict, à part (le verdict ne dépend jamais de la routine enregistrée)
    let duplicateOf = null;

    // 6) Moment + position réelle dans la routine
    const place = _placeInRoutine(prod, prodActives);
    // Étape visée dans la routine (libre / suggestion Glow Up / produit déjà choisi par elle)
    const slot = _slotFor(prod, prodActives, place.section);
    let slotState = null;
    if (slot) {
      const sl = slot.section === 'soir' ? 'du soir' : 'du matin';
      slotState = slot.state;
      place.replaceKey = slot.key; place.replacesLabel = slot.label; place.section = slot.section; place.pos = slot.pos;
      if (slot.state === 'empty') {
        place.replacesLabel = null;
        place.stepText = `L'étape ${slot.pos} de ta routine ${sl} est libre : il sera ajouté ici.`;
      } else if (slot.state === 'suggestion') {
        duplicateOf = '« ' + slot.label + ' », proposé dans ta routine';
        place.stepText = `Il ferait doublon avec « ${slot.label} » (étape ${slot.pos} de ta routine ${sl}, proposé par Glow Up) : tu peux le remplacer, mais garde un seul des deux.`;
      } else {
        duplicateOf = '« ' + slot.label + ' » que tu utilises déjà';
        place.stepText = `Il ferait doublon avec « ${slot.label} » (étape ${slot.pos} de ta routine ${sl}) : tu peux le remplacer, mais garde un seul des deux.`;
      }
    } else if (place.replaceKey) { place.replaceKey = null; place.replacesLabel = null; }

    // 7) Verdict (déterministe)
    // Produit de BASE (nettoyant, tonique, SPF) : il ne « cible » pas un besoin, il a un rôle dans la routine.
    // On ne lui reproche donc pas de ne rien cibler ; on ne prétend pas non plus vérifier sa composition (inconnue).
    const baseCat  = _normStep(prod.category || 'other');
    const isBasic  = baseCat === 'cleanser' || baseCat === 'toner' || baseCat === 'spf';
    const sensitive = a.skinType === 'sensible' || (Array.isArray(a.complexes) && a.complexes.includes('rougeurs'))
                      || (typeof a.sensitivity === 'number' && a.sensitivity >= 6);
    if (isBasic && sensitive && !safety) {
      safety = "Peau sensible : vérifie sur l'emballage qu'il est sans parfum ni alcool — Glow Up n'a pas pu vérifier sa composition.";
    }
    // Verdict : UNIQUEMENT selon la personne (sécurité, préférences, besoins, sensibilité), jamais selon sa routine enregistrée
    let verdict;
    if (restricted || avoidHit)                                                   verdict = 'red';
    else if (prodActives.retinol && (a.skinType === 'sensible'))                  verdict = 'orange';
    else if (isBasic)                                                             verdict = sensitive ? 'orange' : 'green';
    else if (addresses.length)                                                    verdict = 'green';
    else                                                                          verdict = 'orange';

    return { verdict, addresses, duplicateOf, conflicts, safety, moment: place.moment, stepText: place.stepText, section: place.section, pos: place.pos,
             basic: isBasic, kindFr: _kindFr(prod), replaceKey: place.replaceKey || null, replacesLabel: place.replacesLabel || null,
             replaceOffer: !!(place.replaceKey && verdict !== 'red' && (slotState === 'mine' || slotState === 'suggestion')), slotState };
  }

  const _STEP_ORDER = ['cleanser', 'toner', 'exfoliant', 'serum', 'treatment', 'eye', 'moisturizer', 'oil', 'spf'];
  function _normStep(c) { const M = { sunscreen: 'spf', eye_cream: 'eye', mist: 'toner', nightmask: 'treatment' }; return M[c] || c; }

  function _placeInRoutine(prod, prodActives) {
    const r = AppState.routine || {};
    const cat = _normStep(prod.category || 'other');
    let moment = 'Matin et soir ☀️🌙', section = 'matin';
    if (cat === 'spf')                                       { moment = 'Matin ☀️'; section = 'matin'; }
    else if (prodActives.retinol || cat === 'exfoliant' || cat === 'treatment') { moment = 'Soir 🌙'; section = 'soir'; }
    else if (prodActives.vitc)                               { moment = 'Matin ☀️'; section = 'matin'; }

    const stepCat = prodActives.retinol ? 'treatment' : cat;
    const idxWanted = _STEP_ORDER.indexOf(stepCat);
    const steps = (r[section] || []);
    let pos = 1, after = null, before = null;
    steps.forEach(s => {
      const oi = _STEP_ORDER.indexOf(_normStep(s.step));
      if (oi >= 0 && idxWanted >= 0 && oi <= idxWanted) { pos++; after = s.label; }
      else if (oi > idxWanted && !before) { before = s.label; }
    });
    const sectionLabel = section === 'soir' ? 'du soir' : 'du matin';
    let stepText = `Dans ta routine ${sectionLabel}, utilise-le en étape ${pos}`;
    if (after)  stepText += `, après ${after}`;
    if (before) stepText += ` et avant ${before}`;
    stepText += '.';

    // Étape « unique » (nettoyant, crème, SPF) : le produit PREND LA PLACE de celui de l'étape, il ne s'ajoute pas
    if (['cleanser', 'moisturizer', 'spf'].includes(stepCat)) {
      const sorted = [...steps].sort((x, y) => x.order - y.order);
      const idx = sorted.findIndex(s => _normStep(s.step) === stepCat);
      if (idx >= 0) {
        const n = sorted.slice(0, idx).filter(s => s.step === sorted[idx].step).length;
        const replacesLabel = sorted[idx].label;
        return { moment, section, pos: idx + 1, replaceKey: section + '|' + sorted[idx].step + '|' + n, replacesLabel,
                 stepText: `Il remplacerait le produit de l'étape ${idx + 1} (« ${replacesLabel} ») de ta routine ${sectionLabel} : garde l'un ou l'autre, pas les deux.` };
      }
    }
    return { moment, stepText, section, pos };
  }

  // ─── Ajouter à ma routine (réutilise AppState.routine + RoutineSaver) ──
  function addToRoutine() {
    const p = S.product, f = S.facts;
    if (!p || !f) return;
    // Étape unique (nettoyant, crème, SPF) : le produit scanné remplace celui de l'étape (même système que « Modifier ma routine »)
    if (f.replaceKey && typeof RoutineEdit !== 'undefined' && RoutineEdit.setChoice) {
      let own = null;
      try { if (typeof SameProduct !== 'undefined') own = ((AppState.products && AppState.products.catalog) || []).find(c => c.category && SameProduct.same(p, c)); } catch (e) {}
      RoutineEdit.setChoice(f.replaceKey, own ? { id: own.id } : { custom: { brand: p.brand || '', name: p.name || '', category: p.category || 'other' } });
      if (typeof showToast === 'function') showToast(f.slotState === 'empty' ? 'Ajouté à ton étape libre ✦' : ("C'est fait : " + (f.replacesLabel ? '« ' + f.replacesLabel + ' » est remplacé dans ta routine ✦' : 'ton produit remplace celui de cette étape ✦')), 'success', 2800);
      if (AppState.routine && AppState.routine.ruleApplied) showScreen('results');
      return;
    }
    const r = AppState.routine || (AppState.routine = { matin: [], soir: [] });
    const section = f.section || 'matin';
    if (!Array.isArray(r[section])) r[section] = [];
    const label = ((p.brand ? p.brand + ' ' : '') + (p.name || 'Produit scanné')).trim();
    // évite le doublon d'ajout
    if (r[section].some(s => (s.label || '').toLowerCase() === label.toLowerCase())) {
      if (typeof showToast === 'function') showToast('Déjà dans ta routine ✦', 'info', 2500);
      return;
    }
    const insertAt = Math.max(0, Math.min(r[section].length, (f.pos || r[section].length + 1) - 1));
    r[section].splice(insertAt, 0, {
      order: insertAt + 1, step: _normStep(p.category || 'serum'),
      label, note: f.moment || 'Ajouté via le scan produit', scanned: true,
      product: { brand: p.brand || '', name: p.name || '', category: p.category || 'other' }
    });
    r[section].forEach((s, i) => s.order = i + 1);   // renumérote
    try { if (typeof RoutineSaver !== 'undefined' && RoutineSaver.save) RoutineSaver.save(); } catch (e) {}
    if (typeof showToast === 'function') showToast('Ajouté à ta routine ✦', 'success', 2600);
    // propose d'aller voir sa routine
    if (AppState.routine.ruleApplied) showScreen('results');
  }

  return { initScreen, scan, confirmType, onFile, reset, goCreateRoutine, addToRoutine, computeFacts, hasProfile };
})();

if (typeof window !== 'undefined') window.ScanProduct = ScanProduct;
