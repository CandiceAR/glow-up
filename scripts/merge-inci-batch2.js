/* scripts/merge-inci-batch2.js — fusionne dans data/products-manual.json les compositions du lot 2
   (data/inci-candidates-batch2.json) de confiance ÉLEVÉE, validées par Candice le 2026-10-20.
   Les confiances « moyenne » / « faible » restent de côté. Ne remplace jamais une composition existante. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const sim = require(path.join(ROOT, 'lib', 'inciSim.js'));
const PROD = path.join(ROOT, 'data', 'products-manual.json'), B2 = path.join(ROOT, 'data', 'inci-candidates-batch2.json');
const raw = fs.readFileSync(PROD, 'utf8'), data = JSON.parse(raw), b2 = JSON.parse(fs.readFileSync(B2, 'utf8'));
const ZW = /[​-‏‪-‮⁠﻿­]/g;
let n = 0;
b2.items.forEach(i => {
  if (!/^élevée/.test(i.confidence || '') || !i.inci || i.inci.length < 5) return;
  const p = data.products.find(x => x.id === i.id); if (!p || (p.inciNormalized && p.inciNormalized.length)) return;
  const list = i.inci.map(x => x.replace(ZW, '').trim()).filter(Boolean);
  const structured = list.map((x, k) => { const c = sim.classify(x); return { inci: x, normalized: sim.canon(x), position: k + 1, family: c.family, function: c.func, isActive: c.isActive }; });
  p.inciRaw = list.join(', '); p.inciNormalized = list.map(x => sim.canon(x)); p.inciStructured = structured;
  p.actives = structured.filter(s => s.isActive && s.family).map(s => s.inci);
  p.inciSourceUrl = i.source; p.inciLastVerifiedAt = i.retrievedAt; p.inciVerificationStatus = 'verified'; p.dupeEligible = true; p.needsReview = false;
  p.inciMatch = { source: i.sourceType || 'incidecoder', matchedTitle: i.matchedTitle || '', confidence: 'élevée', phase: 'lot2-2026-10-20' };
  i.merged = true; n++;
});
fs.writeFileSync(PROD, JSON.stringify(data, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
fs.writeFileSync(B2, JSON.stringify(b2, null, 1));
console.log('fusionnés :', n);
