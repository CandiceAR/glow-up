/* ============================================================
   netlify/functions/saveProducts.js
   Persiste les produits dans data/products-manual.json via GitHub API
   ============================================================ */

const OWNER = 'CandiceAR';
const REPO = 'glow-up';
const FILE_PATH = 'data/products-manual.json';

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'GITHUB_TOKEN non configuré dans Netlify' })
    };
  }

  try {
    const { products } = JSON.parse(event.body);
    if (!Array.isArray(products)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Pas de tableau "products" fourni' })
      };
    }

    // 1. Récupère le fichier actuel pour son SHA
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    let sha = null;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    } else if (getRes.status !== 404) {
      // Erreur autre que "fichier non trouvé"
      const err = await getRes.json();
      return {
        statusCode: getRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.message || 'Erreur GitHub' })
      };
    }

    // 2. Prepare le payload JSON
    const payload = {
      _meta: {
        version: '1.0',
        source: 'admin',
        tag: 'kand10ar-21',
        lastUpdated: new Date().toISOString().split('T')[0],
        totalProducts: products.length
      },
      products
    };

    const newContent = JSON.stringify(payload, null, 2);
    const contentBase64 = Buffer.from(newContent).toString('base64');

    // 3. Update le fichier via GitHub API
    const putBody = {
      message: `[Admin] Mise à jour produits — ${new Date().toLocaleString('fr-FR')}`,
      content: contentBase64
    };

    if (sha) {
      putBody.sha = sha;
    }

    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json();
      return {
        statusCode: putRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err.message || 'Erreur lors de l\'écriture' })
      };
    }

    const result = await putRes.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        ok: true,
        commit: result.commit.sha,
        message: `${products.length} produits sauvegardés dans ${FILE_PATH}`
      })
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
