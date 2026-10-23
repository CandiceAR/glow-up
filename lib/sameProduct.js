/* ============================================================
   sameProduct.js — Deux fiches désignent-elles le MÊME produit ?
   Sert à ne jamais proposer un produit comme « dupe » de lui-même.
   Deux niveaux :
     1) same(a, b)  — par le NOM : insensible aux accents, à la casse, à la ponctuation, aux contenances (30 ml),
        au pluriel (« Pad » / « Pads ») ; les pourcentages et les NOMBRES du nom doivent concorder
        (« Reedle Shot 100 » ≠ « Reedle Shot 300 », « Vitamin C10 » ≠ « Vitamin C12 »).
     2) sameWithCompo(a, b, listA, listB) — le niveau 1, OU : même marque, noms proches (au moins la moitié des mots),
        aucun nombre qui se contredit (« 2.0 » peut manquer d'un côté) ET compositions quasi identiques
        (au moins 90 % d'ingrédients en commun, ingrédient par ingrédient). C'est le cas de « Zero Pore Pad 2.0 »
        et « Zero Pore Pads 2.0 », deux fiches du même produit.
   Double export : global navigateur (window.SameProduct) + module Node.
   ============================================================ */
(function (root) {
  'use strict';

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b\d+(?:[.,]\d+)?\s*(pads?|patch(?:es|s)?|sheets?|capsules?|pcs|pieces?|unites?|units?|ml|g|gr|oz|l)\b/g, ' ')   // « 70 pads », « 155 ml » : des quantités, pas des noms
      .replace(/(\d)[.,](\d)/g, '$1p$2')              // « 2.0 » → « 2p0 » (un seul mot)
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Mots sans valeur d'identification (contenances, génériques)
  const NOISE = new Set(['ml', 'g', 'gr', 'oz', 'fl', 'l', 'mini', 'new', 'nouveau', 'the', 'de', 'la', 'le', 'du', 'et', 'and', 'for', 'pour']);
  const SYN = { cream: 'creme', serum: 'serum', gel: 'gel', mask: 'masque', cleanser: 'nettoyant',
    yeux: 'eye', contour: 'eye', tonique: 'toner', huile: 'oil', baume: 'balm', brume: 'mist' };
  // Mots qui disent le TYPE de produit : un « Cream » n'est pas le même produit qu'un « Toner », même avec une formule proche
  const TYPE = new Set(['serum', 'creme', 'toner', 'lotion', 'masque', 'nettoyant', 'oil', 'gel', 'pad', 'essence', 'ampoule', 'mist', 'balm', 'eye', 'spf', 'sunscreen', 'mousse', 'foam', 'peeling', 'peel', 'exfoliant']);
  function _typesCompatible(ta, tb) {
    const A = new Set(ta.filter(t => TYPE.has(t))), B = new Set(tb.filter(t => TYPE.has(t)));
    if (!A.size || !B.size) return true;
    if (A.size !== B.size) return false;
    for (const t of A) if (!B.has(t)) return false;
    return true;
  }
  const KEEP_S = new Set(['plus', 'pros', 'focus', 'lotus', 'gas', 'bus', 'mucus', 'cactus', 'asparagus', 'swiss', 'moss', 'gloss', 'kiss', 'miss', 'ss']);

  // Pluriel simple : « pads » → « pad » (mots de plus de 3 lettres terminés par un seul « s »)
  function _singular(t) {
    if (t.length > 3 && /[^s]s$/.test(t) && !KEEP_S.has(t)) return t.slice(0, -1);
    return t;
  }

  // Un mot « nombre » : contient un chiffre et n'est pas une contenance. « 2p0 » (2.0) → « 2 ».
  function _isNum(t) { return /\d/.test(t) && !/^\d+(ml|g|gr|l|oz)$/.test(t); }
  function _numCanon(t) { return t.replace(/^(\d+)p0+$/, '$1'); }

  function _tokens(s, brandTokens) {
    return _norm(s).split(' ')
      .filter(t => t && !NOISE.has(t) && !/^\d+(ml|g|gr|l|oz)$/.test(t))
      .map(t => (_isNum(t) ? _numCanon(t) : _singular(SYN[t] || t)))
      .map(t => SYN[t] || t)
      .filter(t => !brandTokens || !brandTokens.has(t));
  }

  function _jaccard(a, b) {
    const A = new Set(a), B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  // Le chiffre d'un pourcentage (« 10 » dans « Niacinamide 10% ») doit être conservé
  function _pct(s) { return (String(s || '').match(/\d+(?:[.,]\d+)?\s*%/g) || []).map(x => x.replace(/\s|%/g, '')).sort().join(','); }

  function _brandInfo(a, b) {
    const ba = _norm(a.brand), bb = _norm(b.brand);
    const known = !!(ba && bb);
    const compatible = !known || ba === bb || ba.includes(bb) || bb.includes(ba);
    return { known, compatible, tokens: new Set(_norm((a.brand || '') + ' ' + (b.brand || '')).split(' ').filter(Boolean)) };
  }

  // Mots qui désignent une VARIANTE (une version teintée ou « baby » n'est pas la version classique) :
  // s'ils sont d'un seul côté, ce n'est pas le même produit.
  const VARIANT = new Set(['teinte', 'tinted', 'tint', 'night', 'nuit', 'day', 'jour', 'baby', 'bebe', 'kids', 'enfant', 'mini', 'travel',
    'refill', 'recharge', 'men', 'homme', 'sensitive', 'sensible', 'rich', 'riche', 'light', 'legere', 'intense', 'intensive', 'extra', 'max']);
  function _variantsCompatible(ta, tb) {
    const A = new Set(ta), B = new Set(tb);
    for (const t of A) if (VARIANT.has(t) && !B.has(t)) return false;
    for (const t of B) if (VARIANT.has(t) && !A.has(t)) return false;
    return true;
  }

  // Les nombres du nom concordent-ils ? (ensemble égal, ou un côté n'en a pas)
  function _numbersCompatible(ta, tb) {
    const na = new Set(ta.filter(_isNum)), nb = new Set(tb.filter(_isNum));
    if (!na.size || !nb.size) return { ok: true, oneSideMissing: na.size !== nb.size };
    if (na.size !== nb.size) return { ok: false };
    for (const x of na) if (!nb.has(x)) return { ok: false };
    return { ok: true, oneSideMissing: false };
  }

  /** a, b : { id?, brand?, name? } — true si c'est le même produit d'après le NOM. */
  function same(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    const br = _brandInfo(a, b);
    if (!br.compatible) return false;                                     // marques différentes
    if (_pct(a.name) !== _pct(b.name)) return false;                      // 10 % vs 5 % → produits différents
    const ta = _tokens(a.name, br.tokens), tb = _tokens(b.name, br.tokens);
    if (!ta.length || !tb.length) return false;
    if (!_numbersCompatible(ta, tb).ok) return false;                     // « 100 » vs « 300 », « C10 » vs « C12 »
    if (!_variantsCompatible(ta, tb)) return false;                       // « Teinté », « Nuit », « Baby »…
    return _jaccard(ta, tb) >= (br.known ? 0.8 : 0.9);
  }

  // ─── Composition : ingrédient par ingrédient ─────────────────
  const WATER = new Set(['water', 'aqua', 'eau', 'aqua water', 'water aqua', 'aqua water eau', 'water aqua eau']);
  function _ing(x) {
    let s = String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    if (WATER.has(s) || s === 'water aqua eau') s = 'water';
    return s;
  }
  function _ingSet(list) {
    return new Set((Array.isArray(list) ? list : []).map(_ing).filter(x => x && x.length > 1));
  }
  /** Part d'ingrédients en commun (0–1) : intersection / union. null si une liste est trop courte (< 8). */
  function inciOverlap(listA, listB) {
    const A = _ingSet(listA), B = _ingSet(listB);
    if (A.size < 8 || B.size < 8) return null;
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  /**
   * Même produit d'après le nom OU d'après (même marque + noms proches + compositions quasi identiques).
   * listA / listB : listes d'ingrédients (facultatives).
   */
  function sameWithCompo(a, b, listA, listB) {
    if (same(a, b)) return true;
    if (!a || !b) return false;
    const br = _brandInfo(a, b);
    if (!br.known || !br.compatible) return false;                        // la marque doit être connue et identique
    if (_pct(a.name) !== _pct(b.name)) return false;
    const ta = _tokens(a.name, br.tokens), tb = _tokens(b.name, br.tokens);
    if (!ta.length || !tb.length) return false;
    if (!_numbersCompatible(ta, tb).ok) return false;
    if (!_variantsCompatible(ta, tb)) return false;
    if (!_typesCompatible(ta, tb)) return false;                          // type de produit différent (crème / lotion / sérum…)
    if (_jaccard(ta, tb) < 0.5) return false;
    const ov = inciOverlap(listA, listB);
    return ov != null && ov >= 0.9;
  }

  const api = { same, sameWithCompo, inciOverlap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SameProduct = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
