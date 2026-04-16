/* ============================================================
   stripeWebhook.js — Reçoit les événements Stripe et met à jour
   le plan de l'utilisateur dans Firestore
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Map price_id → plan (live + test)
const PRICE_TO_PLAN = {
  'price_1TM1rqJeKx7T3paEB3gqZnxF': 'glow',
  'price_1TM1tTJeKx7T3paEmWdCIWXE': 'glow',
  'price_1TM1ttJeKx7T3paEN7e7CZDa': 'glowplus',
  'price_1TMp8JJeKx7T3paERKVr8oFx': 'glow',
  'price_1TMp8lJeKx7T3paEC2DxJx6j': 'glow',
  'price_1TMp9CJeKx7T3paE1o7Ml1rO': 'glowplus'
};

async function updateUserPlan(uid, plan) {
  if (!uid) return;
  const { initializeApp, getApps, cert } = require('firebase-admin/app');
  const { getFirestore }                  = require('firebase-admin/firestore');

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  const db = getFirestore();
  await db.collection('users').doc(uid).set({ subscription: { plan, updatedAt: new Date().toISOString() } }, { merge: true });
  console.log(`[stripeWebhook] Plan mis à jour → ${uid} : ${plan}`);
}

exports.handler = async (event) => {
  const sig     = event.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error('[stripeWebhook] Signature invalide:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      const uid     = session.client_reference_id || session.metadata?.uid;
      const sub     = await stripe.subscriptions.retrieve(session.subscription);
      const priceId = sub.items.data[0]?.price?.id;
      const plan    = PRICE_TO_PLAN[priceId] || 'glow';
      await updateUserPlan(uid, plan);
    }

    if (stripeEvent.type === 'customer.subscription.updated') {
      const sub     = stripeEvent.data.object;
      const uid     = sub.metadata?.uid;
      const priceId = sub.items.data[0]?.price?.id;
      const plan    = sub.status === 'active' ? (PRICE_TO_PLAN[priceId] || 'glow') : 'free';
      await updateUserPlan(uid, plan);
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const sub = stripeEvent.data.object;
      const uid = sub.metadata?.uid;
      await updateUserPlan(uid, 'free');
    }
  } catch (err) {
    console.error('[stripeWebhook] Erreur traitement:', err);
    return { statusCode: 500, body: err.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
