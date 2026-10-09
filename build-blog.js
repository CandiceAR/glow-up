/* ============================================================
   build-blog.js — Génère le blog Glow Up à partir de fichiers Markdown.
   • Lit  blog/posts/*.md   (frontmatter + Markdown)
   • Crée blog/index.html            (la liste des articles)
          blog/<slug>/index.html     (chaque article, URL propre + SEO)
          blog/posts.json            (index consommé par la page d'accueil)
   Lancer :  node build-blog.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT      = __dirname;
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const OUT_DIR   = path.join(ROOT, 'blog');
const SITE      = 'https://www.glowupskin.app';   // domaine canonique (l'apex redirige vers www)

// Auteure des articles (Person dans les données structurées + ligne « Par … » sous le titre).
// Nom de l'auteure (utilisé aussi pour les articles sans champ « author »). Si un texte entre crochets y est remis,
// le script refuse de tourner sur GitHub Actions (garde-fou contre un faux nom).
const AUTHOR_NAME = 'Candice COHEN';
const AUTHOR_URL  = SITE + '/a-propos/';
// Image de partage par défaut (1200 x 630) quand un article n'a pas sa propre image
const DEFAULT_SHARE = { path: '/assets/og-default.jpg', width: 1200, height: 630 };

// ── Frontmatter minimal (--- clé: valeur --- + corps Markdown) ──
function parseFront(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  let listKey = null;   // une clé sans valeur suivie de lignes « - élément » devient une liste (sources, related)
  m[1].split('\n').forEach(line => {
    const li = line.match(/^\s*-\s+(.*)$/);
    if (li && listKey) { data[listKey].push(li[1].trim()); return; }
    const i = line.indexOf(':');
    if (i === -1) return;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val === '') { data[key] = []; listKey = key; return; }
    listKey = null;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    data[key] = val;
  });
  return { data, body: m[2] };
}

// Dimensions d'une image JPEG / PNG (sans dépendance), pour width / height dans le HTML
function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };   // PNG
    if (b[0] === 0xFF && b[1] === 0xD8) {                                                                       // JPEG
      let o = 2;
      while (o < b.length) {
        if (b[o] !== 0xFF) { o++; continue; }
        const mk = b[o + 1], len = b.readUInt16BE(o + 2);
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return { height: b.readUInt16BE(o + 5), width: b.readUInt16BE(o + 7) };
        o += 2 + len;
      }
    }
  } catch (e) { /* image illisible : pas de dimensions */ }
  return null;
}

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function frDate(iso) {
  try { return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }); }
  catch { return iso; }
}

