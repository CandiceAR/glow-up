/* ============================================================
   lib/routineVerdict.js — « Analyser ma routine » : UNE seule source pour le verdict de chaque produit.
   Règle : un produit n'est « à garder » / « Validée par ton analyse de routine » que si son verdict est « adapted ».
   Un produit « weak » (Peu adapté) ou « discouraged » (Déconseillé) n'est JAMAIS gardé ni validé : la nouvelle routine
   lui propose une alternative, avec en une phrase la raison tirée de l'analyse.
   Double export : global navigateur (window.RoutineVerdict) + module Node (serveur et tests).
   ============================================================ */
(function (root) {
  'use strict';

  const LABEL = { adapted: 'Adapté à ta peau', weak: 'Peu adapté', discouraged: 'Déconseillé' };
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const fullName = p => norm((p && p.brand ? p.brand + ' ' : '') + (p && p.name || ''));

  // Même produit ? (même fiche catalogue, ou même nom une fois accents/ponctuation ignorés)
  function same(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return a.id === b.id;
    const an = norm(a.name), bn = norm(b.name);
    return !!an && (an === bn || fullName(a) === fullName(b));
  }

  /** Verdicts d'une analyse enregistrée : [{ ref, verdict, why, product }] (ra = { result:{products}, products }). */
  function verdicts(ra) {
    const res = ra && ra.result && Array.isArray(ra.result.products) ? ra.result.products : [];
    const prods = ra && Array.isArray(ra.products) ? ra.products : [];
    return res.map(r => ({ ref: r.ref, verdict: r.verdict, why: r.why || '', product: prods[r.ref] || null })).filter(x => x.product);
  }

  /** Verdict de l'analyse pour ce produit (ou null si le produit n'a pas été analysé). */
  function verdictOf(ra, entry) { return verdicts(ra).find(x => same(x.product, entry)) || null; }

  /** Les seuls produits qui peuvent être gardés : verdict « adapted ». */
  function keepRefs(result) {
    const list = result && Array.isArray(result.products) ? result.products : [];
    return list.filter(p => p && p.verdict === 'adapted').map(p => p.ref);
  }
  function keepProducts(ra) { return verdicts(ra).filter(x => x.verdict === 'adapted').map(x => x.product); }

  /** Un texte parle-t-il de ce produit ? (par son nom, accents et ponctuation ignorés). */
  // On compare les mots distinctifs du nom (sans la marque, sans chiffres ni contenance) : « Garde ton Effaclar Mat+ » parle bien
  // de « La Roche-Posay Effaclar Mat+ Hydratant Sébo-Régulateur 40ml », mais pas de « Effaclar Duo+M ».
  function mentions(text, product) {
    if (!product || !product.name) return false;
    const brand = new Set(norm(product.brand).split(' ').filter(Boolean));
    const core = norm(product.name).split(' ').filter(w => w.length >= 3 && !/\d/.test(w) && !brand.has(w));
    if (!core.length) return false;
    const words = new Set(norm(text).split(' '));
    const hit = core.filter(w => words.has(w)).length;
    return hit >= Math.min(2, core.length);
  }

  /** Une phrase simple tirée de l'analyse : pourquoi ce produit est peu adapté. */
  function reasonFor(v) {
    const base = v && v.verdict === 'discouraged' ? 'Déconseillé pour ta peau d’après ton analyse de routine.' : 'Peu adapté à ta peau d’après ton analyse de routine.';
    const txt = String(v && v.why || '').replace(/\s+/g, ' ').trim();
    if (!txt) return base;
    const first = (txt.match(/^[\s\S]*?[.!?](?=\s|$)/) || [txt])[0].trim();
    const s = first.length > 150 ? first.slice(0, 147).replace(/\s+\S*$/, '') + '…' : first;
    return /[.!?…]$/.test(s) ? s : s + '.';
  }

  /**
   * Met la liste « routine actuelle » en accord avec l'analyse :
   *  • retire le marquage « gardé automatiquement » (forceKeep) des produits qui ne sont plus « adaptés » ;
   *  • ajoute les produits « adaptés » qui manquent. Retourne { added, cleared } (noms).
   */
  function syncKeep(list, ra, makeKey) {
    const out = { added: [], cleared: [] };
    if (!Array.isArray(list) || !ra) return out;
    const vs = verdicts(ra);
    if (!vs.length) return out;
    list.forEach(e => {
      if (!e || !e.forceKeep) return;
      const v = vs.find(x => same(x.product, e));
      if (!v || v.verdict !== 'adapted') { delete e.forceKeep; if (v) e.loved = false; out.cleared.push(e.name || ''); }
    });
    keepProducts(ra).forEach(p => {
      if (list.some(e => same(e, p))) return;
      list.push({ _key: makeKey ? makeKey() : 'ra_' + Math.random().toString(36).slice(2, 9), id: p.id || null, brand: p.brand || '', name: p.name || '',
        category: p.category || 'other', fromCatalog: !!p.id, loved: true, forceKeep: true, photo: p.photo || null });
      out.added.push(p.name || '');
    });
    return out;
  }

  const api = { LABEL, norm, same, verdicts, verdictOf, keepRefs, keepProducts, mentions, reasonFor, syncKeep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RoutineVerdict = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
