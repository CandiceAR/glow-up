/* ============================================================
   lib/requestedActives.js — « Autre chose à me dire » : les molécules que la personne DEMANDE dans sa routine.
   • parse(texte)  : lit les molécules demandées (« acide hyaluronique ET céramides ») et celles qu'elle refuse (« sans rétinol »).
   • adapt(routine, réponses) : fait en sorte que CHAQUE molécule demandée ait une étape dédiée, marquée `mustHave` : le moteur de
     produits (RoutineRenderer.findBestProductForStep) choisit alors un produit qui la contient vraiment (liste d'ingrédients ou
     fiche), jamais un produit qui ne la contient pas.
   Sécurité : on n'ajoute jamais d'étape rétinol, vitamine C, azélaïque ou arbutine de force (seulement si la routine en a déjà une).
   Double export : global navigateur (window.RequestedActives) + module Node (tests).
   ============================================================ */
(function (root) {
  'use strict';

  // id : mêmes identifiants que ACTIVE_MATCH de js/routineRenderer.js
  // host : types d'étape qui peuvent porter la molécule (le premier est préféré) ; sections : section préférée
  // safe : peut être AJOUTÉE à une routine qui n'en a pas (les autres : seulement posées sur une étape qui en promet déjà)
  const ACTIVES = [
    { id: 'hyaluronic',  fr: 'acide hyaluronique', text: /hyaluron/i,                                     label: /hyaluron/i,                host: ['serum', 'moisturizer', 'eye'], prefer: 'matin', safe: true,  add: 'serum' },
    { id: 'ceramide',    fr: 'céramides',          text: /c[ée]ramides?/i,                                label: /c[ée]ramide/i,             host: ['moisturizer', 'serum', 'eye'], prefer: 'soir',  safe: true,  add: 'moisturizer' },
    { id: 'niacinamide', fr: 'niacinamide',        text: /niacinamide|vitamine\s*b3|\bb3\b/i,             label: /niacinamide/i,             host: ['serum', 'moisturizer'],        prefer: 'matin', safe: true,  add: 'serum' },
    { id: 'panthenol',   fr: 'panthénol',          text: /panth[ée]nol|vitamine\s*b5|\bb5\b/i,            label: /panth[ée]nol/i,            host: ['moisturizer', 'serum'],        prefer: 'soir',  safe: true,  add: 'moisturizer' },
    { id: 'squalane',    fr: 'squalane',           text: /squalane/i,                                     label: /squalane/i,                host: ['moisturizer', 'serum'],        prefer: 'soir',  safe: true,  add: 'moisturizer' },
    { id: 'centella',    fr: 'centella asiatica',  text: /centella|\bcica\b|madecassoside/i,              label: /centella|\bcica\b/i,       host: ['moisturizer', 'serum'],        prefer: 'soir',  safe: true,  add: 'moisturizer' },
    { id: 'peptide',     fr: 'peptides',           text: /peptides?|collag[eè]ne/i,                       label: /peptide|collag[eè]n/i,     host: ['serum', 'moisturizer', 'eye'], prefer: 'soir',  safe: true,  add: 'serum' },
    { id: 'vitaminec',   fr: 'vitamine C',         text: /vitamine?\s*c\b|vit\.?\s*c\b|ascorb/i,          label: /vitamine?\s*c\b|vit\.?\s*c\b|ascorb/i, host: ['serum'],          prefer: 'matin', safe: true,  add: 'serum' },
    { id: 'retinoid',    fr: 'rétinol',            text: /r[ée]tin(?:ol|al|o[iï]des?)|bakuchiol/i,        label: /r[ée]tin|bakuchiol/i,      host: ['treatment', 'serum'],          prefer: 'soir',  safe: false, add: 'treatment' },
    { id: 'azelaic',     fr: 'acide azélaïque',    text: /az[ée]la[iï]que/i,                              label: /az[ée]la/i,                host: ['serum', 'treatment'],          prefer: 'soir',  safe: false, add: 'serum' },
    { id: 'arbutin',     fr: 'arbutine',           text: /arbutine?/i,                                    label: /arbutin/i,                 host: ['serum', 'treatment'],          prefer: 'soir',  safe: false, add: 'serum' },
    { id: 'caffeine',    fr: 'caféine',            text: /caf[ée]ine/i,                                   label: /caf[ée]ine/i,              host: ['eye'],                         prefer: 'matin', safe: false, add: 'eye' }
  ];
  const BY_ID = {}; ACTIVES.forEach(a => { BY_ID[a.id] = a; });
  const MAX = 4;

  // Une mention est-elle un REFUS (« sans rétinol », « pas de parfum ni de céramides », « allergique à… ») ?
  // On regarde la partie de la phrase juste avant le mot, en s'arrêtant à une ponctuation ou à « et », « mais », « avec »…
  const NEG = /(sans|pas\s+d[e'’ ]|pas\s|[ée]vit\w*|allergi\w*|intol[ée]r\w*|supporte\s+pas|r[ée]agi\w*\s+mal|irrit\w*|je\s+ne\s+veux\s+pas|aucun\w*|jamais)/i;
  function _negated(text, index) {
    let before = text.slice(Math.max(0, index - 45), index);
    const cut = Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf(','), before.lastIndexOf(':'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n'));
    if (cut >= 0) before = before.slice(cut + 1);
    const m = before.match(/^[\s\S]*(?:\s(?:et|mais|avec|ou|puis|aussi)\s)/i);     // « sans parfum et des céramides » → la négation s'arrête à « et »
    if (m) before = before.slice(m[0].length);
    return NEG.test(before);
  }

  /** { wanted:[{id,fr}], avoided:[{id,fr}] } — molécules demandées / refusées dans le texte libre (4 demandes au plus). */
  function parse(text) {
    const t = String(text == null ? '' : text).slice(0, 600);
    const wanted = [], avoided = [], seenW = new Set(), seenA = new Set();
    ACTIVES.forEach(a => {
      const re = new RegExp(a.text.source, 'ig'); let m, anyWanted = false, anyAvoided = false;
      while ((m = re.exec(t))) { if (_negated(t, m.index)) anyAvoided = true; else anyWanted = true; if (m[0].length === 0) re.lastIndex++; }
      if (anyWanted && !seenW.has(a.id)) { seenW.add(a.id); wanted.push({ id: a.id, fr: a.fr, pos: t.search(a.text) }); }
      else if (anyAvoided && !seenA.has(a.id)) { seenA.add(a.id); avoided.push({ id: a.id, fr: a.fr }); }
    });
    wanted.sort((x, y) => x.pos - y.pos);                  // dans l'ordre où elle les a écrits
    return { wanted: wanted.slice(0, MAX).map(w => ({ id: w.id, fr: w.fr })), avoided };
  }

  const SPECIFIC = /r[ée]tin|vitamine?\s*c\b|vit\.?\s*c\b|ascorb|salicyl|glycol|lactique|\baha\b|\bbha\b|az[ée]la|arbutin|peeling|exfoli|eye|yeux/i;
  const labelOf = (a, step) => {
    const base = String(step.label || '').trim();
    if (a.label.test(base + ' ' + (step.note || ''))) return base;
    if (/^s[ée]rum\s*$/i.test(base) || !base) return 'Sérum ' + a.fr;
    return base + ' — ' + a.fr.charAt(0).toUpperCase() + a.fr.slice(1);
  };

  /**
   * Retourne une copie de la routine où chaque molécule demandée a une étape qui l'EXIGE (step.mustHave).
   * Réponses utilisées : freeText (texte libre), labels (grossesse), ageGroup, budget.
   */
  function adapt(routine, answers) {
    const { wanted } = parse(answers && answers.freeText);
    if (!routine || !wanted.length) return routine;
    const out = Object.assign({}, routine, { matin: (routine.matin || []).map(s => Object.assign({}, s)), soir: (routine.soir || []).map(s => Object.assign({}, s)), warnings: (routine.warnings || []).slice() });
    const labels = Array.isArray(answers.labels) ? answers.labels : [];
    const young = ['moins-15', 'moins-20'].indexOf(answers.ageGroup) >= 0;
    const pregnant = labels.indexOf('grossesse') >= 0;
    // Routine essentielle (petit budget : nettoyant + crème + SPF, pas d'étape du soir) : on n'ajoute aucune étape ; la molécule demandée
    // est seulement PRÉFÉRÉE dans le choix de la crème (voir RoutineRenderer.findBestProductForStep) et le récapitulatif dit ce qui est couvert.
    if (['low', 'petits-prix'].indexOf(answers.budget) >= 0) return routine;
    const unsafe = id => (pregnant || young) && (id === 'retinoid' || id === 'azelaic');

    const addMust = (step, id) => { step.mustHave = Array.from(new Set((step.mustHave || []).concat(id))); };
    const sections = ['matin', 'soir'];

    wanted.forEach(w => {
      const a = BY_ID[w.id]; if (!a || unsafe(a.id)) return;
      // 1) une étape de la routine promet déjà cette molécule → on la rend OBLIGATOIRE
      for (const sec of ['matin', 'soir']) {
        const hit = out[sec].find(s => a.label.test((s.label || '') + ' ' + (s.note || '')) && a.host.indexOf(s.step) >= 0);
        if (hit) { addMust(hit, a.id); return; }
      }
      // 2) sinon, une étape adaptée (la moins chargée) la porte : le titre l'annonce, le produit devra la contenir
      //    (jamais pour rétinol, azélaïque, arbutine : on n'ajoute pas ces actifs de force)
      if (!a.safe) return;
      const cands = [];
      sections.forEach(sec => out[sec].forEach(s => {
        const rank = a.host.indexOf(s.step);
        if (rank < 0) return;
        if (SPECIFIC.test(s.label || '') && !a.label.test(s.label || '')) return;        // pas question de dénaturer « Sérum rétinol », « Contour des yeux »…
        cands.push({ sec, s, rank, load: (s.mustHave || []).length });
      }));
      cands.sort((x, y) => (x.load - y.load) || (x.rank - y.rank) || ((x.sec === a.prefer ? 0 : 1) - (y.sec === a.prefer ? 0 : 1)));
      if (cands.length && cands[0].rank <= 1) {                                          // serum / moisturizer : étape principale
        const c = cands[0]; c.s.label = labelOf(a, c.s); addMust(c.s, a.id); return;
      }
      // 3) aucune étape ne peut la porter : on ajoute une étape (seulement pour les molécules douces)
      const sec = sections.indexOf(a.prefer) >= 0 ? a.prefer : sections[0];
      const list = out[sec];
      const ref = list.find(s => s.step === 'moisturizer');
      const order = ref ? ref.order - 0.5 : (list.length ? Math.max.apply(null, list.map(s => s.order || 0)) + 1 : 1);
      list.push({ order, step: a.add, label: 'Sérum ' + a.fr, note: 'Ajouté parce que tu l’as demandé', mustHave: [a.id], requested: true });
      if (a.add !== 'serum') { const n = list[list.length - 1]; n.label = 'Crème — ' + a.fr.charAt(0).toUpperCase() + a.fr.slice(1); }
    });
    return out;
  }

  const api = { ACTIVES, parse, adapt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RequestedActives = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
