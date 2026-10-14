/* ============================================================
   build-pages.js — Pages statiques « Skinpedia » (une page par molécule + une page index).
   • Lit js/skinpedia.js (SANS le modifier) : tableau DATA des 12 molécules.
   • Écrit skinpedia/index.html et skinpedia/<molécule>/index.html.
   • Réutilise NAV, FOOT, head() et le style de build-blog.js.
   • Appelé par build-blog.js (qui écrit le sitemap UNIQUE) ; lastmod = date de dernière VRAIE modification
     du contenu (empreinte stockée dans data/page-dates.json), jamais la date du build.
   Règles de contenu : aucune donnée inventée ; les délais, concentrations et chiffres non sourcés sont retirés ;
   rien sur la grossesse (seulement un lien vers l'article « Skincare et grossesse »).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SITE = 'https://www.glowupskin.app';

// ── Slugs et noms d'affichage (titres « X : à quoi sert cet actif ? ») ──
const SLUG = {
  'retinol': 'retinol', 'niacinamide': 'niacinamide', 'hyaluronic-acid': 'acide-hyaluronique', 'vitamin-c': 'vitamine-c',
  'peptides': 'peptides', 'salicylic-acid': 'acide-salicylique', 'aha': 'aha', 'zinc-pca': 'zinc-pca', 'ceramides': 'ceramides',
  'denat-alcohol': 'alcool-denature', 'parfum': 'parfum-fragrance', 'comedogenic-oils': 'huiles-comedogenes'
};
const LABEL = {
  'retinol': 'Rétinol', 'niacinamide': 'Niacinamide', 'hyaluronic-acid': 'Acide hyaluronique', 'vitamin-c': 'Vitamine C',
  'peptides': 'Peptides', 'salicylic-acid': 'Acide salicylique', 'aha': 'AHA', 'zinc-pca': 'Zinc PCA', 'ceramides': 'Céramides',
  'denat-alcohol': 'Alcool dénaturé', 'parfum': 'Parfum et fragrance', 'comedogenic-oils': 'Huiles comédogènes'
};
const TIER = {
  excellent: 'Très bonnes molécules', good: 'Bonnes molécules', caution: 'À limiter'
};
// Article de blog lié (uniquement s'il existe et parle réellement de l'actif)
const BLOG = {
  'retinol': ['retinol-apres-40-ans', 'Rétinol après 40 ans'],
  'hyaluronic-acid': ['acide-hyaluronique-guide', 'Acide hyaluronique : à quoi ça sert et comment l\'utiliser'],
  'vitamin-c': ['taches-brunes-visage', 'Taches brunes sur le visage'],
  'niacinamide': ['taches-brunes-visage', 'Taches brunes sur le visage'],
  'aha': ['taches-brunes-visage', 'Taches brunes sur le visage']
};
// Fiches proches (choix éditorial : même famille d'usage)
const NEAR = {
  'retinol': ['vitamin-c', 'niacinamide', 'peptides'], 'niacinamide': ['vitamin-c', 'zinc-pca', 'salicylic-acid'],
  'hyaluronic-acid': ['ceramides', 'niacinamide', 'peptides'], 'vitamin-c': ['niacinamide', 'retinol', 'hyaluronic-acid'],
  'peptides': ['retinol', 'hyaluronic-acid', 'ceramides'], 'salicylic-acid': ['aha', 'niacinamide', 'zinc-pca'],
  'aha': ['salicylic-acid', 'retinol', 'vitamin-c'], 'zinc-pca': ['niacinamide', 'salicylic-acid', 'comedogenic-oils'],
  'ceramides': ['hyaluronic-acid', 'niacinamide', 'peptides'], 'denat-alcohol': ['parfum', 'ceramides', 'comedogenic-oils'],
  'parfum': ['denat-alcohol', 'ceramides', 'comedogenic-oils'], 'comedogenic-oils': ['zinc-pca', 'salicylic-acid', 'denat-alcohol']
};

// ── Nettoyage : on retire délais, concentrations et chiffres non sourcés, « n°1 », « selon la Commission européenne » ──
// Corrections ciblées (remplacement exact, avant le filtre par phrase) pour ne pas perdre la définition d'une molécule.
const FIXES = [
  ["Dérivé de la vitamine A, le rétinol est l'un des actifs les mieux documentés de la cosmétologie.", "Le rétinol est un dérivé de la vitamine A."],
  [", constituant près de 50% de la barrière cutanée. ", ". "],
  ["un indice comédogène élevé (4–5/5), ce qui", "un indice comédogène élevé, ce qui"],
  ["jojoba (indice 2/5), rosehip (1/5) ou squalane (0/5)", "jojoba, rosehip ou squalane"]
];
const BAD = [
  /\d+(?:[.,]\d+)?\s*[–-]\s*\d/,                         // intervalles : 4–8, 0,5–2, 4–5/5
  /\d+(?:[.,]\d+)?\s*%/,                                // pourcentages
  /\d+\s*(?:semaines?|mois|jours?|fois|heures?)/i,      // délais et fréquences chiffrés
  /\b\d+\s+premiers?\b/i,                               // « les 5 premiers ingrédients »
  /\bn°\s*1\b/i, /selon la Commission/i
];
function clean(text) {
  if (!text) return { text: '', removed: [] };
  let t = String(text);
  FIXES.forEach(([a, b]) => { t = t.split(a).join(b); });
  const removed = [];
  const kept = t.split(/(?<=[.!?])\s+/).filter(s => { const bad = BAD.some(re => re.test(s)); if (bad) removed.push(s.trim()); return !bad; });
  return { text: kept.join(' ').trim(), removed };
}

// ── Affirmations sans source retirées : aucune maladie citée, aucune promesse absolue ──
// Textes de remplacement explicites (la source reste js/skinpedia.js, non modifiée).
const OVERRIDE = {
  'retinol': { tip: "À utiliser le soir, et à éviter avant une exposition solaire. Associer à un SPF chaque matin." },
  'niacinamide': { definition: "La niacinamide est une forme de vitamine B3.", tip: "Utiliser matin et/ou soir." },
  'vitamin-c': { definition: "Antioxydant, la vitamine C neutralise les radicaux libres générés par les UV et la pollution avant qu'ils n'endommagent les cellules cutanées." },
  'peptides': { tip: "S'utilisent en sérum ou en crème." },
  'salicylic-acid': { tip: "Suivre d'un SPF le matin. Peut assécher si utilisé trop souvent." },
  'aha': { tip: "À utiliser le soir : les AHA augmentent la sensibilité au soleil. L'acide lactique est plus doux que l'acide glycolique." },
  'zinc-pca': { role: "Régule la production excessive de sébum.", tip: "S'utilise matin et/ou soir. Souvent associé à la niacinamide. Chercher 'Zinc PCA' dans la liste INCI." },
  'ceramides': { tip: "S'associent à l'acide hyaluronique et au cholestérol." },
  'comedogenic-oils': { role: "Offrent une hydratation occlusive. Plus adaptées aux peaux très sèches ; elles peuvent être problématiques pour les peaux grasses.",
    tip: "Pas mauvaises en soi : utiles pour les peaux très sèches. À éviter en cas de tendance aux boutons. Préférer des huiles légères : jojoba, rosehip ou squalane." },
  'parfum': { tip: "À éviter pour les peaux sensibles. Rechercher les mentions 'fragrance-free' ou 'sans parfum'. Attention : les parfums naturels (huiles essentielles) peuvent être aussi irritants." }
};
// Bénéfices retirés : promesses absolues, allégations de santé, effets « immédiats », qualificatifs non sourcés
const BENEFIT_DENY = /imm[ée]diat|compatible avec|non irritant|non com[ée]dog|propri[ée]t[ée]s|anti-?inflammatoire|antibact|id[ée]al|id[ée]aux|parfait|efficaces?|exfoliation douce et efficace/i;
// Garde-fou : le build échoue si une de ces formulations réapparaît dans le texte d'une fiche
const FORBIDDEN = /ecz[ée]m|acn[ée]|rosac[ée]e|psoria|dermatite|\btous\b|\btoutes\b|toujours|jamais|parfait|pratiquement|sans exception|garanti|id[ée]al|id[ée]aux|efficaces? contre|universel/i;

// ── Lecture des données (sans modifier js/skinpedia.js) ──
function readData() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'skinpedia.js'), 'utf8');
  const a = src.indexOf('const DATA = [');
  if (a < 0) throw new Error('DATA introuvable dans js/skinpedia.js');
  let depth = 0, start = a + 'const DATA = ['.length - 1, end = -1;
  for (let k = start; k < src.length; k++) { const ch = src[k]; if (ch === '[') depth++; else if (ch === ']') { depth--; if (depth === 0) { end = k; break; } } }
  return new Function('return ' + src.slice(start, end + 1))();
}

// ── Dates de dernière vraie modification (empreinte du contenu) ──
function makeStamper() {
  const file = path.join(ROOT, 'data', 'page-dates.json');
  let db = { _note: "Date de dernière vraie modification de chaque page générée (build-pages.js). La date ne change que si l'empreinte du contenu change.", urls: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); if (!db.urls) db.urls = {}; } catch (e) { /* premier lancement */ }
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  return {
    stamp(url, content) {
      const hash = crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 16);
      const cur = db.urls[url];
      if (!cur || cur.hash !== hash) { db.urls[url] = { hash, date: today }; changed = true; }
      return db.urls[url].date;
    },
    save() { if (changed) fs.writeFileSync(file, JSON.stringify(db, null, 2) + '\n'); }
  };
}

