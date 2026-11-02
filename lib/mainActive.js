/* ============================================================
   mainActive.js — « Actif principal » d'un produit de soin.
   Règle Glow Up : un dupe doit partager l'actif principal de la référence.
   L'actif principal se déduit UNIQUEMENT de données vérifiables, dans cet ordre :
     1. le NOM du produit (ce que la marque annonce : « Niacinamide 10% Booster ») ;
     2. sa composition INCI vérifiée, si on en a une ;
     3. les mots-clés de sa fiche catalogue (ingredientTags, saisis par l'équipe).
   Jamais de la mémoire de l'IA. Si rien ne permet de le dire : null.
   Double export : global navigateur (window.MainActive) + module Node.
   ============================================================ */
(function (root) {
  'use strict';

  // [famille, libellé, regex appliquée au texte normalisé (minuscules, sans accents)]
  // L'ordre = priorité quand plusieurs actifs sont cités : actifs « héros » d'abord.
  const FAMILIES = [
    ['retinoid',      'rétinol et dérivés',            /retin/],
    ['retinoid_like', 'bakuchiol (alternative au rétinol)', /bakuchiol/],
    ['vitc',          'vitamine C',                    /vitamine?\s*c(?![a-z])|ascorb/],
    ['aha',           'acide exfoliant AHA',           /glycoli|lactic|lactobion|mandel|\baha\b/],
    ['bha',           'acide salicylique (BHA)',       /salicyl|\bbha\b/],
    ['pha',           'exfoliant PHA',                 /gluconolactone|\bpha\b/],
    ['brightening',   'actif anti-taches',             /arbutin|tranex|kojic|azela|thiamidol|glutathion/],
    ['peptide',       'peptides',                      /peptid/],
    ['pdrn_nad',      'PDRN / NAD',                    /pdrn|\bnad\b|sodium dna|polydeoxyribonucleotide/],
    ['collagen',      'collagène',                     /collag/],
    ['niacinamide',   'niacinamide (vitamine B3)',     /niacin|nicotinamide|\bb3\b/],
    ['ha',            'acide hyaluronique',            /hyaluron|\bha\b/],
    ['ceramide',      'céramides',                     /ceram|phytosphingosine/],
    ['snail',         "mucine d'escargot",             /snail|escargot|mucin/],
    ['soothing',      'actif apaisant', /centella|\bcica|madecass|asiatic|heartleaf|houttuynia|panthenol|allantoin/]
  ];
  const LABEL = {}; FAMILIES.forEach(f => { LABEL[f[0]] = f[1]; });
  // familles du moteur de formule qui n'ont pas de ligne ci-dessus mais méritent un libellé
  Object.assign(LABEL, { antiage: 'adénosine', antioxidant: 'antioxydants', lipid: 'lipides (cholestérol)' });

  const HERO = ['retinoid', 'retinoid_like', 'vitc', 'aha', 'bha', 'pha', 'brightening', 'peptide', 'pdrn_nad', 'collagen'];
  const SECOND = ['niacinamide', 'ceramide', 'snail', 'ha', 'soothing'];

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\bh\.a\b\.?/g, 'ha')            // « H.A. Intensifier » = acide hyaluronique (sinon l'actif lu en 14e position de la liste l'emportait)
      .replace(/[_\-]+/g, ' ');
  }

  function _first(text) {
    const t = _norm(text);
    if (!t.trim()) return null;
    for (const [fam, , re] of FAMILIES) if (re.test(t)) return fam;
    return null;
  }

  /** Famille annoncée dans le nom du produit, ou null. */
  function fromName(name) { return _first(name); }

  /**
   * Famille déduite des mots-clés de la fiche catalogue — seulement s'ils désignent UNE SEULE famille.
   * Les mots-clés listent les actifs présents sans dire lequel est le principal : si plusieurs familles
   * apparaissent (niacinamide + apaisant…), on ne tranche pas (null) plutôt que de deviner.
   */
  function fromTags(tags) {
    if (!Array.isArray(tags) || !tags.length) return null;
    const fams = new Set();
    tags.forEach(t => { const f = _first(t); if (f) fams.add(f); });
    return fams.size === 1 ? [...fams][0] : null;
  }

  /**
   * Famille déduite d'une liste INCI vérifiée. `sim` = lib/inciSim.js (Node uniquement).
   * Actif « héros » le plus haut placé (position ≤ 15), sinon actif de soutien le plus haut placé.
   */
  function fromInci(list, sim) {
    if (!sim || !Array.isArray(list) || !list.length) return null;
    const A = sim.analyze(list);
    const byPos = (fams, max) => A.actives
      .filter(a => fams.includes(a.family) && (!max || a.position <= max))
      .sort((x, y) => x.position - y.position)[0];
    const h = byPos(HERO, 15);
    if (h) return h.family;
    const s = byPos(SECOND);
    return s ? s.family : null;
  }

  /**
   * { name, inci, tags } -> { family, label, via: 'name'|'inci'|'tags' } ou null.
   * `inci` ne doit être fourni QUE s'il est vérifié.
   */
  // Produits dont l'actif vedette n'est PAS celui que la liste INCI ferait deviner (décision de Candice, 2026-11-02, d'après le site de la marque).
  // Eight Hour Cream : baume nourrissant (glycérine, karité, vitamine E) ; l'acide salicylique de la liste relevée n'est pas son actif vedette.
  const NO_HERO = [/\beight hour\b/];

  function resolve(p, sim) {
    p = p || {};
    if (NO_HERO.some(re => re.test(_norm(p.name)))) return null;
    let fam = fromName(p.name), via = 'name';
    if (!fam) { fam = fromInci(p.inci, sim); via = 'inci'; }
    if (!fam) { fam = fromTags(p.tags); via = 'tags'; }
    return fam ? { family: fam, label: LABEL[fam] || fam, via } : null;
  }

  /**
   * Comparaison factuelle de deux compositions vérifiées (pour des phrases à modèle fixe).
   * Retourne les familles d'actifs communes / propres à chaque produit. Node uniquement.
   */
  function compare(refInci, candInci, sim) {
    if (!sim) return null;
    // Table des actifs clés (lib/actifs.js) : noms simples en français, formes INCI reconnues comme le même actif
    const Actifs = require('./actifs.js');
    const c = Actifs.compare(refInci, candInci);
    const r = sim.similarity(refInci, candInci);
    // derivMismatch reste vide : « une autre forme du même actif » est déjà dit dans les points communs, sans jargon INCI
    return { common: c.common.map(x => x.label), commonFull: c.common, refActifs: c.refActifs, candActifs: c.candActifs, onlyRef: c.onlyRef, onlyCand: c.onlyCand, derivMismatch: [], eliminated: (r.extraPotent || []).length > 0 };
  }

  /**
   * « Actif principal » commun aux DEUX listes INCI : seulement des ingrédients réellement présents chez les deux,
   * avec leur nom courant (« Panthénol (vitamine B5) »). `family` = famille d'actif principal ; `cmp` = résultat de compare().
   * Retourne { labels, ids } (ingrédients communs) et, pour chaque produit, les ingrédients de CETTE famille qu'il contient
   * (refOnly / candOnly : noms courants) — utile quand la famille est la même mais pas l'ingrédient (acide glycolique / acide lactique).
   */
  function mainCommon(family, cmp) {
    const ok = cmp && family;
    const hit = (ok && Array.isArray(cmp.commonFull)) ? cmp.commonFull.filter(x => x.fam === family) : [];
    const own = k => (ok && Array.isArray(cmp[k])) ? cmp[k].filter(x => x.fam === family).map(x => x.fr) : [];
    return { labels: hit.map(x => x.label), ids: hit.map(x => x.id), refOnly: own('refActifs'), candOnly: own('candActifs') };
  }

  const api = { fromName, fromTags, fromInci, resolve, compare, mainCommon, isHero: f => HERO.indexOf(f) >= 0, label: f => LABEL[f] || f, FAMILIES: FAMILIES.map(f => f[0]) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MainActive = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
