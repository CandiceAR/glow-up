/* Renseigne la contenance (volumeMl / netWeightG) des produits de SOIN du catalogue quand elle est ÉCRITE dans leur nom
   (« … Crème Apaisante 50ml »). Rien n'est inventé : on recopie le chiffre du nom, et on garde la trace (volumeFrom: 'nom du produit').
   Ignore les noms ambigus (plusieurs contenances, packs, duos, coffrets, recharges). Idempotent.
   Usage : node scripts/fill-volumes-from-names.js          (liste seulement)
           node scripts/fill-volumes-from-names.js --write  (écrit data/products-manual.json) */
'use strict';
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'products-manual.json');
const raw = fs.readFileSync(file, 'utf8');
const D = JSON.parse(raw);
const MAKEUP = /^(foundation|concealer|corrector|powder|primer|blush|bronzer|highlighter|mascara|eyeliner|eyebrow|eyeshadow|lipstick|lipgloss|lipliner|set|tools|multi_usage)$/;
const AMBIGUOUS = /\b(pack|duo|trio|lot|coffret|kit|recharge|refill|\d+\s*x\s*\d|x\s*\d+\s*(ml|g)\b)/i;

const found = [];
D.products.forEach(p => {
  if (p.active === false || p.discontinued || MAKEUP.test(p.category)) return;
  if (p.volumeMl > 0 || p.netWeightG > 0) return;
  const name = String(p.name || '').replace(',', '.');
  if (AMBIGUOUS.test(name)) return;
  const all = [...name.matchAll(/(\d+(?:\.\d+)?)\s*(ml|cl|l|g|gr)\b/gi)];
  const uniq = [...new Set(all.map(m => m[0].replace(/\s+/g, '').toLowerCase()))];
  if (uniq.length !== 1) return;
  const n = parseFloat(all[0][1]), u = all[0][2].toLowerCase();
  const ml = u === 'ml' ? n : u === 'cl' ? n * 10 : u === 'l' ? n * 1000 : null;
  const g = (u === 'g' || u === 'gr') ? n : null;
  if (!(ml > 0 && ml < 2000) && !(g > 0 && g < 2000)) return;
  found.push({ p, ml, g, txt: all[0][0] });
});

found.forEach(x => console.log(x.p.id.padEnd(6), (x.p.brand + ' | ' + x.p.name).slice(0, 78).padEnd(78), '→', x.ml ? x.ml + ' ml' : x.g + ' g', '  (« ' + x.txt + ' »)'));
console.log('\n' + found.length + ' produit(s) de soin dont la contenance est écrite dans le nom.');

if (process.argv.includes('--write')) {
  found.forEach(x => { if (x.ml) x.p.volumeMl = x.ml; else x.p.netWeightG = x.g; x.p.volumeFrom = 'nom du produit'; });
  const m = /^\{\r?\n( +)"/.exec(raw);
  const indent = m ? m[1].length : 2;
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  let out = JSON.stringify(D, null, indent);
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out + (/\n$/.test(raw) ? eol : ''));
  console.log('Écrit dans data/products-manual.json');
}
