/* scripts/merge-inci-batch23.js — fusion validée par Candice le 2026-10-20 :
   - lot 3 (data/inci-candidates-batch3.json) : les compositions de confiance ÉLEVÉE dont le type de produit
     correspond (garde-fou : eye / mask / pad / spf / set / sérum / crème absents d'un côté → écartées) ;
   - lot 2 (data/inci-candidates-batch2.json) : les « moyenne » validées : m142, m178, m262, m391 ; m301 avec la
     formule BI 699 fournie par Candice ; m129 (La Roche-Posay Rosaliac) REFUSÉE ;
   - contenances validées des dupes du lot 1 (30 ml).
   Ne remplace jamais une composition existante. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const sim = require(path.join(ROOT, 'lib', 'inciSim.js'));
const PROD = path.join(ROOT, 'data', 'products-manual.json');
const raw = fs.readFileSync(PROD, 'utf8'), data = JSON.parse(raw);
const B2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'inci-candidates-batch2.json'), 'utf8'));
const B3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'inci-candidates-batch3.json'), 'utf8'));
const ZW = /[​-‏‪-‮⁠﻿­]/g;
const DATE = '2026-10-20';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const FR2EN = { yeux: 'eye', contour: 'eye', masque: 'mask', liquide: 'liquid', poudre: 'powder', coffret: 'set', creme: 'cream', tonique: 'toner', nettoyant: 'cleanser', baume: 'balm', nuit: 'night', jour: 'day', solaire: 'spf' };
const words = s => norm(s).split(' ').map(w => FR2EN[w] || w);
const TYPE = ['eye', 'mask', 'pad', 'pads', 'sheet', 'cream', 'serum', 'toner', 'cleanser', 'balm', 'gel', 'oil', 'spf', 'night', 'day', 'set'];
function typeMismatch(i) {
  const n = new Set(words(i.brand + ' ' + i.name).concat(/spf\d*/.test(norm(i.name)) ? ['spf'] : []));
  const t = words(i.source.matchedTitle).map(w => /^spf\d*$/.test(w) ? 'spf' : w);
  const extra = TYPE.filter(w => t.includes(w) && !n.has(w)), missing = TYPE.filter(w => n.has(w) && !t.includes(w));
  return extra.filter(w => ['eye', 'mask', 'pad', 'pads', 'sheet', 'spf', 'set', 'night', 'day'].includes(w)).concat(missing.filter(w => ['eye', 'mask', 'spf', 'set', 'serum', 'pad', 'pads'].includes(w))).length > 0;
}

function apply(p, list, meta) {
  list = list.map(x => x.replace(ZW, '').trim()).filter(Boolean);
  const structured = list.map((x, k) => { const c = sim.classify(x); return { inci: x, normalized: sim.canon(x), position: k + 1, family: c.family, function: c.func, isActive: c.isActive }; });
  p.inciRaw = list.join(', '); p.inciNormalized = list.map(x => sim.canon(x)); p.inciStructured = structured;
  p.actives = structured.filter(s => s.isActive && s.family).map(s => s.inci);
  p.inciSourceUrl = meta.url; p.inciLastVerifiedAt = meta.date; p.inciVerificationStatus = 'verified'; p.dupeEligible = true; p.needsReview = false;
  p.inciMatch = { source: meta.source, matchedTitle: meta.title || '', confidence: meta.confidence, phase: meta.phase, note: meta.note || '' };
}

let n3 = 0, n2 = 0;
// lot 3 : élevée + type cohérent
B3.items.filter(i => i.status === 'trouvé' && i.confidence === 'élevée' && i.inci && i.inci.length >= 5 && !typeMismatch(i)).forEach(i => {
  const p = data.products.find(x => x.id === i.id); if (!p || (p.inciNormalized && p.inciNormalized.length)) return;
  apply(p, i.inci, { url: i.source.url, date: i.retrievedAt || DATE, source: i.source.type, title: i.source.matchedTitle, confidence: 'élevée', phase: 'lot3-2026-10-20' }); n3++;
});
// lot 2 : moyennes validées
const OK2 = ['m142', 'm178', 'm262', 'm391'];
B2.items.filter(i => OK2.includes(i.id)).forEach(i => {
  const p = data.products.find(x => x.id === i.id); if (!p || (p.inciNormalized && p.inciNormalized.length)) return;
  apply(p, i.inci, { url: i.source, date: i.retrievedAt || DATE, source: i.sourceType || 'incidecoder', title: i.matchedTitle, confidence: 'moyenne (validée par Candice le 2026-10-20)', phase: 'lot2-moyenne-2026-10-20', note: i.note }); n2++;
});
// m301 : formule BI 699 fournie par Candice (mêmes 29 ingrédients que INCIDecoder)
const BIO = 'Aqua/Water/Eau, Mineral Oil (Paraffinum Liquidum), Glycerin, Tridecyl Trimellitate, Glycol Palmitate, Caprylic/Capric Triglyceride, Canola Oil, Triceteareth-4 Phosphate, Fructooligosaccharides, Mannitol, Xylitol, Rhamnose, Laminaria Ochroleuca Extract, Glycyrrhetinic Acid, Glycine Soja (Soybean) Germ Extract, Allantoin, Ginkgo Biloba Leaf Extract, Camellia Sinensis Leaf Extract, Propylene Glycol, Pentylene Glycol, Caprylyl Glycol, Glycol Stearate, PEG-2 Stearate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, 1,2-Hexanediol, Citric Acid, Xanthan Gum, Disodium EDTA, Sodium Hydroxide'.split(', ');
const p301 = data.products.find(x => x.id === 'm301');
if (p301 && !(p301.inciNormalized && p301.inciNormalized.length)) { apply(p301, BIO, { url: 'https://incidecoder.com/products/bioderma-sensibio-ar-cream', date: DATE, source: 'fournie par Candice (formule BI 699, Sensibio AR 40 ml non teinté), mêmes 29 ingrédients que INCIDecoder', title: 'Bioderma Sensibio AR Soin Anti-Rougeurs 40 ml', confidence: 'élevée', phase: 'lot2-2026-10-20' }); n2++; }

// contenances validées (dupes du lot 1)
const VOL = { m256: [30, 'https://www.skinlovers.com/products/la-roche-posay-pure-vitamin-c-10-serum-30ml'], m139: [30, 'https://www.stylevana.com/en_US/the-ordinary-niacinamide-10-zinc-1-30ml25376.html'], m348: [30, 'https://www.iherb.com/pr/anua-peach-70-niacin-serum-1-01-fl-oz-30-ml/131868'], m393: [30, 'https://www.cultbeauty.com/p/the-ordinary-lactic-acid-10-ha-2-superficial-peeling-formulation-30ml/11363400/'], m402: [30, 'https://www.cultbeauty.com/p/the-ordinary-vitamin-c-suspension-23-ha-spheres-30ml/11363392/'], m253: [30, 'https://lyskin.com/shop/vichy-liftactiv-specialist-b3-anti-dark-spots-serum-30ml/'] };
let nv = 0;
Object.entries(VOL).forEach(([id, [v, url]]) => { const p = data.products.find(x => x.id === id); if (p && p.volumeMl == null) { p.volumeMl = v; p.volumeSource = { url, retrievedAt: DATE, validatedBy: 'Candice 2026-10-20' }; nv++; } });

fs.writeFileSync(PROD, JSON.stringify(data, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
console.log('compositions lot 3 :', n3, '| lot 2 :', n2, '| contenances :', nv);
