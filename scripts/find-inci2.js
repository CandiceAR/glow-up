/* ============================================================
   scripts/find-inci2.js — LOT 3 : 2e passe de recherche des compositions (INCIDecoder) pour les SOINS sans
   composition, avec plusieurs façons d'écrire le nom (mots français traduits, marque + mots clés, nom seul).
   Écrit data/inci-candidates-batch3.json — NE FUSIONNE RIEN. Usage : node scripts/find-inci2.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { get, tokens, dice, grade, dec, sleep, ZW, TODAY } = require('./find-inci.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'inci-candidates-batch3.json');
const MK = new Set(['foundation', 'concealer', 'corrector', 'powder', 'primer', 'blush', 'bronzer', 'highlighter', 'mascara', 'eyeliner', 'eyebrow', 'eyeshadow', 'lipstick', 'lipgloss', 'lipliner', 'lipbalm', 'set', 'tools', 'multi_usage']);

async function slugsFor(q) {
  const r = await get('https://incidecoder.com/search?query=' + encodeURIComponent(q));
  return [...new Set([...r.body.matchAll(/href="(\/products\/[a-z0-9-]+)"/g)].map(m => m[1]))].filter(l => !/create/.test(l)).slice(0, 8);
}

async function fromIncidecoder2(p) {
  const base = (p.brand + ' ' + p.name).replace(/\b\d+\s?(ml|g)\b/gi, '').trim();
  const tk = tokens(base), bt = tokens(p.brand);
  const nameOnly = tokens(p.name).filter(t => !bt.includes(t));
  const distinct = [...new Set(nameOnly)].sort((a, b) => b.length - a.length).slice(0, 2);
  const queries = [...new Set([base, tk.join(' '), p.brand + ' ' + distinct.join(' '), nameOnly.join(' ')].filter(x => x && x.length > 3))];
  let slugs = [];
  for (const q of queries) { slugs.push(...await slugsFor(q)); await sleep(200); }
  slugs = [...new Set(slugs)];
  const ranked = slugs.map(l => ({ l, s: dice(tk, tokens(l.replace('/products/', '').replace(/-/g, ' '))) })).sort((a, b) => b.s - a.s).slice(0, 3);
  let best = null;
  for (const { l, s } of ranked) {
    if (s < 0.35) continue;
    const pr = await get('https://incidecoder.com' + l); const h = pr.body; if (!h) continue;
    const title = dec((/<title>([^<]*)<\/title>/.exec(h) || [])[1] || '').replace(/\s*[-–|]\s*INCIDecoder.*$/i, '').replace(/\s*ingredients\s*\(explained\).*$/i, '').replace(ZW, '').trim();
    const list = [...h.matchAll(/<a[^>]*class="[^"]*product-long-ingred-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g)]
      .map(m => dec(m[1].replace(/<[^>]+>/g, '')).replace(ZW, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (list.length < 5) continue;
    const g = grade(p, title);
    if (!best || g.score > best.score) best = { ...g, type: 'incidecoder', url: 'https://incidecoder.com' + l, matchedTitle: title, inci: list };
    await sleep(200);
  }
  return best;
}

(async () => {
  const all = require(path.join(ROOT, 'data', 'products-manual.json')).products.filter(p => p.active !== false);
  const seen = new Set();
  for (const f of ['inci-candidates.json', 'inci-candidates-batch2.json']) {
    try { JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).items.forEach(i => { if (['trouvé', 'fusionné', 'à vérifier'].includes(i.status) || i.inci) seen.add(i.id); }); } catch (e) {}
  }
  const todo = all.filter(p => !MK.has(p.category) && !(p.inciNormalized && p.inciNormalized.length) && !seen.has(p.id));
  console.log(todo.length + ' soins sans composition (hors ceux déjà trouvés en attente de validation)');
  const items = []; const q = todo.slice(); let done = 0;
  const save = () => {
    const st = {}; items.forEach(i => { st[i.status] = (st[i.status] || 0) + 1; });
    fs.writeFileSync(OUT, JSON.stringify({ _note: 'LOT 3 — 2e passe, NON fusionné. À valider.', generatedAt: new Date().toISOString(), searched: todo.length, processed: items.length, stats: st, items }, null, 1));
  };
  const worker = async () => {
    while (q.length) {
      const p = q.shift(); const base = { id: p.id, brand: p.brand, name: p.name, category: p.category };
      try {
        const b = await fromIncidecoder2(p);
        if (!b) items.push({ ...base, status: 'introuvable' });
        else items.push({ ...base, status: b.confidence !== 'faible' ? 'trouvé' : 'faible', source: { type: b.type, url: b.url, matchedTitle: b.matchedTitle }, matchScore: b.score, confidence: b.confidence, brandMatch: b.brandMatch, percentMatch: b.percentMatch, retrievedAt: TODAY, inci: b.inci, inciRaw: b.inci.join(', ') });
      } catch (e) { items.push({ ...base, status: 'erreur', error: e.message }); }
      done++; if (done % 10 === 0) { save(); console.log('  ' + done + '/' + todo.length); }
      await sleep(250);
    }
  };
  await Promise.all([worker(), worker(), worker()]); save();
  const st = {}; items.forEach(i => { st[i.status] = (st[i.status] || 0) + 1; });
  console.log('Terminé :', JSON.stringify(st));
})();
