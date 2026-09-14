/* ============================================================
   build-web.js — Génère un dossier `www/` MINIMAL pour Capacitor.
   La v1 de l'app iOS charge le site de production (server.url dans
   capacitor.config.json), donc `www/` sert seulement de page de
   secours hors-ligne + icônes/manifeste. Léger (pas de bundle 100 Mo).
   Lancer :  node scripts/build-web.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'www');

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Icônes + manifeste (légers)
for (const item of ['icons', 'manifest.json']) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, item), { recursive: true });
}

// Page de secours (affichée uniquement si l'app ne peut pas joindre le site)
const fallback = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Glow Up</title>
<style>
  html,body{height:100%;margin:0;background:#F5ECE0;color:#3A2318;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;}
  img{width:120px;height:120px;border-radius:26px;}
  h1{font-size:22px;margin:6px 0 0;}
  p{color:#8A6E58;max-width:30ch;}
  button{margin-top:8px;background:#B4482E;color:#fff;border:none;border-radius:30px;padding:13px 26px;font-size:15px;font-weight:600;}
</style></head>
<body><div class="wrap">
  <img src="icons/icon-192.png" alt="Glow Up">
  <h1>Glow Up</h1>
  <p>Connexion internet nécessaire pour charger l'application.</p>
  <button onclick="location.reload()">Réessayer</button>
</div></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), fallback);

console.log('OK — www/ minimal généré (page de secours + icônes + manifeste).');
