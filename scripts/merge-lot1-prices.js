/* ============================================================
   scripts/merge-lot1-prices.js — Met dans le catalogue les prix VÉRIFIÉS du lot 1 (data/dupes-lot1.json),
   avec leur revendeur, leur adresse et leur date de relevé. Un « dupe fiable » ou « dupe similaire » ne repose
   que sur un prix ainsi sourcé et daté (voir api/dupeMatch.js).
   Champs ajoutés à un produit :  priceVerified: true · priceSource: { name, url } · priceRetrievedAt · priceNote
   Aucun prix n'est inventé : tout vient du fichier du lot 1 (relevé et validé par Candice le 20/10/2026).
   Écrit aussi, pour les références du lot 1 qui ne sont PAS dans le catalogue, un prix vérifié dans
   data/reference-inci.json (champ « verified »), repris automatiquement par la recherche de dupe.
   Usage : node scripts/merge-lot1-prices.js   (relançable sans risque)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Produits retirés de la vente (ils ne sont plus proposés comme dupes) — signalés par Candice
const DISCONTINUED = [
  { id: 'm256', note: 'La Roche-Posay Pure Vitamin C10 n\'est plus vendu.', reportedAt: '2026-10-23', source: 'signalé par Candice' }
];
// Références du lot 1 qui existent aussi dans le catalogue (clé de la fiche → identifiant), vérifiées une à une :
// m257 = Paula's Choice 10% Niacinamide Booster. (m428 « Discoloration Correcting Serum » est un AUTRE produit : Good Molecules.)
const REF_IN_CATALOGUE = { 'paula-s-choice-10-niacinamide-booster': 'm257' };

function splitSource(name) {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(name || '');
  return m ? { name: m[1].trim(), note: m[2].trim() } : { name: String(name || '').trim(), note: '' };
}
function priceMeta(p) {
  if (!p || !(p.value > 0) || !p.source || !p.source.name || !p.retrievedAt) return null;
  const s = splitSource(p.source.name);
  return { value: p.value, source: { name: s.name, url: p.source.url || '' }, retrievedAt: p.retrievedAt, note: s.note };
}

const lot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dupes-lot1.json'), 'utf8'));
const fProducts = path.join(ROOT, 'data', 'products-manual.json');
const rawP = fs.readFileSync(fProducts, 'utf8');
const D = JSON.parse(rawP);
const fRefs = path.join(ROOT, 'data', 'reference-inci.json');
const rawR = fs.readFileSync(fRefs, 'utf8');
const R = JSON.parse(rawR);

const report = [];
function applyPrice(prod, meta, label) {
  const before = prod.price;
  prod.price = meta.value;
  prod.priceVerified = true;
  prod.priceSource = meta.source;
  prod.priceRetrievedAt = meta.retrievedAt;
  if (meta.note) prod.priceNote = meta.note; else delete prod.priceNote;
  delete prod._priceIndicatif; delete prod.priceIsIndicative;
  report.push(`${prod.id.padEnd(5)} ${String(prod.name).slice(0, 42).padEnd(43)} ${String(before).padStart(6)} € → ${meta.value} € · ${meta.source.name} · ${meta.retrievedAt}${meta.note ? ' · ' + meta.note : ''}  (${label})`);
}

lot.pairs.forEach(pair => {
  // 1) le dupe
  const dupe = D.products.find(p => p.id === pair.dupeId);
  const dm = priceMeta(pair.dupe && pair.dupe.price);
  if (dupe && dm) applyPrice(dupe, dm, 'dupe de ' + pair.refShort);
  // 2) la référence, si elle est dans le catalogue
  const refId = REF_IN_CATALOGUE[pair.refKey];
  const rm = priceMeta(pair.ref && pair.ref.price);
  if (refId && rm) applyPrice(D.products.find(p => p.id === refId), rm, 'référence');
  // 3) la référence : prix vérifié dans sa fiche de référence (qu'elle soit ou non dans le catalogue)
  const ref = R.refs.find(r => r.key === pair.refKey);
  if (ref && rm) {
    ref.verified = { price: rm.value, currency: 'EUR', volumeMl: (pair.ref && pair.ref.volumeMl) || (ref.hero && ref.hero.volumeMl) || null,
      priceSource: rm.source, priceRetrievedAt: rm.retrievedAt, priceNote: rm.note || '' };
    report.push(`ref   ${String(ref.hero.name).slice(0, 42).padEnd(43)} ${rm.value} € · ${rm.source.name} · ${rm.retrievedAt}${rm.note ? ' · ' + rm.note : ''}  (fiche de référence)`);
  }
});

DISCONTINUED.forEach(d => {
  const p = D.products.find(x => x.id === d.id);
  if (!p) return;
  p.discontinued = true;
  p.discontinuedNote = d.note;
  p.discontinuedReportedAt = d.reportedAt;
  p.discontinuedSource = d.source;
  report.push(`${p.id.padEnd(5)} ${String(p.name).slice(0, 42).padEnd(43)} PLUS VENDU (${d.source}, ${d.reportedAt})`);
});

// On réécrit chaque fichier avec SA mise en forme d'origine (indentation et fins de ligne), pour ne modifier que les lignes concernées
function save(file, raw, data) {
  const m = /^\{\r?\n( +)"/.exec(raw);
  const indent = m ? m[1].length : 2;
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  let out = JSON.stringify(data, null, indent);
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out + (/\n$/.test(raw) ? eol : ''));
}
save(fProducts, rawP, D);
save(fRefs, rawR, R);
console.log(report.join('\n'));
console.log('\n' + report.length + ' mise(s) à jour. Produits avec prix vérifié :', D.products.filter(p => p.priceVerified).length);
