/* ============================================================
   createCheckout.js — Crée une session Stripe Checkout
   ============================================================ */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');

const PRICE_IDS = isTestMode ? {
  // Legacy (anciens abonnés)
  glow_monthly: 'price_1TMp8JJeKx7T3paERKVr8oFx',
  glow_yearly:  'price_1TMp8lJeKx7T3paEC2DxJx6j',
  glowplus:     'price_1TMp9CJeKx7T3paE1o7Ml1rO',
  // Phase 2 — nouveaux tarifs (créer dans Stripe Dashboard test mode)
  glow_year:    'price_1Tc0xDJeKx7T3paEf15SP5dB',   // Glow 19,99 €/an
  coach_year:   'price_1Tc133JeKx7T3paET9l1IJHe',  // Glow Coach 199,99 €/an
  glow_found:   'price_1Tc13bJeKx7T3paE9pnJtpP9',  // Glow fondatrices 15,99 €/an
  coach_found:  'price_1Tc13yJeKx7T3paEDIpfmk2B'   // Coach fondatrices 149,99 €/an
} : {
  // Legacy (anciens abonnés)
  glow_monthly: 'price_1TM1rqJeKx7T3paEB3gqZnxF',
  glow_yearly:  'price_1TM1tTJeKx7T3paEmWdCIWXE',
  glowplus:     'price_1TM1ttJeKx7T3paEN7e7CZDa',
  // Phase 2 — nouveaux tarifs (créer dans Stripe Dashboard live mode)
  glow_year:    'price_1Tc16MJeKx7T3paEKoE2tEj7',   // Glow 19,99 €/an
  coach_year:   'price_1Tc17gJeKx7T3paEzIZBTNqK',  // Glow Coach 199,99 €/an
  glow_found:   'price_1Tc198JeKx7T3paEzArs3QmO',  // Glow fondatrices 15,99 €/an
  coach_found:  'price_1Tc19TJeKx7T3paEeePs49Ti'   // Coach fondatrices 149,99 €/an
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { priceKey, uid, email } = JSON.parse(event.body);
    const priceId = PRICE_IDS[priceKey];
    if (!priceId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Plan invalide' }) };

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

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('[createCheckout]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
