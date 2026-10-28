/* Génère reglement-concours/index.html (règlement du jeu concours Instagram) avec la même mise en page que confidentialite/index.html.
   Usage : node scripts/build-reglement.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'confidentialite', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const head = src.slice(0, src.indexOf('<main class="doc">'))
  .replace(/<title>[^<]*<\/title>/, '<title>Règlement du jeu concours · Glow Up</title>')
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Règlement du jeu concours Instagram Glow Up : une carte cadeau Sephora de 50 € à gagner du 30 octobre au 8 novembre 2026, tirage au sort le 12 novembre.">')
  .replace('https://www.glowupskin.app/confidentialite/', 'https://www.glowupskin.app/reglement-concours/')
  .replace('<h1>Politique de confidentialité</h1>', '<h1>Règlement du jeu concours</h1>')
  .replace('Dernière mise à jour : 22 octobre 2026', 'Jeu concours du 30 octobre au 8 novembre 2026');
const foot = src.slice(src.indexOf('<footer class="foot">'));

const body = `<main class="doc"><div class="wrap">

  <p>Ce règlement s'applique au jeu concours organisé par Glow Up sur Instagram et dans l'application Glow Up. <strong>Participer implique l'acceptation pleine et entière de ce règlement.</strong></p>

  <h2>Article 1 · Organisatrice</h2>
  <p>Le jeu est organisé par <strong>Candice Arav</strong> (Glow Up, micro-entreprise), éditrice de l'application et du site <a href="https://www.glowupskin.app">glowupskin.app</a>. Contact : <strong>contact@glowupskin.app</strong>.</p>

  <h2>Article 2 · Durée</h2>
  <p>Le jeu commence le <strong>vendredi 30 octobre 2026 à 00h00</strong> et se termine le <strong>dimanche 8 novembre 2026 à 23h59</strong> (heure de Paris). Aucune participation n'est acceptée avant ou après ces dates.</p>

  <h2>Article 3 · Lot</h2>
  <p>Une <strong>carte cadeau Sephora d'une valeur de 50 €</strong>. Le lot n'est ni échangeable contre de l'argent, ni modifiable.</p>

  <h2>Article 4 · Conditions de participation</h2>
  <p>Pour participer, il faut :</p>
  <ul>
    <li>être <strong>majeure</strong> (18 ans ou plus) et <strong>résider en France métropolitaine</strong> ;</li>
    <li>être <strong>abonnée au compte Instagram @glowupandshiny</strong> ;</li>
    <li>avoir <strong>généré une routine personnalisée dans l'application Glow Up</strong> ;</li>
    <li>avoir inscrit son <strong>pseudo Instagram dans la case « Concours »</strong> de l'application, et accepté le présent règlement.</li>
  </ul>
  <p><strong>Une seule participation par personne</strong> : un compte Glow Up et un pseudo Instagram ne peuvent participer qu'une fois. Toute participation multiple, fausse ou frauduleuse est exclue.</p>

  <h2>Article 5 · Gratuité</h2>
  <p>Le jeu est <strong>gratuit et sans obligation d'achat</strong>. Créer un compte et générer une routine dans Glow Up est gratuit.</p>

  <h2>Article 6 · Tirage au sort</h2>
  <p>Le tirage au sort a lieu le <strong>jeudi 12 novembre 2026</strong>, parmi toutes les participations valides, de façon aléatoire. L'annonce de la gagnante est faite en story sur <strong>@glowupandshiny</strong>.</p>

  <h2>Article 7 · Contact de la gagnante</h2>
  <p>La gagnante est contactée <strong>uniquement en message privé par @glowupandshiny</strong>. Sans réponse de sa part sous <strong>72 heures</strong>, ou si elle ne remplit pas les conditions de participation, un nouveau tirage au sort est effectué.</p>

  <h2>Article 8 · Données personnelles</h2>
  <p>Les données collectées (pseudo Instagram, identifiant du compte, date de participation) sont utilisées <strong>uniquement pour le concours</strong> et <strong>supprimées après la remise du lot</strong>. Tu peux exercer tes droits (accès, rectification, suppression) en écrivant à contact@glowupskin.app. Plus d'informations dans notre <a href="/confidentialite/">politique de confidentialité</a>.</p>

  <h2>Article 9 · Instagram, Meta et Sephora</h2>
  <p>Ce jeu n'est <strong>ni organisé, ni parrainé, ni géré par Instagram, Meta ou Sephora</strong>, et n'est associé à aucun d'entre eux. Les informations que tu fournis sont destinées à l'organisatrice, et non à ces sociétés.</p>

  <h2>Article 10 · Modification du jeu</h2>
  <p>L'organisatrice se réserve le droit de modifier, reporter ou annuler le jeu en cas de force majeure ou de problème technique, sans que sa responsabilité puisse être engagée. Le règlement est disponible gratuitement à tout moment sur cette page.</p>

</div></main>

`;
fs.mkdirSync(path.join(ROOT, 'reglement-concours'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reglement-concours', 'index.html'), head + body + foot);
console.log('reglement-concours/index.html écrit :', (head + body + foot).length, 'caractères');
