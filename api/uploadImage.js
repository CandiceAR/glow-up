/* ============================================================
   api/uploadImage.js — Upload image dans assets/ via GitHub API (Vercel)
   ============================================================ */

const OWNER = 'CandiceAR';
const REPO  = 'glow-up';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(503).json({ error: 'GITHUB_TOKEN non configuré' });

  const { filename, contentBase64 } = req.body || {};
  if (!filename || !contentBase64) {
    return res.status(400).json({ error: 'filename et contentBase64 requis' });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, '-');
  const filePath = `assets/${safeName}`;

  const getRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );

  let sha = null;
  if (getRes.ok) {
    const fileData = await getRes.json();
    sha = fileData.sha;
  }

  const putBody = { message: `[Admin] Upload image: ${safeName}`, content: contentBase64 };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization:   `token ${token}`,
        Accept:          'application/vnd.github.v3+json',
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(putBody)
    }
  );

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    console.error('[uploadImage] GitHub API error:', putRes.status, err);
    return res.status(putRes.status).json({
      error: err.message || 'Erreur upload',
      github_status: putRes.status
    });
  }

  return res.status(200).json({ ok: true, path: filePath, filename: safeName });
}

handler.config = { api: { bodyParser: { sizeLimit: '10mb' } } };

module.exports = handler;
