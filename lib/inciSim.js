/* ============================================================
   inciSim.js — Similarité de FORMULE entre deux listes INCI.
   Règles (spec Glow Up) :
   - comparer les ACTIFS réels, pas les promesses marketing ;
   - pondérer par la POSITION INCI (début de liste = plus concentré) ;
   - distinguer les DÉRIVÉS d'une même famille (rétinal ≠ rétinol ≠ rétinyl ;
     vit C pure ≠ dérivés ; peptides ; AHA/BHA/PHA ; céramides ; HA) ;
   - proximité de CONCENTRATION quand elle est connue ;
   - RÈGLE ÉLIMINATOIRE : actif central puissant présent chez le candidat
     mais absent de la référence → pas un dupe (plafond 20).
   ============================================================ */

const ZW = /[​-‏‪-‮⁠﻿­]/g;
function canon(x) {
  return (x || '').toLowerCase().replace(ZW, '')
    .replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/\.$/, '');
}

// famille, fonction, actif, puissant (pour règle éliminatoire), dérivé (clé fine)
// [regex, family, func, isActive, potent, derivKey]
const TAX = [
  [/^(water|aqua|eau)$/, 'solvant', 'solvant', false, false, ''],
  [/retinal|retinaldehyde/, 'retinoid', 'rétinoïde', true, true, 'retinal'],
  [/\bretinol\b/, 'retinoid', 'rétinoïde', true, true, 'retinol'],
  [/retinyl/, 'retinoid', 'rétinoïde', true, true, 'retinyl'],
  [/hydroxypinacolone retinoate/, 'retinoid', 'rétinoïde', true, true, 'hpr'],
  [/bakuchiol/, 'retinoid_like', 'rétinol-like', true, false, 'bakuchiol'],
  [/\bl-ascorbic acid\b|^ascorbic acid$|\bascorbic acid\b/, 'vitc', 'vitamine C', true, true, 'ascorbic'],
  [/3-o-ethyl ascorbic|ethyl ascorbic/, 'vitc', 'vitamine C', true, true, 'eaa'],
  [/ascorbyl glucoside/, 'vitc', 'vitamine C', true, true, 'ag'],
  [/sodium ascorbyl phosphate|magnesium ascorbyl phosphate/, 'vitc', 'vitamine C', true, true, 'sap'],
  [/ascorbyl tetraisopalmitate|ascorbyl/, 'vitc', 'vitamine C', true, true, 'atip'],
  [/niacinamide|nicotinamide/, 'niacinamide', 'vitamine B3', true, false, 'niacinamide'],
  [/glycolic acid/, 'aha', 'exfoliant AHA', true, true, 'glycolic'],
  [/lactic acid|lactobionic/, 'aha', 'exfoliant AHA', true, true, 'lactic'],
  [/mandelic acid/, 'aha', 'exfoliant AHA', true, true, 'mandelic'],
  [/malic acid|tartaric acid|citric acid/, 'aha', 'exfoliant AHA', true, true, 'aha_other'],
  [/salicylic acid|betaine salicylate|bha/, 'bha', 'exfoliant BHA', true, true, 'salicylic'],
  [/gluconolactone/, 'pha', 'exfoliant PHA', true, true, 'gluconolactone'],
  [/alpha-arbutin|arbutin/, 'brightening', 'anti-taches', true, true, 'arbutin'],
  [/tranexamic|cetyl tranexamate/, 'brightening', 'anti-taches', true, true, 'txa'],
  [/azelaic|azeloyl/, 'brightening', 'anti-taches', true, true, 'azelaic'],
  [/glutathione/, 'brightening', 'éclat/antiox', true, false, 'glutathione'],
  [/kojic/, 'brightening', 'anti-taches', true, true, 'kojic'],
  [/copper tripeptide/, 'peptide', 'peptide', true, false, 'cu-tripeptide'],
  [/acetyl hexapeptide/, 'peptide', 'peptide', true, false, 'argireline'],
  [/palmitoyl (penta|tetra|tri|hexa|oligo)peptide|palmitoyl peptide|matrixyl/, 'peptide', 'peptide', true, false, 'matrixyl'],
  [/sh-oligopeptide|sh-polypeptide|oligopeptide|polypeptide|hexapeptide|pentapeptide|tripeptide|peptide/, 'peptide', 'peptide', true, false, 'peptide'],
  [/sodium dna|polydeoxyribonucleotide|nicotinamide adenine|nadh|nad\b/, 'pdrn_nad', 'régénérant', true, false, 'pdrn'],
  [/hydrolyzed collagen|^collagen$|collagen extract|atelocollagen/, 'collagen', 'repulpant', true, false, 'collagen'],
  [/adenosine/, 'antiage', 'anti-rides', true, false, 'adenosine'],
  [/sodium hyaluronate|hyaluronic acid|hyaluronate|hydrolyzed hyaluronic/, 'ha', 'humectant', true, false, 'ha'],
  [/panthenol/, 'soothing', 'apaisant', true, false, 'panthenol'],
  [/allantoin/, 'soothing', 'apaisant', true, false, 'allantoin'],
  [/centella|asiaticoside|madecassoside|asiatic acid|madecassic|houttuynia|heartleaf/, 'soothing', 'apaisant', true, false, 'centella'],
  [/bisabolol|panthenyl/, 'soothing', 'apaisant', true, false, 'soothing'],
  [/snail secretion filtrate/, 'snail', 'réparateur', true, false, 'snail'],
  [/ceramide|phytosphingosine/, 'ceramide', 'barrière', true, false, 'ceramide'],
  [/cholesterol/, 'lipid', 'barrière', false, false, 'cholesterol'],
  [/tocopherol|tocopheryl|ferulic|ubiquinone/, 'antioxidant', 'antioxydant', true, false, 'antiox'],
  [/glycerin|betaine|butylene glycol|propylene glycol|dipropylene glycol|methylpropanediol|pentylene glycol|sodium pca|trehalose|glycereth|propanediol|polyglycerin/, 'humectant', 'humectant', false, false, ''],
  [/squalane|triglyceride|jojoba|argania|helianthus|simmondsia|caprylyl|isononyl|ethylhexyl palmitate|coconut oil|olea europaea|shea|butyrospermum|oil$/, 'emollient', 'émollient', false, false, ''],
  [/dimethicone|petrolatum|cyclopentasiloxane|siloxane|polyisobutene/, 'occlusive', 'occlusif', false, false, ''],
  [/phenoxyethanol|ethylhexylglycerin|chlorphenesin|potassium sorbate|sodium benzoate|caprylyl glycol|1,2-hexanediol|hexanediol/, 'preservative', 'conservateur', false, false, ''],
  [/fragrance|parfum|limonene|linalool|citronellol|geraniol|citral|eugenol/, 'fragrance', 'parfum', false, false, ''],
  [/carbomer|xanthan|acrylate|crosspolymer|cellulose|sclerotium|copolymer/, 'texture', 'texture', false, false, ''],
  [/edta|etidronic/, 'chelator', 'stabilisant', false, false, ''],
  [/hydroxide|arginine|tromethamine|triethanolamine/, 'ph', 'pH', false, false, ''],
];
function classify(name) {
  const n = canon(name);
  for (const [re, family, func, isActive, potent, derivKey] of TAX)
    if (re.test(n)) return { name: n, family, func, isActive, potent, derivKey: derivKey || family };
  return { name: n, family: '', func: '', isActive: false, potent: false, derivKey: '' };
}
function parseConc(raw) { const m = (raw || '').match(/([\d.]+)\s*%/); return m ? parseFloat(m[1]) : null; }

