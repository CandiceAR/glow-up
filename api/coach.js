/* ============================================================
   api/coach.js — Proxy sécurisé vers l'API Anthropic (Vercel) pour le coach IA.

   SÉCURITÉ (22 oct. 2026) : cette route était un « proxy ouvert » — elle transmettait telle quelle n'importe quelle
   demande (modèle, longueur, outils…) avec la clé de Glow Up, sans aucun contrôle. Désormais :
     • seuls 2 modèles sont acceptés (sinon Haiku, le moins cher) ;
     • la réponse est limitée à 600 tokens, la conversation à 30 messages et 24 000 caractères au total ;
     • seuls les champs model / max_tokens / system / messages / temperature sont transmis (pas d'outils, pas de flux) ;
     • limite par IP + plafond de coût global (lib/aiGuard.js).
   ============================================================ */

const AI = require('../lib/aiGuard.js');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const HAIKU = 'claude-haiku-4-5-20251001';
const ALLOWED_MODELS = new Set([HAIKU, 'claude-sonnet-4-6']);
const MAX_TOKENS = 600;
const MAX_MESSAGES = 30;
const MAX_CHARS = 24000;

// Ne garde que ce que l'appli envoie réellement, avec des bornes. Retourne null si la demande est invalide.
function clean(body) {
  if (!body || typeof body !== 'object') return null;
  const msgs = Array.isArray(body.messages) ? body.messages : null;
  if (!msgs || !msgs.length || msgs.length > MAX_MESSAGES) return null;
  const messages = [];
  let chars = 0;
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;   // texte seulement
    chars += m.content.length;
    messages.push({ role: m.role, content: m.content });
  }
  const system = typeof body.system === 'string' ? body.system : '';
  chars += system.length;
  if (chars > MAX_CHARS) return null;
  const out = {
    model: ALLOWED_MODELS.has(body.model) ? body.model : HAIKU,
    max_tokens: Math.max(1, Math.min(MAX_TOKENS, parseInt(body.max_tokens, 10) || 400)),
    messages
  };
  if (system) out.system = system;
  if (typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 1) out.temperature = body.temperature;
  return out;
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: { message: 'ANTHROPIC_API_KEY non configurée.' } });
  }

  if (!(await AI.guard(req, res, 'coach', { ai: true }))) return;

  const body = clean(req.body);
  if (!body) return res.status(400).json({ error: { message: 'Demande invalide.' } });

  try {
    const upstream = await AI.anthropic('coach', apiKey, body);
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: { message: 'Erreur du coach' } });
  }
};

module.exports._clean = clean;   // tests
