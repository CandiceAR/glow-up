/* Ajoute au catalogue (data/products-manual.json) les patchs pour les yeux validés par Candice.
   Compositions recopiées telles quelles depuis la page citée (inciSourceUrl), relevées le 26/10/2026.
   Prix en euros : seulement quand une page française le donne (priceVerified + revendeur + date). Sinon pas de prix :
   l'appli le relève toute seule chez un revendeur au moment de la recherche.
   Idempotent (clé = marque + nom). Ne modifie ni ne supprime aucun produit existant.
   Usage : node scripts/add-eye-patches.js          (liste seulement)
           node scripts/add-eye-patches.js --write  (écrit le catalogue) */
'use strict';
const fs = require('fs'), path = require('path');
const { splitInci } = require('../lib/inciLookup.js');
const file = path.join(__dirname, '..', 'data', 'products-manual.json');
const raw = fs.readFileSync(file, 'utf8');
const D = JSON.parse(raw);
const DATE = '2026-10-26';

const PATCHS = [
  { brand: 'Yepoda', name: 'Yepoda The Depuff Eyespresso Patchs Décongestionnants', patchCount: 60,
    description: "Patchs hydrogel à poser 10 à 15 minutes sous les yeux. Utiles contre les poches gonflées et le regard fatigué : la caféine et le thé vert décongestionnent.",
    concernTags: ['poches', 'yeux'], ingredientTags: ['cafeine', 'allantoin'],
    src: 'https://yepoda.fr/products/the-depuff-eyespresso',
    price: { value: 29, name: 'Yepoda', url: 'https://yepoda.fr/products/the-depuff-eyespresso', note: '60 patchs (30 paires)' },
    inci: 'Aqua (Eau), Glycerin, Carrageenan (Algue), Caffeine, Camellia Sinensis (Extrait de Feuille de Thé Vert), Ceratonia Siliqua (Gomme de Caroube), Cucumis Sativus (Extrait de Fruit de Concombre), Dipotassium Glycyrrhizate (Réglisse), Allantoin, Aloe Barbadensis (Polysaccharides de Feuille d\'Aloe Vera), Tocopherol (Vitamine E), Calcium Chloride, Cyamopsis Tetragonoloba (Gomme de Guar), Sucrose, Calendula Officinalis (Extrait de Fleur de Souci), Chondrus Crispus (Poudre d\'Algue Rouge), Polyglyceryl-10 Laurate, Propanediol, Caprylyl Glycol, Cellulose Gum, Potassium Chloride, Ethyl Hexanediol, Ethylhexylglycerin, Pentylene Glycol, Butylene Glycol, 1,2-Hexanediol, Octanediol, Hydroxyacetophenone, CI 77288 (Oxyde de Chrome Vert)' },
  { brand: 'Pixi', name: 'Pixi DetoxifEYE Patchs Yeux Décongestionnants', patchCount: 60,
    description: "Patchs hydrogel à poser 10 minutes. Pour dégonfler les poches et rafraîchir le regard (caféine, concombre), avec de l'acide hyaluronique pour hydrater.",
    concernTags: ['poches', 'yeux'], ingredientTags: ['cafeine', 'hyaluronique', 'niacinamide'],
    src: 'https://ulta.com/p/detoxifeye-depuffing-eye-patches-pimprod2013437',
    inci: 'Aqua/Water/Eau, Glycerin, Carrageenan, Cocos Nucifera (Coconut) Fruit Extract, Pinus Sylvestris Leaf Extract, Caffeine, Gold (CI 77480), Cucumis Sativus (Cucumber) Fruit Extract, Rubus Idaeus (Raspberry) Fruit Extract, Rubus Coreanus Fruit Extract, Vaccinium Angustifolium (Blueberry) Fruit Extract, Ribes Nigrum (Black Currant) Leaf Extract, Euterpe Oleracea Fruit Extract, Camellia Sinensis Leaf Extract, Chamomilla Recutita (Matricaria) Flower Extract, Camellia Japonica Flower Extract, Arnica Montana Flower Extract, Aloe Barbadensis Leaf Extract, Ricinus Communis (Castor) Seed Oil, Sodium Hyaluronate, Ethylhexylglycerin, Cellulose Gum, Cyamopsis Tetragonoloba (Guar) Gum, Allantoin, Calcium Chloride, Propanediol, Polyglyceryl-10 Laurate, Niacinamide, Calcium Lactate, Potassium Chloride, Ceratonia Siliqua (Carob) Gum, Maltodextrin, Sucrose, Mica, Dipotassium Glycyrrhizate, Tin Oxide, CI 77491, Titanium Dioxide, Arginine, Butylene Glycol, Pentylene Glycol, Ethyl Hexanediol, 1,2-Hexanediol, Chlorphenesin, Disodium EDTA' },
  { brand: 'Medicube', name: 'Medicube PDRN Pink Caffeine Collagen Eye Patch', patchCount: 60,
    description: "Patchs hydrogel anti-fatigue et anti-âge. Pour les poches (caféine), les ridules et la peau fine sous les yeux (collagène, peptides, rétinol, PDRN).",
    concernTags: ['poches', 'rides', 'yeux'], ingredientTags: ['sodiumdna', 'cafeine', 'collagene', 'retinol', 'peptides', 'niacinamide'],
    src: 'https://medicube.us/products/pdrn-caffeine-collagen-eye-patch',
    inci: 'WATER, GLYCERIN, NIACINAMIDE, CHONDRUS CRISPUS POWDER, 1,2-HEXANEDIOL, CERATONIA SILIQUA (CAROB) GUM, CYAMOPSIS TETRAGONOLOBA (GUAR) GUM, HYDROXYACETOPHENONE, CHONDRUS CRISPUS, ALLANTOIN, CALCIUM CHLORIDE, BUTYLENE GLYCOL, POTASSIUM CHLORIDE, POLYGLYCERYL-10 LAURATE, PROPANEDIOL, TREHALOSE, CELLULOSE GUM, SUCROSE, ADENOSINE, ETHYLHEXYLGLYCERIN, DIPOTASSIUM GLYCYRRHIZATE, CAFFEINE, PANTHENOL, CYANOCOBALAMIN, SQUALANE, GLYCINE SOJA (SOYBEAN) OIL, ATELOCOLLAGEN, DESAMIDO COLLAGEN, HYDROLYZED COLLAGEN, CENTELLA ASIATICA EXTRACT, DIMETHYLSILANOL HYALURONATE, HYDROLYZED HYALURONIC ACID, HYDROLYZED SODIUM HYALURONATE, TOCOPHEROL, SOLUBLE COLLAGEN, HOUTTUYNIA CORDATA EXTRACT, HYALURONIC ACID, POTASSIUM HYALURONATE, RETINOL, SODIUM HYALURONATE, HYDROXYPROPYLTRIMONIUM HYALURONATE, SODIUM HYALURONATE CROSSPOLYMER, CAPRYLIC/CAPRIC TRIGLYCERIDE, COLLAGEN, COLLAGEN AMINO ACIDS, SODIUM HYALURONATE DIMETHYLSILANOL, SODIUM ACETYLATED HYALURONATE, PHOSPHATIDYLCHOLINE, CENTELLA ASIATICA LEAF EXTRACT, PROCOLLAGEN, SODIUM DNA, CERAMIDE NP, ACETYL HEXAPEPTIDE-8, ASCORBIC ACID POLYPEPTIDE, GLYCINE, GLUTAMIC ACID, SERINE, ALANINE, LYSINE, ARGININE, PROLINE, THREONINE, ACETYL OCTAPEPTIDE-3, ACETYL TETRAPEPTIDE-2, ACETYL TETRAPEPTIDE-3, ACETYL TETRAPEPTIDE-5, ACETYL TETRAPEPTIDE-9, CARNOSINE, COPPER TRIPEPTIDE-1, NONAPEPTIDE-1, PALMITOYL PENTAPEPTIDE-4, PALMITOYL TRIPEPTIDE-1, PALMITOYL TRIPEPTIDE-5' },
  { brand: 'COSRX', name: 'COSRX The Peptide Collagen Hydrogel Eye Patch', patchCount: 60,
    description: "Patchs hydrogel pour les ridules et la peau qui se relâche sous les yeux : peptides et collagène, avec de la caféine contre les poches.",
    concernTags: ['rides', 'poches', 'yeux'], ingredientTags: ['peptides', 'collagene', 'cafeine', 'niacinamide', 'hyaluronique'],
    src: 'https://www.skincupid.us/products/cosrx-the-peptide-collagen-hydrogel-eye-patch-60-patches',
    inci: 'Water, Dipropylene Glycol, Glycerin, Niacinamide, Ceratonia Siliqua (Carob) Gum, Chondrus Crispus Powder, Chondrus Crispus, Cellulose Gum, Hydroxyacetophenone, Algin, Caprylyl Glycol, Potassium Chloride, Betaine, Panthenol, Sucrose, Ethylhexylglycerin, Sodium Polyacrylate, Polyglyceryl-10 Laurate, Adenosine, Polyglyceryl-10 Myristate, Maltodextrin, Caffeine, Collagen, Butylene Glycol, Cyanocobalamin, 1,2-Hexanediol, Sodium Hyaluronate, Dipotassium Glycyrrhizate, Pantolactone, Pentylene Glycol, Acetyl Hexapeptide-8, Dunaliella Salina Extract, sh-Polypeptide-121, Palmitoyl Tripeptide-5, Hydrolyzed Hyaluronic Acid, Hyaluronic Acid, Potassium Hyaluronate, Hydrolyzed Sodium Hyaluronate, Acetyl Tetrapeptide-5, Citric Acid, Disodium EDTA' },
  { brand: 'Terez & Honor', name: 'Terez & Honor Vitamin C Niacinamide Tranexamic Acid Eye Gel Patch', patchCount: 60,
    description: "Patchs hydrogel pour les cernes foncés et le teint terne sous les yeux : vitamine C, acide tranexamique et niacinamide éclaircissent ; la caféine aide contre les poches.",
    concernTags: ['cernes', 'eclat', 'poches', 'yeux'], ingredientTags: ['vitaminec', 'tranexamicacid', 'niacinamide', 'cafeine', 'hyaluronique', 'ceramides'],
    src: 'https://terezandhonor.com/products/vitamin-c-niacinamide-eye-gel-patch',
    inci: 'Water, Glycerin, Niacinamide, Calcium Chloride, Butyrospermum Parkii Butter, Butylene Glycol, 1,2-Hexanediol, Glucomannan, Ceramide NP, Sodium Hyaluronate, Potassium Hyaluronate, Glutathione, Dimethylsilanol Hyaluronate, Sodium Acetylated Hyaluronate, Sodium Hyaluronate Crosspolymer, Squalane, Ascorbic Acid, Citrus Junos Fruit Extract, Tranexamic Acid, Citrus Limon Fruit Extract, Acetyl Hexapeptide-8, Hydroxypropyltrimonium Hyaluronate, Hydrolyzed Sodium Hyaluronate, Hydrolyzed Hyaluronic Acid, Hyaluronic Acid, Caffeine, Chondrus Crispus Powder, PEG-60 Hydrogenated Castor Oil, Hydroxyacetophenone, Pentylene Glycol, Ceratonia Siliqua Gum, Xanthan Gum, Allantoin, Ethylhexylglycerin, Gardenia Florida Fruit Extract, Dextrin, Hippophae Rhamnoides Water, Hydroxyethylcellulose, Adenosine, Disodium EDTA, Caprylic/Capric Triglyceride, Citrus Aurantium Bergamia Fruit Oil, Hydrogenated Lecithin' },
  { brand: 'Terez & Honor', name: 'Terez & Honor 24K Gold Retinol Eye Patches', patchCount: 60,
    description: "Patchs hydrogel pour les ridules, les cernes et les poches : le rétinol, le collagène et les peptides lissent, la caféine dégonfle. Contient du rétinol.",
    concernTags: ['rides', 'cernes', 'poches', 'yeux'], ingredientTags: ['retinol', 'collagene', 'peptides', 'cafeine', 'niacinamide'],
    src: 'https://terezandhonor.com/products/24k-gold-retinol-under-eye-patches',
    inci: 'Water/Aqua, Glycerin, Niacinamide, Calcium Chloride, 1,2-Hexanediol, Ethyl Hexanediol, Glucomannan, Chondrus Crispus Powder, Hydroxyacetophenone, Pentylene Glycol, Ceratonia Siliqua Gum, Xanthan Gum, PEG-60 Hydrogenated Castor Oil, Ethylhexylglycerin, Synthetic Fluorphlogopite, CI 77891, Caffeine, Hydroxyethylcellulose, Adenosine, Butylene Glycol, Dextrin, Disodium EDTA, CI 77491, Tin Oxide, Chamomilla Recutita Flower Extract, Centella Asiatica Extract, Sodium Hyaluronate, Glycyrrhiza Glabra Root Extract, Hydrolyzed Collagen, Dipropylene Glycol, Diisopropyl Sebacate, Gold, Sorbeth-30 Tetraoleate, Tocophersolan, Retinol, Tocopheryl Acetate, Copper Tripeptide-1, Dimethylmethoxy Chromanol, Acetyl Tetrapeptide-5, Palmitoyl Tripeptide-1, Palmitoyl Tripeptide-5, Palmitoyl Pentapeptide-4, Hexapeptide-3, 4-t-Butylcyclohexanol, Bisabolol' },
  { brand: 'Terez & Honor', name: 'Terez & Honor Caffeine Hyaluronic Acid Eye Gel Patch', patchCount: 60,
    description: "Patchs hydrogel pour les poches gonflées et le regard fatigué : la caféine dégonfle, l'acide hyaluronique et la niacinamide hydratent et illuminent.",
    concernTags: ['poches', 'cernes', 'yeux'], ingredientTags: ['cafeine', 'hyaluronique', 'niacinamide', 'adenosine'],
    src: 'https://terezandhonor.com/products/caffeine-hyaluronic-acid-eye-gel-patch',
    inci: 'Water, Glycerin, Niacinamide, Caffeine, Sodium Hyaluronate, Adenosine, Calcium Chloride, Glucomannan, Butylene Glycol, 1,2-Hexanediol, Chondrus Crispus Powder, PEG-60 Hydrogenated Castor Oil, Butyrospermum Parkii Butter, Pentylene Glycol, Ceratonia Siliqua Gum, Xanthan Gum, Glyceryl Caprylate, Ethylhexylglycerin, Dextrin, Hydroxyethylcellulose, Disodium EDTA, Gardenia Florida Fruit Extract, Sodium Guaiazulene Sulfonate' },
  { brand: 'Dr. Herma', name: 'Dr. Herma Patchs Yeux Hydrogel Défatiguants', patchCount: 30,
    description: "Patchs hydrogel défatiguants : pour les poches, les cernes et le regard fatigué (caféine, niacinamide, thé vert, acide hyaluronique).",
    concernTags: ['poches', 'cernes', 'yeux'], ingredientTags: ['cafeine', 'niacinamide', 'hyaluronique', 'peptides', 'allantoin'],
    src: 'https://www.pharma-gdd.com/fr/dr-herma-patch-yeux-hydrogel-defatiguant',
    price: { value: 17.99, name: 'Pharma GDD', url: 'https://www.pharma-gdd.com/fr/dr-herma-patch-yeux-hydrogel-defatiguant', note: 'boîte de 30 patchs' },
    inci: 'Water, Glycerin, Niacinamide, Chondrus Crispus Powder, Caffeine, 1,2-Hexanediol, Ceratonia Siliqua (Carob) Gum, Butylene Glycol, Hydroxyacetophenone, Chondrus Crispus, Cyamopsis Tetragonoloba (Guar) Gum, Calcium Chloride, Allantoin, Butyrospermum Parkii (Shea) Butter, Polyglyceryl-3 Methylglucose Distearate, Potassium Chloride, Betaine, Panthenol, Polyglyceryl-10 Laurate, Polyglyceryl-2 Diisostearate, Propanediol, Sucrose, Caprylyl Glycol, Cellulose Gum, Adenosine, Dipotassium Glycyrrhizate, Ethylhexylglycerin, CI 77288, Sodium Hyaluronate, Camellia Sinensis Leaf Extract, Glycine Soja (Soybean) Seed Extract, Oryza Sativa (Rice) Extract, Sesamum Indicum (Sesame) Seed Extract, Tocopherol, Copper Tripeptide-1, Acetyl Hexapeptide-8' },
  { brand: 'Aloe Paris', name: 'Aloe Paris Hydralise Patchs Hydrogel Anti-Cernes', patchCount: 60,
    description: "Patchs hydrogel anti-cernes : hydratent la peau sous les yeux et atténuent les cernes (aloe vera, collagène, niacinamide). La liste affichée contient aussi du rétinol.",
    concernTags: ['cernes', 'poches', 'yeux'], ingredientTags: ['collagene', 'hyaluronique', 'retinol', 'niacinamide', 'tocopherol'],
    src: 'https://www.pharma-gdd.com/fr/aloe-patchs-hydrogel-anti-cernes',
    price: { value: 32.99, name: 'Pharma GDD', url: 'https://www.pharma-gdd.com/fr/aloe-patchs-hydrogel-anti-cernes', note: 'boîte de 60 patchs' },
    inci: 'Aqua, Propanediol, Butylene Glycol, Hydrolyzed Collagen, Algae Extract, Aloe Barbadensis Leaf Extract, Betain, Sodium Hyaluronate, Hydroxyethylcellulose, Mica, CI 77891, Retinol (Vitamin A), Tocopherol (Vitamin E), Niacinamide, Hydroxyacetophenone' },
  { brand: 'Séfia', name: 'Séfia Patchs Anti-Cernes Curcuma & Caféine', patchCount: 68,
    description: "Patchs gel anti-cernes et anti-poches : le curcuma et la niacinamide donnent de l'éclat, la caféine dégonfle.",
    concernTags: ['cernes', 'poches', 'yeux'], ingredientTags: ['cafeine', 'niacinamide', 'hyaluronique', 'peptides'],
    src: 'https://sefia.co/products/patchs-anti-cernes',
    price: { value: 24.9, name: 'Séfia', url: 'https://sefia.co/products/patchs-anti-cernes', note: 'boîte de 68 patchs (34 paires)' },
    inci: 'Aqua, Glycerin, Sodium Carrageenan, Glucomannan, Cellulose Gum, Hydroxyacetophenone, Curcuma Longa Root Extract, Niacinamide, Caffeine, Hyaluronic Acid, Acetyl Hexapeptide-8, 1,2-Hexanediol, Potassium Chloride, Sodium Chloride, Dipotassium Glycyrrhizate, Parfum, CI 19140, CI 16255, CI 16035, Benzyl Salicylate, Linalool' },
  { brand: 'Patchology', name: 'Patchology FlashPatch Rejuvenating Eye Gels', patchCount: 60,
    description: "Patchs gel à poser 5 minutes : pour les poches, les cernes et les yeux fatigués (caféine, collagène, centella). Contient du parfum.",
    concernTags: ['poches', 'cernes', 'yeux'], ingredientTags: ['cafeine', 'hydrolyzedcollagen', 'centella', 'hyaluronique', 'snail', 'allantoin'],
    src: 'https://www.dermstore.com/p/patchology-flashpatch-rejuvinatingeye-gels-30-pairs-jar/11289036/',
    inci: 'Aqua (Water, Eau), Glycerin, Butylene Glycol, Ceratonia Siliqua Gum, Urea and Yeast Amino Acids and Trehalose and Inositol and Taurine and Betaine, Caffeine, Chondrus Crispus Powder, Galactomyces Ferment Filtrate, Aurebasidium Pullulans Ferment, Ricinus Communis (Castor) Seed Oil, Hydrolyzed Collagen, Allantoin, Lavandula Angustifolia (Lavender) Flower Extract and Monarda Didyma Leaf Extract and Mentha Piperita (Peppermint) Leaf Extract and Freesia Alba Flower Extract and Rosmarinus Officinalis (Rosemary) Leaf Extract and Chamomilla Recutita (Martricaria) Flower Extract, PEG-60 Hydrogenated Castor Oil, Centella Asiaticia Extract, Mica and Titanium Dioxide, Snail Secretion Filtrate, Sodium Hyaluronate, Acetyl Glucosamine, Cyamopsis Tetragonoloba (Guar) Gum, Portulaca Oleracea Extract, Methylparaben, Chlorphenesin, Phenoxyethanol, Calcium Chloride, Ultramarines, Adenosine, Disodium EDTA, Fragrance' },
  { brand: 'Patchology', name: 'Patchology FlashPatch Illuminating Eye Gels', patchCount: 10,
    description: "Patchs gel à poser 5 minutes pour les cernes et le teint terne sous les yeux : la vitamine C, le thé vert et le mûrier éclaircissent. Contient du parfum.",
    concernTags: ['cernes', 'eclat', 'poches', 'yeux'], ingredientTags: ['vitaminec', 'cafeine', 'hyaluronique', 'allantoin'],
    src: 'https://www.dermstore.com/p/patchology-flashpatch-illuminating-eye-gels/12071147/',
    inci: 'Water (Aqua/Eau), Glycerin, Caffeine, Butylene Glycol, Camellia Sinensis Leaf Extract, Ascorbic Acid, Glycyrrhiza Uralensis (Licorice) Root Extract, Sodium Hyaluronate, Morus Nigra Fruit Extract, Cocos Nucifera (Coconut) Fruit Extract, Cedrus Atlantica Bark Extract, Propanediol, Pentylene Glycol, Pinus Sylvestris Leaf Extract, Ceratonia Siliqua (Carob) Gum, Sucrose, Carrageenan, Potassium Chloride, Peg-60 Hydrogenated Castor Oil, Xanthan Gum, Ethyl Hexanediol, 1,2-Hexanediol, Allantoin, Chlorphenesin, Sodium Polyacrylate, Ricinus Communis (Castor) Seed Oil, Gellan Gum, Cellulose Gum, Calcium Lactate, Adenosine, Dipotassium Glycyrrhizate, Betaine, Trehalose, Inositol, Taurine, Mica, Titanium Dioxide, Tin Oxide, Disodium Edta, Ethylhexylglycerin, Sodium Polyglutamate, Acetyl Glucosamine, Ci 77491, Fragrance (Parfum)' },
  { brand: 'Patchology', name: 'Patchology Serve Chilled On Ice Firming Eye Gels', patchCount: 30,
    description: "Patchs gel effet froid pour les poches et les ridules : le bakuchiol (alternative végétale au rétinol) et les peptides raffermissent. Contient du parfum.",
    concernTags: ['poches', 'rides', 'yeux'], ingredientTags: ['bakuchiol', 'peptides', 'centella', 'hyaluronique'],
    src: 'https://www.dermstore.com/p/patchology-serve-chilled-on-ice-firming-eye-gels-15-pair-jar/16035207/',
    inci: 'Water (Aqua/Eau), Glycerin, Dipropylene Glycol, Butylene Glycol, Paeonia Suffruticosa Root Extract, Centella Asiatica Extract, 1,2-Hexanediol, Chamomilla Recutita (Matricaria) Flower Extract, Glyceryl Caprylate, Ethylhexylglycerin, Menthyl Lactate, Chondrus Crispus Powder, Ceratonia Siliqua (Carob) Gum, Erythrito, Potassium Chloride, Sucrose, Betaine, Yeast Imino Acids, Trehalose, Taurine, Inositol, Cellulose Gum, Algin, Dextrin, Xanthan Gum, Ultramarines (CI 77007), Rubus Chamaemorus Fruit Extract, Gardenia Florida Fruit Extract, Titanium Dioxide (CI 77891), Polymethylsilsesquioxane, Silica, Polysorbate 20, Disodium EDTA, Fragrance, Limonene, Sodium Hyaluronate, Tripeptide-1, Acetyl Tetrapeptide-2, Acetyl Tetrapeptide-5, Copper Tripeptide-1, Palmitoyl Tripeptide-1, Palmitoyl Pentapeptide-4, Hexapeptide-11, Hexapeptide-9, Palmitoyl Tripeptide-5, Bakuchiol, Menthyl Disopropyl Propionamide, Urea, Polyglyceryl-10 Laurate, Potassium Sorbate, Phenoxyethanol' },
  { brand: 'Biodance', name: 'Biodance Collagen Peptide Under Eye Patches', patchCount: 60,
    description: "Patchs hydrogel pour les ridules et la peau qui manque de fermeté sous les yeux : collagène et peptides, avec de la caféine contre les poches et de la niacinamide pour l'éclat.",
    concernTags: ['rides', 'poches', 'cernes', 'yeux'], ingredientTags: ['collagene', 'peptides', 'cafeine', 'niacinamide', 'hyaluronique'],
    src: 'https://www.lookfantastic.com/p/biodance-collagen-peptide-eye-patches-30ea/17811644/',
    inci: 'Water, Glycerin, Collagen Water(97,000ppm), Niacinamide, Chondrus Crispus Powder, Butylene Glycol, 1,2-Hexanediol, Ceratonia Siliqua (Carob) Gum, Betaine, Hydroxyacetophenone, Chondrus Crispus, Cyamopsis Tetragonoloba (Guar) Gum, Calcium Chloride, Allantoin, Polyglyceryl-3 Methylglucose Distearate, Potassium Chloride, Glucomannan, Polyglyceryl-10 Laurate, Propanediol, Trehalose, Butyrospermum Parkii (Shea) Butter, Calcium Aluminum Borosilicate, Sucrose, Cellulose Gum, Adenosine, Dipotassium Glycyrrhizate, Ethylhexylglycerin, Titanium Dioxide (CI 77891), Caffeine, Iron Oxides (CI 77491), Hydrolyzed Hyaluronic Acid, Tin Oxide, Lactobacillus Ferment Lysate, Hydrolyzed Collagen(7ppm), Tocopherol, Collagen Extract(0.1ppm), Elastin, Glycosaminoglycans, Sodium Hyaluronate, Acetyl Hexapeptide-8(4.5ppb), Ascorbic Acid Polypeptide(1ppb), sh-Oligopeptide-1(0.01ppb), sh-Oligopeptide-2(0.01ppb), sh-Polypeptide-1(0.01ppb), sh-Polypeptide-22(0.01ppb), sh-Polypeptide-3(0.01ppb), Acetyl Octapeptide-3(0.009ppb), Acetyl Tetrapeptide-2(0.009ppb), Acetyl Tetrapeptide-3(0.009ppb), Acetyl Tetrapeptide-5(0.009ppb), Acetyl Tetrapeptide-9(0.009ppb), Carnosine, Copper Tripeptide-1(0.009ppb), Nonapeptide-1(0.009ppb), Palmitoyl Pentapeptide-4(0.009ppb), Palmitoyl Tripeptide-1(0.009ppb), Palmitoyl Tripeptide-5(0.009ppb)' }
];