// Analyse une liste INCI brute (avec % éventuels) -> actifs positionnés
function analyze(list) {
  const items = (list || []).map((raw, i) => {
    const c = classify(raw);
    return { ...c, position: i + 1, weight: 1 / Math.sqrt(i + 1), concentration: parseConc(raw) };
  });
  const actives = items.filter(x => x.isActive && x.family);
  const families = new Set(items.filter(x => x.family && x.family !== 'solvant').map(x => x.family));
  return { items, actives, families };
}

// Familles "héros" = ce qui définit vraiment un produit (vs actifs de soutien)
const HERO_FAMILIES = new Set(['retinoid', 'retinoid_like', 'vitc', 'aha', 'bha', 'pha', 'brightening', 'peptide', 'pdrn_nad', 'collagen']);
// héros DÉFINISSANT = famille héros ET assez haut dans la liste (les traces profondes = soutien)
const isHero = a => HERO_FAMILIES.has(a.family) && a.position <= 15;

// Recouvrement pondéré (position + dérivé + concentration) + couverture pondérée par famille
function _overlap(refActives, candByFamily, shared, missing, derivMismatch) {
  let num = 0, den = 0;
  const famWeight = new Map(), famMatched = new Map();
  refActives.forEach(a => {
    den += a.weight;
    famWeight.set(a.family, (famWeight.get(a.family) || 0) + a.weight);
    const fam = candByFamily.get(a.family);
    if (!fam) { missing.push(a.derivKey || a.family); return; }
    famMatched.set(a.family, true);
    const exact = fam.find(c => c.derivKey === a.derivKey);
    let credit = exact ? 1 : 0.5;
    if (!exact) derivMismatch.push(`${a.derivKey}≠${fam[0].derivKey}`);
    const cc = exact || fam[0];
    if (a.concentration != null && cc.concentration != null) {
      const hi = Math.max(a.concentration, cc.concentration);
      const prox = hi > 0 ? 1 - Math.min(1, Math.abs(a.concentration - cc.concentration) / hi) : 1;
      credit *= (0.4 + 0.6 * prox);
    }
    num += a.weight * credit;
    shared.push((exact ? a.derivKey : a.family) + (a.concentration != null ? ` ${a.concentration}%` : ''));
  });
  // couverture pondérée par la position : une famille en tête pèse plus qu'une famille en fin
  let covNum = 0, covDen = 0;
  famWeight.forEach((w, f) => { covDen += w; if (famMatched.get(f)) covNum += w; });
  return { score: den > 0 ? num / den : 0, coverage: covDen > 0 ? covNum / covDen : 1 };
}

