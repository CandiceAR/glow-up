/* Enregistre des listes INCI OFFICIELLES (recopiées par Candice depuis le site de la marque, le 2026-11-02) :
     • Sisley Sisleÿa L'Intégral Anti-Âge Crème Contour des Yeux et des Lèvres → nouvelle fiche dans data/reference-inci.json
     • Clarins Total Eye Lift (m445) → remplace la liste relevée sur INCIDecoder le 2026-10-20 (formule différente)
   Jamais complétée de mémoire : uniquement le texte ci-dessous. Rejouable sans doublon.
   Usage : node scripts/set-official-inci.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const sim = require(path.join(ROOT, 'lib', 'inciSim.js'));
const DATE = '2026-11-02';

const SISLEY = `AQUA/WATER/EAU, GLYCERIN, BUTYROSPERMUM PARKII (SHEA) BUTTER, GLYCERYL MYRISTATE, COCO-CAPRYLATE/CAPRATE, HYDROGENATED POLYISOBUTENE, POTASSIUM CETYL PHOSPHATE, CITRUS AURANTIUM AMARA (BITTER ORANGE) FLOWER WATER, ROSA CENTIFOLIA FLOWER WATER, STEARYL ALCOHOL, CETEARYL ALCOHOL, ISOPROPYL PALMITATE, PANTHENOL, TOCOPHERYL ACETATE, CAFFEINE, CEDRUS ATLANTICA OIL/EXTRACT, AVENA SATIVA (OAT) KERNEL EXTRACT, HYDROLYZED SOY PROTEIN, BISABOLOL, SACCHARIDE HYDROLYSATE, ADENOSINE, ALBIZIA JULIBRISSIN BARK EXTRACT, PUNICA GRANATUM FRUIT EXTRACT, PASSIFLORA EDULIS FRUIT EXTRACT, HYDROLYZED YEAST PROTEIN, HYDROXYETHYL ACRYLATE/SODIUM ACRYLOYLDIMETHYL TAURATE COPOLYMER, CETEARETH-33, PENTYLENE GLYCOL, BUTYLENE GLYCOL, CARBOMER, ETHYLHEXYLGLYCERIN, DISODIUM EDTA, SODIUM HYDROXIDE, POLYSORBATE 60, SORBITAN ISOSTEARATE, CITRIC ACID, GLYCINE SOJA (SOYBEAN) OIL, PHENOXYETHANOL, SODIUM BENZOATE, POTASSIUM SORBATE, TOCOPHEROL`;
const CLARINS = `AQUA/WATER/EAU. CAPRYLIC/CAPRIC TRIGLYCERIDE. PROPANEDIOL. CETEARYL ALCOHOL. BUTYROSPERMUM PARKII (SHEA) BUTTER. HYDROGENATED COCO-GLYCERIDES. PENTYLENE GLYCOL. PANTHENOL. GLYCERIN. GLYCERYL STEARATE. PEG-100 STEARATE. CETEARYL GLUCOSIDE. CAFFEINE. STEARETH-21. HYDROXYACETOPHENONE. DIMETHICONE. CHLORPHENESIN. AVENA SATIVA (OAT) KERNEL EXTRACT. CARBOMER. ETHYLHEXYLGLYCERIN. PVP. TOCOPHERYL ACETATE. CI 77891/TITANIUM DIOXIDE. SYNTHETIC FLUORPHLOGOPITE. DISODIUM EDTA. ESCIN. PARFUM/FRAGRANCE. BUTYLENE GLYCOL. SODIUM HYDROXIDE. DIMETHICONOL. PHENETHYL ALCOHOL. CITRIC ACID. HARUNGANA MADAGASCARIENSIS EXTRACT. MARRUBIUM VULGARE EXTRACT. SODIUM BENZOATE. FURCELLARIA LUMBRICALIS EXTRACT. SODIUM CARRAGEENAN. JANIA RUBENS EXTRACT. TIN OXIDE. MARIS SAL/SEA SALT/SEL MARIN. ACETYL TETRAPEPTIDE-2. DEXTRAN`;

const KEEP_UP = new Set(['EDTA', 'PEG', 'CI', 'BHT', 'PVP']);
const titleWord = w => KEEP_UP.has(w) ? w : (/^[A-Z]/.test(w) ? w[0] + w.slice(1).toLowerCase() : w);
// « AQUA/WATER/EAU » → « Aqua/Water/Eau » ; « (SHEA) » → « (Shea) » ; « PEG-100 » → « PEG-100 »
const pretty = s => s.replace(/[A-Z][A-Z0-9]*/g, titleWord);
const parse = (txt, sep) => txt.split(sep).map(x => x.trim()).filter(Boolean).map(pretty);

