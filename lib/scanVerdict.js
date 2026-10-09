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
  if (facts.basic && !facts.duplicateOf) reasons.unshift("C'est un produit de base de la routine : il ne cible pas un besoin précis, il a un rôle (nettoyer, tonifier ou protéger).");
  if (!reasons.length)                reasons.push("Aucun besoin clair identifié dans ton profil pour ce produit.");
  return {
    title, reasons: reasons.slice(0, 3),
    timing: facts.moment || '', step: facts.stepText || '',
    note: facts.safety || (facts.conflicts || [])[0] || ''
  };
}

// ─── Garde-fous de crédibilité ───────────────────────────────
const _txt = o => [o.title, (o.reasons || []).join(' '), o.note, o.timing, o.step,
  o.expected ? [o.expected.purpose, o.expected.results, o.expected.forYou].join(' ') : ''].join(' ');

function _looksWrong(product, out) {
  const t = _txt(out).toLowerCase();
  const name = ((product.brand || '') + ' ' + (product.name || '') + ' ' + (product.claims || []).join(' ')).toLowerCase();
  // 1) Composition affirmée sans source (nous n'avons pas la liste d'ingrédients)
  const CLAIMS = [/sans parfum/, /sans alcool/, /sans silicone/, /sans paraben/, /non com[ée]dog[eè]ne/, /hypoallerg[ée]nique/, /sans huile essentielle/];
  if (CLAIMS.some(re => re.test(t) && !re.test(name))) return true;
  // 2) Un produit de nettoyage décrit comme un soin qui reste sur la peau
  const isCleanser = product.category === 'cleanser' || /micellaire|micellar|d[ée]maquill|nettoyant|cleans/i.test(name);
  if (isCleanser && /cr[eè]me|s[eé]rum|baume/.test(t) && !/cr[eè]me|s[eé]rum|baume/.test(name)) return true;
  if (isCleanser && /(soin|cr[eè]me|produit) (apaisant|barri[eè]re|r[ée]parateur|anti-?rides|raffermissant)/.test(t)) return true;
  return false;
}

// Texte toujours exact : décrit uniquement le RÔLE du type de produit, sans promesse sur sa composition
function _factualExpected(product, facts) {
  const cat = product.category;
  const rep = facts && facts.replacesLabel ? `À utiliser à la place de « ${facts.replacesLabel} », pas en plus.` : '';
  if (cat === 'cleanser') return { purpose: 'Nettoie le visage : retire maquillage, excès de sébum et impuretés.',
    results: 'Une peau propre, prête pour la suite de ta routine. Un nettoyant ne traite pas les rides ni les taches : son rôle est de bien préparer la peau.', timeline: '', forYou: rep || 'Un nettoyant est un produit de base : un seul suffit à cette étape.' };
  if (cat === 'toner' || cat === 'mist') return { purpose: 'Complète le nettoyage et prépare la peau aux soins suivants.',
    results: 'Une peau plus confortable avant le sérum et la crème.', timeline: '', forYou: rep || '' };
  if (cat === 'spf' || cat === 'sunscreen') return { purpose: 'Protège la peau des UV.',
    results: 'Aide à limiter les taches et le vieillissement dû au soleil, à condition de l\'appliquer chaque matin.', timeline: '', forYou: rep || 'La protection solaire est le geste anti-âge n°1.' };
  return null;
}

