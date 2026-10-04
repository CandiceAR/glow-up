/* ============================================================
   api/scanVerdict.js — Rédige le verdict d'un scan produit.
   L'IA NE DÉCIDE PAS le verdict : l'app calcule les FAITS (besoin,
   doublon, conflit, sécurité, n° d'étape) et l'IA les met en mots.
   + Incrémente le compteur de scans (suivi des coûts côté admin).
   Entrée  : { product, verdict:'green|orange|red', facts, profile }
   Sortie  : { title, reasons[], timing, step, note }
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function _getDb() {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getFirestore, FieldValue }      = require('firebase-admin/firestore');
    if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    return { db: getFirestore(), FieldValue };
  } catch (e) { console.error('[scanVerdict] firebase init:', e.message); return null; }
}

// Compte 1 scan dans scanStats/{AAAA-MM} — ne bloque JAMAIS le verdict.
async function _countScan(verdict) {
  const f = _getDb();
  if (!f) return;
  try {
    const now = new Date();
    const ym  = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
    await f.db.collection('scanStats').doc(ym).set({
      month: ym,
      count: f.FieldValue.increment(1),
      [`verdict_${verdict}`]: f.FieldValue.increment(1),
      updatedAt: f.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) { console.error('[scanVerdict] count:', e.message); }
}

function _fallbackText(product, verdict, facts) {
  const title = verdict === 'green'  ? 'Oui, ce produit peut te convenir'
              : verdict === 'orange' ? 'Oui, mais avec quelques précautions'
              :                        "Non, ce produit n'est pas idéal pour toi";
  const reasons = [];
  if ((facts.addresses || []).length) reasons.push('Il répond à ' + facts.addresses.join(', ') + '.');
  if (facts.duplicateOf)              reasons.push('Il ferait doublon avec ' + facts.duplicateOf + " — tu n'en as pas forcément besoin.");
  (facts.conflicts || []).forEach(c => reasons.push(c));
  if (facts.safety)                   reasons.push(facts.safety);
  if (!reasons.length)                reasons.push("Aucun besoin clair identifié dans ton profil pour ce produit.");
  return {
    title, reasons: reasons.slice(0, 3),
    timing: facts.moment || '', step: facts.stepText || '',
    note: facts.safety || (facts.conflicts || [])[0] || ''
  };
}

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const { product, verdict, facts, profile } = req.body || {};
  if (!product || !verdict || !facts) return res.status(400).json({ error: 'données manquantes' });

  // Compte le scan (en parallèle, sans bloquer la réponse)
  _countScan(verdict).catch(() => {});

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json(_fallbackText(product, verdict, facts));

  const vLabel = verdict === 'green'  ? 'ADAPTÉ'
               : verdict === 'orange' ? 'ADAPTÉ AVEC PRÉCAUTIONS OU PAS INDISPENSABLE'
               :                        'NON ADAPTÉ';

  const prompt = `Tu es l'experte skincare de Glow Up. Tu dis à une utilisatrice si un produit qu'elle veut acheter est fait pour SA peau, à partir de FAITS déjà calculés par l'app.

RÈGLES ABSOLUES :
- Le verdict est DÉJÀ décidé : ${vLabel}. Ne le contredis jamais.
- N'invente AUCUN fait, numéro d'étape, actif ou conflit : utilise uniquement les données ci-dessous.
- Ton neutre et honnête. Glow Up ne pousse jamais à l'achat. Si c'est un doublon, dis clairement qu'elle n'en a pas forcément besoin.
- Français, tutoiement, concis (pas de blabla).

PRODUIT : ${product.brand || ''} ${product.name || ''} (type: ${product.category || '?'}, actifs: ${(product.keyActives || []).join(', ') || 'inconnus'})
PROFIL : peau ${profile && profile.skinType || '?'}, besoins: ${(profile && profile.concerns || []).join(', ') || '—'}, âge ${profile && profile.age != null ? profile.age : '?'}${profile && profile.pregnant ? ', GROSSESSE' : ''}
FAITS :
- besoins du profil couverts par le produit : ${(facts.addresses || []).join(', ') || 'aucun identifié'}
- doublon avec : ${facts.duplicateOf || 'non'}
- conflits d'actifs : ${(facts.conflicts || []).join(' ; ') || 'aucun'}
- alerte sécurité : ${facts.safety || 'aucune'}
- moment conseillé : ${facts.moment || '?'}
- position dans SA routine : ${facts.stepText || '?'}

Retourne UNIQUEMENT ce JSON, sans texte avant/après :
{
  "title": "verdict en une phrase courte (ex: 'Oui, ce produit peut te convenir')",
  "reasons": ["2 à 3 raisons maximum, basées uniquement sur les faits"],
  "timing": "quand l'utiliser (reprend 'moment conseillé')",
  "step": "à quelle étape dans SA routine (reprend 'position dans SA routine' avec le numéro exact)",
  "note": "alerte doublon/conflit/sécurité honnête, ou '' si rien à signaler"
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) return res.status(200).json(_fallbackText(product, verdict, facts));
    const data = await resp.json();
    const txt  = (data && data.content && data.content[0] && data.content[0].text || '').trim();
    const m    = txt.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed || !parsed.title) return res.status(200).json(_fallbackText(product, verdict, facts));
    return res.status(200).json({
      title:   parsed.title,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
      timing:  parsed.timing || facts.moment || '',
      step:    parsed.step   || facts.stepText || '',
      note:    parsed.note   || ''
    });
  } catch (e) {
    console.error('[scanVerdict]', e.message);
    return res.status(200).json(_fallbackText(product, verdict, facts));
  }
};
