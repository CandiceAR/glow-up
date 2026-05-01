#!/usr/bin/env node
/* ============================================================
   generateProductsFromImages.js
   Génère les produits automatiquement à partir des images dans /assets/
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets');
const PRODUCTS_FILE = path.join(__dirname, '../data/products-manual.json');
const TAG = 'kand10ar-21';

// Catégories basées sur des mots-clés dans les noms de fichiers
const CATEGORY_KEYWORDS = {
  lipstick: ['levre', 'lèvre', 'rouge', 'lipstick', 'balm', 'baume'],
  blush: ['blush', 'joues', 'rouge'],
  foundation: ['fond', 'fond de teint', 'foundation', 'base'],
  mascara: ['mascara', 'cils'],
  concealer: ['concealer', 'correcteur', 'correctrice', 'anti cernes'],
  eyeshadow: ['fard', 'paupiere', 'shadow', 'ombre'],
  skincare: ['serum', 'crème', 'creme', 'lotion', 'nettoyant', 'essence', 'gel', 'soin', 'hydratant', 'exfoliant', 'masque', 'contour'],
};

function detectCategory(filename) {
  const lower = filename.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }
  return 'lipstick'; // défaut
}

function generateProductFromImage(imageFile) {
  const filename = path.parse(imageFile).name; // sans .jpg
  const parts = filename.split('-');

  let brand = parts[0] || 'Marque Inconnue';
  let productName = parts.slice(1).join(' ') || filename;

  // Nettoyer et capitaliser
  brand = brand
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  productName = productName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const category = detectCategory(filename);
  const id = `${brand.toLowerCase().replace(/\s+/g, '-')}-${productName.toLowerCase().replace(/\s+/g, '-').slice(0, 15)}`;

  return {
    id,
    asin: '', // Pas d'ASIN sans URL Amazon
    name: productName,
    brand,
    category,
    subcategory: category,
    shadeName: null,
    colorHex: null,
    imageUrl: `assets/${imageFile}`,
    amazonUrl: '', // À remplir manuellement plus tard
    price: null,
    currency: 'EUR',
    rating: null,
    skinTypeTags: ['normale', 'mixte', 'seche', 'grasse', 'sensible'],
    concernTags: [],
    makeupCategory: category,
    finish: 'naturel',
    coverage: null,
    isFeatured: false,
    active: true,
    skinTonePreview: {
      mode: 'images',
      light: `assets/previews/${id}_light.jpg`,
      medium: `assets/previews/${id}_medium.jpg`,
      dark: `assets/previews/${id}_dark.jpg`
    },
    description: '',
    curatedBy: 'auto-import',
    curatedAt: new Date().toISOString().split('T')[0],
    notes: 'Importé automatiquement depuis les images'
  };
}

async function main() {
  try {
    console.log('📸 Scanning images in', ASSETS_DIR);

    // Lire tous les fichiers .jpg
    const files = fs.readdirSync(ASSETS_DIR)
      .filter(f => f.toLowerCase().endsWith('.jpg'))
      .sort();

    console.log(`✅ Found ${files.length} images\n`);

    // Générer les produits
    const products = files.map(generateProductFromImage);

    // Charger ou créer le fichier de produits
    let existingData = { _meta: {}, products: [] };
    if (fs.existsSync(PRODUCTS_FILE)) {
      try {
        const content = fs.readFileSync(PRODUCTS_FILE, 'utf8');
        existingData = JSON.parse(content);
      } catch (e) {
        console.warn('⚠️  Impossible de lire le fichier existant, création d\'un nouveau');
      }
    }

    const existingIds = new Set(existingData.products?.map(p => p.id) || []);
    const newProducts = products.filter(p => !existingIds.has(p.id));

    console.log(`📊 Résumé:`);
    console.log(`   Produits existants: ${existingData.products?.length || 0}`);
    console.log(`   Nouveaux produits: ${newProducts.length}`);
    console.log(`   Total: ${(existingData.products?.length || 0) + newProducts.length}\n`);

    if (newProducts.length > 0) {
      // Fusionner
      const allProducts = [...(existingData.products || []), ...newProducts];

      // Mettre à jour le fichier
      const output = {
        _meta: {
          version: '1.0',
          source: 'auto-import',
          tag: TAG,
          lastUpdated: new Date().toISOString().split('T')[0],
          totalProducts: allProducts.length
        },
        products: allProducts
      };

      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(output, null, 2));
      console.log(`✅ Fichier sauvegardé: ${PRODUCTS_FILE}`);
      console.log(`\n📝 Produits ajoutés:`);
      newProducts.slice(0, 10).forEach(p => {
        console.log(`   - ${p.brand} / ${p.name} (${p.category})`);
      });
      if (newProducts.length > 10) {
        console.log(`   ... et ${newProducts.length - 10} autres`);
      }
    } else {
      console.log('✅ Tous les produits existent déjà !');
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

main();
