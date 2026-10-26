/* ============================================================
   lib/actifs.js — Table des actifs clés : un NOM SIMPLE EN FRANÇAIS + tous les noms INCI et formes de chaque actif.
   Sert à l'écran de comparaison des dupes :
     • même actif = POINT COMMUN, même si le nom INCI est différent
       (« Tranexamic Acid » et « Cetyl Tranexamate Mesylate » → « Acide tranexamique ») ;
     • forme différente du même actif → « Acide tranexamique (sous une autre forme) » (jamais « identique ») ;
     • l'utilisatrice ne voit JAMAIS un nom INCI : toujours le nom français de cette table.
   Pour ajouter un actif : une ligne dans ACTIFS. `forms` = [clé de la forme, expression qui reconnaît son nom INCI] ;
   la 1re expression qui correspond gagne (mettre les plus précises en premier). `maxPos` : un actif de confort (vitamine E…)
   n'est compté que s'il figure dans les premiers ingrédients (sinon ce sont des traces).
   ============================================================ */
'use strict';

const ACTIFS = [
  { id: 'txa', fr: 'Acide tranexamique', forms: [
    ['tranexamic acid', /^tranexamic acid$/], ['cetyl tranexamate mesylate', /cetyl tranexamate (mesylate|mesilate)/],
    ['cetyl tranexamate hcl', /cetyl tranexamate (hcl|hydrochloride)/], ['autre', /tranexam/]] },
  { id: 'niacinamide', fr: 'Niacinamide (vitamine B3)', forms: [['niacinamide', /^(niacinamide|nicotinamide)$/], ['autre', /niacin/]] },
  { id: 'vitc', fr: 'Vitamine C', forms: [
    ['acide ascorbique', /^(l-)?ascorbic acid$/], ['ascorbyl glucoside', /ascorbyl glucoside/],
    ['sodium ascorbyl phosphate', /sodium ascorbyl phosphate/], ['magnesium ascorbyl phosphate', /magnesium ascorbyl phosphate/],
    ['3-o-ethyl ascorbic acid', /3-[o0]-ethyl ascorbic|ethyl ascorbic/], ['tetrahexyldecyl ascorbate', /tetrahexyldecyl ascorbate/],
    ['ascorbyl tetraisopalmitate', /ascorbyl tetraisopalmitate/], ['ascorbyl palmitate', /ascorbyl palmitate/], ['autre', /ascorb/]] },
  { id: 'retinoid', fr: 'Rétinoïdes', forms: [
    ['retinal', /retinal\b|retinaldehyde/], ['retinol', /^retinol$/], ['retinyl palmitate', /retinyl palmitate/],
    ['hydroxypinacolone retinoate', /hydroxypinacolone retinoate/], ['retinyl autre', /retinyl/]] },
  { id: 'bakuchiol', fr: 'Bakuchiol', forms: [['bakuchiol', /bakuchiol/]] },
  { id: 'kojic', fr: 'Acide kojique', forms: [['kojic acid', /^kojic acid$/], ['kojic dipalmitate', /kojic dipalmitate/], ['autre', /kojic/]] },
  { id: 'arbutin', fr: 'Arbutine', forms: [['alpha-arbutin', /alpha-arbutin/], ['arbutin', /^arbutin$/], ['autre', /arbutin/]] },
  { id: 'ha', fr: 'Acide hyaluronique', forms: [
    ['hyaluronate de sodium', /^sodium hyaluronate$/], ['acide hyaluronique', /^hyaluronic acid$/],
    ['hyaluronique hydrolysé', /hydrolyzed (sodium )?hyaluron/], ['autre', /hyaluron/]] },
  { id: 'glycolic', fr: 'Acide glycolique', forms: [['glycolic acid', /glycolic acid/]] },
  { id: 'lactic', fr: 'Acide lactique', forms: [['lactic acid', /^lactic acid$/], ['lactobionic acid', /lactobionic/]] },
  { id: 'mandelic', fr: 'Acide mandélique', forms: [['mandelic acid', /mandelic/]] },
  { id: 'salicylic', fr: 'Acide salicylique', forms: [
    ['salicylic acid', /^salicylic acid$/], ['betaine salicylate', /betaine salicylate/], ['capryloyl salicylic acid', /capryloyl salicylic/]] },
  { id: 'pha', fr: 'Gluconolactone (PHA)', forms: [['gluconolactone', /gluconolactone/]] },
  { id: 'azelaic', fr: 'Acide azélaïque', forms: [['azelaic acid', /^azelaic acid$/], ['autre', /azelaic|azeloyl/]] },
  { id: 'ferulic', fr: 'Acide férulique', forms: [['ferulic acid', /ferulic/]] },
  { id: 'vite', fr: 'Vitamine E', maxPos: 20, forms: [['tocopherol', /^(dl-|d-)?tocopherol$/], ['tocopheryl acetate', /tocopheryl acetate/], ['autre', /tocopher/]] },
  { id: 'glutathione', fr: 'Glutathion', forms: [['glutathione', /glutathione/]] },
  { id: 'peptide', fr: 'Peptides', forms: [
    ['cuivre tripeptide', /copper tripeptide/], ['argireline', /acetyl hexapeptide/], ['palmitoyl peptide', /palmitoyl (tri|tetra|penta|hexa|oligo)?peptide/],
    ['autre', /peptide/]] },
  { id: 'pdrn', fr: 'PDRN / NAD', forms: [['sodium dna', /sodium dna|polydeoxyribonucleotide/], ['nad', /nicotinamide adenine|nadh|\bnad\b/]] },
  { id: 'collagen', fr: 'Collagène', forms: [['hydrolyzed collagen', /hydrolyzed collagen/], ['collagen', /collagen/]] },
  { id: 'adenosine', fr: 'Adénosine', maxPos: 25, forms: [['adenosine', /^adenosine$/]] },
  { id: 'panthenol', fr: 'Panthénol (vitamine B5)', maxPos: 25, forms: [['panthenol', /panthenol/]] },
  { id: 'allantoin', fr: 'Allantoïne', maxPos: 25, forms: [['allantoin', /allantoin/]] },
  { id: 'bisabolol', fr: 'Bisabolol', maxPos: 25, forms: [['bisabolol', /bisabolol/]] },
  { id: 'centella', fr: 'Centella asiatica', forms: [
    ['extrait de centella', /centella asiatica/], ['madecassoside', /madecassoside/], ['asiaticoside', /asiaticoside/],
    ['acide asiatique', /asiatic acid/], ['acide madécassique', /madecassic/], ['autre', /centella|houttuynia|heartleaf/]] },
  { id: 'ceramide', fr: 'Céramides', forms: [['ceramides', /ceramide|phytosphingosine/]] },
  { id: 'cholesterol', fr: 'Cholestérol', maxPos: 25, forms: [['cholesterol', /^cholesterol$/]] },
  { id: 'snail', fr: "Mucine d'escargot", forms: [['snail', /snail secretion filtrate/]] },
  { id: 'urea', fr: 'Urée', forms: [['urea', /^urea$/]] },
  { id: 'caffeine', fr: 'Caféine', forms: [['caffeine', /^caffeine$/]] },
  { id: 'resveratrol', fr: 'Resvératrol', forms: [['resveratrol', /resveratrol/]] },
  { id: 'q10', fr: 'Coenzyme Q10', forms: [['ubiquinone', /ubiquinone/]] },
  { id: 'zincpca', fr: 'Zinc PCA', forms: [['zinc pca', /zinc pca/]] },
  { id: 'licorice', fr: 'Réglisse', forms: [['glycyrrhizate', /glycyrrhizate/], ['extrait', /glycyrrhiza glabra/]] }
];

