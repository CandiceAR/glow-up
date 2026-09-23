/* ============================================================
   skinConcern.js — Table centrale « problématique → actifs → produit »
   Couche d'INTELLIGENCE réutilisable (catalogue, routine, analyse, coach).
   N'ajoute AUCUN parcours ni écran : sert uniquement à mieux scorer/classer
   les produits EXISTANTS à partir de leurs données existantes
   (concernTags, ingredientTags, inciNormalized/inciStructured).
   Double export : global navigateur (window.SkinConcern) + module Node.
   ============================================================ */
(function (root) {
  'use strict';

  // ── Les 13 problématiques (ordre d'affichage), orientées peaux +30 ans ──
  const CONCERNS = [
    { key: 'wrinkles',     label: 'Rides & ridules',                    concernTags: ['rides', 'ridules'] },
    { key: 'firmness',     label: 'Perte de fermeté',                   concernTags: ['fermete', 'anti_age'] },
    { key: 'radiance',     label: 'Éclat / teint terne',                concernTags: ['eclat', 'teint_terne', 'eclat_terne'] },
    { key: 'pigmentation', label: 'Taches',                             concernTags: ['taches', 'uniformite'] },
    { key: 'dehydration',  label: 'Déshydratation',                     concernTags: ['deshydratation', 'hydratation'] },
    { key: 'dryness',      label: 'Peau sèche / barrière fragilisée',   concernTags: ['secheresse', 'barriere', 'nourrissant'] },
    { key: 'redness',      label: 'Rougeurs & sensibilité',             concernTags: ['rougeurs', 'sensibilite', 'apaisement'] },
    { key: 'pores',        label: 'Pores visibles',                     concernTags: ['pores'] },
    { key: 'blemishes',    label: 'Imperfections & comédons',           concernTags: ['imperfections', 'acne', 'sebum'] },
    { key: 'post_marks',   label: 'Marques post-imperfections',         concernTags: ['taches', 'uniformite', 'imperfections'] },
    { key: 'texture',      label: 'Texture / grain de peau',            concernTags: ['texture', 'exfoliant'] },
    { key: 'bounce',       label: 'Rebond & ridules de déshydratation', concernTags: ['deshydratation', 'ridules'] },
    { key: 'prevention30', label: 'Prévention après 30 ans',            concernTags: ['anti_age', 'spf'] },
  ];

  // ── Correspondance problématique → actifs (primary > secondary > supporting) ──
  const RULES = {
    wrinkles:     { primary: ['retinoid'],                                        secondary: ['peptides', 'niacinamide'],           supporting: ['hyaluronic_acid'] },
    firmness:     { primary: ['retinoid', 'peptides'],                            secondary: ['vitamin_c', 'niacinamide'] },
    radiance:     { primary: ['vitamin_c'],                                       secondary: ['niacinamide', 'glycolic_acid', 'lactic_acid'] },
    pigmentation: { primary: ['vitamin_c', 'niacinamide', 'azelaic_acid', 'tranexamic_acid'], secondary: ['glycolic_acid'] },
    dehydration:  { primary: ['hyaluronic_acid', 'glycerin'],                     secondary: ['panthenol', 'beta_glucan'] },
    dryness:      { primary: ['ceramides', 'squalane', 'cholesterol', 'fatty_acids'], secondary: ['panthenol'] },
    redness:      { primary: ['panthenol', 'centella'],                           secondary: ['beta_glucan', 'ectoine', 'niacinamide'] },
    pores:        { primary: ['niacinamide', 'salicylic_acid'],                   secondary: ['retinoid', 'glycolic_acid'] },
    blemishes:    { primary: ['salicylic_acid', 'azelaic_acid', 'niacinamide'] },
    post_marks:   { primary: ['azelaic_acid', 'niacinamide', 'vitamin_c'],        secondary: ['tranexamic_acid', 'glycolic_acid'] },
    texture:      { primary: ['glycolic_acid', 'lactic_acid', 'salicylic_acid'],  secondary: ['retinoid'] },
    bounce:       { primary: ['hyaluronic_acid', 'glycerin'],                     secondary: ['peptides', 'ceramides'] },
    prevention30: { primary: ['spf', 'retinoid', 'vitamin_c'],                    secondary: ['hyaluronic_acid', 'niacinamide', 'peptides'], supporting: ['glycolic_acid'] },
  };

  // ── Détection d'un actif dans un produit (INCI réel prioritaire, sinon tags/nom) ──
  const ACTIVE_RE = {
    retinoid:        /retin(ol|al|aldehyde|yl|oate|oid)|hydroxypinacolone|bakuchiol/i,
    peptides:        /peptide|matrixyl|argireline|hexapeptide|polypeptide/i,
    niacinamide:     /niacinamide|nicotinamide/i,
    vitamin_c:       /ascorb|3-o-ethyl|vitaminec|vitamine?\s*c\b/i,
    hyaluronic_acid: /hyaluron/i,
    glycerin:        /glycerin|glyc[ée]rine/i,
    azelaic_acid:    /az[ée]la/i,
    tranexamic_acid: /tranexam/i,
    glycolic_acid:   /glycolic|glycolique/i,
    lactic_acid:     /lactic|lactique/i,
    salicylic_acid:  /salicyl/i,
    ceramides:       /ceramide|c[ée]ramide|phytosphingosine/i,
    squalane:        /squalane/i,
    cholesterol:     /cholesterol/i,
    fatty_acids:     /linoleic|linol[ée]ique|acides? gras|fatty acid/i,
    panthenol:       /panthenol|panth[ée]nol/i,
    centella:        /centella|\bcica\b|madecass|asiatic|houttuynia/i,
    beta_glucan:     /beta[-\s]?glucan|b[êe]ta[-\s]?glucane/i,
    ectoine:         /ectoin/i,
    spf:             /\bspf\b|solaire|sunscreen|[ée]cran solaire/i,
  };
  const ACTIVE_LABEL = {
    retinoid: 'rétinoïde', peptides: 'peptides', niacinamide: 'niacinamide', vitamin_c: 'vitamine C',
    hyaluronic_acid: 'acide hyaluronique', glycerin: 'glycérine', azelaic_acid: 'acide azélaïque',
    tranexamic_acid: 'acide tranexamique', glycolic_acid: 'acide glycolique', lactic_acid: 'acide lactique',
    salicylic_acid: 'acide salicylique', ceramides: 'céramides', squalane: 'squalane', cholesterol: 'cholestérol',
    fatty_acids: 'acides gras', panthenol: 'panthénol', centella: 'centella', beta_glucan: 'bêta-glucane',
    ectoine: 'ectoïne', spf: 'SPF',
  };

  function _text(p) {
    return ((p.ingredientTags || []).join(' ') + ' ' +
            (p.inciNormalized || []).join(' ') + ' ' +
            (p.actives || []).join(' ') + ' ' +
            (p.name || '')).toLowerCase();
  }
  // Un produit contient-il l'actif `key` ?  (spf : aussi via catégorie / includesSPF)
  function hasActive(p, key) {
    if (key === 'spf' && (['spf', 'sunscreen'].includes(p.category) || p.includesSPF)) return true;
    const re = ACTIVE_RE[key];
    return re ? re.test(_text(p)) : false;
  }
  // Entrée INCI structurée correspondant à l'actif (pour pondérer position/concentration)
  function _structEntry(p, key) {
    const re = ACTIVE_RE[key];
    if (!re || !Array.isArray(p.inciStructured)) return null;
    return p.inciStructured.find(e => re.test(e.normalized || '') || re.test(e.inci || '')) || null;
  }

  // ── Score d'un produit pour une problématique ──
  function scoreProductForConcern(p, concernKey) {
    const rule = RULES[concernKey];
    const meta = CONCERNS.find(c => c.key === concernKey);
    if (!rule || !p) return { score: 0, matched: [], confidence: 'none' };
    const W = { primary: 10, secondary: 5, supporting: 2 };
    let score = 0; const matched = [];
    ['primary', 'secondary', 'supporting'].forEach(tier => {
      (rule[tier] || []).forEach(key => {
        if (!hasActive(p, key)) return;
        let s = W[tier];
        const e = _structEntry(p, key);
        if (e) {                                   // INCI réel → pondération fine
          s *= 1 + 0.6 * (1 / Math.sqrt((e.position || 12)));   // + haut dans l'INCI = mieux
          if (e.concentration != null) s *= 1.12;              // concentration publiée = bonus
        }
        score += s;
        matched.push(key);
      });
    });
    // Bonus concernTags (utile pour les produits sans INCI structuré)
    const ct = (meta && meta.concernTags) || [];
    const pc = new Set(p.concernTags || []);
    const ctMatch = ct.filter(c => pc.has(c)).length;
    score += ctMatch * 3;
    // Confiance de la correspondance
    const confidence = matched.length
      ? ((Array.isArray(p.inciStructured) && p.inciStructured.length) ? 'high' : 'medium')
      : (ctMatch ? 'low' : 'none');
    return { score: Math.round(score * 10) / 10, matched: [...new Set(matched)], concernTagMatch: ctMatch, confidence };
  }

  // ── Classer les produits d'un catalogue pour une problématique ──
  function rankForConcern(catalog, concernKey, opts) {
    opts = opts || {};
    const list = (catalog || []).filter(p => p.active !== false);
    const pool = opts.category ? list.filter(p => p.category === opts.category) : list;
    const scored = pool.map(p => ({ p, r: scoreProductForConcern(p, concernKey) }))
      .filter(x => x.r.score > 0)
      .sort((a, b) => b.r.score - a.r.score);
    const out = scored.map(x => Object.assign({ _concernScore: x.r.score, _concernMatched: x.r.matched, _concernConfidence: x.r.confidence }, x.p));
    return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out;
  }

  // ── Problématiques déjà « couvertes » par une liste de produits (anti-doublon) ──
  // Couverte = au moins un actif PRIMARY de la problématique est présent.
  function concernsCovered(products) {
    const covered = {};
    CONCERNS.forEach(c => {
      const prim = (RULES[c.key].primary) || [];
      const hit = (products || []).some(p => prim.some(k => hasActive(p, k)));
      if (hit) covered[c.key] = true;
    });
    return covered;
  }

  // Actifs présents dans un produit (pour affichage / debug)
  function detectActives(p) {
    return Object.keys(ACTIVE_RE).filter(k => hasActive(p, k));
  }

  // Tags de préoccupation utilisateur (ex. answers.complexes/concerns) → clés de problématique
  function concernsForTags(tags) {
    const set = new Set((tags || []).map(String));
    return CONCERNS.filter(c => c.concernTags.some(t => set.has(t))).map(c => c.key);
  }

  const API = {
    CONCERNS, RULES, ACTIVE_LABEL,
    scoreProductForConcern, rankForConcern, concernsCovered, concernsForTags, detectActives, hasActive,
    concern: k => CONCERNS.find(c => c.key === k) || null,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.SkinConcern = API;
})(typeof window !== 'undefined' ? window : null);
