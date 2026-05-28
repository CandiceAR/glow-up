/* ============================================================
   stripeWebhook.js — Reçoit les événements Stripe et met à jour
   le plan de l'utilisateur dans Firestore
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Map price_id → plan (live + test)
const PRICE_TO_PLAN = {
  // Legacy
  'price_1TM1rqJeKx7T3paEB3gqZnxF': 'glow',
  'price_1TM1tTJeKx7T3paEmWdCIWXE': 'glow',
  'price_1TM1ttJeKx7T3paEN7e7CZDa': 'glowplus',
  'price_1TMp8JJeKx7T3paERKVr8oFx': 'glow',
  'price_1TMp8lJeKx7T3paEC2DxJx6j': 'glow',
  'price_1TMp9CJeKx7T3paE1o7Ml1rO': 'glowplus',
  // Phase 2
  'price_1Tc0xDJeKx7T3paEf15SP5dB':     'glow',
  'price_1Tc16MJeKx7T3paEKoE2tEj7':     'glow',
  'price_1Tc133JeKx7T3paET9l1IJHe':     'glowplus',
  'price_1Tc17gJeKx7T3paEzIZBTNqK':     'glowplus',
  'price_1Tc13bJeKx7T3paE9pnJtpP9':     'glow',
  'price_1Tc198JeKx7T3paEzArs3QmO':     'glow',
  'price_1Tc13yJeKx7T3paEDIpfmk2B':     'glowplus',
  'price_1Tc19TJeKx7T3paEeePs49Ti':     'glowplus'
};

// Prix fondatrices → incrémenter le compteur config/stats.foundersCount
const FOUNDERS_PRICE_KEYS = new Set([
  'price_1Tc13bJeKx7T3paE9pnJtpP9',
  'price_1Tc198JeKx7T3paEzArs3QmO',
  'price_1Tc13yJeKx7T3paEDIpfmk2B',
  'price_1Tc19TJeKx7T3paEeePs49Ti'
]);

async function updateUserPlan(uid, plan, priceId) {
  if (!uid) return;
  const { initializeApp, getApps, cert } = require('firebase-admin/app');
  const { getFirestore, FieldValue }      = require('firebase-admin/firestore');

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  const db        = getFirestore();
  const isFounder = priceId && FOUNDERS_PRICE_KEYS.has(priceId);

  await db.collection('users').doc(uid).set({
    subscription: {
      plan,
      isFounder: isFounder || false,
      updatedAt: new Date().toISOString()
    }
  }, { merge: true });

  // Incrémenter le compteur fondatrices (approximatif)
  if (isFounder) {
    await db.collection('config').doc('stats').set(
      { foundersCount: FieldValue.increment(1) },
      { merge: true }
    );
    console.log(`[stripeWebhook] Fondatrice enregistrée → ${uid}`);
  }

  console.log(`[stripeWebhook] Plan mis à jour → ${uid} : ${plan}${isFounder ? ' (fondatrice)' : ''}`);
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
      await updateUserPlan(uid, plan, priceId);
    }

    if (stripeEvent.type === 'customer.subscription.updated') {
      const sub     = stripeEvent.data.object;
      const uid     = sub.metadata?.uid;
      const priceId = sub.items.data[0]?.price?.id;
      const plan    = sub.status === 'active' ? (PRICE_TO_PLAN[priceId] || 'glow') : 'free';
      await updateUserPlan(uid, plan, priceId);
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const sub = stripeEvent.data.object;
      const uid = sub.metadata?.uid;
      await updateUserPlan(uid, 'free', null);
    }
  } catch (err) {
    console.error('[stripeWebhook] Erreur traitement:', err);
    return { statusCode: 500, body: err.message };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