// ── Styles partagés (DA Glow Up) ──
const CSS = `
:root{--cream:#F5ECE0;--white:#FCF8F1;--peach:#EED9C9;--terra:#B4482E;--gold:#E0A24E;--espresso:#3A2318;--muted:#7E6552;--line:#E3D3BE;
--anton:'Anton',Impact,sans-serif;--serif:'Fraunces',Georgia,serif;--sans:'DM Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--cream);color:var(--espresso);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased;}
img{max-width:100%;display:block;}
a{color:var(--terra);}
.wrap{max-width:1120px;margin:0 auto;padding:0 22px;}
.bnav{position:sticky;top:0;z-index:10;background:rgba(245,236,224,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);}
.bnav .wrap{display:flex;align-items:center;height:66px;gap:20px;}
.bnav .brand{display:flex;align-items:center;gap:2px;text-decoration:none;line-height:1;}
.bnav .brand img{height:30px;width:auto;filter:drop-shadow(0 0 6px rgba(240,145,63,.45));}
.bnav .brand span{font-family:var(--serif);font-weight:600;font-size:22px;color:var(--terra);}
.bnav .links{margin-left:auto;display:flex;align-items:center;gap:22px;font-size:14px;}
.bnav .links a{color:var(--muted);text-decoration:none;}
.bnav .links a:hover{color:var(--terra);}
.bnav .links .blog-cta{background:var(--terra);color:#fff;padding:8px 16px;border-radius:30px;font-weight:600;}
.bnav .links .blog-cta:hover{color:#fff;opacity:.92;}
@media(max-width:600px){.bnav .wrap{height:58px;gap:12px;}.bnav .links{gap:14px;font-size:13px;}.bnav .links .d-hide-sm{display:none;}.bnav .brand img{height:27px;}.bnav .brand span{font-size:20px;}}
.kicker{font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--terra);}
.display{font-family:var(--anton);font-weight:400;text-transform:uppercase;letter-spacing:.01em;line-height:.96;text-wrap:balance;}
.foot{background:var(--espresso);color:#E7D6C4;margin-top:64px;}
.foot .wrap{padding:40px 22px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;}
.foot .fb{font-family:var(--serif);font-weight:600;font-size:24px;color:var(--cream);}
.foot .fl{margin-left:auto;display:flex;gap:20px;}
.foot a{color:#E7D6C4;text-decoration:none;font-size:14px;}
.foot .copy{width:100%;border-top:1px solid rgba(255,255,255,.12);padding-top:16px;font-size:12px;color:#A78B74;}

/* Liste */
.bhero{padding:64px 0 34px;}
.bhero h1{font-size:clamp(40px,7vw,80px);margin-top:12px;}
.bhero p{color:var(--muted);font-size:18px;margin-top:16px;max-width:54ch;}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding-bottom:40px;}
.card{background:var(--white);border:1px solid var(--line);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:transform .18s ease,box-shadow .18s ease;}
.card:hover{transform:translateY(-4px);box-shadow:0 16px 36px rgba(58,35,24,.10);}
.card .cover{aspect-ratio:16/10;background:linear-gradient(140deg,#E7C7A6,#D89B72);}
.card .cover img{width:100%;height:100%;object-fit:cover;}
.card .cbody{padding:18px;display:flex;flex-direction:column;gap:8px;flex:1;}
.card .date{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.card h2{font-family:var(--serif);font-weight:600;font-size:20px;line-height:1.25;color:var(--espresso);}
.card p{color:var(--muted);font-size:14px;}
.card .more{margin-top:auto;color:var(--terra);font-weight:600;font-size:14px;}
@media(max-width:860px){.grid{grid-template-columns:1fr;}}

/* Article */
.article{padding:44px 0 10px;}
.article .inner{max-width:720px;margin:0 auto;}
.article .meta{color:var(--muted);font-size:13px;letter-spacing:.06em;text-transform:uppercase;}
.article h1{font-family:var(--serif);font-weight:600;font-size:clamp(30px,4.4vw,48px);line-height:1.12;letter-spacing:-.01em;color:var(--espresso);margin:12px 0 6px;text-wrap:balance;}
.article .cover{border-radius:20px;overflow:hidden;margin:26px 0 8px;aspect-ratio:16/9;background:linear-gradient(140deg,#E7C7A6,#D89B72);}
.article .cover img{width:100%;height:100%;object-fit:cover;}
.prose{max-width:680px;margin:26px auto 0;font-size:19px;line-height:1.75;color:#4a3527;}
.prose>*+*{margin-top:20px;}
.prose h2{font-family:var(--serif);font-weight:600;font-size:30px;color:var(--espresso);margin-top:44px;line-height:1.2;}
.prose h3{font-family:var(--serif);font-weight:600;font-size:22px;color:var(--espresso);margin-top:30px;}
.prose a{color:var(--terra);text-underline-offset:3px;}
.prose ul,.prose ol{padding-left:1.3em;}
.prose li+li{margin-top:8px;}
.prose blockquote{border-left:3px solid var(--gold);background:var(--white);padding:14px 20px;border-radius:0 12px 12px 0;color:var(--muted);font-style:italic;}
.prose img{border-radius:14px;margin:26px 0;}
.prose strong{color:var(--espresso);}
.backcta{max-width:680px;margin:44px auto 0;padding:26px;background:var(--peach);border-radius:20px;text-align:center;}
.backcta a.btn{display:inline-block;margin-top:12px;background:var(--terra);color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:40px;}
.backlink{display:inline-block;margin-top:30px;color:var(--muted);text-decoration:none;font-size:14px;}
.byline{color:var(--muted);font-size:14px;margin-top:6px;}
.byline a{color:var(--terra);font-weight:600;text-decoration:none;}
.byline a:hover{text-decoration:underline;}
.sources{max-width:680px;margin:40px auto 0;font-size:15px;color:#4a3527;}
.sources h2{font-family:var(--serif);font-weight:600;font-size:22px;color:var(--espresso);margin-bottom:10px;}
.sources ol{padding-left:1.3em;}
.sources li+li{margin-top:6px;}
.related{max-width:680px;margin:44px auto 0;}
.related h2{font-family:var(--serif);font-weight:600;font-size:26px;color:var(--espresso);margin-bottom:14px;}
.related ul{list-style:none;display:grid;gap:12px;}
.related a{display:block;background:var(--white);border:1px solid var(--line);border-radius:16px;padding:14px 18px;text-decoration:none;color:var(--espresso);}
.related a:hover{border-color:var(--terra);}
.related a strong{display:block;font-family:var(--serif);font-weight:600;font-size:18px;line-height:1.3;}
.related a span{display:block;color:var(--muted);font-size:14px;margin-top:4px;}
`;

