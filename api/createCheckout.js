/* ============================================================
   api/createCheckout.js — Session Stripe Checkout (Vercel)
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');

const PRICE_IDS = isTestMode ? {
  // Legacy
  glow_monthly: 'price_1TMp8JJeKx7T3paERKVr8oFx',
  glow_yearly:  'price_1TMp8lJeKx7T3paEC2DxJx6j',
  glowplus:     'price_1TMp9CJeKx7T3paE1o7Ml1rO',
  // Phase 2
  glow_year:    'price_1Tc0xDJeKx7T3paEf15SP5dB',
  coach_year:   'price_1Tc133JeKx7T3paET9l1IJHe',
  glow_found:   'price_1Tc13bJeKx7T3paE9pnJtpP9',
  coach_found:  'price_1Tc13yJeKx7T3paEDIpfmk2B'
} : {
  // Legacy
  glow_monthly: 'price_1TM1rqJeKx7T3paEB3gqZnxF',
  glow_yearly:  'price_1TM1tTJeKx7T3paEmWdCIWXE',
  glowplus:     'price_1TM1ttJeKx7T3paEN7e7CZDa',
  // Phase 2
  glow_year:    'price_1Tc16MJeKx7T3paEKoE2tEj7',
  coach_year:   'price_1Tc17gJeKx7T3paEzIZBTNqK',
  glow_found:   'price_1Tc198JeKx7T3paEzArs3QmO',
  coach_found:  'price_1Tc19TJeKx7T3paEeePs49Ti'
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { priceKey, uid, email } = req.body || {};
    const priceId = PRICE_IDS[priceKey];
    if (!priceId) return res.status(400).json({ error: 'Plan invalide' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      client_reference_id: uid,
      success_url: 'https://glowupskin.app/?checkout=success',
      cancel_url:  'https://glowupskin.app/?checkout=cancel',
      metadata: { uid, priceKey }
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[createCheckout]', err);
    return res.status(500).json({ error: err.message });
  }
};
