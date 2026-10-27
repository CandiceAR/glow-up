/* Photos de couverture du blog : photos libres de droits Pexels (licence Pexels : usage commercial autorisé, mention non obligatoire).
   Télécharge chaque photo en 1600x900 dans assets/blog/<slug>.jpg, ajoute « image » et « image_alt » dans l'article (si absents)
   et tient à jour assets/blog/CREDITS.txt (photographe et page d'origine). Idempotent.
   Usage : node scripts/blog-photos.js */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

// slug → [identifiant Pexels, texte alternatif, crédit photographe]
const PHOTOS = {
  'retinol-apres-40-ans': [8140898, "Main dévissant la pipette d'un flacon de sérum en verre ambré, sur fond rose", 'Pexels'],
  'taches-brunes-visage': [6417954, "Gros plan sur le visage d'une femme qui applique du sérum avec une pipette près de l'œil", 'Pexels'],
  'skincare-grossesse': [1556652, "Femme enceinte, les mains posées sur son ventre arrondi, sur fond pêche", 'Pexels'],
  'acide-hyaluronique-guide': [7321655, "Main versant du sérum avec une pipette dans un flacon blanc, à côté d'un rouleau de massage", 'Pexels'],
  'menopause-et-peau': [7984828, "Femme mûre aux cheveux blonds, souriante, tenant son téléphone", 'Pexels'],
  'skincare-coreenne-peau-mature': [6001483, "Femme détendue sur un canapé avec un masque en tissu sur le visage, son téléphone à la main", 'Pexels'],
  'skincare-apres-50-ans': [4584638, "Femme mûre souriante au regard levé, sur fond rose", 'Pexels'],
  'acide-hyaluronique-dangers': [6417957, "Main versant quelques gouttes de sérum depuis une pipette dans la paume de l'autre main", 'Pexels'],
  'collagene-visage': [27305404, "Petits flacons de collagène à boire posés à côté de citrons coupés", 'Pexels'],
  'proteger-peau-visage-froid': [29932005, "Gros plan sur une femme au bonnet rouge, les joues rosies par le froid et des flocons de neige sur les cils", 'Pexels'],
  'manque-de-sommeil-et-peau': [6957501, "Femme tenant contre elle un bébé endormi", 'Pexels'],
  'peau-jeune-maman-routine-3-gestes': [3270224, "Mains d'une jeune maman serrant son bébé enveloppé dans un gilet en laine crème", 'Pexels'],
  'patchs-yeux-cernes-ou-poches': [3762537, "Femme souriante avec des patchs hydrogel transparents sous les yeux, la main posée sur la joue", 'Pexels']
};

(async () => {
  const credits = [];
  for (const slug of Object.keys(PHOTOS)) {
    const [id, alt] = PHOTOS[slug];
    const out = path.join(ROOT, 'assets', 'blog', slug + '.jpg');
    if (!fs.existsSync(out)) {
      const url = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop&crop=faces`;
      const r = await fetch(url);
      const b = Buffer.from(await r.arrayBuffer());
      if (!r.ok || b.length < 20000) { console.log('ÉCHEC téléchargement', slug, id, r.status, b.length); continue; }
      fs.writeFileSync(out, b);
      console.log('photo :', slug, '←', 'pexels.com/photo/' + id, (b.length / 1024).toFixed(0) + ' Ko');
    }
    credits.push(`${slug}.jpg — Pexels, photo n° ${id} — https://www.pexels.com/photo/${id}/ — licence Pexels (usage commercial libre)`);
    const md = path.join(ROOT, 'blog', 'posts', slug + '.md');
    if (!fs.existsSync(md)) continue;                       // article pas encore écrit : la photo est prête
    let s = fs.readFileSync(md, 'utf8');
    const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n/.exec(s);
    if (!m) { console.log('pas de bloc d\'en-tête :', slug); continue; }
    let fm = m[1];
    if (/^image:/m.test(fm)) { console.log('a déjà une photo :', slug); continue; }
    const lines = fm.split('\n');
    const at = lines.findIndex(l => /^related:/.test(l));
    const ins = ['image: /assets/blog/' + slug + '.jpg', 'image_alt: ' + alt];
    if (at >= 0) lines.splice(at, 0, ...ins); else lines.push(...ins);
    s = '---\n' + lines.join('\n') + '\n---\n' + s.slice(m[0].length);
    if (crlf) s = s.replace(/\n/g, '\r\n');
    fs.writeFileSync(md, s);
    console.log('en-tête mis à jour :', slug);
  }
  fs.writeFileSync(path.join(ROOT, 'assets', 'blog', 'CREDITS.txt'), 'Photos de couverture du blog (Pexels, licence libre pour usage commercial)\n\n' + credits.join('\n') + '\n');
})();