function head(title, desc, canonical, image, opts = {}) {
  // Image de partage : celle de l'article, sinon l'image par défaut de la marque
  const img = image ? (image.startsWith('http') ? image : SITE + image) : SITE + DEFAULT_SHARE.path;
  const iw = image ? opts.imgW : DEFAULT_SHARE.width, ih = image ? opts.imgH : DEFAULT_SHARE.height;
  const ogTitle = opts.ogTitle || title;
  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="${opts.ogType || 'article'}">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(img)}">
${iw && ih ? `<meta property="og:image:width" content="${iw}"><meta property="og:image:height" content="${ih}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>`;
}

const NAV = `<nav class="bnav"><div class="wrap">
<a class="brand" href="/" aria-label="Glow Up — retour à l'application"><img src="/assets/logo-g-symbol.png" alt=""><span>low up</span></a>
<div class="links"><a href="/">Accueil</a><a class="d-hide-sm" href="/blog/">Conseils</a><a class="blog-cta" href="/">Faire mon analyse</a></div>
</div></nav>`;

const FOOT = `<footer class="foot"><div class="wrap">
<div class="fb">glow up</div>
<div class="fl"><a href="/">Accueil</a><a href="/blog/">Conseils</a><a href="/a-propos/">À propos</a><a href="/confidentialite/">Confidentialité</a><a href="https://www.instagram.com/glowupandshiny" target="_blank" rel="noopener">Instagram</a></div>
<div class="copy">© ${new Date().getFullYear()} Glow Up · Ton agent IA skincare</div>
</div></footer></body></html>`;

function coverHTML(image, cls, alt, w, h) {
  const dims = w && h ? ` width="${w}" height="${h}"` : '';
  return `<div class="${cls}">${image ? `<img src="${esc(image)}" alt="${esc(alt || '')}"${dims} decoding="async">` : ''}</div>`;
}

