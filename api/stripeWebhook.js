/* ============================================================
   api/stripeWebhook.js — Événements Stripe → Firestore + Parrainage
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_TO_PLAN = {
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

const REFERRALS_PER_COUPON = 5;

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

  // 1. Générer un code parrain si l'utilisatrice n'en a pas encore
  if (!userData.referral?.code) {
    const code = generateReferralCode();
    await userRef.set({ referral: { code, count: 0, coupons: [] } }, { merge: true });
    console.log(`[Referral] Code généré → ${uid}: ${code}`);
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

  // 5. Incrémenter le compteur du parrain
  const referrerRef = db.collection('users').doc(referrerUid);
  await referrerRef.set(
    { referral: { count: FieldValue.increment(1) } },
    { merge: true }
  );

  // 6. Générer un bon d'achat tous les 5 filleuls validés
  const referrerDoc  = await referrerRef.get();
  const newCount     = referrerDoc.data()?.referral?.count || 0;

  if (newCount > 0 && newCount % REFERRALS_PER_COUPON === 0) {
    try {
      const coupon = await stripe.coupons.create({
        percent_off:      100,
        duration:         'once',
        name:             `Parrainage Glow Up (${newCount} filleuls)`,
        max_redemptions:  1,
        metadata:         { referrerUid, milestone: String(newCount) }
      });
      await referrerRef.set(
        { referral: { coupons: FieldValue.arrayUnion(coupon.id) } },
        { merge: true }
      );
      console.log(`[Referral] 🎉 Bon d'achat généré pour ${referrerUid}: ${coupon.id}`);
    } catch (e) {
      console.error('[Referral] Erreur création coupon:', e.message);
    }
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
