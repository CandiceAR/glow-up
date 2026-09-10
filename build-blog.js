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
const SITE      = 'https://glowupskin.app';

// ── Frontmatter minimal (--- clé: valeur --- + corps Markdown) ──
function parseFront(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  m[1].split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i === -1) return;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    data[key] = val;
  });
  return { data, body: m[2] };
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
.bnav .brand{font-family:var(--serif);font-weight:600;font-size:26px;color:var(--terra);text-decoration:none;line-height:1;}
.bnav .links{margin-left:auto;display:flex;gap:24px;font-size:14px;}
.bnav .links a{color:var(--muted);text-decoration:none;}
.bnav .links a:hover{color:var(--terra);}
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
`;

function head(title, desc, canonical, image) {
  const img = image ? (image.startsWith('http') ? image : SITE + image) : '';
  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>`;
}

const NAV = `<nav class="bnav"><div class="wrap">
<a class="brand" href="/">glow up</a>
<div class="links"><a href="/">Accueil</a><a href="/blog/">Conseils</a><a href="/">Faire mon analyse</a></div>
</div></nav>`;

const FOOT = `<footer class="foot"><div class="wrap">
<div class="fb">glow up</div>
<div class="fl"><a href="/">Accueil</a><a href="/blog/">Conseils</a><a href="https://www.instagram.com/">Instagram</a></div>
<div class="copy">© ${new Date().getFullYear()} Glow Up · Ton agent IA skincare</div>
</div></footer></body></html>`;

function coverHTML(image, cls) {
  return `<div class="${cls}">${image ? `<img src="${esc(image)}" alt="">` : ''}</div>`;
}

async function main() {
  const { marked } = await import('marked');
  marked.setOptions({ mangle:false, headerIds:true });

  if (!fs.existsSync(POSTS_DIR)) { console.error('Aucun dossier blog/posts'); process.exit(1); }
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data, body } = parseFront(raw);
    const slug = data.slug || file.replace(/\.md$/, '');
    const title = data.title || slug;
    const desc = data.metaDescription || data.excerpt || '';
    const canonical = `${SITE}/blog/${slug}/`;
    const contentHTML = marked.parse(body);

    const page = head(`${title} · Glow Up`, desc, canonical, data.image)
      + NAV
      + `<main class="article"><div class="wrap"><div class="inner">
          <p class="meta">${frDate(data.date)}${data.author ? ' · ' + esc(data.author) : ''}</p>
          <h1>${esc(title)}</h1>
        </div></div>
        ${data.image ? `<div class="wrap"><div class="inner">${coverHTML(data.image,'cover')}</div></div>` : ''}
        <article class="prose">${contentHTML}</article>
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
    posts.push({ title, slug, date: data.date || '', excerpt: data.excerpt || '', image: data.image || '', url: `/blog/${slug}/` });
    console.log('✓ article :', slug);
  }

  // tri par date décroissante
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // page liste
  const cards = posts.map(p => `<a class="card" href="${p.url}">
      ${coverHTML(p.image,'cover')}
      <div class="cbody">
        <span class="date">${frDate(p.date)}</span>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.excerpt)}</p>
        <span class="more">Lire l'article →</span>
      </div></a>`).join('');

  const list = head('Conseils skincare · Le journal Glow Up',
      'Tous nos conseils skincare : routines, actifs, dupes et bons gestes pour prendre soin de ta peau au juste prix.',
      `${SITE}/blog/`, '')
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
  console.log(`\nOK — ${posts.length} article(s) · blog/index.html + blog/posts.json générés.`);
}

if (require.main === module) {
  main().catch(e => { console.error('ERREUR build-blog:', e); process.exit(1); });
}

module.exports = { CSS, NAV, FOOT, head, parseFront, frDate, esc, coverHTML };
