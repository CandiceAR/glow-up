/* Corrige la composition de SkinCeuticals Discoloration Defense (data/reference-inci.json) avec la liste INCI publiée
   par la marque, fournie par Candice le 26/10/2026. Garde l'ancienne liste (INCIDecoder, 13/10/2026) dans « previous ».
   Ajoute les autres écritures du nom (Serum / Sérum) pour que la recherche ouvre toujours CETTE fiche.
   Ne touche à aucune association de dupe (dupeId) ni à aucun produit. Idempotent.   Usage : node scripts/fix-skinceuticals-discoloration.js */
'use strict';
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'reference-inci.json');
const raw = fs.readFileSync(file, 'utf8');
const D = JSON.parse(raw);

const BRAND_LIST = 'Aqua / Water, Butylene Glycol, Niacinamide, Hydroxyethylpiperazine Ethane Sulfonic Acid, Glycerin, Tranexamic Acid, Propylene Glycol, Hydroxyethyl Urea, Kojic Acid, Caprylyl Glycol, Allantoin, Chlorphenesin, Xanthan Gum, Disodium EDTA';
const INCI = BRAND_LIST.split(',').map(x => x.trim().replace(/^Aqua \/ Water$/, 'Aqua/Water'));

const r = D.refs.find(x => x.key === 'skinceuticals-discoloration-defense');
if (!r) { console.error('Fiche introuvable'); process.exit(1); }
if (r.inciRaw === BRAND_LIST) { console.log('Déjà à jour.'); process.exit(0); }

r.previous = { inci: r.inci, inciRaw: r.inciRaw, source: r.source, retrievedAt: r.retrievedAt,
  note: "Ancienne liste relevée sur INCIDecoder le 13/10/2026 (contenait Phenoxyethanol, sans Kojic Acid) : remplacée par la liste publiée par la marque." };
r.inci = INCI;
r.inciRaw = BRAND_LIST;
r.source = { type: 'brand', url: '', productTitle: 'SkinCeuticals Discoloration Defense',
  note: "Liste d'ingrédients publiée par la marque, fournie par Candice le 26/10/2026." };
r.retrievedAt = '2026-10-26';
r.aliases = Array.from(new Set((r.aliases || []).concat(['Discoloration Defense Serum', 'Discoloration Defense Sérum'])));

const m = /^\{\r?\n( +)"/.exec(raw);
const indent = m ? m[1].length : 2;
const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
let out = JSON.stringify(D, null, indent);
if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
fs.writeFileSync(file, out + (/\n$/.test(raw) ? eol : ''));
console.log('Composition corrigée :', INCI.length, 'ingrédients. Source : liste publiée par la marque, fournie par Candice le 26/10/2026.');
