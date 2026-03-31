/* ============================================================
   netlify/functions/uploadImage.js
   Upload une image dans assets/ via GitHub API
   ============================================================ */

const OWNER = 'CandiceAR';
const REPO  = 'glow-up';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: 'GITHUB_TOKEN non configuré dans Netlify' })
    };
  }

  let filename, contentBase64;
  try {
    ({ filename, contentBase64 } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Corps invalide' }) };
  }

  if (!filename || !contentBase64) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'filename et contentBase64 requis' }) };
  }

  // Sécuriser le nom de fichier
  const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, '-');
  const filePath = `assets/${safeName}`;

  // Récupérer le SHA si le fichier existe déjà (pour mise à jour)
  const getRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );

  let sha = null;
  if (getRes.ok) {
    const fileData = await getRes.json();
    sha = fileData.sha;
  }

  // Upload via GitHub API
  const putBody = {
    message: `[Admin] Upload image: ${safeName}`,
    content: contentBase64
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    }
  );

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    return {
      statusCode: putRes.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message || 'Erreur lors de l\'upload' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify({ ok: true, path: filePath, filename: safeName })
  };
};