// Similarité de formule 0-100 + signaux explicatifs
function similarity(refList, candList) {
  const ref = analyze(refList), cand = analyze(candList);
  if (!ref.actives.length || !candList || !candList.length)
    return { score: null, shared: [], missing: [], extraPotent: [], derivMismatch: [] };

  const candByFamily = new Map();
  cand.actives.forEach(a => {
    if (!candByFamily.has(a.family)) candByFamily.set(a.family, []);
    candByFamily.get(a.family).push(a);
  });

  // ── RÈGLE ÉLIMINATOIRE : actif PUISSANT central du candidat TOTALEMENT absent de la réf ──
  //    (spec : « référence SANS vitamine C » → un sérum vit C n'est pas un dupe)
  const extraPotent = [];
  cand.actives.filter(a => a.potent && a.position <= 10).forEach(a => {
    if (!ref.families.has(a.family)) extraPotent.push(a.derivKey || a.family);
  });

  const shared = [], missing = [], derivMismatch = [];
  const refHeroes = ref.actives.filter(isHero);        // héros définissant de la réf (pos ≤ 15)
  const refSupport = ref.actives.filter(a => !isHero(a));

  const hero = _overlap(refHeroes, candByFamily, shared, missing, derivMismatch);
  const support = _overlap(refSupport, candByFamily, shared, missing, derivMismatch);

  // Architecture globale : recouvrement des familles fonctionnelles de soutien
  const archFams = ['humectant', 'ha', 'ceramide', 'emollient', 'occlusive', 'soothing', 'antioxidant', 'snail'];
  let inter = 0, union = 0;
  archFams.forEach(f => { const r = ref.families.has(f), c = cand.families.has(f); if (r || c) union++; if (r && c) inter++; });
  const archScore = union > 0 ? inter / union : 0;

  // ── Le CANDIDAT est-il défini par un héros ABSENT de la réf ? (ex. réf sans peptides
  //    vs candidat "peptide booster") → produit différent, pas un dupe de formule ──
  const candDefiningHeroes = cand.actives.filter(isHero);
  const extraHero = [...new Set(candDefiningHeroes.filter(a => !ref.families.has(a.family)).map(a => a.derivKey || a.family))];

  // Score : les héros dominent quand la réf en a
  let score;
  if (refHeroes.length) {
    score = Math.round((hero.score * 0.58 + support.score * 0.16 + archScore * 0.26) * 100);
  } else {
    score = Math.round((support.score * 0.6 + archScore * 0.4) * 100);
  }
  if (extraHero.length) score = Math.min(score, 40);     // candidat défini par un autre héros
  if (extraPotent.length) score = Math.min(score, 20);   // éliminatoire (actif puissant absent de la réf)

  return { score, heroCoverage: Math.round((refHeroes.length ? hero.coverage : 1) * 100),
           shared: [...new Set(shared)], missing: [...new Set(missing)],
           extraHero, extraPotent: [...new Set(extraPotent)], derivMismatch: [...new Set(derivMismatch)] };
}

module.exports = { classify, analyze, similarity, canon };
