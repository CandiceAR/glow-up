/* ============================================================
   api/inci.js — Composition (liste INCI) d'un produit, sans rien inventer.
   Deux modes (un seul fichier : limite de 12 fonctions Vercel) :

   1) mode « lookup » (par défaut) — Entrée : { barcode?, brand?, name? }
      Cherche dans : nos fiches vérifiées → cache → Open Beauty Facts (code-barres, nom) → INCIDecoder.
      Voir lib/inciLookup.js. Sortie :
      { found, inci, inciList[], confidence: 'high'|'medium'|'none', source, sourceUrl, sourceLabel,
        retrievedAt, matchedName, barcode, quantity, volumeMl }
        • high   : utilisable tel quel
        • medium : nom proche mais pas identique → l'appli demande de CONFIRMER le produit
        • none   : rien de fiable → l'appli demande la photo de la liste d'ingrédients

   2) mode « photo » — Entrée : { mode:'photo', photo:'data:image/jpeg;base64,…' }
      Lit la liste d'ingrédients PHOTOGRAPHIÉE par l'utilisatrice (modèle de vision Haiku), mot pour mot.
      Sortie : mêmes champs, confidence 'photo', source 'photo' → affichée « Lue sur ta photo, à vérifier ».
      L'IA ne fait que recopier ce qui est écrit : si la photo est illisible, elle ne renvoie rien.
   ============================================================ */

const { lookup, splitInci, cleanList, EMPTY } = require('../lib/inciLookup.js');
const MainActive = require('../lib/mainActive.js');
const _sim = require('../lib/inciSim.js');

// Actif principal déduit de la composition (jamais de l'IA) : sert à choisir les produits à comparer
function withActive(r) {
  if (!r || !r.found || !Array.isArray(r.inciList)) return r;
  const fam = MainActive.fromInci(r.inciList, _sim);
  return Object.assign({}, r, { mainFamily: fam || null, mainLabel: fam ? MainActive.label(fam) : '' });
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function readPhoto(photo, apiKey) {
  const m = String(photo || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/s);
  if (!m) return { error: 'Format photo invalide', status: 400 };
  if (m[2].length > 5000000) return { error: 'Image trop grande', status: 413 };

  const prompt = `Cette photo montre la liste d'ingrédients (liste INCI) imprimée sur l'emballage d'un produit cosmétique.

Recopie EXACTEMENT les ingrédients, dans l'ordre où ils sont écrits, un par élément de la liste.
RÈGLES IMPÉRATIVES :
- Ne corrige rien, ne complète rien, n'ajoute aucun ingrédient, ne traduis pas.
- Si un passage est illisible, arrête-toi avant plutôt que de deviner.
- Si la photo ne montre pas une liste d'ingrédients lisible, réponds avec une liste vide.
- Ignore tout ce qui n'est pas la liste (marque, conseils d'utilisation, adresse…).

Réponds UNIQUEMENT avec ce JSON :
{ "readable": true ou false, "ingredients": ["Aqua", "Glycerin", ...] }`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: prompt }
      ] }]
    })
  });
  if (!resp.ok) return { error: 'API Anthropic indisponible', status: 502 };
  const ai = await resp.json();
  const raw = (ai && ai.content && ai.content[0] && ai.content[0].text || '').trim();
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    const j = raw.match(/\{[\s\S]*\}/);
    try { parsed = j ? JSON.parse(j[0]) : null; } catch (e2) { parsed = null; }
  }
  return { parsed };
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const body = req.body || {};

  if (body.mode === 'photo') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY manquante' });
    try {
      const out = await readPhoto(body.photo, apiKey);
      if (out.error) return res.status(out.status).json({ error: out.error });
      const items = out.parsed && out.parsed.readable && Array.isArray(out.parsed.ingredients)
        ? out.parsed.ingredients.filter(x => typeof x === 'string').map(x => x.trim()).filter(x => x.length > 1 && x.length < 90).slice(0, 80)
        : [];
      // moins de 5 éléments : ce n'est pas une vraie liste lue → on ne s'en sert pas
      if (items.length < 5) return res.status(200).json(Object.assign({}, EMPTY, { readable: false }));
      return res.status(200).json(withActive({
        found: true, readable: true, inci: items.join(', '), inciList: cleanList(items), confidence: 'photo',
        source: 'photo', sourceUrl: '', sourceLabel: 'lue sur ta photo (à vérifier)',
        retrievedAt: new Date().toISOString().slice(0, 10), matchedName: '', barcode: '', quantity: '', volumeMl: null
      }));
    } catch (e) {
      console.error('[inci photo] erreur:', e.message);
      return res.status(500).json({ error: 'Lecture de la photo échouée' });
    }
  }

  // mode « lookup » : ne lève jamais d'erreur (pas de composition = confiance « none »)
  const r = await lookup({ barcode: body.barcode, brand: body.brand, name: body.name });
  return res.status(200).json(withActive(r));
};
