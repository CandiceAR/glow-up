/* ============================================================
   api/stripeWebhook.js — Événements Stripe → Firestore + Parrainage
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_TO_PLAN = {
  // ── Tarifs 2026 ── TEST
  'price_1Tp40yJeKx7T3paEnFuyfADa': 'glow',      // Premium 4,99€/mois
  'price_1Tp41KJeKx7T3paERhO9gRQ0': 'glow',      // Premium 39,99€/an
  'price_1Tp41iJeKx7T3paEdAff3s5W': 'glowplus',  // Coach 15,99€/mois
  'price_1Tp426JeKx7T3paEGBsDy1z9': 'glowplus',  // Coach 149,99€/an
  // ── Tarifs 2026 ── LIVE
  'price_1Tp33cJeKx7T3paEN7bn4SVq': 'glow',      // Premium 4,99€/mois
  'price_1Tp34WJeKx7T3paEyvMzQjMS': 'glow',      // Premium 39,99€/an
  'price_1Tp3zWJeKx7T3paEr2lI46Fo': 'glowplus',  // Coach 15,99€/mois
  'price_1Tp3zrJeKx7T3paENfT1wLf9': 'glowplus',  // Coach 149,99€/an
  // ── Existants ────────────────────────────────────────────────
  'price_1TM1rqJeKx7T3paEB3gqZnxF': 'glow',
  'price_1TM1tTJeKx7T3paEmWdCIWXE': 'glow',
  'price_1TM1ttJeKx7T3paEN7e7CZDa': 'glowplus',
  'price_1TMp8JJeKx7T3paERKVr8oFx': 'glow',
  'price_1TMp8lJeKx7T3paEC2DxJx6j': 'glow',
  'price_1TMp9CJeKx7T3paE1o7Ml1rO': 'glowplus',
  'price_1Tc0xDJeKx7T3paEf15SP5dB': 'glow',
  'price_1Tc16MJeKx7T3paEKoE2tEj7': 'glow',
  'price_1Tc133JeKx7T3paET9l1IJHe': 'glowplus',
  'price_1Tc17gJeKx7T3paEzIZBTNqK': 'glowplus',
  'price_1Tc13bJeKx7T3paE9pnJtpP9': 'glow',
  'price_1Tc198JeKx7T3paEzArs3QmO': 'glow',
  'price_1Tc13yJeKx7T3paEDIpfmk2B': 'glowplus',
  'price_1Tc19TJeKx7T3paEeePs49Ti': 'glowplus',
  'price_1TdmseJeKx7T3paEU6Ldaz0M': 'glowplus',
  'price_1TdmqvJeKx7T3paEytDBrEUI': 'glowplus'
};

const FOUNDERS_PRICE_KEYS = new Set([
  'price_1Tc13bJeKx7T3paE9pnJtpP9',
  'price_1Tc198JeKx7T3paEzArs3QmO',
  'price_1Tc13yJeKx7T3paEDIpfmk2B',
  'price_1Tc19TJeKx7T3paEeePs49Ti',
  'price_1TdmseJeKx7T3paEU6Ldaz0M',
  'price_1TdmqvJeKx7T3paEytDBrEUI'
]);

// ─── Programme Ambassadrice (réservé aux abonnées Glow Up Coach) ──
const REFERRAL_CREDIT    = 2;   // 2€ de Crédit Beauté par filleul validé
const GIFTCARD_THRESHOLD = 10;  // palier de crédit pour débloquer une carte
const GIFTCARD_VALUE     = 10;  // valeur de la carte cadeau (€)

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GU-';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

function initFirebase() {
  const { initializeApp, getApps, cert } = require('firebase-admin/app');
  const { getFirestore, FieldValue }      = require('firebase-admin/firestore');
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return { db: getFirestore(), FieldValue };
}

async function updateUserPlan(uid, plan, priceId) {
  if (!uid) return;
  const { db, FieldValue } = initFirebase();
  const isFounder = priceId && FOUNDERS_PRICE_KEYS.has(priceId);

  await db.collection('users').doc(uid).set(
    { subscription: { plan, isFounder: isFounder || false, updatedAt: new Date().toISOString() } },
    { merge: true }
  );

  if (isFounder) {
    await db.collection('config').doc('stats').set(
      { foundersCount: FieldValue.increment(1) },
      { merge: true }
    );
  }
}

// ─── Parrainage : génère le code + valide les filleuls ──────────
async function processReferral(uid, plan) {
  if (!uid || plan === 'free') return;

  const { db, FieldValue } = initFirebase();
  const userRef  = db.collection('users').doc(uid);
  const userDoc  = await userRef.get();
  const userData = userDoc.data() || {};

  // 1. Générer un code parrain — RÉSERVÉ aux abonnées Glow Up Coach
  if (plan === 'glowplus' && !userData.referral?.code) {
    const code = generateReferralCode();
    await userRef.set({ referral: { code, count: 0, coupons: [] } }, { merge: true });
    console.log(`[Referral] Code Ambassadrice généré → ${uid}: ${code}`);
  }

  // 2. Vérifier si cette utilisatrice a été parrainée
  const referredBy = userData.referral?.referredBy;
  if (!referredBy) return;

  // 3. Trouver le document de parrainage en attente
  const refQuery = await db.collection('referrals')
    .where('refereeUid', '==', uid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (refQuery.empty) return;

  const refDoc    = refQuery.docs[0];
  const referrerUid = refDoc.data().referrerUid;

  // 4. Valider le parrainage
  await refDoc.ref.update({
    status:      'validated',
    validatedAt: new Date().toISOString(),
    plan
  });
  console.log(`[Referral] Validé → filleule ${uid} parrainée par ${referrerUid}`);

  // 5. Le parrain doit être une Ambassadrice éligible (abonnée Glow Up Coach)
  const referrerRef  = db.collection('users').doc(referrerUid);
  const beforeDoc    = await referrerRef.get();
  const referrerPlan = beforeDoc.data()?.subscription?.plan;
  if (referrerPlan !== 'glowplus') {
    console.log(`[Referral] Parrain ${referrerUid} non-Coach (${referrerPlan}) → pas de crédit`);
    return;
  }

  // Récompense fixe : 2€ de Crédit Beauté par filleul validé
  const creditEarned = REFERRAL_CREDIT;
  const oldCredit    = beforeDoc.data()?.referral?.credit || 0;
  const newCredit    = oldCredit + creditEarned;

  await referrerRef.set(
    { referral: {
        count:  FieldValue.increment(1),
        credit: FieldValue.increment(creditEarned)
    } },
    { merge: true }
  );
  console.log(`[Referral] +${creditEarned}€ crédit → ${referrerUid} (total ${newCredit}€)`);

  // 6. Débloquer une carte cadeau à chaque palier de 10€ franchi
  const oldCards = Math.floor(oldCredit / GIFTCARD_THRESHOLD);
  const newCards = Math.floor(newCredit / GIFTCARD_THRESHOLD);
  const cardsToUnlock = newCards - oldCards;

  if (cardsToUnlock > 0) {
    const referrerEmail = beforeDoc.data()?.email || '';
    for (let i = 0; i < cardsToUnlock; i++) {
      try {
        await db.collection('rewards').add({
          referrerUid,
          referrerEmail,
          amount:    GIFTCARD_VALUE,
          currency:  'EUR',
          type:      'amazon_giftcard',
          status:    'pending',
          createdAt: new Date().toISOString(),
          sentAt:    null
        });
      } catch (e) {
        console.error('[Referral] Erreur enregistrement récompense:', e.message);
      }
    }
    await referrerRef.set(
      { referral: { pendingRewards: FieldValue.increment(cardsToUnlock) } },
      { merge: true }
    );
    console.log(`[Referral] 🎁 ${cardsToUnlock} carte(s) ${GIFTCARD_VALUE}€ à envoyer → ${referrerUid}`);
  }
}

async function handler(req, res) {
  const sig      = req.headers['stripe-signature'];
  const secret   = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody  = await getRawBody(req);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const uid     = session.client_reference_id || session.metadata?.uid;
      const sub     = await stripe.subscriptions.retrieve(session.subscription);
      const priceId = sub.items.data[0]?.price?.id;
      const plan    = PRICE_TO_PLAN[priceId] || 'glow';
      await updateUserPlan(uid, plan, priceId);
      await processReferral(uid, plan);
    }
    if (stripeEvent.type === 'customer.subscription.updated') {
      const sub     = stripeEvent.data.object;
      const priceId = sub.items.data[0]?.price?.id;
      const plan    = sub.status === 'active' ? (PRICE_TO_PLAN[priceId] || 'glow') : 'free';
      const uid     = sub.metadata?.uid;
      await updateUserPlan(uid, plan, priceId);
      if (plan !== 'free') await processReferral(uid, plan);
    }
    if (stripeEvent.type === 'customer.subscription.deleted') {
      await updateUserPlan(stripeEvent.data.object.metadata?.uid, 'free', null);
    }
  } catch (err) {
    console.error('[Webhook] Erreur:', err);
    return res.status(500).send(err.message);
  }

  return res.status(200).json({ received: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
