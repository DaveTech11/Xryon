// Premium payments for Xyron: Flutterwave, OPay and crypto (NOWPayments).
//
// This file only talks to the providers. The server (server.mjs) owns orders,
// sessions and subscriptions. Rule used everywhere: a payment is only ever
// marked paid after we ask the provider's own API about it. Webhook bodies are
// treated as a "go and check" signal, never as proof.

import crypto from 'node:crypto';

export const PLAN_DAYS = 30;

export const PLANS = {
  premium: { name: 'Premium', ngn: 5000, usd: () => Number(process.env.CRYPTO_PRICE_PREMIUM_USD) || 4 },
  premium_plus: { name: 'Premium+', ngn: 10000, usd: () => Number(process.env.CRYPTO_PRICE_PREMIUM_PLUS_USD) || 8 },
};

export const METHODS = ['flutterwave', 'opay', 'crypto'];

const env = (k) => (process.env[k] || '').trim();
const TIMEOUT = 20000;

export function methodsAvailable() {
  return {
    flutterwave: Boolean(env('FLW_SECRET_KEY')),
    opay: Boolean(env('OPAY_MERCHANT_ID') && env('OPAY_PUBLIC_KEY') && env('OPAY_SECRET_KEY')),
    crypto: Boolean(env('NOWPAYMENTS_API_KEY')),
  };
}

export function publicPlans() {
  return Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name, ngn: p.ngn, usd: p.usd(), days: PLAN_DAYS }));
}

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function jsonFetch(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { r, j, text };
}

// ---------------------------------------------------------------- Flutterwave
// Flutterwave v3 "Standard" hosted checkout. Needs a v3 secret key (FLWSECK-...).
// Dashboard -> Settings -> Webhooks: set the URL to
//   PUBLIC_URL/api/payments/webhook/flutterwave
// and set the "Secret hash" to the same value as FLW_SECRET_HASH.
export async function flutterwaveCreate({ order, user, returnUrl }) {
  const { r, j } = await jsonFetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('FLW_SECRET_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_ref: order.reference,
      amount: order.amount,
      currency: 'NGN',
      redirect_url: returnUrl,
      payment_options: 'card,banktransfer,ussd,account',
      customer: { email: user.email, name: user.full_name || user.email },
      customizations: { title: 'Xyron', description: `${PLANS[order.tier].name} - ${PLAN_DAYS} days` },
      meta: { order_id: order.id, user_id: user.id },
    }),
  });
  if (!r.ok || j?.status !== 'success' || !j?.data?.link) throw new Error(`Flutterwave: ${j?.message || `HTTP ${r.status}`}`);
  return { url: j.data.link };
}

