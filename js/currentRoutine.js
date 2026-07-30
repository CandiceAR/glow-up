/* ============================================================
   currentRoutine.js — Étape « Ma routine actuelle »
   L'utilisatrice déclare les produits qu'elle utilise déjà.
   Glow Up part de sa routine : garde les produits adaptés,
   remplace ceux qui ne conviennent pas, enrichit le catalogue.
   ============================================================ */

const CurrentRoutine = (() => {

  // ─── Catégories proposées à la saisie manuelle ────────────────
  const CATEGORIES = [
    { value: 'cleanser',    label: 'Nettoyant' },
    { value: 'toner',       label: 'Tonique / Lotion' },
    { value: 'serum',       label: 'Sérum / Traitement' },
    { value: 'exfoliant',   label: 'Exfoliant / Gommage' },
    { value: 'eye',         label: 'Contour des yeux' },
    { value: 'moisturizer', label: 'Crème hydratante' },
    { value: 'oil',         label: 'Huile visage' },
    { value: 'mask',        label: 'Masque' },
    { value: 'spf',         label: 'Protection solaire (SPF)' },
    { value: 'lipbalm',     label: 'Baume à lèvres' },
    { value: 'other',       label: 'Autre' }
  ];

  const CAT_LABEL = CATEGORIES.reduce((m, c) => (m[c.value] = c.label, m), {});

  // Normalise une catégorie catalogue vers un « bucket » d'étape routine
  const NORM = {
    cleanser: 'cleanser',
    toner: 'serum', serum: 'serum', exfoliant: 'serum', treatment: 'serum',
    mask: 'serum', nightmask: 'serum', mist: 'serum',
    eye: 'eye', eye_cream: 'eye',
    moisturizer: 'moisturizer', oil: 'moisturizer',
    spf: 'spf', sunscreen: 'spf',
    lipbalm: 'lipbalm'
  };
  function normCat(cat) { return NORM[cat] || cat; }

  // step.step (routine) → catégories catalogue acceptées
  const STEP_CATS = {
    cleanser: ['cleanser'],
    toner: ['serum'], serum: ['serum'], treatment: ['serum'], exfoliant: ['serum'],
    eye: ['eye'], eyepatch: ['eye'],
    moisturizer: ['moisturizer'], oil: ['moisturizer'],
    spf: ['spf'], lipbalm: ['lipbalm']
  };

  // ─── Accès à la liste (persistée dans les réponses du questionnaire) ─
  function list() {
    const a = AppState?.questionnaire?.answers;
    if (!a) return [];
    if (!Array.isArray(a.currentRoutine)) a.currentRoutine = [];
    return a.currentRoutine;
  }

  function _mkKey() { return 'cr_' + Math.random().toString(36).slice(2, 9); }

  function addFromCatalog(id) {
    const p = (AppState.products.catalog || []).find(x => x.id === id);
    if (!p) return;
    const l = list();
    if (l.some(e => e.id === id)) return; // déjà ajouté
    l.push({ _key: _mkKey(), id: p.id, brand: p.brand || '', name: p.name || '',
             category: p.category || 'other', fromCatalog: true, loved: false });
  }

  function addManual(brand, name, category) {
    brand = (brand || '').trim(); name = (name || '').trim();
    if (!name) return false;
    list().push({ _key: _mkKey(), id: null, brand, name,
                  category: category || 'other', fromCatalog: false, loved: false });
    return true;
  }

  function remove(key)     { const l = list(); const i = l.findIndex(e => e._key === key); if (i >= 0) l.splice(i, 1); }
  function toggleLove(key)  { const e = list().find(x => x._key === key); if (e) e.loved = !e.loved; }

  // ─── Recherche dans le catalogue ──────────────────────────────
  function searchCatalog(query, limit = 8) {
    query = (query || '').trim().toLowerCase();
    if (query.length < 2) return [];
    const words = query.split(/\s+/);
    const cat   = AppState.products.catalog || [];
    const scored = [];
    for (const p of cat) {
      const hay = ((p.brand || '') + ' ' + (p.name || '')).toLowerCase();
      if (!words.every(w => hay.includes(w))) continue;
      // score : match sur la marque en tête = mieux
      let score = 0;
      if ((p.brand || '').toLowerCase().includes(query)) score += 5;
      if (hay.startsWith(query)) score += 3;
      score += (p.rating || 0);
      scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(x => x.p);
  }

  // ─── Moteur d'adéquation ──────────────────────────────────────
  function _userSkinType() {
    return AppState?.face?.skinAnalysis?.skinType?.type
        || AppState?.questionnaire?.answers?.skinType
        || null;
  }
  const _TYPE_LABEL = { normale: 'normale', grasse: 'grasse', seche: 'sèche',
                        mixte: 'mixte', sensible: 'sensible', mature: 'mature' };
  function _lbl(t) { return _TYPE_LABEL[t] || t; }

  // Retourne { verdict:'keep'|'replace', reason }
  function evaluate(entry) {
    const skinType = _userSkinType();

    // Validé par l'analyse "Ma routine actuelle" → on garde, quelle que soit la catégorie
    if (entry.forceKeep) {
      return { verdict: 'keep', reason: 'Validée par ton analyse de routine ✓' };
    }

    // Produit saisi manuellement : pas de données ingrédient → on fait confiance
    if (!entry.fromCatalog) {
      return { verdict: 'keep',
               reason: entry.loved
                 ? 'Tu l\'adores — on la garde dans ta routine 💛'
                 : 'On la garde dans ta routine.' };
    }

    const p = (AppState.products.catalog || []).find(x => x.id === entry.id) || {};
    const tags = p.skinTypeTags || [];

    // Signal concret de non-adéquation : le produit cible d'autres types de peau
    if (skinType && tags.length && !tags.includes(skinType)) {
      const forTypes = tags.map(_lbl).join(', ');
      return { verdict: 'replace',
               reason: `Plutôt pensée pour les peaux ${forTypes} — on te propose une option plus adaptée à ta peau ${_lbl(skinType)}.` };
    }

    // Adaptée (tags matchent) ou neutre (pas de tags → on ne la pénalise pas)
    if (skinType && tags.includes(skinType)) {
      return { verdict: 'keep', reason: `Parfaitement adaptée à ta peau ${_lbl(skinType)} ✓` };
    }
    return { verdict: 'keep', reason: 'Compatible avec ton profil — on la garde ✓' };
  }

  function matchesStep(entry, stepKey) {
    const cats = STEP_CATS[stepKey] || [stepKey];
    return cats.includes(normCat(entry.category));
  }

  // Produit à CONSERVER pour cette étape (adéquat + pas déjà placé)
  function getKeptForStep(stepKey, usedSet) {
    for (const e of list()) {
      if (usedSet && usedSet.has(e._key)) continue;
      if (!matchesStep(e, stepKey)) continue;
      if (evaluate(e).verdict !== 'keep') continue;
      return e;
    }
    return null;
  }

  // Produit à REMPLACER pour cette étape (non adéquat) → note sous la reco
  function getReplacedForStep(stepKey, usedSet) {
    for (const e of list()) {
      if (usedSet && usedSet.has(e._key)) continue;
      if (!matchesStep(e, stepKey)) continue;
      if (evaluate(e).verdict !== 'replace') continue;
      return e;
    }
    return null;
  }

  // ─── Rendu : carte « produit que tu gardes » (dans le slot routine) ─
  function _entryImg(entry) {
    if (entry.fromCatalog) {
      const p = (AppState.products.catalog || []).find(x => x.id === entry.id);
      if (p?.imageUrl) return p.imageUrl;
    }
    return null;
  }

  function renderKeptCard(entry) {
    const ev  = evaluate(entry);
    const img = _entryImg(entry);
    return `
      <article class="cr-kept-card">
        <div class="cr-kept-badge">✓ Tu la gardes</div>
        <div class="cr-kept-body">
          ${img ? `<img src="${img}" alt="${entry.name}" class="cr-kept-img" loading="lazy" onerror="this.style.display='none'">` : '<div class="cr-kept-icon">🫙</div>'}
          <div class="cr-kept-info">
            <span class="cr-kept-brand">${entry.brand || ''}${entry.loved ? ' <span class="cr-heart">❤️</span>' : ''}</span>
            <h3 class="cr-kept-name">${entry.name || ''}</h3>
            <p class="cr-kept-reason">${ev.reason}</p>
            <p class="cr-kept-note">Tu l'utilises déjà — inutile de racheter.</p>
          </div>
        </div>
      </article>`;
  }

  // ─── Récap « Ta routine actuelle » (écran résultats) ──────────
  function renderRecapBlock() {
    const l = list();
    if (!l.length) return '';
    const rows = l.map(e => {
      const ev = evaluate(e);
      const keep = ev.verdict === 'keep';
      return `
        <div class="cr-recap-row ${keep ? 'cr-keep' : 'cr-replace'}">
          <span class="cr-recap-verdict">${keep ? '✓' : '→'}</span>
          <div class="cr-recap-txt">
            <strong>${(e.brand ? e.brand + ' ' : '') + e.name}</strong>
            <span>${ev.reason}</span>
          </div>
          ${e.loved ? '<span class="cr-recap-heart">❤️</span>' : ''}
        </div>`;
    }).join('');
    return `
      <div class="cr-recap">
        <div class="cr-recap-head">
          <span class="cr-recap-emoji">🧴</span>
          <div>
            <h2>Ta routine actuelle</h2>
            <p>On est partis de ce que tu utilises déjà.</p>
          </div>
        </div>
        ${rows}
      </div>`;
  }

  // ─── Sauvegarde des produits saisis manuellement (enrichissement) ─
  async function saveManual() {
    const manual = list().filter(e => !e.fromCatalog);
    if (!manual.length) return;
    try {
      if (typeof firebase === 'undefined' || !firebase.apps.length) return;
      const db  = firebase.firestore();
      const uid = AppState?.user?.uid || null;
      const batch = db.batch();
      manual.forEach(e => {
        const ref = db.collection('userProducts').doc();
        batch.set(ref, {
          brand: e.brand || '', name: e.name || '', category: e.category || 'other',
          loved: !!e.loved, uid, email: AppState?.user?.email || null,
          createdAt: new Date().toISOString(), status: 'pending_review'
        });
      });
      await batch.commit();
      console.log(`[CurrentRoutine] ${manual.length} produit(s) manuel(s) enregistré(s) pour enrichir le catalogue`);
    } catch (err) {
      console.warn('[CurrentRoutine] Sauvegarde produits manuels échouée:', err.message);
    }
  }

  return {
    CATEGORIES, catLabel: (c) => CAT_LABEL[c] || 'Autre',
    list, addFromCatalog, addManual, remove, toggleLove,
    searchCatalog, evaluate, matchesStep,
    getKeptForStep, getReplacedForStep,
    renderKeptCard, renderRecapBlock, saveManual
  };
})();

if (typeof window !== 'undefined') window.CurrentRoutine = CurrentRoutine;