const maxNum = Math.max.apply(null, D.products.map(p => parseInt(String(p.id).replace(/\D/g, ''), 10) || 0));
const key = p => (p.brand + ' ' + p.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const have = new Set(D.products.map(key));
let n = maxNum, added = [];
PATCHS.forEach(x => {
  if (have.has(key(x))) { console.log('déjà présent :', x.name); return; }
  const list = splitInci(x.inci);
  const norm = list.map(i => i.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
  const p = { id: 'm' + String(++n).padStart(3, '0'), name: x.name, brand: x.brand, category: 'eye', price: x.price ? x.price.value : null, currency: 'EUR',
    description: x.description, concernTags: x.concernTags, ingredientTags: x.ingredientTags, active: true, patchCount: x.patchCount,
    inciRaw: x.inci, inciNormalized: norm, inciSourceUrl: x.src, inciLastVerifiedAt: DATE, inciVerificationStatus: 'verified',
    dupeEligible: true, needsReview: false, curatedBy: 'patchs-yeux-2026-10-26' };
  if (x.price) Object.assign(p, { shopUrl: x.price.url, priceVerified: true, priceSource: { name: x.price.name, url: x.price.url }, priceRetrievedAt: DATE, priceNote: x.price.note });
  added.push(p);
  console.log(p.id, '|', p.name, '|', p.patchCount + ' patchs', '|', norm.length + ' ingrédients', '|', x.price ? x.price.value + ' € (' + x.price.name + ')' : 'sans prix en euros');
});
console.log('\n' + added.length + ' patch(s) à ajouter.');
if (process.argv.includes('--write') && added.length) {
  D.products.push.apply(D.products, added);
  const m = /^\{\r?\n( +)"/.exec(raw);
  const indent = m ? m[1].length : 2;
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  let out = JSON.stringify(D, null, indent);
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out + (/\n$/.test(raw) ? eol : ''));
  console.log('Écrit dans data/products-manual.json');
}
