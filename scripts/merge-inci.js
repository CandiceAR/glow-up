/* ============================================================
   scripts/merge-inci.js — PHASE 2 : fusionne dans data/products-manual.json les compositions
   de data/inci-candidates.json de confiance ÉLEVÉE, avec leur source et leur date.
   - les confiances « moyenne » / « faible » restent de côté ;
   - rejets explicites (REJECT) : écartés du fichier de candidats (status « rejeté ») ;
   - garde-fou « autre produit » (HOLD) : si le titre trouvé contient un mot qui change la nature du produit
     (eye, mask, sheet, set, spf, liquid, powder, kit, travel, mini…) absent du nom du catalogue, la
     composition n'est PAS fusionnée (elle reste dans le fichier de candidats, statut « à vérifier »).
   Usage : node scripts/merge-inci.js [--dry]
   ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CAND = path.join(ROOT, 'data', 'inci-candidates.json');
const PROD = path.join(ROOT, 'data', 'products-manual.json');
const sim = require(path.join(ROOT, 'lib', 'inciSim.js'));
const DRY = process.argv.includes('--dry');

const REJECT = { 'KIKO MILANO – 03': null };           // décision de Candice : rapprochement trop incertain (nom « 03 »)
const RISK = ['eye', 'mask', 'sheet', 'set', 'spf', 'liquid', 'powder', 'kit', 'travel', 'mini', 'stick', 'pencil', 'refill'];
const FR2EN = { yeux: 'eye', contour: 'eye', masque: 'mask', liquide: 'liquid', poudre: 'powder', coffret: 'set' };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s => norm(s).split(' ').map(w => FR2EN[w] || w);

function holdReason(item) {
  const nameW = words(item.brand + ' ' + item.name).join(' ');
  const titleW = words(item.source.matchedTitle);
  const extra = RISK.filter(w => titleW.some(t => t === w || (w === 'spf' && /^spf\d*$/.test(t))) && !new RegExp('(^| )' + w + '( |\\d|$)').test(nameW));
  return extra.length ? 'le titre trouvé contient « ' + extra.join(', ') + ' » absent du nom du catalogue' : null;
}

const cand = JSON.parse(fs.readFileSync(CAND, 'utf8'));
const raw = fs.readFileSync(PROD, 'utf8');
const data = JSON.parse(raw);
const byId = new Map(data.products.map(p => [p.id, p]));

// 1) rejet explicite
cand.items.forEach(i => {
  if ((i.brand + ' ' + i.name).toUpperCase().includes('KIKO') && /^\s*03\s*$/.test(i.name)) { i.status = 'rejeté'; i.rejectReason = 'rapprochement trop incertain (nom « 03 »), décision de Candice'; }
});

const merged = [], held = [];
cand.items.filter(i => ['trouvé', 'fusionné', 'à vérifier'].includes(i.status) && i.confidence === 'élevée').forEach(i => {
  const p = byId.get(i.id);
  if (!p) return;
  if (p.inciNormalized && p.inciNormalized.length) return;          // ne jamais écraser une composition existante
  const why = holdReason(i);
  if (why) { held.push({ id: i.id, name: i.brand + ' | ' + i.name, title: i.source.matchedTitle, why }); i.status = 'à vérifier'; i.holdReason = why; return; }
  const list = i.inci.map(x => x.replace(/[​-‏‪-‮⁠﻿­]/g, '').trim()).filter(Boolean);
  const structured = list.map((x, k) => { const c = sim.classify(x); return { inci: x, normalized: sim.canon(x), position: k + 1, family: c.family, function: c.func, isActive: c.isActive }; });
  p.inciRaw = i.inciRaw;
  p.inciNormalized = list.map(x => sim.canon(x));
  p.inciStructured = structured;
  p.actives = structured.filter(s => s.isActive && s.family).map(s => s.inci);
  p.inciSourceUrl = i.source.url;
  p.inciLastVerifiedAt = i.retrievedAt;
  p.inciVerificationStatus = 'verified';
  p.dupeEligible = true;
  p.needsReview = false;
  p.inciMatch = { source: i.source.type, matchedTitle: i.source.matchedTitle, matchScore: i.matchScore, confidence: i.confidence, phase: 'phase2-2026-10' };
  i.status = 'fusionné';
  merged.push(i.id);
});

console.log('fusionnés :', merged.length, '| retenus pour vérification (pas fusionnés) :', held.length);
held.forEach(h => console.log('  - ' + h.id + ' | ' + h.name + '  ⇢  ' + h.title + '  [' + h.why + ']'));
if (!DRY) {
  // même mise en forme que le fichier d'origine
  const indent = /^\{\n\s{2}"/.test(raw) ? 2 : (/^\{\n\s{1}"/.test(raw) ? 1 : 2);
  fs.writeFileSync(PROD, JSON.stringify(data, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
  fs.writeFileSync(CAND, JSON.stringify(cand, null, 1));
  console.log('écrit :', PROD);
}
