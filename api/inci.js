/* ============================================================
   api/inci.js — Récupère la liste INCI d'un produit via Open Beauty Facts.
   Entrée (POST JSON) : { barcode?, brand?, name? }
   Priorité : code-barres (fiable) → recherche par nom (secours, moins fiable).
   Sortie : {
     found: boolean,
     inci: "texte INCI brut",
     inciList: ["aqua","glycerin",...],   // normalisé, minuscules
     source: "openbeautyfacts" | null,
     confidence: "high" | "medium" | "low" | "none",
     matchedName: "nom du produit trouvé",
     barcode: "..."          // code-barres réellement utilisé si trouvé par nom
   }
   Ne renvoie JAMAIS d'ingrédient inventé : uniquement ce qu'OBF fournit.
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const OBF_UA = 'GlowUp/1.0 (skincare dupe finder; contact@glowupskin.app)';
const FIELDS = 'code,product_name,brands,ingredients_text,ingredients_text_fr';

function _normList(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .replace(/\([^)]*\)/g, ' ')          // retire (parenthèses / %)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/['’‘]/g, ',')              // certaines fiches OBF utilisent ' comme séparateur
    .split(/[,•\n;]+/)
    .map(s => s.trim().toLowerCase().replace(/\.$/, '').replace(/\s{2,}/g, ' '))
    .filter(s => s.length > 1 && s.length < 60)
    .slice(0, 80);
}

function _inciText(p) {
  return (p.ingredients_text_fr && p.ingredients_text_fr.trim())
      || (p.ingredients_text && p.ingredients_text.trim())
      || '';
}

// Le nom/marque du produit trouvé contient-il des mots de la requête ?
function _looseMatch(p, q) {
  const hay = ((p.product_name || '') + ' ' + (p.brands || '')).toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  if (!words.length) return true;
  const hits = words.filter(w => hay.includes(w)).length;
  return hits >= Math.min(2, words.length);   // au moins 2 mots (ou tous si <2)
}

async function _fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': OBF_UA } });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const { barcode, brand, name } = req.body || {};
  const empty = { found: false, inci: '', inciList: [], source: null, confidence: 'none', matchedName: '', barcode: '' };

  try {
    // 1) Par code-barres (fiable)
    const code = (barcode || '').replace(/\D/g, '');
    if (code.length >= 8) {
      const data = await _fetchJson(`https://world.openbeautyfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`);
      const p = data && data.product;
      const text = p ? _inciText(p) : '';
      if (text) {
        return res.status(200).json({
          found: true, inci: text, inciList: _normList(text),
          source: 'openbeautyfacts', confidence: 'high',
          matchedName: p.product_name || '', barcode: code
        });
      }
    }

    // 2) Par nom (secours, moins fiable)
    const q = [brand, name].filter(Boolean).join(' ').trim();
    if (q.length >= 3) {
      const enc = encodeURIComponent(q);
      const data = await _fetchJson(`https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=6&fields=${FIELDS}`);
      const products = (data && data.products) || [];
      // On garde le 1er résultat AVEC INCI et dont le nom/marque correspond vraiment
      for (const p of products) {
        const text = _inciText(p);
        if (text && _looseMatch(p, q)) {
          return res.status(200).json({
            found: true, inci: text, inciList: _normList(text),
            source: 'openbeautyfacts', confidence: 'medium',
            matchedName: p.product_name || '', barcode: p.code || ''
          });
        }
      }
      // Un résultat avec INCI mais correspondance faible → confiance basse
      const weak = products.find(p => _inciText(p));
      if (weak) {
        const text = _inciText(weak);
        return res.status(200).json({
          found: true, inci: text, inciList: _normList(text),
          source: 'openbeautyfacts', confidence: 'low',
          matchedName: weak.product_name || '', barcode: weak.code || ''
        });
      }
    }

    return res.status(200).json(empty);
  } catch (err) {
    console.error('[inci] erreur:', err.message);
    return res.status(200).json(empty);   // jamais bloquant : pas d'INCI = confiance none
  }
};
