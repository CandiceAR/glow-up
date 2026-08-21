/* ============================================================
   ageGuard.js — Règle CENTRALE d'adéquation des produits selon l'âge.
   UNE seule logique, utilisée partout (routine, reco, scan, dupes, analyse).
   Les règles viennent de data/ageRules.json (+ override admin Firestore).
   Ne PAS dupliquer cette logique ailleurs.
   ============================================================ */

const AgeGuard = (() => {

  let _rules = [];
  let _meta  = { youngThreshold: 15, youngGuidance: '', scanMessage: '', version: 0 };
  let _loaded = false;

  // Catégories « potentes » : un actif y est un ingrédient vedette (pas une trace)
  const POTENT = new Set(['serum', 'exfoliant', 'treatment', 'nightmask', 'eye', 'eye_cream', 'mask', 'oil']);

  // Tranche d'âge (questionnaire) → âge représentatif (borne basse)
  const BAND_AGE = {
    'moins-15': 12, '-15': 12,
    'moins-20': 17, '15-20': 17,
    '20-25': 22, '25-30': 27, '30-40': 35, '40+': 45
  };

  function _slug(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }

  async function load() {
    if (_loaded) return;
    // 1) JSON de base
    try {
      const res = await fetch('data/ageRules.json?v=' + Date.now());
      const d = await res.json();
      _rules = Array.isArray(d.rules) ? d.rules : [];
      if (d._meta) _meta = { ..._meta, ...d._meta };
    } catch (e) { console.warn('[AgeGuard] chargement JSON échoué:', e.message); }
    // 2) Override admin (Firestore)
    try {
      if (typeof firebase !== 'undefined' && firebase.apps?.length) {
        const snap = await firebase.firestore().collection('ageRules').get();
        if (!snap.empty) {
          const overrides = [];
          snap.forEach(doc => overrides.push(doc.data()));
          if (overrides.length) _rules = overrides;   // l'admin fait foi s'il existe
        }
      }
    } catch (e) { /* silencieux : le JSON suffit */ }
    _loaded = true;
  }

  // ─── Âge de l'utilisatrice ────────────────────────────────────
  function age(answers) {
    const a = answers || (AppState?.questionnaire?.answers) || {};
    const band = a.ageGroup || a.age;
    const v = BAND_AGE[band];
    return (typeof v === 'number') ? v : null;   // null = inconnu → pas de restriction
  }
  function youngThreshold() { return _meta.youngThreshold || 15; }
  function isYoung(answers) { const x = age(answers); return x != null && x < youngThreshold(); }

  // ─── Cœur : un produit est-il restreint à cet âge ? (non-naïf) ─
  function _pctInName(name) {
    const m = (name || '').match(/(\d{1,2})\s?%/);
    return m ? parseInt(m[1], 10) : null;
  }
  function isRestricted(product, userAge) {
    if (userAge == null) return { restricted: false };
    const name = (product?.name || '').toLowerCase();
    const cat  = product?.category || '';
    const tags = (product?.ingredientTags || []).map(_slug);
    const pct  = _pctInName(name);

    for (const rule of _rules) {
      if (userAge >= (rule.minAge || 15)) continue;
      const aliases = rule.aliases || [];
      const inName = aliases.some(al => name.includes(al.toLowerCase()));
      const inTags = aliases.some(al => tags.includes(_slug(al)));
      if (!inName && !inTags) continue;

      const potent = POTENT.has(cat);
      let hit = false;
      switch (rule.restriction) {
        case 'block':
          // vedette = cité dans le nom, ou taggé dans une catégorie potente
          hit = inName || (inTags && potent);
          break;
        case 'concentration':
          // restreint si concentration connue > max, sinon seulement si actif VEDETTE
          if (pct != null && rule.maxConcentration != null) hit = pct > rule.maxConcentration;
          else hit = inName && potent;
          break;
        case 'caution':
          // rincé (nettoyant/tonique) → toléré ; leave-on vedette → restreint
          if (cat === 'cleanser' || cat === 'toner') { hit = false; break; }
          if (pct != null && rule.maxConcentration != null) hit = pct > rule.maxConcentration;
          else hit = inName || (inTags && potent);
          break;
        default:
          hit = inName;
      }
      if (hit) return { restricted: true, ingredient: rule.ingredient, reason: rule.reason, source: rule.source };
    }
    return { restricted: false };
  }

  // Enlève les produits non adaptés (ne vide jamais complètement le pool)
  function filter(products, userAge) {
    if (userAge == null || !Array.isArray(products)) return products || [];
    const kept = products.filter(p => !isRestricted(p, userAge).restricted);
    return kept.length ? kept : products;
  }

  // Liste des actifs restreints pour cet âge (pour les prompts IA)
  function restrictedActives(userAge) {
    if (userAge == null) return [];
    return _rules.filter(r => userAge < (r.minAge || 15)).map(r => r.ingredient);
  }

  function youngGuidance() { return _meta.youngGuidance || 'Routine simple : nettoyage doux + hydratation + SPF.'; }
  function scanMessage()   { return _meta.scanMessage || "Ce produit contient un actif que Glow Up ne recommande pas en première intention à ton âge. Je peux te proposer une alternative plus adaptée à ta peau."; }

  // Contrainte prête à injecter dans une requête IA (null si non concernée)
  function aiConstraint(answers) {
    const x = age(answers);
    if (x == null || x >= youngThreshold()) return null;
    return { age: x, restricted: restrictedActives(x), guidance: youngGuidance() };
  }

  function rules()  { return _rules; }
  function reload() { _loaded = false; return load(); }

  return { load, reload, rules, age, isYoung, youngThreshold, isRestricted, filter, restrictedActives, youngGuidance, scanMessage, aiConstraint };
})();

if (typeof window !== 'undefined') window.AgeGuard = AgeGuard;