// Nettoie le bloc « résultats attendus » (texte court uniquement ; null si vide)
function _cleanExpected(e) {
  if (!e || typeof e !== 'object') return null;
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  // Un délai trop long n'est pas un « ordre de grandeur » : on l'écarte plutôt que de le couper en plein mot
  const tl = s(e.timeline, 200);
  const out = { purpose: s(e.purpose, 260), results: s(e.results, 360), timeline: tl.length <= 40 ? tl : '', forYou: s(e.forYou, 480) };
  return (out.purpose || out.results || out.forYou) ? out : null;
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

PRODUIT : ${product.brand || ''} ${product.name || ''} (type: ${product.category || '?'}, actifs: ${(product.keyActives || []).join(', ') || 'inconnus'}, promesses lisibles sur l'emballage: ${(product.claims || []).join(', ') || 'aucune lisible'})
TYPE DU PRODUIT (CERTAIN, déterminé par l'app) : ${facts.kindFr || 'non précisé'}
RÈGLES SUR LE TYPE ET LA COMPOSITION (priorité maximale — la crédibilité de Glow Up en dépend) :
- Tu ne décris JAMAIS ce produit comme un autre type de produit (une eau micellaire n'est ni une crème, ni un sérum, ni un soin apaisant ou barrière).
- Tu n'affirmes JAMAIS une composition ou une qualité que tu ne connais pas : « sans parfum », « sans alcool », « non comédogène », « hypoallergénique »… sont INTERDITS sauf s'ils figurent dans le nom du produit ou ses promesses lisibles ci-dessus.
- Si tu n'es pas certaine de ce que fait le produit, tu le dis simplement ; tu n'inventes aucune propriété.
${facts.basic ? "- C'est un produit de BASE (nettoyant, tonique ou SPF) : il ne cible pas un besoin précis. Ne lui reproche JAMAIS de ne pas cibler les besoins de la personne ; explique son rôle dans la routine. S'il remplace un produit existant à cette étape, dis-le (pas de cumul)." : ''}
PROFIL : peau ${profile && profile.skinType || '?'}, besoins: ${(profile && profile.concerns || []).join(', ') || '—'}, objectif principal: ${profile && profile.objective || '—'}, âge ${profile && profile.age != null ? profile.age : '?'}${profile && profile.pregnant ? ', GROSSESSE' : ''}
FAITS :
- besoins du profil couverts par le produit : ${(facts.addresses || []).join(', ') || 'aucun identifié'}
- doublon avec : ${facts.duplicateOf || 'non'}
- conflits d'actifs : ${(facts.conflicts || []).join(' ; ') || 'aucun'}
- alerte sécurité : ${facts.safety || 'aucune'}
- moment conseillé : ${facts.moment || '?'}
- position dans SA routine : ${facts.stepText || '?'}
- emplacement dans sa routine : ${facts.slotState === 'suggestion' ? 'une SUGGESTION de Glow Up (« ' + (facts.replacesLabel || '') + ' ») qu’elle n’utilise pas encore : ce n’est PAS un doublon, dis que ce produit peut prendre sa place' : (facts.slotState === 'empty' ? 'une étape libre : il peut y être ajouté' : 'non précisé')}
- produit de sa routine remplaçable : ${facts.replaceOffer ? '« ' + (facts.replacesLabel || '') + ' » — l’app lui propose un bouton « Remplacer ». Dis simplement que ce produit fait doublon avec lui et qu’elle peut le remplacer (un seul des deux). Ne dis JAMAIS que c’est dangereux et ne choisis pas à sa place.' : 'non'}

Retourne UNIQUEMENT ce JSON, sans texte avant/après :
{
  "title": "verdict en une phrase courte (ex: 'Oui, ce produit peut te convenir')",
  "reasons": ["2 à 3 raisons maximum, basées uniquement sur les faits"],
  "timing": "quand l'utiliser (reprend 'moment conseillé')",
  "step": "à quelle étape dans SA routine (reprend 'position dans SA routine' avec le numéro exact)",
  "note": "alerte doublon/conflit/sécurité honnête, ou '' si rien à signaler",
  "expected": {
    "purpose": "à quoi sert ce produit (d'après ses actifs et promesses lisibles), 1 phrase — '' si impossible à déterminer",
    "results": "ce qu'on peut RAISONNABLEMENT en attendre, 1 à 2 phrases, vocabulaire prudent (« peut aider à », « tend à »)",
    "timeline": "délai habituel, TRÈS COURT, 5 mots maximum (ex: '4 à 8 semaines') — '' si inconnu",
    "forYou": "lien avec SES besoins, 2 phrases maximum : dis clairement si ce produit cible ou NON son besoin principal (ex: « ce produit vise la fermeté, alors que tu cherches surtout à atténuer tes taches »)"
  }
}

RÈGLES POUR "expected" (fiabilité avant tout) :
- Base-toi UNIQUEMENT sur les actifs connus et les promesses lisibles. Si le produit est inconnu ou les actifs ne sont pas connus : laisse "purpose", "results" et "timeline" à '' et explique dans "forYou" qu'il n'y a pas assez d'informations fiables — n'invente rien.
- Aucune promesse garantie, aucun chiffre de résultat clinique inventé, aucune allégation médicale. Les délais sont des ordres de grandeur habituels pour l'actif.
- "forYou" doit comparer avec les besoins du profil, même quand le produit est adapté (dis alors lequel il couvre).`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1100, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) return res.status(200).json(_fallbackText(product, verdict, facts));
    const data = await resp.json();
    const txt  = (data && data.content && data.content[0] && data.content[0].text || '').trim();
    const m    = txt.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed || !parsed.title) return res.status(200).json(_fallbackText(product, verdict, facts));
    const out = {
      title:   parsed.title,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
      timing:  parsed.timing || facts.moment || '',
      step:    parsed.step   || facts.stepText || '',
      note:    parsed.note   || '',
      expected: _cleanExpected(parsed.expected)
    };
    // Contrôle final : un texte qui contredit le TYPE du produit ou affirme une composition non vérifiée
    // n'est JAMAIS affiché — on le remplace par un texte factuel et prudent.
    if (_looksWrong(product, out)) {
      const fb = _fallbackText(product, verdict, facts);
      fb.expected = _factualExpected(product, facts);
      return res.status(200).json(fb);
    }
    return res.status(200).json(out);
  } catch (e) {
    console.error('[scanVerdict]', e.message);
    return res.status(200).json(_fallbackText(product, verdict, facts));
  }
};