export async function flutterwaveVerify(order) {
  const { r, j } = await jsonFetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(order.reference)}`,
    { headers: { Authorization: `Bearer ${env('FLW_SECRET_KEY')}` } }
  );
  // "No transaction was found" simply means the customer has not paid yet.
  if (!r.ok || j?.status !== 'success' || !j?.data) return 'pending';
  const d = j.data;
  if (d.tx_ref !== order.reference) return 'pending';
  if (d.status === 'successful') {
    return d.currency === 'NGN' && Number(d.amount) >= order.amount ? 'paid' : 'failed';
  }
  if (d.status === 'failed') return 'failed';
  return 'pending';
}

export function flutterwaveWebhookOk(req) {
  const hash = env('FLW_SECRET_HASH');
  const got = req.headers['verif-hash'];
  return Boolean(hash && got && safeEq(got, hash));
}

// ----------------------------------------------------------------------- OPay
// OPay Cashier (hosted checkout). Keys: OPay merchant dashboard -> API Keys.
// create: Bearer <public key> + MerchantId header.
// status: Bearer HMAC-SHA512(body, secret key) + MerchantId header.
const opayBase = () =>
  env('OPAY_BASE_URL') ||
  `${env('OPAY_ENV') === 'sandbox' ? 'https://testapi.opaycheckout.com' : 'https://liveapi.opaycheckout.com'}/api/v1/international`;

export async function opayCreate({ order, user, returnUrl, callbackUrl, cancelUrl }) {
  const { r, j } = await jsonFetch(`${opayBase()}/cashier/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('OPAY_PUBLIC_KEY')}`, MerchantId: env('OPAY_MERCHANT_ID'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      country: 'NG',
      reference: order.reference,
      amount: { total: Math.round(order.amount * 100), currency: 'NGN' }, // kobo
      returnUrl,
      callbackUrl,
      cancelUrl,
      expireAt: 30,
      userInfo: { userId: user.id, userEmail: user.email, userName: user.full_name || user.email },
      product: { name: `Xyron ${PLANS[order.tier].name}`, description: `${PLANS[order.tier].name} - ${PLAN_DAYS} days` },
    }),
  });
  const url = j?.data?.cashierUrl;
  if (!r.ok || j?.code !== '00000' || !url) throw new Error(`OPay: ${j?.message || `HTTP ${r.status}`}`);
  return { url, providerRef: j.data.orderNo || null };
}

export async function opayVerify(order) {
  const body = JSON.stringify({ reference: order.reference, country: 'NG' });
  const sig = crypto.createHmac('sha512', env('OPAY_SECRET_KEY')).update(body).digest('hex');
  const { r, j } = await jsonFetch(`${opayBase()}/cashier/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sig}`, MerchantId: env('OPAY_MERCHANT_ID'), 'Content-Type': 'application/json' },
    body,
  });
  if (!r.ok || j?.code !== '00000' || !j?.data) return 'pending';
  const d = j.data;
  if (d.reference && d.reference !== order.reference) return 'pending';
  const status = String(d.status || '').toUpperCase();
  if (status === 'SUCCESS') {
    const total = Number(d.amount?.total);
    return Number.isFinite(total) && total < Math.round(order.amount * 100) ? 'failed' : 'paid';
  }
  if (status === 'FAIL' || status === 'CLOSE') return 'failed';
  return 'pending';
}

// --------------------------------------------------------- Crypto (NOWPayments)
// Hosted invoice: customer picks BTC, ETH, USDT, etc. on NOWPayments.
// Dashboard -> Store settings: create an IPN secret and put it in NOWPAYMENTS_IPN_SECRET.
// NOWPayments must be able to reach PUBLIC_URL/api/payments/webhook/nowpayments,
// so this method cannot confirm payments on plain localhost (use a tunnel when testing).
const npBase = () => env('NOWPAYMENTS_API_URL') || 'https://api.nowpayments.io/v1';

export async function cryptoCreate({ order, returnUrl, callbackUrl, cancelUrl }) {
  const { r, j } = await jsonFetch(`${npBase()}/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': env('NOWPAYMENTS_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: order.usd,
      price_currency: 'usd',
      order_id: order.id,
      order_description: `Xyron ${PLANS[order.tier].name} - ${PLAN_DAYS} days`,
      ipn_callback_url: callbackUrl,
      success_url: returnUrl,
      cancel_url: cancelUrl,
    }),
  });
  if (!r.ok || !j?.invoice_url) throw new Error(`NOWPayments: ${j?.message || `HTTP ${r.status}`}`);
  return { url: j.invoice_url, providerRef: String(j.id || '') };
}

// NOWPayments signs the JSON body with its keys sorted alphabetically (recursively).
const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
  : v;

export function cryptoWebhookOk(req, data) {
  const secret = env('NOWPAYMENTS_IPN_SECRET');
  const got = String(req.headers['x-nowpayments-sig'] || '').trim().toLowerCase();
  if (!secret || !got) return false;
  const expected = crypto.createHmac('sha512', secret).update(JSON.stringify(sortKeys(data))).digest('hex');
  return safeEq(got, expected);
}

// Called from the IPN handler: re-read the payment from NOWPayments before trusting it.
export async function cryptoVerifyPayment(order, paymentId) {
  if (!paymentId) return 'pending';
  const { r, j } = await jsonFetch(`${npBase()}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { 'x-api-key': env('NOWPAYMENTS_API_KEY') },
  });
  if (!r.ok || !j) return 'pending';
  if (String(j.order_id) !== order.id) return 'pending';
  const st = String(j.payment_status || '').toLowerCase();
  if (st === 'finished' || st === 'confirmed') {
    const ok = String(j.price_currency || '').toLowerCase() === 'usd' && Number(j.price_amount) >= order.usd;
    return ok ? 'paid' : 'failed';
  }
  if (st === 'failed' || st === 'expired' || st === 'refunded') return 'failed';
  return 'pending'; // waiting, confirming, sending, partially_paid, ...
}
