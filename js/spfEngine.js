/* ============================================================
   spfEngine.js — Base SPF + logique de recommandation
   GLOW UP · Protection solaire
   • Charge data/spfProducts.json → AppState.products.spfCatalog
   • getBestSpfForUser(profile) : 1 SPF visage + alternatives + 1 SPF corps
   • Pensé pour la future section saisonnière « Routine spéciale été »
   ============================================================ */

'use strict';

const SpfEngine = (() => {

  let _loaded = false;
  let _cache  = null;   // { key, result } — mémoïsation de la dernière reco
  let _seed   = '';     // seed stable (fixé par la routine) → reco déterministe

  // Aléa DÉTERMINISTE : même seed + même clé → même valeur [0,1)
  function _rnd(key) {
    const str = _seed + key;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return (h >>> 0) / 4294967296;
  }
  function setSeed(s) { if (s !== _seed) { _seed = s || ''; _cache = null; } }

  // ─── Chargement de la base SPF ────────────────────────────────
  async function load() {
    if (_loaded && (AppState.products.spfCatalog || []).length) return AppState.products.spfCatalog;
    try {
      const res  = await fetch('data/spfProducts.json?v=1');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.products || []);
      // Injecter le tag affilié si un buyUrl Amazon est présent
      AppState.products.spfCatalog = list.map(p => ({
        ...p,
        buyUrl: (p.buyUrl && typeof ProductCatalog !== 'undefined')
          ? ProductCatalog.ensureTag(p.buyUrl)
          : (p.buyUrl || '')
      }));
      _loaded = true;
      console.log(`[SpfEngine] Base SPF chargée : ${AppState.products.spfCatalog.length} (visage ${list.filter(p=>p.spfType==='face').length}, corps ${list.filter(p=>p.spfType==='body').length})`);
    } catch (err) {
      console.error('[SpfEngine] Erreur chargement spfProducts.json :', err);
      AppState.products.spfCatalog = [];
    }
    return AppState.products.spfCatalog;
  }

  // ─── Construire le profil utilisatrice depuis l'état global ────
  function buildUserProfile() {
    const a  = AppState.questionnaire?.answers || {};
    const sa = AppState.face?.skinAnalysis || null;

    const skinType  = sa?.skinType?.type || a.skinType || null;
    const complexes = Array.isArray(a.complexes) ? a.complexes : [];
    const avoid     = Array.isArray(a.avoidIngredients) ? a.avoidIngredients : [];
    const labels    = Array.isArray(a.labels) ? a.labels : [];

    // Sensibilité : slider, sinon dérivée (peau sensible / rougeurs déclarées)
    let sensitivity = typeof a.sensitivity === 'number' ? a.sensitivity : null;
    if (sensitivity === null) {
      sensitivity = (skinType === 'sensible' || complexes.includes('rougeurs')) ? 7 : 3;
    }

    const age = a.ageGroup || null;

    return {
      skinType,
      complexes,
      sensitivity,
      sensitive:  skinType === 'sensible' || sensitivity >= 6 || complexes.includes('rougeurs'),
      dry:        skinType === 'seche' || complexes.includes('secheresse'),
      oily:       skinType === 'grasse' || skinType === 'mixte',
      mature:     age === '40+' || complexes.includes('rides'),
      young:      age === 'moins-20' || age === '20-25',
      taches:     complexes.includes('taches'),
      imperfections: complexes.includes('acne') || complexes.includes('pores'),
      budget:     _normBudget(a.budget),
      korean:     a.skincareStyle === 'korean',
      wantsFragranceFree: avoid.includes('parfum') || labels.includes('grossesse'),
      avoidAlcohol: avoid.includes('alcool') || skinType === 'seche' || skinType === 'sensible',
      pregnancy:  labels.includes('grossesse'),
      // Réponses dédiées SPF (bloc « Protection solaire »)
      spfFinish:        a.spfFinish        || null,   // invisible/matte/hydrating/glow/any
      spfMakeup:        a.spfMakeup        || null,   // light/hydrating/any/nomakeup
      spfEyeSensitive:  a.spfEyeSensitive  || null,   // often/sometimes/no
      spfFragrance:     a.spfFragrance     || null,   // fragrancefree/any/unknown
      spfPriority:      a.spfPriority      || null,   // invisible/matte/comfort/antitaches/heatresist/budget
      spfWaterResistant:a.spfWaterResistant|| null,   // yes/no/summer
      spfBodyInterest:  a.spfBodyInterest  || null,   // yes/no/summer
      spfBodyFormat:    a.spfBodyFormat    || null,   // milk/spray/mist/any
      spfBodyGoal:      a.spfBodyGoal      || null,   // family/beach/daily/budget
      spfFrequency:     a.spfFrequency     || null
    };
  }

  function _normBudget(b) {
    if (b === 'low'    || b === 'petits-prix') return 'petit';
    if (b === 'medium' || b === 'bon-rapport') return 'normal';
    if (b === 'high'   || b === 'premium')     return 'premium';
    return b || 'normal';
  }

  // ─── Scoring d'un SPF visage pour un profil ───────────────────
  function _scoreFace(p, u) {
    let s = (p.rankingScore || 50) * 0.25;   // popularité/fiabilité (base)

    // ── Type de peau ──
    if (u.skinType && p.skinTypes?.includes(u.skinType)) s += 30;
    else if (p.skinTypes?.includes('tous')) s += 8;

    // ── Peau grasse / mixte / imperfections : léger, matifiant, non comédogène ──
    if (u.oily) {
      if (['fluid','gel','serum'].includes(p.texture)) s += 18;
      if (p.texture === 'cream' || p.texture === 'milk') s -= 12;
      if (p.nonComedogenic) s += 12;
      if (['matte','invisible'].includes(p.finish)) s += 10;
    }
    if (u.imperfections) {
      if (p.nonComedogenic) s += 16;
      if (p.concerns?.includes('imperfections') || p.concerns?.includes('pores')) s += 14;
      if (p.finish === 'matte') s += 8;
    }

    // ── Peau sèche : confort, texture riche, hydratation ──
    if (u.dry) {
      if (['cream','milk','lotion'].includes(p.texture)) s += 16;
      if (p.concerns?.includes('secheresse')) s += 12;
      if (p.finish === 'matte') s -= 8;
    }

    // ── Peau sensible : tolérance, sans parfum, sans alcool ──
    if (u.sensitive) {
      if (p.skinTypes?.includes('sensible')) s += 22;
      if (p.fragranceFree) s += 16;
      if (p.alcoholHigh) s -= 40;
      if (p.concerns?.includes('rougeurs')) s += 12;
      if (p.suitableForEyes) s += 6;
    }
    // Anti-alcool transverse (sèche/sensible/grossesse)
    if (u.avoidAlcohol && p.alcoholHigh) s -= 30;

    // ── Peau mature / taches : UVA forte, anti-photoaging, glow ──
    if (u.mature) {
      if (p.uvaStrong) s += 14;
      if (p.concerns?.includes('rides') || p.concerns?.includes('photoaging')) s += 18;
      if (['glow','natural'].includes(p.finish)) s += 8;
    }
    if (u.taches) {
      if (p.concerns?.includes('taches')) s += 26;
      if (p.uvaStrong) s += 14;
    }

    // ── Préférence de fini (réponse SPF dédiée) ──
    const finishWanted = {
      invisible: 'invisible', matte: 'matte', hydrating: 'natural', glow: 'glow'
    }[u.spfFinish];
    if (finishWanted) {
      if (p.finish === finishWanted) s += 24;
      if (u.spfFinish === 'hydrating' && ['cream','milk'].includes(p.texture)) s += 8;
      if (u.spfFinish === 'matte' && p.finish === 'glow') s -= 18;
      if (u.spfFinish === 'glow' && p.finish === 'matte') s -= 12;
    }

    // ── Maquillage ──
    if (u.spfMakeup === 'light') { if (p.makeup) s += 22; if (['fluid','gel','serum'].includes(p.texture)) s += 8; }
    if (u.spfMakeup === 'hydrating') { if (['cream','fluid'].includes(p.texture)) s += 8; }

    // ── Yeux sensibles ──
    if (u.spfEyeSensitive === 'often') { if (p.suitableForEyes) s += 24; if (p.fragranceFree) s += 12; if (!p.fragranceFree) s -= 8; }
    if (u.spfEyeSensitive === 'sometimes') { if (p.suitableForEyes) s += 10; }

    // ── Parfum ──
    if (u.spfFragrance === 'fragrancefree' || u.wantsFragranceFree) {
      if (p.fragranceFree) s += 22; else s -= 16;
    }

    // ── Priorité n°1 ──
    switch (u.spfPriority) {
      case 'invisible':  if (p.finish === 'invisible') s += 26; break;
      case 'matte':      if (p.finish === 'matte') s += 26; if (p.finish === 'glow') s -= 14; break;
      case 'comfort':    if (['cream','milk'].includes(p.texture)) s += 22; if (p.concerns?.includes('secheresse')) s += 8; break;
      case 'antitaches': if (p.concerns?.includes('taches')) s += 22; if (p.uvaStrong) s += 14; break;
      case 'heatresist': if (p.waterResistant) s += 22; if (p.sportFriendly) s += 10; break;
      case 'budget':     if (p.budgetLevel === 'petit') s += 24; if (p.budgetLevel === 'premium') s -= 16; break;
    }

    // ── Résistance à l'eau ──
    if (u.spfWaterResistant === 'yes') { if (p.waterResistant) s += 18; else s -= 6; }

    // ── Budget global ──
    if (u.budget === 'petit')    { if (p.budgetLevel === 'petit') s += 22; if (p.budgetLevel === 'premium') s -= 24; }
    if (u.budget === 'premium')  { if (p.budgetLevel === 'premium') s += 8; }

    // ── Style coréen ──
    if (u.korean && p.korean) s += 16;

    // ── Profil jeune : éviter le premium inutile ──
    if (u.young && p.budgetLevel === 'premium') s -= 8;

    // Protection : on privilégie légèrement SPF50
    if (p.protection >= 50) s += 4;

    // Variété DÉTERMINISTE (seed de la routine)
    s += _rnd('f_' + p.id) * 8;
    return s;
  }

  // ─── Scoring d'un SPF corps ───────────────────────────────────
  function _scoreBody(p, u) {
    let s = (p.rankingScore || 50) * 0.25;

    if (u.skinType && p.skinTypes?.includes(u.skinType)) s += 14;
    else if (p.skinTypes?.includes('tous')) s += 6;
    if (u.sensitive) { if (p.skinTypes?.includes('sensible')) s += 16; if (p.fragranceFree) s += 10; if (p.alcoholHigh) s -= 20; }
    if (u.dry && p.concerns?.includes('secheresse')) s += 8;

    // Format demandé
    if (u.spfBodyFormat && u.spfBodyFormat !== 'any') {
      const fmt = { milk: ['milk','lotion','cream'], spray: ['spray'], mist: ['mist','spray'] }[u.spfBodyFormat] || [];
      if (fmt.includes(p.texture)) s += 22;
    }

    // Objectif corps
    switch (u.spfBodyGoal) {
      case 'family': if (p.kidsFriendly) s += 24; if (p.fragranceFree) s += 8; break;
      case 'beach':  if (p.waterResistant) s += 20; if (p.sportFriendly) s += 14; break;
      case 'daily':  if (['lotion','spray','mist'].includes(p.texture)) s += 12; break;
      case 'budget': if (p.budgetLevel === 'petit') s += 24; if (p.budgetLevel === 'premium') s -= 16; break;
    }

    // Été / vacances → résistance à l'eau
    if (u.spfBodyInterest === 'summer' || u.spfWaterResistant === 'summer') { if (p.waterResistant) s += 14; }

    if (u.budget === 'petit')   { if (p.budgetLevel === 'petit') s += 16; if (p.budgetLevel === 'premium') s -= 18; }
    if (u.budget === 'premium') { if (p.budgetLevel === 'premium') s += 6; }

    s += _rnd('b_' + p.id) * 8;
    return s;
  }

  // ─── Raison personnalisée (texte) ─────────────────────────────
  function _buildReason(p, u) {
    const bits = [];

    if (u.oily && (p.finish === 'matte' || p.nonComedogenic))
      bits.push('ta peau a besoin d\'une protection légère qui ne fasse pas briller la zone T');
    else if (u.dry && ['cream','milk','lotion'].includes(p.texture))
      bits.push('ta peau a besoin d\'une texture confortable et hydratante');
    else if (u.sensitive && (p.fragranceFree || p.skinTypes?.includes('sensible')))
      bits.push('ta peau sensible a besoin d\'une formule haute tolérance, tout en douceur');
    else if (u.mature || u.taches)
      bits.push('tu recherches une protection anti-taches et anti-photovieillissement au quotidien');
    else
      bits.push('elle s\'accorde parfaitement à ton type de peau');

    if (u.spfPriority === 'antitaches' && p.concerns?.includes('taches')) bits.push('sa protection UVA forte aide à prévenir les taches');
    if (u.spfFinish === 'invisible' && p.finish === 'invisible') bits.push('son fini est invisible, sans trace blanche');
    if (u.spfFinish === 'glow' && p.finish === 'glow') bits.push('elle laisse un joli fini lumineux');
    if (u.spfMakeup === 'light' && p.makeup) bits.push('elle se porte parfaitement sous le maquillage');
    if (u.spfEyeSensitive === 'often' && p.suitableForEyes) bits.push('elle est bien tolérée au contour des yeux');
    if (u.spfWaterResistant === 'yes' && p.waterResistant) bits.push('elle résiste à l\'eau et à la transpiration');
    if (u.budget === 'petit' && p.budgetLevel === 'petit') bits.push('elle reste accessible niveau budget');
    if (u.korean && p.korean) bits.push('c\'est une référence K-Beauty');

    const head = `On t'a choisi ce SPF car ${bits[0]}`;
    const tail = bits.slice(1, 3).join(' et ');
    return tail ? `${head} — ${tail}.` : `${head}.`;
  }

  // ─── Reco principale (mémoïsée) ───────────────────────────────
  function getBestSpfForUser(profile, products) {
    const u    = profile || buildUserProfile();
    const list = products || AppState.products.spfCatalog || [];
    if (!list.length) return null;

    const face = list.filter(p => p.spfType === 'face')
      .map(p => ({ p, s: _scoreFace(p, u) }))
      .sort((a, b) => b.s - a.s);
    if (!face.length) return null;

    const primary      = face[0].p;
    const alternatives = face.slice(1, 4).map(x => x.p);

    let body = null;
    if (u.spfBodyInterest && u.spfBodyInterest !== 'no') {
      const bodyList = list.filter(p => p.spfType === 'body')
        .map(p => ({ p, s: _scoreBody(p, u) }))
        .sort((a, b) => b.s - a.s);
      if (bodyList.length) body = bodyList[0].p;
    }

    return {
      primary,
      alternatives,
      body,
      reason: _buildReason(primary, u),
      bodyReason: body ? _buildBodyReason(body, u) : null
    };
  }

  function _buildBodyReason(p, u) {
    if (u.spfBodyGoal === 'family' && p.kidsFriendly) return 'Pour le corps : une formule familiale, douce et adaptée à toute la famille.';
    if (u.spfBodyGoal === 'beach' && p.waterResistant) return 'Pour le corps : résistante à l\'eau, parfaite pour la plage et le sport.';
    if (u.spfBodyFormat === 'spray' && p.texture === 'spray') return 'Pour le corps : un spray facile à appliquer et à réappliquer.';
    return 'Pour le corps : un complément solaire adapté à tes besoins.';
  }

  // ─── Reco mémoïsée (utilisée par la routine) ──────────────────
  function getRecommendation() {
    const u   = buildUserProfile();
    const key = _seed + '|' + JSON.stringify(u);   // dépend du seed → stable
    if (_cache && _cache.key === key) return _cache.result;
    const result = getBestSpfForUser(u);
    _cache = { key, result };
    return result;
  }

  function reset() { _cache = null; }

  // ─── Filtre générique (préparation section « Routine été ») ────
  // criteria : { spfType, beach, kids, budget, skinType, korean, waterResistant }
  function filter(criteria = {}) {
    let list = AppState.products.spfCatalog || [];
    const c = criteria;
    if (c.spfType)        list = list.filter(p => p.spfType === c.spfType);
    if (c.skinType)       list = list.filter(p => p.skinTypes?.includes(c.skinType) || p.skinTypes?.includes('tous'));
    if (c.korean)         list = list.filter(p => p.korean);
    if (c.waterResistant) list = list.filter(p => p.waterResistant);
    if (c.kids)           list = list.filter(p => p.kidsFriendly);
    if (c.beach)          list = list.filter(p => p.waterResistant && p.sportFriendly);
    if (c.sensitive)      list = list.filter(p => p.skinTypes?.includes('sensible'));
    if (c.budget)         list = list.filter(p => p.budgetLevel === c.budget);
    return list.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
  }

  return { load, buildUserProfile, getBestSpfForUser, getRecommendation, reset, setSeed, filter };

})();
