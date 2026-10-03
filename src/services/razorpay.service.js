import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// The only module that talks to Razorpay. Tests swap the client with setClientForTests().
let client = null;

const getClient = () => {
  if (client) return client;
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new ApiError(503, 'Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  }
  client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  return client;
};

export const setClientForTests = (fake) => {
  client = fake;
};

export const toPaise = (inr) => Math.round(Number(inr) * 100);

// Razorpay SDK errors look like { statusCode, error: { description } }.
const call = async (label, fn) => {
  try {
    return await fn(getClient());
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const description = err?.error?.description || err?.message || 'Unknown error';
    logger.error(`Razorpay ${label} failed:`, description);
    throw new ApiError(502, `Payment provider error: ${description}`);
  }
};

export const createPlan = ({ name, description, billingCycle, amountInr }) =>
  call('plans.create', (rzp) =>
    rzp.plans.create({
      period: billingCycle,
      interval: 1,
      item: { name, description, amount: toPaise(amountInr), currency: 'INR' },
    })
  );

export const createSubscription = ({ razorpayPlanId, totalCount, notes }) =>
  call('subscriptions.create', (rzp) =>
    rzp.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: totalCount,
      customer_notify: 1,
      notes,
    })
  );

export const fetchSubscription = (subscriptionId) =>
  call('subscriptions.fetch', (rzp) => rzp.subscriptions.fetch(subscriptionId));

export const cancelSubscription = (subscriptionId, atCycleEnd = true) =>
  call('subscriptions.cancel', (rzp) => rzp.subscriptions.cancel(subscriptionId, atCycleEnd));

export const createOrder = ({ amountInr, receipt, notes }) =>
  call('orders.create', (rzp) =>
    rzp.orders.create({ amount: toPaise(amountInr), currency: 'INR', receipt, notes })
  );

// ---- Signature checks -------------------------------------------------------

const hmac = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

const safeEqualHex = (expected, received) => {
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
};

const requireSecret = (secret, name) => {
  if (!secret) throw new ApiError(503, `Payments are not configured. Set ${name}`);
  return secret;
};

// Checkout result for a subscription: HMAC(payment_id + "|" + subscription_id).
export const verifySubscriptionSignature = (paymentId, subscriptionId, signature) =>
  safeEqualHex(
    hmac(requireSecret(env.razorpay.keySecret, 'RAZORPAY_KEY_SECRET'), `${paymentId}|${subscriptionId}`),
    signature
  );

// Checkout result for an order: HMAC(order_id + "|" + payment_id).
export const verifyOrderSignature = (orderId, paymentId, signature) =>
  safeEqualHex(
    hmac(requireSecret(env.razorpay.keySecret, 'RAZORPAY_KEY_SECRET'), `${orderId}|${paymentId}`),
    signature
  );

// Webhooks are signed over the raw request body with the webhook secret.
export const verifyWebhookSignature = (rawBody, signature) =>
  safeEqualHex(
    hmac(requireSecret(env.razorpay.webhookSecret, 'RAZORPAY_WEBHOOK_SECRET'), rawBody),
    signature
  );

export const publicKeyId = () => env.razorpay.keyId;