function firstSentence(t) { const m = /^[\s\S]*?[.!?](?:\s|$)/.exec(t || ''); return (m ? m[0] : t || '').trim(); }
function cutDesc(t, max = 158) {
  if (t.length <= max) return t;
  const s = t.slice(0, max); const i = Math.max(s.lastIndexOf('. '), s.lastIndexOf(', '), s.lastIndexOf(' '));
  return s.slice(0, i > 60 ? i : max).replace(/[,;:\s]+$/, '') + '…';
}

function build() {
  const { head, NAV, FOOT, esc } = require('./build-blog.js');
  const DATA = readData();
  const stamper = makeStamper();
  const out = [];       // { loc, lastmod } pour le sitemap
  const report = [];
  const SANTE = "Cet article est informatif et ne remplace pas l'avis d'un professionnel de santé.";
  const byId = Object.fromEntries(DATA.map(m => [m.id, m]));
  const url = id => `${SITE}/skinpedia/${SLUG[id]}/`;

  const pages = DATA.map(m => {
    if (!SLUG[m.id]) throw new Error('slug manquant pour ' + m.id);
    const ov = OVERRIDE[m.id] || {};
    const def = ov.definition ? { text: ov.definition, removed: [] } : clean(m.definition);
    const role = ov.role ? { text: ov.role, removed: [] } : clean(m.role);
    const tip = ov.tip ? { text: ov.tip, removed: [] } : clean(m.tip);
    const benefits = (m.benefits || []).filter(b => { const bad = BAD.some(re => re.test(b)) || BENEFIT_DENY.test(b); if (bad) report.push(`${m.id}.benefits : « ${b} » retiré`); return !bad; });
    [['définition', def], ['rôle', role], ['conseil', tip]].forEach(([k, c]) => { if (FORBIDDEN.test(c.text)) throw new Error(`Formulation interdite dans ${m.id}.${k} : ${c.text}`); });
    benefits.forEach(b => { if (FORBIDDEN.test(b)) throw new Error(`Formulation interdite dans ${m.id}.benefits : ${b}`); });
    Object.keys(ov).forEach(k => report.push(`${m.id}.${k} : texte réécrit (affirmation sans source retirée)`));
    [['definition', def], ['role', role], ['tip', tip]].forEach(([k, c]) => c.removed.forEach(s => report.push(`${m.id}.${k} : « ${s} »`)));
    if (m.skinImprovement) report.push(`${m.id}.skinImprovement : section « effets observés » entièrement retirée (délais)`);
    return { m, id: m.id, label: LABEL[m.id], def: def.text, role: role.text, tip: tip.text, benefits };
  });

  const nearLinks = id => NEAR[id].map(n => ({ href: url(n), title: LABEL[n] }));

  pages.forEach(p => {
    const loc = url(p.id), title = `${p.label} : à quoi sert cet actif ?`;
    const desc = cutDesc(`${p.def}${p.role ? ' ' + p.role : ''}`);
    const blog = BLOG[p.id];
    const content = { id: p.id, def: p.def, role: p.role, tip: p.tip, benefits: p.benefits, aka: p.m.aka, tier: p.m.tier, blog: blog ? blog[0] : '', near: NEAR[p.id] };
    const lastmod = stamper.stamp(loc, content);
    out.push({ loc, lastmod, id: p.id });

    const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Skinpedia', item: SITE + '/skinpedia/' },
      { '@type': 'ListItem', position: 3, name: p.label, item: loc }] }];
    const rel = nearLinks(p.id).map(r => `<li><a href="${r.href}"><strong>${esc(r.title)}</strong><span>Fiche Skinpedia</span></a></li>`);
    if (blog) rel.push(`<li><a href="${SITE}/blog/${blog[0]}/"><strong>${esc(blog[1])}</strong><span>Article du blog</span></a></li>`);
    const aka = (p.m.aka || []).filter(a => a.toLowerCase() !== p.label.toLowerCase());

    const html = head(title, desc, loc, '', { ogType: 'website' })
      + `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
      + NAV
      + `<main class="article"><div class="wrap"><div class="inner">
          <h1>${esc(title)}</h1>
          ${aka.length ? `<p class="byline">Aussi appelé&nbsp;: ${esc(aka.join(', '))}</p>` : ''}
        </div></div>
        <article class="prose">
          ${p.def ? `<h2>Définition</h2><p>${esc(p.def)}</p>` : ''}
          ${p.role ? `<h2>Son rôle dans les soins</h2><p>${esc(p.role)}</p>` : ''}
          ${p.benefits.length ? `<h2>Ce qu'on lui attribue</h2><ul>${p.benefits.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
          ${p.tip ? `<h2>Conseil d'utilisation</h2><p>${esc(p.tip)}</p>` : ''}
          <p>Grossesse&nbsp;: voir notre article <a href="${SITE}/blog/skincare-grossesse/">Skincare et grossesse</a>.</p>
          <p class="sante">${SANTE}</p>
        </article>
        <aside class="related"><h2>À lire aussi</h2><ul>${rel.join('')}</ul></aside>
        <div class="backcta">
          <strong>Envie de savoir si cet actif convient à ta peau&nbsp;?</strong><br>
          <a class="btn" href="/">Faire mon analyse ✦</a>
        </div>
        <div class="wrap" style="max-width:680px;margin:0 auto;"><a class="backlink" href="/skinpedia/">← Toute la Skinpedia</a></div>
        </main>`
      + FOOT;
    const dir = path.join(ROOT, 'skinpedia', SLUG[p.id]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  });

  // ── Page index /skinpedia/ ──
  const iloc = `${SITE}/skinpedia/`;
  const ititle = 'Skinpedia : les actifs de soin expliqués simplement';
  const idesc = cutDesc(`Comprends ce que tu appliques sur ta peau : ${pages.length} actifs et ingrédients expliqués simplement, de ${pages[0].label.toLowerCase()} à ${pages[pages.length - 1].label.toLowerCase()}.`);
  const sorted = [...pages].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  const ilastmod = out.reduce((mx, o) => (o.lastmod > mx ? o.lastmod : mx), '');
  const idate = stamper.stamp(iloc, { list: pages.map(p => p.id + ':' + p.m.tier), title: ititle });
  const ildate = idate > ilastmod ? idate : ilastmod;
  const ild = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Skinpedia', item: iloc }] }];
  const ihtml = head(ititle, idesc, iloc, '', { ogType: 'website' })
    + `<script type="application/ld+json">${JSON.stringify(ild)}</script>`
    + NAV
    + `<main class="article"><div class="wrap"><div class="inner">
        <h1>${esc(ititle)}</h1>
      </div></div>
      <article class="prose">
        <p>Comprends ce que tu appliques sur ta peau&nbsp;: chaque actif est expliqué simplement, avec son rôle et un conseil d'utilisation.</p>
        <ul>${sorted.map(p => `<li><a href="${url(p.id)}"><strong>${esc(p.label)}</strong></a> — ${esc(firstSentence(p.def))}</li>`).join('')}</ul>
        <p class="sante">${SANTE}</p>
      </article>
      <div class="backcta">
        <strong>Envie d'une routine faite pour ta peau&nbsp;?</strong><br>
        <a class="btn" href="/">Faire mon analyse ✦</a>
      </div>
      </main>`
    + FOOT;
  fs.mkdirSync(path.join(ROOT, 'skinpedia'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'skinpedia', 'index.html'), ihtml);
  out.push({ loc: iloc, lastmod: ildate });

  stamper.save();
  console.log(`✓ Skinpedia : ${pages.length} fiches + index`);
  if (process.env.SHOW_CLEAN_REPORT || !process.env.GITHUB_ACTIONS) { if (report.length) console.log('  Retiré des fiches :\n   - ' + report.join('\n   - ')); }
  return out.map(({ loc, lastmod }) => ({ loc, lastmod }));
}

module.exports = { build };
if (require.main === module) build();
