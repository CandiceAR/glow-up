/* ============================================================
   build-dupes.js — Pages « dupes » statiques (lot 1) : /dupes/ + /dupes/<produit>/
   • Lit SANS les modifier : data/dupes-lot1.json (paires validées + contenances sourcées),
     data/reference-inci.json, data/dupe-inci.json, data/products-manual.json, data/dupes.json.
   • Appelé par build-pages.js. Tant que data/site-flags.json n'a pas "dupesLive": true,
     rien n'est généré (aperçu local possible avec GLOW_PREVIEW_DUPES=1, sans sitemap).
   Règles de contenu : composition comparée + prix uniquement ; jamais « aussi efficace » ;
   AUCUN pourcentage global de similarité ; aucune note ni avis ; aucune donnée inventée
   (contenance ou source de prix inconnue = écrit tel quel, aucun calcul).
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SITE = 'https://www.glowupskin.app';
const E = require('./lib/inciSim.js');

const LABEL = { retinoid: 'rétinoïde', vitc: 'vitamine C', niacinamide: 'niacinamide', aha: 'AHA', bha: 'BHA (acide salicylique)', pha: 'PHA', brightening: 'actif anti-taches', peptide: 'peptides', pdrn_nad: 'PDRN / NAD', collagen: 'collagène', ha: 'acide hyaluronique', ceramide: 'céramides', snail: "mucine d'escargot" };
const HERO = ['retinoid', 'retinoid_like', 'vitc', 'aha', 'bha', 'pha', 'brightening', 'peptide', 'pdrn_nad', 'collagen'];
const SECOND = ['niacinamide', 'ceramide', 'snail', 'ha'];
const KW = { retinoid: /retin/i, vitc: /vitamin|ascorb/i, niacinamide: /niacin/i, aha: /glycol|lactic|lactique|mandel/i, bha: /salicyl|bha/i, brightening: /arbutin|tranex|kojic|azela|discolor/i, peptide: /peptid/i, ha: /hyaluron|\bha\b|h\.a\./i, ceramide: /ceram/i, snail: /snail|escargot|mucin/i };
const SKINPEDIA = { vitc: ['vitamine-c', 'Vitamine C'], niacinamide: ['niacinamide', 'Niacinamide'], retinoid: ['retinol', 'Rétinol'], aha: ['aha', 'AHA'], ha: ['acide-hyaluronique', 'Acide hyaluronique'], bha: ['acide-salicylique', 'Acide salicylique'], peptide: ['peptides', 'Peptides'], ceramide: ['ceramides', 'Céramides'] };
const BLOGTITLE = { 'taches-brunes-visage': 'Taches brunes sur le visage', 'retinol-apres-40-ans': 'Rétinol après 40 ans', 'acide-hyaluronique-guide': "Acide hyaluronique : à quoi ça sert et comment l'utiliser" };
const PREGNANCY = { retinoid: 'du rétinol (rétinoïde)', bha: "de l'acide salicylique", aha: 'des AHA (acides de fruits)' };

const cn = s => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/aqua\s*\/\s*water(\s*\/\s*eau)?|water\s*\/\s*aqua(\s*\/\s*eau)?|\baqua\b|\beau\b/g, 'water').replace(/[^a-z0-9]+/g, ' ').trim();
const eur = n => n.toFixed(2).replace('.', ',') + ' €';
const num = (n, d = 2) => n.toFixed(d).replace('.', ',');
const frDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Concentration annoncée DANS LE NOM, deux formes sans ambiguïté : « Niacinamide 10% + Zinc 1% » ou « 10% Niacinamide » en tout début de nom
function concInName(name, fam) {
  const re = KW[fam]; if (!re) return null;
  const segs = name.split(/\s*[+&,]\s*|\s+et\s+/i);
  for (const p0 of segs) {
    const p = p0.trim();
    const m = p.match(/^(\d+(?:[.,]\d+)?)\s*%\s*((?:[A-Za-z\-.]+\s*){1,2})/);
    if (m && re.test(m[2])) return m[1].replace('.', ',') + ' %';
    const re2 = /(\d+(?:[.,]\d+)?)\s*%/g; let q;
    while ((q = re2.exec(p))) { const before = p.slice(0, q.index).trim().split(/\s+/).slice(-3).join(' '); if (before && re.test(before)) return q[1].replace('.', ',') + ' %'; }
  }
  return null;
}

function analyse(heroName, refInci, dupeCatName, dupeInci) {
  const A = E.analyze(refInci), B = E.analyze(dupeInci);
  const named = Object.keys(KW).filter(f => KW[f].test(heroName));
  const byName = A.actives.filter(a => named.includes(a.family)).sort((x, y) => x.position - y.position)[0];
  const heroItems = A.actives.filter(a => HERO.includes(a.family) && a.position <= 15).sort((x, y) => x.position - y.position);
  const secondItems = A.actives.filter(a => SECOND.includes(a.family)).sort((x, y) => x.position - y.position);
  const main = byName || heroItems[0] || secondItems[0] || null;
  let common = null;
  if (main) {
    const cand = B.actives.filter(a => a.family === main.family).sort((x, y) => x.position - y.position)[0];
    if (cand) common = { fam: main.family, label: LABEL[main.family] || main.family, refItem: refInci[main.position - 1], refPos: main.position, dupeItem: dupeInci[cand.position - 1], dupePos: cand.position,
      concRef: concInName(heroName, main.family), concDupe: concInName(dupeCatName, main.family), deriv: main.derivKey !== cand.derivKey ? [main.derivKey, cand.derivKey] : null };
  }
  const setA = new Set(refInci.map(cn)), setB = new Set(dupeInci.map(cn));
  const shared = refInci.filter(x => setB.has(cn(x)));
  const act = (an, list) => an.actives.map(a => list[a.position - 1]);
  const onlyRef = act(A, refInci).filter(x => !setB.has(cn(x)));
  const onlyDupe = act(B, dupeInci).filter(x => !setA.has(cn(x)));
  const flag = (list, other) => list.filter(x => /parfum|fragrance|alcohol denat/i.test(x) && !other.has(cn(x)));
  const pregFams = [...new Set(B.actives.map(a => a.family).filter(f => PREGNANCY[f]))];
  return { common, shared, onlyRef: [...new Set(onlyRef)], onlyDupe: [...new Set(onlyDupe)], flagRef: flag(refInci, setB), flagDupe: flag(dupeInci, setA), pregFams };
}

function ensureTag(url) {
  try { const u = new URL(url); if (/amazon\./i.test(u.hostname) && !u.searchParams.get('tag')) u.searchParams.set('tag', 'glowupapp-21'); return u.toString(); } catch (e) { return url; }
}

function build(ctx) {
  const flagsFile = path.join(ROOT, 'data', 'site-flags.json');
  let flags = {}; try { flags = JSON.parse(fs.readFileSync(flagsFile, 'utf8')); } catch (e) { /* pas de fichier = rien de publié */ }
  const preview = process.env.GLOW_PREVIEW_DUPES === '1';
  if (!flags.dupesLive && !preview) return [];
  const { head, NAV, FOOT, esc, stamper } = ctx;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dupes-lot1.json'), 'utf8'));
  cfg.pairs = cfg.pairs.filter(p => !p.hold);   // paires mises en attente (hold: true) : ni page, ni lien, ni index
  const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reference-inci.json'), 'utf8')).refs;
  const DI = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dupe-inci.json'), 'utf8')).dupes;
  const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products-manual.json'), 'utf8')).products;
  const DJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dupes.json'), 'utf8')).dupes;
  const out = [], pages = [];
  const url = slug => `${SITE}/dupes/${slug}/`;

  cfg.pairs.forEach(pr => {
    if (pr.title.length > 60) throw new Error('title > 60 car. : ' + pr.slug);
    const ref = R.find(r => r.key === pr.refKey); if (!ref) throw new Error('référence absente : ' + pr.refKey);
    const cat = P.find(p => p.id === pr.dupeId);
    const dj = DJ.find(x => x.dupeId === pr.dupeId && x.hero.brand === ref.hero.brand && x.hero.name === ref.hero.name); if (!dj) throw new Error('paire absente de dupes.json : ' + pr.slug);
    let dInci, dSrc;
    const di = DI.find(x => x.dupeId === pr.dupeId);
    if (di && di.inci && di.inci.length) { dInci = di.inci; dSrc = { url: di.source.url, title: di.source.productTitle, date: di.retrievedAt, kind: di.source.type }; }
    else if (cat.inciRaw) { dInci = (cat.inciNormalized && cat.inciNormalized.length) ? cat.inciNormalized : cat.inciRaw.split(','); dSrc = { url: cat.inciSourceUrl, title: cat.name, date: cat.inciLastVerifiedAt, kind: 'incidecoder' }; }
    else throw new Error('composition du dupe absente : ' + pr.slug);
    const a = analyse(ref.hero.name, ref.inci, cat.name, dInci);
    // Ingrédient « signature » hors taxonomie du moteur (ex. ferment bifida) : défini à la main dans la paire, avec les rangs vérifiables
    if (pr.mainOverride) {
      const ix = (list, re) => list.findIndex(x => re.test(x)) + 1, re = new RegExp(pr.mainOverride.pattern, 'i');
      const rp = ix(ref.inci, re), dp = ix(dInci, re);
      if (!rp || !dp) throw new Error('ingrédient signature absent d\'une des deux listes : ' + pr.slug);
      a.common = { family: 'signature', label: pr.mainOverride.label, refItem: ref.inci[rp - 1], dupeItem: dInci[dp - 1], refPos: rp, dupePos: dp, concRef: null, concDupe: null, deriv: null };
    }
    if (!a.common) throw new Error('aucun actif principal commun : ' + pr.slug);
    const c = a.common;

    // ── Actif principal commun (la concentration est dite clairement, y compris quand elle diffère) ──
    let conc;
    if (c.concRef && c.concDupe) conc = c.concRef === c.concDupe ? `Les noms des deux produits annoncent la même concentration : ${c.concRef}.` : `La concentration annoncée dans le nom n'est pas la même : ${c.concRef} pour ${ref.hero.brand} ${ref.hero.name}, ${c.concDupe} pour ${cat.name}.`;
    else if (c.concRef) conc = `Le nom du produit de référence annonce ${c.concRef} ; celui du dupe n'annonce pas de concentration.`;
    else if (c.concDupe) conc = `Le nom du dupe annonce ${c.concDupe} ; celui du produit de référence n'annonce pas de concentration.`;
    else conc = "Le nom des deux produits n'annonce pas de concentration.";
    const deriv = c.deriv ? ` Il ne s'agit pas exactement de la même forme (${c.deriv[0]} d'un côté, ${c.deriv[1]} de l'autre).` : '';

    // ── Contenance et prix ──
    const refPrice = (pr.ref.price && pr.ref.price.value) || dj.hero.price;
    const dupePriceOv = pr.dupe.price && pr.dupe.price.value ? pr.dupe.price : null;   // prix relevé chez un revendeur (source + date)
    const dupePrice = dupePriceOv ? dupePriceOv.value : cat.price;
    const rv = pr.ref.volumeMl, dv = pr.dupe.volumeMl;
    // Règle du prix au millilitre : jamais de page « dupe » sans contenances connues, ni pour un produit pas moins cher au ml
    if (!(rv && dv)) throw new Error('contenance manquante (règle du prix au ml) : ' + pr.slug);
    if (dupePrice / dv >= refPrice / rv) throw new Error('dupe pas moins cher au millilitre : ' + pr.slug + ' — à mettre en attente (hold)');
    const refPriceSrc = pr.ref.price && pr.ref.price.source;
    const refPriceTxt = refPriceSrc ? `Prix constaté le ${frDate(pr.ref.price.retrievedAt)} chez <a href="${esc(refPriceSrc.url)}" target="_blank" rel="noopener nofollow">${esc(refPriceSrc.name)}</a>, susceptible d'évoluer.` : `Prix indicatif issu de nos données de comparaison ; source et date de relevé non renseignées.`;
    let economy, unit = [];
    if (rv && dv) {
      const rp = refPrice / rv, dp = dupePrice / dv;
      unit = [`${eur(refPrice)} pour ${rv} ml, soit ${num(rp)} € le millilitre`, `${eur(dupePrice)} pour ${dv} ml, soit ${num(dp)} € le millilitre`];
      economy = `Économie au millilitre : ${num(rp - dp)} € de moins (${Math.round((1 - dp / rp) * 100)} % moins cher).`;
    } else {
      unit = [`${eur(refPrice)}${rv ? ` pour ${rv} ml` : ' — contenance non renseignée'}`, `${eur(dupePrice)}${dv ? ` pour ${dv} ml` : ' — contenance non renseignée'}`];
      const miss = [!rv ? 'du produit de référence' : '', !dv ? 'du dupe' : ''].filter(Boolean).join(' et ');
      economy = `Économie au millilitre : non calculée, la contenance ${miss} n'est pas renseignée.`;
    }

    const refName = `${ref.hero.brand} ${ref.hero.name}`, dupeName = cat.name.startsWith(cat.brand) ? cat.name : `${cat.brand} ${cat.name}`;
    const h1 = `Dupe de ${refName} : ${dupeName}`;
    const desc = `${refName} (${eur(refPrice)}) et ${dupeName} (${eur(dupePrice)}) comparés : ${c.label} commun, ingrédients en commun, différences, contenance et prix.`;
    const loc = url(pr.slug);
    const sp = SKINPEDIA[c.fam];
    const near = pr.near.map(k => cfg.pairs.find(x => x.refKey === k)).filter(Boolean);
    const rel = near.map(n => `<li><a href="${url(n.slug)}"><strong>${esc(n.title)}</strong><span>Page dupe</span></a></li>`);
    if (sp) rel.push(`<li><a href="${SITE}/skinpedia/${sp[0]}/"><strong>${esc(sp[1])} : à quoi sert cet actif ?</strong><span>Fiche Skinpedia</span></a></li>`);
    if (pr.blog) rel.push(`<li><a href="${SITE}/blog/${pr.blog}/"><strong>${esc(BLOGTITLE[pr.blog] || pr.blog)}</strong><span>Article du blog</span></a></li>`);
    const preg = a.pregFams.length ? `<p>Ce dupe contient ${a.pregFams.map(f => PREGNANCY[f]).join(' et ')}. Pendant la grossesse, voir notre article <a href="${SITE}/blog/skincare-grossesse/">Skincare et grossesse</a>.</p>` : '';
    const buy = ensureTag(cat.amazonUrl || '');
    const list = x => x.length ? esc(x.slice(0, 10).join(', ')) : 'aucun';
    const srcLine = (name, s) => s ? `<li>${esc(name)} : liste d'ingrédients ${s.kind === 'official' ? 'publiée par la marque sur sa page officielle' : 'du produit, relevée via INCIDecoder (qui reprend la liste publiée par la marque)'}, relevée le ${frDate(s.date || cfg.retrievedAt)}${s.url ? ` — <a href="${esc(s.url)}" target="_blank" rel="noopener">source</a>` : ''}.</li>` : '';
    const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Dupes', item: SITE + '/dupes/' }, { '@type': 'ListItem', position: 3, name: h1, item: loc }] }];
    const content = { pr, ref: { inci: ref.inci, src: ref.source.url }, dupe: { inci: dInci, price: dupePrice, src: dSrc.url }, refPrice, hero: ref.hero };
    const lastmod = stamper.stamp(loc, content);
    pages.push({ slug: pr.slug, title: pr.title, h1, loc, lastmod });

    const html = head(pr.title, desc, loc, '', { ogType: 'website' })
      + `<script type="application/ld+json">${JSON.stringify(ld)}</script>` + NAV
      + `<main class="article"><div class="wrap"><div class="inner"><h1>${esc(h1)}</h1></div></div>
        <article class="prose">
          <h2>Actif principal commun : ${esc(c.label)}</h2>
          <p>Les deux produits en contiennent : « ${esc(c.refItem)} » (ingrédient n°${c.refPos}) chez ${esc(ref.hero.name)}, « ${esc(c.dupeItem)} » (ingrédient n°${c.dupePos}) chez ${esc(cat.name)}. ${esc(conc)}${esc(deriv)}</p>
          <h2>Ingrédients en commun</h2>
          <p>${a.shared.length ? 'Présents dans les deux listes : ' + esc(a.shared.join(', ')) + '.' : 'Aucun ingrédient identique dans les deux listes.'}</p>
          <h2>Différences notables</h2>
          <ul>
            <li>Dans ${esc(ref.hero.name)}, pas dans ${esc(cat.name)} : ${list(a.onlyRef)}.</li>
            <li>Dans ${esc(cat.name)}, pas dans ${esc(ref.hero.name)} : ${list(a.onlyDupe)}.</li>
            ${a.flagDupe.length ? `<li>Le dupe contient aussi : ${esc(a.flagDupe.join(', '))}.</li>` : ''}${a.flagRef.length ? `<li>Le produit de référence contient aussi : ${esc(a.flagRef.join(', '))}.</li>` : ''}
            <li>Longueur des listes d'ingrédients : ${ref.inci.length} pour ${esc(ref.hero.name)}, ${dInci.length} pour ${esc(cat.name)}.</li>
          </ul>
          ${preg}
          <h2>Contenance et prix</h2>
          <ul>
            <li>${esc(refName)} : ${esc(unit[0])}.</li>
            <li>${esc(dupeName)} : ${esc(unit[1])}.</li>
          </ul>
          <p>${esc(economy)}</p>
          <p>${refPriceTxt} ${dupePriceOv && dupePriceOv.source ? `Prix du dupe constaté le ${frDate(dupePriceOv.retrievedAt)} chez <a href="${esc(dupePriceOv.source.url)}" target="_blank" rel="noopener nofollow">${esc(dupePriceOv.source.name)}</a>, susceptible d'évoluer.` : 'Prix du dupe : prix du catalogue Glow Up, qui peut évoluer.'}${pr.dupe.volumeNote ? ' ' + esc(pr.dupe.volumeNote) : ''}</p>
          <p>${[pr.ref.volumeSource ? `Contenance de ${esc(ref.hero.name)} : ${esc(pr.ref.volumeSource.name)}${pr.ref.volumeSource.url ? ` (<a href="${esc(pr.ref.volumeSource.url)}" target="_blank" rel="noopener">source</a>)` : ''}, relevée le ${frDate(pr.ref.volumeSource.retrievedAt || cfg.retrievedAt)}.` : '', pr.dupe.volumeSource ? `Contenance de ${esc(cat.name)} : ${esc(pr.dupe.volumeSource.name)}${pr.dupe.volumeSource.url ? ` (<a href="${esc(pr.dupe.volumeSource.url)}" target="_blank" rel="noopener">source</a>)` : ''}.` : ''].filter(Boolean).join(' ')}</p>
          <h2>Source de la composition</h2>
          <ul>${srcLine(ref.hero.name, { url: ref.source.url, date: ref.retrievedAt, kind: 'incidecoder' })}${srcLine(cat.name, dSrc)}</ul>
          <p>Cette comparaison porte sur les listes d'ingrédients, les contenances et les prix : elle ne dit rien de l'efficacité des produits. Les concentrations réelles, la formulation et la tolérance peuvent différer.</p>
          ${buy ? `<p><a class="btn" href="${esc(buy)}" target="_blank" rel="noopener nofollow sponsored">Voir ${esc(cat.name)} sur Amazon</a></p><p><small>Lien affilié : nous touchons une petite commission, sans surcoût pour toi.</small></p>` : ''}
        </article>
        <aside class="related"><h2>À lire aussi</h2><ul>${rel.join('')}</ul></aside>
        <div class="backcta"><strong>Envie de savoir si ce produit convient à ta peau&nbsp;?</strong><br><a class="btn" href="/">Faire mon analyse ✦</a></div>
        <div class="wrap" style="max-width:680px;margin:0 auto;"><a class="backlink" href="/dupes/">← Toutes les pages dupes</a></div>
        </main>` + FOOT;
    const dir = path.join(ROOT, 'dupes', pr.slug); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), html);
  });

  // Garde-fou : on ne publie pas une page dont le prix de référence n'a ni source ni date
  const noSrc = cfg.pairs.filter(p => !(p.ref.price && p.ref.price.source));
  if (flags.dupesLive && noSrc.length) throw new Error('Prix de référence sans source ni date : ' + noSrc.map(p => p.slug).join(', '));
  if (noSrc.length) console.warn('⚠️ Prix de référence sans source ni date (publication bloquée) :', noSrc.length, 'page(s)');

  // ── Page index /dupes/ ──
  const iloc = SITE + '/dupes/', ititle = 'Dupes : compositions, contenances et prix comparés';
  const idesc = `${pages.length} comparaisons de produits de soin : actif principal commun, ingrédients en commun, différences, contenance et prix.`;
  const ild = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Dupes', item: iloc }] }];
  const idate = stamper.stamp(iloc, pages.map(p => p.slug + ':' + p.lastmod));
  const ihtml = head(ititle, idesc, iloc, '', { ogType: 'website' }) + `<script type="application/ld+json">${JSON.stringify(ild)}</script>` + NAV
    + `<main class="article"><div class="wrap"><div class="inner"><h1>${esc(ititle)}</h1></div></div>
      <article class="prose"><p>Chaque page compare deux produits de soin : l'actif principal qu'ils ont en commun, les ingrédients identiques, les différences, la contenance et le prix. Elle compare les listes d'ingrédients, pas l'efficacité.</p>
      <ul>${pages.map(p => `<li><a href="${p.loc}">${esc(p.h1)}</a></li>`).join('')}</ul></article>
      <div class="backcta"><strong>Envie d'une routine faite pour ta peau&nbsp;?</strong><br><a class="btn" href="/">Faire mon analyse ✦</a></div></main>` + FOOT;
  fs.mkdirSync(path.join(ROOT, 'dupes'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'dupes', 'index.html'), ihtml);
  console.log(`✓ Dupes : ${pages.length} pages + index${preview && !flags.dupesLive ? ' (APERÇU LOCAL, hors sitemap)' : ''}`);
  if (preview && !flags.dupesLive) return [];
  return [...pages.map(p => ({ loc: p.loc, lastmod: p.lastmod })), { loc: iloc, lastmod: idate }];
}
module.exports = { build };
