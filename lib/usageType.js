/* ============================================================
   usageType.js — « Type d'usage » d'un produit de soin, et règle de concentration.
   Un dupe ou une option doit se UTILISER de la même façon que le produit de la personne :
     pads ou lotion sans rinçage ↔ pads ou lotion · sérum ↔ sérum · crème ↔ crème · masque à rincer ↔ masque à rincer ·
     peeling à rincer ↔ peeling … Un peeling concentré à rincer (AHA 30 %) n'est PAS une alternative à un pad quotidien.
   Le type d'usage se déduit du NOM, de la catégorie et de la description (jamais de la mémoire de l'IA). On peut le
   forcer produit par produit avec les champs facultatifs « usageType » (+ « usageFormat ») du catalogue.
   Concentration : pour les actifs exfoliants (AHA, BHA, PHA) et les rétinoïdes, on ne propose jamais un produit
   nettement plus concentré que celui de la personne (pourcentages du nom, ou rang dans la composition).
   Double export : global navigateur (window.UsageType) + module Node.
   ============================================================ */
(function (root) {
  'use strict';

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%.,+ ]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Libellés affichés (« ne s'utilise pas de la même façon que… »)
  const LABEL = {
    pad_lotion: 'pads ou lotion sans rinçage', serum: 'sérum', cream: 'crème', eye: 'contour des yeux',
    rinse_mask: 'masque à rincer', leave_mask: 'masque sans rinçage (nuit)', sheet_mask: 'masque tissu', mask_other: 'masque',
    peeling: 'peeling à rincer', cleanser: 'nettoyant', oil: 'huile', spf: 'protection solaire', mist: 'brume', lip: 'soin des lèvres'
  };
  const FORMAT_LABEL = { pad: 'pads', lotion: 'lotion' };

  /**
   * p : { name, category, description?, usageType?, usageFormat? }
   * → { group, format, label } ou null si on ne sait pas.
   */
  function usageOf(p) {
    if (!p) return null;
    if (p.usageType) {
      return { group: p.usageType, format: p.usageFormat || p.usageType, label: LABEL[p.usageType] || p.usageType };
    }
    const cat = String(p.category || '').toLowerCase();
    const t = norm(p.name);
    const mk = (group, format) => ({ group, format: format || group, label: LABEL[group] || group });

    // maquillage et accessoires : pas de type d'usage de soin
    if (/^(foundation|concealer|corrector|powder|primer|blush|bronzer|highlighter|mascara|eyeliner|eyebrow|eyeshadow|lipstick|lipgloss|lipliner|set|tools|multi_usage)$/.test(cat)) return null;

    if (cat === 'cleanser' || /nettoyant|cleanser|demaquill|micellaire|cleansing|face wash|gel moussant|foaming/.test(t)) return mk('cleanser');
    if (/\bpeeling\b|\bpeel\b|gommage|gel exfoliant|exfoliating gel|\bscrub\b/.test(t) && !/\bpads?\b|\blotion\b|toner/.test(t)) return mk('peeling');
    if (/\bpads?\b|\bdisques?\b/.test(t)) return mk('pad_lotion', 'pad');
    if (cat === 'mist' || /\bmist\b|\bbrume\b|\bspray\b/.test(t)) return mk('mist');
    if (cat === 'mask' || cat === 'nightmask' || /\bmasque?s?\b|\bmask\b/.test(t)) {
      if (/sheet|tissu|hydrogel|patch|\(x\d+\)|\bx\d+\b/.test(t)) return mk('sheet_mask');
      if (/rinc|rinse|wash|argile|clay|boue|mud|charbon|charcoal|peel off/.test(t)) return mk('rinse_mask');
      if (cat === 'nightmask' || /night|nuit|sleeping|wrapping|overnight/.test(t)) return mk('leave_mask');
      return mk('mask_other');
    }
    if ((cat === 'toner' || /\btoner\b|\btonique\b|\blotion\b|\bessence\b|\btoning\b|liquid exfoliant|treatment toner/.test(t)) && cat !== 'moisturizer') {
      return mk('pad_lotion', 'lotion');
    }
    if (cat === 'eye' || cat === 'eye_cream' || /\beye\b|\byeux\b|contour des yeux/.test(t)) return mk('eye');
    if (cat === 'spf' || cat === 'sunscreen' || /\bspf\b|solaire|sunscreen/.test(t)) return mk('spf');
    if (cat === 'lipbalm') return mk('lip');
    if (cat === 'oil' || /\boil\b|\bhuile\b/.test(t)) return mk('oil');
    if (cat === 'serum' || /serum|ampoule|booster|concentr|\bdrops?\b|\bshot\b|\bsolution\b/.test(t)) return mk('serum');
    if (cat === 'moisturizer' || /\bcream\b|\bcreme\b|\bbalm\b|baume|moisturi|gel cream/.test(t)) return mk('cream');
    if (cat === 'exfoliant' && /\bacid\b|\bacide\b/.test(t)) return mk('serum');     // « Lactic Acid 10 % + HA » : sérum acide à garder
    if (cat === 'exfoliant') return mk('exfoliant_other');
    return null;
  }

  /**
   * Le candidat s'utilise-t-il de la même façon que la référence ?
   * { ok, formatDiff } — ok:false → à écarter ; formatDiff:true → même usage mais format différent (pads ↔ lotion).
   * Référence inconnue : on ne filtre pas. Candidat inconnu alors que la référence est connue : on écarte.
   */
  function compatible(refUsage, candUsage) {
    if (!refUsage) return { ok: true, formatDiff: false, unknown: true };
    if (!candUsage) return { ok: false, formatDiff: false, reason: 'unknown' };
    if (refUsage.group !== candUsage.group) return { ok: false, formatDiff: false, reason: 'group' };
    return { ok: true, formatDiff: refUsage.format !== candUsage.format };
  }

  // ─── Concentration des actifs exfoliants et rétinoïdes ────────
  const FAMILIES = ['aha', 'bha', 'pha', 'retinoid'];
  const FAMILY_RE = {
    aha: /glycol|lactic|mandel|\baha\b|citric/g,
    bha: /salicyl|\bbha\b|betaine salicylate/g,
    pha: /gluconolactone|\bpha\b|lactobionic/g,
    retinoid: /retin/g
  };
  // Teneur maximale pour un produit qu'on laisse sur la peau au quotidien (en %) — à valider avec Candice.
  // Au-delà, sans connaître la teneur du produit de la personne, on ne le propose pas.
  const DAILY_CEILING = { aha: 10, bha: 2, pha: 10, retinoid: 1 };
  const STRONG_RATIO = 1.5;        // « nettement plus concentré » = plus de 1,5 fois la teneur de la personne
  const RANK_GAP = 6;              // … ou cité au moins 6 rangs plus haut dans la composition

  // Pourcentages écrits dans le NOM : { aha: 30, bha: 2 } (le plus proche actif cité avant le chiffre)
  function percents(name) {
    const t = norm(name), out = {};
    const re = /(\d+(?:[.,]\d+)?)\s*%/g;
    let m;
    while ((m = re.exec(t))) {
      const val = parseFloat(m[1].replace(',', '.'));
      const before = t.slice(Math.max(0, m.index - 28), m.index);
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 28);
      let best = null, bestPos = -1;
      FAMILIES.forEach(f => {
        const r = new RegExp(FAMILY_RE[f].source, 'g'); let x, last = -1;
        while ((x = r.exec(before))) last = x.index;
        if (last > bestPos) { bestPos = last; best = f; }
      });
      if (!best) {                                         // pas d'actif avant le chiffre : on regarde après (« 7 % glycolic »)
        FAMILIES.forEach(f => { if (!best && new RegExp(FAMILY_RE[f].source).test(after)) best = f; });
      }
      if (best && isFinite(val)) out[best] = Math.max(out[best] || 0, val);
    }
    return out;
  }

  /**
   * Le candidat est-il nettement plus concentré que la référence ? → texte de la raison, ou null.
   * ref / cand : { name } ; opts.refRank / opts.candRank : { famille: rang INCI } (facultatif, côté serveur).
   * opts.refGroup : type d'usage de la référence (un peeling à rincer a le droit d'être très concentré).
   */
  function tooStrong(ref, cand, opts) {
    opts = opts || {};
    const pr = percents(ref && ref.name), pc = percents(cand && cand.name);
    for (const f of FAMILIES) {
      if (pc[f] != null && pr[f] != null && pc[f] > pr[f] * STRONG_RATIO) return `nettement plus concentré (${pc[f]} % contre ${pr[f]} %)`;
      if (pc[f] != null && pr[f] == null && opts.refGroup !== 'peeling' && pc[f] > DAILY_CEILING[f]) {
        return `bien plus concentré qu'un soin quotidien (${pc[f]} %)`;
      }
      // Les deux noms donnent un pourcentage : ce chiffre fait foi (la place dans la liste ne dit rien d'une dose en % connue)
      if (pc[f] != null && pr[f] != null) continue;
      const rr = opts.refRank && opts.refRank[f], cr = opts.candRank && opts.candRank[f];
      if (rr != null && cr != null && cr <= rr - RANK_GAP) return 'cité bien plus haut dans la composition (plus concentré)';
    }
    return null;
  }

  const api = { usageOf, compatible, percents, tooStrong, LABEL, FORMAT_LABEL, FAMILIES, DAILY_CEILING };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UsageType = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
