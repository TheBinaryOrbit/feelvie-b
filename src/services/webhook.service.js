import crypto from 'crypto';
import { UserSubscription } from '../models/userSubscription.model.js';
import { Payment } from '../models/payment.model.js';
import { WebhookEvent } from '../models/webhookEvent.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import * as razorpay from './razorpay.service.js';
import { applyRemote, recordSubscriptionPayment, syncGrants } from './subscription.service.js';
import { fulfillPackPayment, markPackPaymentFailed } from './purchase.service.js';

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.paused',
  'subscription.resumed',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.updated',
]);

const handleSubscriptionEvent = async (event, payload) => {
  const entity = payload.subscription?.entity;
  const paymentEntity = payload.payment?.entity;
  if (!entity) return 'ignored';

  const sub = await UserSubscription.findOne({ razorpaySubscriptionId: entity.id });
  if (!sub) {
    logger.warn(`Webhook ${event} for unknown subscription ${entity.id}`);
    return 'ignored';
  }

  applyRemote(sub, entity);
  if (event === 'subscription.cancelled') {
    // Cancelled from the Razorpay dashboard rather than through our API.
    if (!sub.cancelledAt) sub.cancelledAt = new Date();
    if (!sub.cancelledBy) sub.cancelledBy = 'razorpay';
  }
  if (event === 'subscription.charged' && paymentEntity?.id) sub.lastPaymentId = paymentEntity.id;
  await sub.save();

  if (event === 'subscription.charged' && paymentEntity?.id) {
    await recordSubscriptionPayment(sub, { paymentId: paymentEntity.id, amountPaise: paymentEntity.amount });
  }

  await syncGrants(sub);
  return 'processed';
};

const handlePackPaid = async (paymentEntity) => {
  if (!paymentEntity?.order_id) return 'ignored';
  const payment = await Payment.findOne({ razorpayOrderId: paymentEntity.order_id, kind: 'credit_pack' });
  if (!payment) return 'ignored';
  await fulfillPackPayment(payment, paymentEntity.id);
  return 'processed';
};

const handlePaymentFailed = async (paymentEntity) => {
  if (!paymentEntity) return 'ignored';
  if (paymentEntity.order_id) {
    const updated = await markPackPaymentFailed(
      paymentEntity.order_id,
      paymentEntity.id,
      paymentEntity.error_description
    );
    return updated ? 'processed' : 'ignored';
  }
  return 'ignored';
};

const dispatch = (event, payload) => {
  if (SUBSCRIPTION_EVENTS.has(event)) return handleSubscriptionEvent(event, payload);
  if (event === 'order.paid' || event === 'payment.captured') return handlePackPaid(payload.payment?.entity);
  if (event === 'payment.failed') return handlePaymentFailed(payload.payment?.entity);
  return Promise.resolve('ignored');
};

/**
 * Verifies and processes one webhook delivery. Throws ApiError(400) on a bad signature.
 * Other failures are rethrown so the controller returns 500 and Razorpay retries.
 */
export const processWebhook = async (rawBody, signature, eventIdHeader) => {
  if (!Buffer.isBuffer(rawBody) || !rawBody.length) throw ApiError.badRequest('Empty webhook body');
  if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
    throw ApiError.badRequest('Invalid webhook signature');
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Webhook body is not valid JSON');
  }

  const event = body.event || 'unknown';
  // Razorpay sends x-razorpay-event-id. Fall back to a hash of the body.
  const eventId = eventIdHeader || crypto.createHash('sha256').update(rawBody).digest('hex');

  const existing = await WebhookEvent.findOneAndUpdate(
    { eventId },
    { $setOnInsert: { eventId, event, status: 'processing' } },
    { upsert: true, new: false }
  );
  if (existing && ['processed', 'ignored'].includes(existing.status)) {
    return { event, status: 'duplicate' };
  }
  if (existing) await WebhookEvent.updateOne({ eventId }, { $inc: { attempts: 1 }, $set: { status: 'processing' } });

  try {
    const status = await dispatch(event, body.payload || {});
    await WebhookEvent.updateOne({ eventId }, { $set: { status }, $unset: { error: 1 } });
    return { event, status };
  } catch (err) {
    await WebhookEvent.updateOne({ eventId }, { $set: { status: 'failed', error: err.message } });
    logger.error(`Webhook ${event} (${eventId}) failed: ${err.message}`);
    throw err;
  }
};
