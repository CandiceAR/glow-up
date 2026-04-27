/* ============================================================
   api/saveProducts.js — Persiste les produits via GitHub API (Vercel)
   ============================================================ */

const OWNER     = 'CandiceAR';
const REPO      = 'glow-up';
const FILE_PATH = 'data/products-manual.json';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(503).json({ error: 'GITHUB_TOKEN non configuré' });

  const { products } = req.body || {};
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'Pas de tableau "products" fourni' });
  }

  const getRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );

  let sha = null;
  if (getRes.ok) {
    const fileData = await getRes.json();
    sha = fileData.sha;
  } else if (getRes.status !== 404) {
    const err = await getRes.json();
    return res.status(getRes.status).json({ error: err.message || 'Erreur GitHub' });
  }

  const payload = {
    _meta: {
      version: '1.0', source: 'admin', tag: 'kand10ar-21',
      lastUpdated: new Date().toISOString().split('T')[0],
      totalProducts: products.length
    },
    products
  };

  const contentBase64 = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');
  const putBody = {
    message: `[Admin] Mise à jour produits — ${new Date().toLocaleString('fr-FR')}`,
    content: contentBase64
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
    {
      method: 'PUT',
      headers: {
        Authorization:  `token ${token}`,
        Accept:         'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    }
  );

  if (!putRes.ok) {
    const err = await putRes.json();
    return res.status(putRes.status).json({ error: err.message || 'Erreur écriture' });
  }

  const result = await putRes.json();
  return res.status(200).json({
    ok: true,
    commit: result.commit.sha,
    message: `${products.length} produits sauvegardés`
  });
};
