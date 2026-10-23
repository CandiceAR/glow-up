/* ============================================================
   api/makeupRender.js — Proxy Replicate pour rendu maquillage IA
   Modèle : black-forest-labs/flux-fill-pro (inpainting) v2
   ============================================================ */

const AI = require('../lib/aiGuard.js');

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

  // SÉCURITÉ (23 oct. 2026) : ce service d'images est PAYANT à chaque appel et n'avait aucun contrôle.
  // Désormais : compte obligatoire, 4 appels par heure et par IP, plafond de coût global (3 €/jour).
  const G = await AI.guard(req, res, 'makeupRender', { ai: true, auth: true });
  if (!G) return;

  const { image, mask, prompt, zone } = req.body || {};
  if (!image || !mask || !prompt) {
    return res.status(400).json({ error: 'image, mask et prompt requis' });
  }
  // Entrées bornées : des images (jusqu'à ~6 Mo) et une consigne courte — pas un générateur d'images ouvert
  const isImg = s => typeof s === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,/.test(s) && s.length < 8000000;
  if (!isImg(image) || !isImg(mask) || typeof prompt !== 'string' || prompt.length > 600) {
    return res.status(400).json({ error: 'Entrées invalides' });
  }
  // Coût réservé AVANT l'appel (≈ 0,05 $ l'image, arrondi à 0,06 €) pour que le plafond de 3 €/jour tienne même en rafale
  await AI.addCostEur('makeupRender', 'replicate_flux-fill-pro', 0.06);

  try {
    // 1. Lancer la prédiction (retry si 429)
    let startRes;
    for (let attempt = 0; attempt <= 4; attempt++) {
      if (attempt > 0) {
        const wait = attempt * 8000; // 8s, 16s, 24s, 32s
        await new Promise(r => setTimeout(r, wait));
      }
      startRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'Prefer':        'wait'
        },
        body: JSON.stringify({
          input: {
            image,
            mask,
            prompt,
            output_format:    'jpg',
            output_quality:   90,
            safety_tolerance: 6
          }
        })
      });
      if (startRes.status !== 429) break;
      console.warn(`[makeupRender] 429 — tentative ${attempt+1}/4`);
    }

    if (!startRes.ok) {
      const errBody = await startRes.text().catch(() => '');
      console.error('[makeupRender] Replicate error:', startRes.status, errBody);
      return res.status(startRes.status).json({ error: errBody || `Replicate HTTP ${startRes.status}` });
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