// Nom INCI nettoyé : minuscules, sans parenthèses ni astérisques ni « aqua/ » devant, sans espaces en trop
function canon(x) {
  return String(x || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/[*†]/g, '')
    .replace(/\s+/g, ' ').trim().replace(/\.$/, '');
}

/** Actifs présents dans une liste INCI : [{ id, fr, forms:Set, pos }] (dans l'ordre de la liste). */
function detect(list) {
  const out = new Map();
  (Array.isArray(list) ? list : []).forEach((raw, i) => {
    const n = canon(raw);
    if (!n) return;
    for (const a of ACTIFS) {
      const f = a.forms.find(x => x[1].test(n));
      if (!f) continue;
      if (a.maxPos && i + 1 > a.maxPos) break;           // traces : ne comptent pas
      const e = out.get(a.id) || { id: a.id, fr: a.fr, forms: new Set(), pos: i + 1 };
      e.forms.add(f[0]);
      out.set(a.id, e);
      break;
    }
  });
  return [...out.values()].sort((x, y) => x.pos - y.pos);
}

const withForm = c => c.fr + (c.otherForm ? ' (sous une autre forme)' : '');

/**
 * Comparaison de deux compositions, en noms simples :
 *   common  : actifs présents dans les deux (« … (sous une autre forme) » quand aucune forme n'est partagée)
 *   onlyRef : actifs de ton produit absents de l'autre ; onlyCand : actifs de l'autre en plus
 */
function compare(refList, candList) {
  const A = detect(refList), B = detect(candList);
  const bById = new Map(B.map(x => [x.id, x]));
  const common = [], onlyRef = [];
  A.forEach(a => {
    const b = bById.get(a.id);
    if (!b) { onlyRef.push(a.fr); return; }
    const shared = [...a.forms].some(f => b.forms.has(f));
    common.push({ id: a.id, fr: a.fr, otherForm: !shared, label: withForm({ fr: a.fr, otherForm: !shared }) });
  });
  const aIds = new Set(A.map(x => x.id));
  const onlyCand = B.filter(b => !aIds.has(b.id)).map(b => b.fr);
  return { common, onlyRef, onlyCand };
}

module.exports = { ACTIFS, detect, compare, canon };