async function main() {
  const { marked } = await import('marked');
  marked.setOptions({ mangle:false, headerIds:true });

  if (!fs.existsSync(POSTS_DIR)) { console.error('Aucun dossier blog/posts'); process.exit(1); }
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts = [];

  // Publication programmée : on ne génère que les articles dont la date est arrivée (<= aujourd'hui).
  const pubCutoff = new Date(); pubCutoff.setHours(23, 59, 59, 999);

  // Garde-fou : on ne publie jamais avec le faux nom d'auteure (GitHub Actions)
  if (/\[|\]/.test(AUTHOR_NAME) && process.env.GITHUB_ACTIONS) {
    console.error('ERREUR : AUTHOR_NAME contient encore un texte entre crochets. Renseigne le vrai nom dans build-blog.js.');
    process.exit(1);
  }

  const ISO = d => String(d || '').slice(0, 10);
  const STOP = new Set('avec dans pour sans cette cela mais plus tout tous tres comme leur leurs elle elles votre vous nous sont etre faire fait ainsi alors apres avant entre chez depuis voici quelle quels quelles dont aussi ceux celle peut peuvent bien quoi comment pourquoi ce qu il ne pas que qui une des les est son ses sur par aux the'.split(' '));
  const tokens = t => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)));

  // ── Passe 1 : lecture de tous les articles publiés ──
  const entries = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data, body } = parseFront(raw);
    const slug = data.slug || file.replace(/\.md$/, '');
    if (data.date && new Date(data.date) > pubCutoff) { console.log('⏳ programmé :', slug, '(' + data.date + ')'); continue; }
    const title = data.title || slug;

    // Image : champ « image » du .md, sinon assets/blog/<slug>.(jpg|jpeg|png|webp) s'il existe
    let image = data.image || '';
    if (!image) {
      for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
        if (fs.existsSync(path.join(ROOT, 'assets', 'blog', slug + '.' + ext))) { image = `/assets/blog/${slug}.${ext}`; break; }
      }
    }
    const size = image && !image.startsWith('http') ? imageSize(path.join(ROOT, image.replace(/^\//, ''))) : null;

    // Sources : lignes « Titre | https://adresse » (jamais inventées : rien n'est affiché si le champ est vide)
    const sources = (Array.isArray(data.sources) ? data.sources : []).map(l => {
      const i = l.lastIndexOf('|');
      const t = i > 0 ? l.slice(0, i).trim() : '', u = i > 0 ? l.slice(i + 1).trim() : '';
      if (!t || !/^https?:\/\//.test(u)) { console.warn('⚠️ source ignorée (format « Titre | https://… » attendu) dans', slug, ':', l); return null; }
      return { title: t, url: u };
    }).filter(Boolean);

    if (data.titre_seo && data.titre_seo.length > 60) console.warn('⚠️ titre_seo > 60 caractères dans', slug, '(' + data.titre_seo.length + ')');
    entries.push({
      slug, title, titreSeo: data.titre_seo || '', date: ISO(data.date), updated: ISO(data.updated) || ISO(data.date),
      hasUpdate: !!data.updated && ISO(data.updated) !== ISO(data.date),
      excerpt: data.excerpt || '', desc: data.metaDescription || data.excerpt || '',
      image, imageAlt: data.image_alt || '', imgW: size && size.width, imgH: size && size.height,
      author: data.author && data.author !== 'Glow Up' ? data.author : AUTHOR_NAME,
      sources, relatedManual: Array.isArray(data.related) ? data.related : String(data.related || '').split(',').map(x => x.trim()).filter(Boolean),
      tok: tokens(title + ' ' + (data.excerpt || '') + ' ' + (data.metaDescription || '')), body,
    });
  }

  // « À lire aussi » : 3 articles publiés les plus proches (mots communs pondérés par leur rareté), sinon les plus récents
  const df = {}; entries.forEach(e => e.tok.forEach(w => { df[w] = (df[w] || 0) + 1; }));
  const relatedOf = e => {
    const manual = e.relatedManual.map(sl => entries.find(x => x.slug === sl)).filter(x => x && x !== e);
    const scored = entries.filter(x => x !== e && !manual.includes(x)).map(x => {
      let sc = 0; x.tok.forEach(w => { if (e.tok.has(w)) sc += 1 / df[w]; });
      return { x, sc, d: Math.abs(new Date(x.date) - new Date(e.date)) };
    }).sort((a, b) => (b.sc - a.sc) || (a.d - b.d)).map(o => o.x);
    return [...manual, ...scored].slice(0, 3);
  };

  // ── Passe 2 : génération des pages ──
  for (const e of entries) {
    const { slug, title } = e;
    const desc = e.desc;
    const canonical = `${SITE}/blog/${slug}/`;
    const contentHTML = marked.parse(e.body);
    const absImg = e.image ? (e.image.startsWith('http') ? e.image : SITE + e.image) : SITE + DEFAULT_SHARE.path;
    const altTxt = e.imageAlt || title;

    // Données structurées Article (JSON-LD) — aide Google à comprendre l'article
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: desc,
      image: [absImg],
      datePublished: e.date,
      dateModified: e.updated,
      inLanguage: 'fr-FR',
      author: { '@type': 'Person', name: e.author, url: AUTHOR_URL },
      publisher: { '@type': 'Organization', name: 'Glow Up', url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/icons/icon-512.png', width: 512, height: 512 } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    };
    // Fil d'Ariane (breadcrumb) : Accueil › Conseils › Article
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Conseils', item: SITE + '/blog/' },
        { '@type': 'ListItem', position: 3, name: title, item: canonical },
      ],
    };
    const ldScript = `<script type="application/ld+json">${JSON.stringify([ld, breadcrumb])}</script>`;

    // Sous le H1 : auteure (lien vers /a-propos/), date de publication et — seulement s'il y en a une — date de mise à jour
    const byline = `<p class="byline">Par <a href="${AUTHOR_URL}" rel="author">${esc(e.author)}</a> · Publié le <time datetime="${e.date}">${frDate(e.date)}</time>${e.hasUpdate ? ` · Mis à jour le <time datetime="${e.updated}">${frDate(e.updated)}</time>` : ''}</p>`;
    const sourcesHTML = e.sources.length
      ? `<section class="sources"><h2>Sources</h2><ol>${e.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ol></section>`
      : '';
    const rel = relatedOf(e);
    const relatedHTML = rel.length
      ? `<aside class="related"><h2>À lire aussi</h2><ul>${rel.map(r => `<li><a href="${SITE}/blog/${r.slug}/"><strong>${esc(r.title)}</strong><span>${esc(r.excerpt)}</span></a></li>`).join('')}</ul></aside>`
      : '';

    const page = head(e.titreSeo || `${title} · Glow Up`, desc, canonical, e.image, { imgW: e.imgW, imgH: e.imgH, ogTitle: title })
      + ldScript
      + NAV
      + `<main class="article"><div class="wrap"><div class="inner">
          <h1>${esc(title)}</h1>
          ${byline}
        </div></div>
        ${e.image ? `<div class="wrap"><div class="inner">${coverHTML(e.image,'cover',altTxt,e.imgW,e.imgH)}</div></div>` : ''}
        <article class="prose">${contentHTML}</article>
        ${sourcesHTML}
        ${relatedHTML}
        <div class="backcta">
          <strong>Envie d'une routine faite pour ta peau ?</strong><br>
          <a class="btn" href="/">Faire mon analyse ✦</a>
        </div>
        <div class="wrap" style="max-width:680px;margin:0 auto;"><a class="backlink" href="/blog/">← Tous les conseils</a></div>
        </main>`
      + FOOT;

    const dir = path.join(OUT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    posts.push({ title, slug, date: e.date, updated: e.updated, excerpt: e.excerpt, image: e.image, imageAlt: e.imageAlt, imgW: e.imgW, imgH: e.imgH, url: `/blog/${slug}/` });
    console.log('✓ article :', slug);
  }

  // tri par date décroissante
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // page liste
  const cards = posts.map(p => `<a class="card" href="${p.url}">
      ${coverHTML(p.image,'cover',p.imageAlt || p.title,p.imgW,p.imgH)}
      <div class="cbody">
        <span class="date">${frDate(p.date)}</span>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.excerpt)}</p>
        <span class="more">Lire l'article →</span>
      </div></a>`).join('');

  const list = head('Conseils skincare · Le journal Glow Up',
      'Tous nos conseils skincare : routines, actifs, dupes et bons gestes pour prendre soin de ta peau au juste prix.',
      `${SITE}/blog/`, '', { ogType: 'website' })
    + NAV
    + `<header class="bhero"><div class="wrap">
        <span class="kicker">Le journal</span>
        <h1 class="display">Nos conseils skincare</h1>
        <p>Routines, actifs, dupes et bons gestes — pour comprendre ta peau et faire les bons choix, au juste prix.</p>
      </div></header>
      <main><div class="wrap"><div class="grid">${cards}</div></div></main>`
    + FOOT;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), list);

  fs.writeFileSync(path.join(OUT_DIR, 'posts.json'), JSON.stringify(posts, null, 2));

  // ── Page « À propos » (statique, indexable — crédibilité / E-E-A-T) ──
  const aproposDesc = "Glow Up, l'agent IA skincare des femmes de +30 ans : notre mission, notre indépendance (aucune marque ne nous paie) et notre façon de recommander sans influence.";
  const aproposPage = head('À propos de Glow Up', aproposDesc, `${SITE}/a-propos/`, '', { ogType: 'website' })
    + NAV
    + `<main class="article">
      <div class="wrap"><div class="inner">
        <p class="meta">À propos</p>
        <h1>Une routine skincare juste, pour chaque peau après 30&nbsp;ans</h1>
      </div></div>
      <article class="prose">
        <p>Glow Up est un agent beauté nouvelle génération, pensé pour les femmes de plus de 30&nbsp;ans. Notre but&nbsp;: t'aider à <strong>comprendre ta peau</strong> et à construire une <strong>routine skincare vraiment adaptée</strong> — sans jargon, sans pression, et sans te vendre la marque du moment.</p>

        <h2>Pourquoi Glow Up existe</h2>
        <p>Le skincare est devenu un labyrinthe&nbsp;: des milliers de produits, des promesses partout, un marketing omniprésent. Et passé 30&nbsp;ans, quand la peau évolue — fermeté, éclat, hydratation, premières rides —, il devient encore plus difficile de savoir quoi choisir.</p>
        <p>Glow Up est né de cette frustration. Plutôt qu'une énième boutique, on a voulu un outil qui part de <strong>ta</strong> peau&nbsp;: ton type, tes préoccupations, ton âge, ton budget — pour te proposer une routine claire et des produits qui te correspondent vraiment.</p>

        <h2>Notre différence&nbsp;: l'indépendance</h2>
        <p>C'est notre engagement le plus important&nbsp;: <strong>aucune marque ne nous paie pour être recommandée</strong>. Nos suggestions dépendent uniquement des besoins de ta peau, jamais d'un partenariat.</p>
        <p>En toute transparence&nbsp;: pour faire vivre un service gratuit, certains liens vers Amazon contiennent un code affilié — nous touchons alors une petite commission, <strong>identique sur tous les produits</strong>. Cela ne change jamais nos recommandations&nbsp;: on te conseille ce qui convient à ta peau, pas ce qui rapporte le plus.</p>

        <h2>Comment ça marche</h2>
        <ul>
          <li>Une <strong>analyse de ta peau</strong> (quelques questions, et si tu veux une photo analysée par l'IA).</li>
          <li>Une <strong>routine personnalisée</strong> matin et soir, étape par étape, avec le rôle de chaque produit.</li>
          <li>Un <strong>catalogue</strong> filtrable selon tes besoins et ton budget.</li>
          <li>Un outil pour trouver des <strong>dupes</strong> — des alternatives moins chères à composition proche.</li>
          <li>Un <strong>coach IA</strong> pour répondre à tes questions, et un <a href="/blog/">journal de conseils</a> pour comprendre ta peau au fil du temps.</li>
        </ul>

        <h2>Nos engagements</h2>
        <ul>
          <li><strong>Ne jamais inventer une donnée</strong> — composition, prix, ingrédients&nbsp;: on s'appuie sur des sources vérifiées.</li>
          <li><strong>Recommander selon tes besoins</strong>, jamais selon le marketing.</li>
          <li><strong>La bienveillance avant tout</strong>&nbsp;: pas de culpabilisation, pas d'injonction à la perfection.</li>
          <li><strong>Le respect de tes données</strong> personnelles (voir notre <a href="/confidentialite/">politique de confidentialité</a>).</li>
        </ul>

        <h2>Pour qui&nbsp;?</h2>
        <p>Glow Up s'adresse à toutes les femmes de <strong>30 à 70&nbsp;ans</strong> qui veulent prendre soin de leur peau simplement — qu'elles débutent ou s'y connaissent déjà. Peaux matures, peaux sensibles, premières rides ou envie d'éclat&nbsp;: chaque routine part de ta peau, pas d'un modèle unique.</p>

        <p>Glow Up est un projet <strong>indépendant</strong>, porté par une conviction simple&nbsp;: bien choisir ses soins ne devrait être ni compliqué, ni dicté par le marketing.</p>
      </article>
      <div class="backcta">
        <strong>Envie d'une routine faite pour ta peau&nbsp;?</strong><br>
        <a class="btn" href="/">Faire mon analyse ✦</a>
      </div>
      <div class="wrap" style="max-width:680px;margin:0 auto;"><a class="backlink" href="/blog/">← Voir nos conseils</a></div>
      </main>`
    + FOOT;
  fs.mkdirSync(path.join(ROOT, 'a-propos'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'a-propos', 'index.html'), aproposPage);
  console.log('✓ page À propos');

  // ── sitemap.xml + robots.txt (à la racine du site) ──
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: SITE + '/', lastmod: today, priority: '1.0' },
    { loc: SITE + '/blog/', lastmod: today, priority: '0.8' },
    { loc: SITE + '/a-propos/', lastmod: today, priority: '0.5' },
    ...posts.map(p => ({ loc: SITE + p.url, lastmod: (p.updated || p.date || today).slice(0, 10), priority: '0.7' })),
    { loc: SITE + '/confidentialite/', lastmod: today, priority: '0.3' },
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join('\n')
    + `\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

  const robots = `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin\n\nSitemap: ${SITE}/sitemap.xml\n`;
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots);

  console.log(`\nOK — ${posts.length} article(s) · blog/index.html + posts.json + sitemap.xml + robots.txt générés.`);
}

if (require.main === module) {
  main().catch(e => { console.error('ERREUR build-blog:', e); process.exit(1); });
}

module.exports = { CSS, NAV, FOOT, head, parseFront, frDate, esc, coverHTML };
