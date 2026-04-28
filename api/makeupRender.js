/* ============================================================
   api/makeupRender.js — Proxy Replicate pour rendu maquillage IA
   Modèle : black-forest-labs/flux-fill-pro (inpainting)
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(503).json({ error: 'REPLICATE_API_TOKEN non configuré' });

  const { image, mask, prompt, zone } = req.body || {};
  if (!image || !mask || !prompt) {
    return res.status(400).json({ error: 'image, mask et prompt requis' });
  }

  try {
    // 1. Lancer la prédiction
    const startRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Prefer':        'wait'   // attend le résultat directement (max 60s)
      },
      body: JSON.stringify({
        input: {
          image,
          mask,
          prompt,
          guidance:         30,
          steps:            25,
          output_format:    'jpeg',
          output_quality:   90,
          safety_tolerance: 6
        }
      })
    });

    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}));
      return res.status(startRes.status).json({ error: err?.detail || 'Replicate error' });
    }

    const prediction = await startRes.json();

    // Si la réponse est immédiate (Prefer: wait)
    if (prediction.status === 'succeeded' && prediction.output) {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return res.json({ url: outputUrl, id: prediction.id });
    }

    // Sinon polling (fallback)
    const id = prediction.id;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes  = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const poll = await pollRes.json();
      if (poll.status === 'succeeded') {
        const url = Array.isArray(poll.output) ? poll.output[0] : poll.output;
        return res.json({ url, id });
      }
      if (poll.status === 'failed' || poll.status === 'canceled') {
        return res.status(500).json({ error: `Prediction ${poll.status}`, detail: poll.error });
      }
    }
    return res.status(504).json({ error: 'Timeout — prédiction trop longue' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
