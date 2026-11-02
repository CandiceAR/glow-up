/* ============================================================
   tests/affiliate.test.js — Tous les liens Amazon du catalogue doivent rapporter : code affilié glowupapp-21, pas de lien court
   (un lien amzn.to garde le code du compte qui l'a créé : le ?tag= ajouté après coup est ignoré par Amazon).
   ============================================================ */
'use strict';
const fs = require('fs');
const { ROOT, check, done, path } = require('./helpers.js');

const TAG = 'glowupapp-21';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const urls = txt => (txt.match(/https?:\/\/(?:www\.)?(?:amazon\.[a-z.]+|amzn\.[a-z]+|a\.co)\/[^\s"`<>\\]*/gi) || []).map(u => u.replace(/&amp;/g, '&'));
const tagOf = u => { try { return new URL(u).searchParams.get('tag'); } catch (e) { return null; } };

console.log('── Catalogue : produits, ancien catalogue, pages dupes ──');
const sources = ['data/products-manual.json', 'data/catalogue.json', 'js/catalogue.js']
  .concat(fs.readdirSync(path.join(ROOT, 'dupes'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => 'dupes/' + d.name + '/index.html'));

// Produits : on contrôle les liens d'achat (amazonUrl / buyUrl), pas les « sources de prix » qui ne sont jamais montrées comme bouton
const buyLinks = f => {
  if (f !== 'data/products-manual.json') return urls(read(f));
  const all = JSON.parse(read(f)); const arr = Array.isArray(all) ? all : (all.products || []);
  return arr.flatMap(p => [p.amazonUrl, p.buyUrl]).filter(Boolean);
};
sources.forEach(f => {
  const list = buyLinks(f);
  const short = list.filter(u => /\/\/(amzn\.|a\.co)/.test(u));
  const wrong = list.filter(u => !/\/\/(amzn\.|a\.co)/.test(u) && tagOf(u) !== TAG);
  check(f + ' : aucun lien court amzn.to (' + list.length + ' liens Amazon)', short.length === 0, short.slice(0, 2).join(' '));
  check(f + ' : tous les liens portent tag=' + TAG, wrong.length === 0, wrong.slice(0, 2).join(' '));
});

console.log('\n── Code qui fabrique des liens ──');
const admin = read('js/adminPanel.js');
check("panneau admin : code affilié " + TAG, /const TAG\s*=\s*'glowupapp-21'/.test(admin));
check('catalogue : le code affilié est ' + TAG, /const TAG = 'glowupapp-21'/.test(read('js/productCatalog.js')));
check("aucun ancien code (kand10ar-21 / kan10ar-21) dans le code ni les pages", ['js/adminPanel.js', 'js/productCatalog.js', 'admin.html', 'index.html', 'build-dupes.js'].every(f => !/kand?10ar-21/.test(read(f))));

done('liens Amazon affiliés');