// Réécrit un fichier JSON en gardant SA mise en forme (indentation, fins de ligne, saut de ligne final) : la différence reste minime
function saveLike(file, raw, obj) {
  const lead = (raw.split(/\r?\n/)[1] || '').match(/^ */)[0].length || 2;
  let out = JSON.stringify(obj, null, lead);
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  if (/\n$/.test(raw)) out += raw.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(file, out);
}

function structure(list) {
  const A = sim.analyze(list);
  return {
    inciNormalized: list.map(sim.canon),
    inciStructured: A.items.map(i => ({ inci: list[i.position - 1], normalized: i.name, position: i.position, family: i.family, function: i.func, isActive: !!i.isActive })),
    actives: A.items.filter(i => i.isActive).map(i => list[i.position - 1])
  };
}

// ── Sisley : nouvelle fiche de référence (la recherche de dupe l'utilise avant toute recherche sur le web) ──
const fRef = path.join(ROOT, 'data', 'reference-inci.json');
const refRaw = fs.readFileSync(fRef, 'utf8');
const refsFile = JSON.parse(refRaw);
const sisList = parse(SISLEY, ',');
const sisley = {
  key: 'sisley-sisleya-l-integral-yeux-levres',
  hero: { brand: 'Sisley', name: "Sisleÿa L'Intégral Anti-Âge Crème Contour des Yeux et des Lèvres", price: 173, volumeMl: 15 },
  aliases: ["Sisleÿa L'Intégral Yeux et Lèvres", "Sisleya L'Intégral Yeux et Lèvres", "Sisleÿa L'Intégral Anti-Âge Contour des Yeux et des Lèvres", "Sisleÿa L'Intégral Crème Contour des Yeux et des Lèvres"],
  inci: sisList, inciRaw: sisList.join(', '),
  source: { type: 'official', url: '', productTitle: "Sisleÿa L'Intégral Anti-Âge Crème Contour des Yeux et des Lèvres",
    note: "Liste officielle recopiée depuis le site de la marque par Candice Arav le " + DATE + " (rubrique « Les ingrédients »). La marque précise que ses listes sont régulièrement mises à jour." },
  retrievedAt: DATE
};
const i = refsFile.refs.findIndex(r => r.key === sisley.key);
if (i >= 0) refsFile.refs[i] = sisley; else refsFile.refs.push(sisley);
saveLike(fRef, refRaw, refsFile);
console.log('Sisley :', sisList.length, 'ingrédients ; caféine en position', sisList.findIndex(x => /^Caffeine$/i.test(x)) + 1);

// ── Clarins Total Eye Lift (m445) : liste officielle ──
const fCat = path.join(ROOT, 'data', 'products-manual.json');
const raw = fs.readFileSync(fCat, 'utf8');
const cat = JSON.parse(raw);
const arr = Array.isArray(cat) ? cat : cat.products;
const p = arr.find(x => x.id === 'm445');
if (!p) throw new Error('m445 introuvable');
const clList = parse(CLARINS, '.').map(x => x.replace(/\s+$/, ''));
const st = structure(clList);
const before = (p.inciNormalized || []).length;
p.inciRaw = clList.join(', ');
p.inciNormalized = st.inciNormalized; p.inciStructured = st.inciStructured; p.actives = st.actives;
p.inciSourceKind = 'official'; p.inciSourceUrl = ''; p.inciLastVerifiedAt = DATE; p.inciVerificationStatus = 'verified';
p.inciMatch = { source: 'official', matchedTitle: 'Clarins Total Eye Lift', confidence: 'élevée', phase: 'officiel-' + DATE,
  note: "Liste officielle (rubrique « Composition » du site Clarins, code V4480A) recopiée par Candice Arav le " + DATE + ". Remplace la liste INCIDecoder du 2026-10-20 (" + before + " ingrédients, formule différente)." };
saveLike(fCat, raw, cat);
console.log('Clarins m445 :', before, '→', clList.length, 'ingrédients ; actifs :', st.actives.join(', '));
