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

  function _vResult() {
    const p = S.product || {};
    const r = S.result || {};
    const v = S.verdict;
    const badge = v === 'green'  ? { cls: 'green',  ic: '🟢' }
                : v === 'orange' ? { cls: 'orange', ic: '🟠' }
                :                  { cls: 'red',    ic: '🔴' };
    const canAdd = v === 'green';
    const reasons = (r.reasons || []).map(x => `<li>${x}</li>`).join('');
    return `
      <div class="scan-wrap">
        <div class="scan-prod-head">
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

        ${(v !== 'red' && (r.timing || r.step)) ? `
          <div class="scan-block">
            <h3 class="scan-block-h">Comment l'utiliser</h3>
            ${r.timing ? `<p class="scan-line"><span class="scan-line-ic">⏰</span> ${r.timing}</p>` : ''}
            ${r.step   ? `<p class="scan-line"><span class="scan-line-ic">📍</span> ${r.step}</p>` : ''}
          </div>` : ''}

        ${r.note ? `<div class="scan-note">⚠️ ${r.note}</div>` : ''}

        <div class="scan-result-ctas">
          ${canAdd ? `<button class="btn btn-dark scan-cta" onclick="ScanProduct.addToRoutine()">✦ Ajouter à ma routine</button>` : ''}
          <button class="btn btn-outline scan-cta" onclick="ScanProduct.reset()">📷 Scanner un autre produit</button>
        </div>
      </div>`;
  }

  // ─── Navigation ───────────────────────────────────────────────
  function goCreateRoutine() {
    try { sessionStorage.setItem('glow_after_routine_scan', '1'); } catch (e) {}
    if (typeof startGlowUp === 'function') startGlowUp(); else showScreen('questionnaire');
  }
  function reset() { S = { view: 'intro', busy: false, product: null, facts: null, verdict: null }; render(); }

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
    S.busy = true; S.view = 'identifying'; render();
    try {
      const photo = await _compress(raw);
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
      S.product = prod;

      // 2) Calculer les FAITS (fiables, côté app)
      const facts = computeFacts(prod);
      S.facts = facts;
      S.verdict = facts.verdict;

      // 3) Rédaction du verdict par l'IA (ne décide rien, met en mots)
      const a = _answers();
      const profile = {
        skinType: (AppState.face && AppState.face.skinAnalysis && AppState.face.skinAnalysis.skinType && AppState.face.skinAnalysis.skinType.type) || a.skinType || null,
        concerns: a.concerns || a.complexes || [],
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

  // Repli texte local si l'IA échoue (toujours cohérent avec les faits)
  function _localText(product, facts) {
    const title = facts.verdict === 'green'  ? 'Oui, ce produit peut te convenir'
                : facts.verdict === 'orange' ? 'Oui, mais avec quelques précautions'
                :                              "Non, ce produit n'est pas idéal pour toi";
    const reasons = [];
    if ((facts.addresses || []).length) reasons.push('Il répond à ' + facts.addresses.join(', ') + '.');
    if (facts.duplicateOf)              reasons.push('Il ferait doublon avec ' + facts.duplicateOf + " — tu n'en as pas forcément besoin.");
    (facts.conflicts || []).forEach(c => reasons.push(c));
    if (facts.safety)                   reasons.push(facts.safety);
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

  function computeFacts(prod) {
    const a = _answers();
    const pseudo = _pseudo(prod);
    const prodActives = _actives(pseudo.name + ' ' + (prod.keyActives || []).join(' '));
    const curActives  = _actives(_currentHay());

    // 1) Besoins du profil couverts par le produit
    const userTags = a.concerns || a.complexes || [];
    let addresses = [];
    try {
      const keys = SkinConcern.concernsForTags(userTags);
      addresses = keys.filter(k => SkinConcern.scoreProductForConcern(pseudo, k) > 0)
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
    if (prodActives.retinol && curActives.retinol) conflicts.push("Tu utilises déjà un rétinol : ne les cumule pas, ça risque d'irriter ta peau.");
    if (prodActives.retinol && curActives.exfo)    conflicts.push("Ta routine contient déjà des acides (AHA/BHA) : n'utilise pas rétinol + acides le même soir, alterne.");
    if (prodActives.exfo && curActives.retinol)    conflicts.push("Tu as déjà un rétinol le soir : alterne, n'ajoute pas d'acides le même soir.");
    const hardConflict = prodActives.retinol && curActives.retinol;

    // 5) Doublon (couvre un besoin DÉJÀ couvert par la routine)
    let duplicateOf = null;
    const sameActive = Object.keys(prodActives).some(k => prodActives[k] && curActives[k]);
    if (sameActive && addresses.length) {
      try {
        const curProducts = (AppState.products && AppState.products.recommended) || [];
        const covered = SkinConcern.concernsCovered(curProducts);
        const keys = SkinConcern.concernsForTags(userTags);
        const stillNeeded = keys.some(k => SkinConcern.scoreProductForConcern(pseudo, k) > 0 && !covered[k]);
        if (!stillNeeded) duplicateOf = "un produit que tu utilises déjà (même bénéfice)";
      } catch (e) {}
    }

    // 6) Moment + position réelle dans la routine
    const place = _placeInRoutine(prod, prodActives);

    // 7) Verdict (déterministe)
    let verdict;
    if (restricted || avoidHit || hardConflict)                                   verdict = 'red';
    else if (duplicateOf || conflicts.length || (prodActives.retinol && (a.skinType === 'sensible'))) verdict = 'orange';
    else if (addresses.length)                                                    verdict = 'green';
    else                                                                          verdict = 'orange';

    return { verdict, addresses, duplicateOf, conflicts, safety, moment: place.moment, stepText: place.stepText, section: place.section, pos: place.pos };
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
    return { moment, stepText, section, pos };
  }

  // ─── Ajouter à ma routine (réutilise AppState.routine + RoutineSaver) ──
  function addToRoutine() {
    const p = S.product, f = S.facts;
    if (!p || !f) return;
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

  return { initScreen, scan, onFile, reset, goCreateRoutine, addToRoutine, computeFacts, hasProfile };
})();

if (typeof window !== 'undefined') window.ScanProduct = ScanProduct;
