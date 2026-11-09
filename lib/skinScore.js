/* ============================================================
   lib/skinScore.js — Score de peau : version légère d'une analyse (pour l'historique) et comparaison « avant / après ».
   Aucun calcul de peau ici (il vient de js/skinAnalysis.js) : on range seulement quelques chiffres et on compare.
   Double export : global navigateur (window.SkinScore) + module Node (tests).
   ============================================================ */
(function (root) {
  'use strict';

  const ZONE_ORDER = ['forehead', 'leftCheek', 'rightCheek', 'nose', 'chin'];
  const ZONE_LABEL = { forehead: 'Front', leftCheek: 'Joue gauche', rightCheek: 'Joue droite', nose: 'Nez', chin: 'Menton' };
  const METRIC_KEYS = ['hydratation', 'rougeurs', 'texture', 'eclat'];
  const METRIC_LABEL = { hydratation: 'Hydratation', rougeurs: 'Rougeurs', texture: 'Texture', eclat: 'Éclat' };
  const num = v => typeof v === 'number' && isFinite(v);

  /**
   * Version légère d'une analyse : score global, score par zone, 4 critères. C'est ce qu'on garde dans l'historique
   * (jamais la photo, jamais les pixels). `metrics` = résultat de SkinJourney.metricsFromAnalysis (facultatif).
   */
  function snapshot(analysis, metrics, date) {
    if (!analysis || !analysis.zones) return null;
    const zones = {};
    ZONE_ORDER.forEach(k => { const z = analysis.zones[k]; if (z && num(z.score)) zones[k] = { score: Math.round(z.score) }; });
    const keys = Object.keys(zones);
    if (!keys.length) return null;
    const global = num(analysis.globalScore) ? Math.round(analysis.globalScore)
      : Math.round(keys.reduce((s, k) => s + zones[k].score, 0) / keys.length);
    return { globalScore: global, zones, metrics: metrics || null, date: date || null };
  }

  const _d = (a, b) => (num(a) && num(b)) ? Math.round(a - b) : null;

  /** Compare le nouveau score à l'ancien (prev peut être null : première analyse enregistrée). */
  function compare(prev, next) {
    const p = prev || null, n = next || {};
    const out = { hasPrev: !!(p && num(p.globalScore)), prevDate: p ? (p.date || null) : null, global: null, zones: [], metrics: [] };
    out.global = { next: n.globalScore, prev: p ? p.globalScore : null, delta: p ? _d(n.globalScore, p.globalScore) : null };
    ZONE_ORDER.forEach(k => {
      const z = n.zones && n.zones[k]; if (!z) return;
      const pz = p && p.zones && p.zones[k];
      out.zones.push({ key: k, label: ZONE_LABEL[k], next: z.score, prev: pz ? pz.score : null, delta: pz ? _d(z.score, pz.score) : null });
    });
    METRIC_KEYS.forEach(k => {
      if (!n.metrics || !num(n.metrics[k])) return;
      const pv = p && p.metrics && num(p.metrics[k]) ? p.metrics[k] : null;
      out.metrics.push({ key: k, label: METRIC_LABEL[k], next: n.metrics[k], prev: pv, delta: pv == null ? null : _d(n.metrics[k], pv) });
    });
    return out;
  }

  /** « +5 », « −3 » (vrai signe moins), « 0 » ; chaîne vide si pas de comparaison. */
  function fmtDelta(d) { return !num(d) ? '' : d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'; }

  /** Phrase simple pour le score global. */
  function verdict(delta) {
    if (!num(delta)) return 'C’est ton premier score enregistré : il servira de point de départ pour suivre ta peau.';
    if (delta >= 3) return 'Ta peau s’améliore ✨';
    if (delta <= -3) return 'Ta peau est un peu moins bien qu’à la dernière analyse : ça arrive (fatigue, saison, lumière…). Refais une photo dans les mêmes conditions pour confirmer.';
    return 'Ta peau est stable depuis la dernière analyse.';
  }

  /** Empreinte d'une routine (règle + étapes) : sert à savoir si une routine proposée est vraiment différente. */
  function routineSignature(r) {
    if (!r) return '';
    try { return JSON.stringify([r.ruleApplied || '', r.matin || [], r.soir || []]); } catch (e) { return ''; }
  }

  const api = { ZONE_ORDER, ZONE_LABEL, METRIC_KEYS, METRIC_LABEL, snapshot, compare, fmtDelta, verdict, routineSignature };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SkinScore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
