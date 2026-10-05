/* ============================================================
   sameProduct.js — Deux fiches désignent-elles le MÊME produit ?
   Sert à ne jamais proposer un produit comme « dupe » de lui-même
   (ex : « Medicube PDRN Pink Peptide Serum » vs « Médicube PDRN Pink Peptide Sérum »).
   Insensible aux accents, à la casse, à la ponctuation et aux contenances (30 ml…).
   Double export : global navigateur (window.SameProduct) + module Node.
   ============================================================ */
(function (root) {
  'use strict';

  function _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Mots sans valeur d'identification (contenances, génériques)
  const NOISE = new Set(['ml', 'g', 'gr', 'oz', 'fl', 'l', 'mini', 'new', 'nouveau', 'the', 'de', 'la', 'le', 'du', 'et', 'and', 'for', 'pour']);
  const SYN = { cream: 'creme', serum: 'serum', sérum: 'serum', gel: 'gel', mask: 'masque', cleanser: 'nettoyant' };

  function _tokens(s, brandTokens) {
    return _norm(s).split(' ')
      .filter(t => t && !NOISE.has(t) && !/^\d+(ml|g|gr|l|oz)?$/.test(t))
      .map(t => SYN[t] || t)
      .filter(t => !brandTokens || !brandTokens.has(t));
  }

  function _jaccard(a, b) {
    const A = new Set(a), B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  // Le chiffre d'un pourcentage (« 10 » dans « Niacinamide 10% ») doit être conservé :
  // _tokens retire les nombres isolés de contenance, mais pas les pourcentages (traités à part).
  function _pct(s) { return (String(s || '').match(/\d+(?:[.,]\d+)?\s*%/g) || []).map(x => x.replace(/\s|%/g, '')).sort().join(','); }

  /** a, b : { id?, brand?, name? } — true si c'est le même produit. */
  function same(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    const ba = _norm(a.brand), bb = _norm(b.brand);
    const brandKnown = ba && bb;
    if (brandKnown && ba !== bb && !ba.includes(bb) && !bb.includes(ba)) return false;   // marques différentes

    // Pourcentages d'actif différents (10 % vs 5 %) → produits différents
    if (_pct(a.name) !== _pct(b.name)) return false;

    const brandTokens = new Set(_norm((a.brand || '') + ' ' + (b.brand || '')).split(' ').filter(Boolean));
    const ta = _tokens(a.name, brandTokens), tb = _tokens(b.name, brandTokens);
    if (!ta.length || !tb.length) return false;
    const j = _jaccard(ta, tb);
    return brandKnown ? j >= 0.8 : j >= 0.9;
  }

  const api = { same };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SameProduct = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
