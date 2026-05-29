/* ============================================================
   api/stripeWebhook.js — Événements Stripe → Firestore (Vercel)
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_TO_PLAN = {
  // Legacy
  'price_1TM1rqJeKx7T3paEB3gqZnxF': 'glow',
  'price_1TM1tTJeKx7T3paEmWdCIWXE': 'glow',
  'price_1TM1ttJeKx7T3paEN7e7CZDa': 'glowplus',
  'price_1TMp8JJeKx7T3paERKVr8oFx': 'glow',
  'price_1TMp8lJeKx7T3paEC2DxJx6j': 'glow',
  'price_1TMp9CJeKx7T3paE1o7Ml1rO': 'glowplus',
  // Phase 2
  'price_1Tc0xDJeKx7T3paEf15SP5dB': 'glow',
  'price_1Tc16MJeKx7T3paEKoE2tEj7': 'glow',
  'price_1Tc133JeKx7T3paET9l1IJHe': 'glowplus',
  'price_1Tc17gJeKx7T3paEzIZBTNqK': 'glowplus',
  'price_1Tc13bJeKx7T3paE9pnJtpP9': 'glow',
  'price_1Tc198JeKx7T3paEzArs3QmO': 'glow',
  'price_1Tc13yJeKx7T3paEDIpfmk2B': 'glowplus',
  'price_1Tc19TJeKx7T3paEeePs49Ti': 'glowplus'
};

const FOUNDERS_PRICE_KEYS = new Set([
  'price_1Tc13bJeKx7T3paE9pnJtpP9',
  'price_1Tc198JeKx7T3paEzArs3QmO',
  'price_1Tc13yJeKx7T3paEDIpfmk2B',
  'price_1Tc19TJeKx7T3paEeePs49Ti'
]);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

async function updateUserPlan(uid, plan, priceId) {
  if (!uid) return;
  const { initializeApp, getApps, cert } = require('firebase-admin/app');
  const { getFirestore, FieldValue }      = require('firebase-admin/firestore');
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  const db        = getFirestore();
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

async function handler(req, res) {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await getRawBody(req);

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
      await updateUserPlan(uid, PRICE_TO_PLAN[priceId] || 'glow', priceId);
    }
    if (stripeEvent.type === 'customer.subscription.updated') {
      const sub     = stripeEvent.data.object;
      const priceId = sub.items.data[0]?.price?.id;
      const plan    = sub.status === 'active' ? (PRICE_TO_PLAN[priceId] || 'glow') : 'free';
      await updateUserPlan(sub.metadata?.uid, plan, priceId);
    }
    if (stripeEvent.type === 'customer.subscription.deleted') {
      await updateUserPlan(stripeEvent.data.object.metadata?.uid, 'free', null);
    }
  } catch (err) {
    return res.status(500).send(err.message);
  }

  return res.status(200).json({ received: true });
}

// Désactiver le body parser Vercel pour que Stripe puisse vérifier la signature
handler.config = { api: { bodyParser: false } };

module.exports = handler;
