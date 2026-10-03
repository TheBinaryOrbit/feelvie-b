import crypto from 'crypto';
import { CreditPack } from '../models/creditPack.model.js';
import { Payment } from '../models/payment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { addDays } from '../utils/date.js';
import { logger } from '../utils/logger.js';
import * as razorpay from './razorpay.service.js';
import * as walletService from './wallet.service.js';
import { requireActive } from './subscription.service.js';

export const createPackOrder = async (user, packId) => {
  // Packs are an add-on: only users with a paid-up subscription can buy them.
  await requireActive(user._id);

  const pack = await CreditPack.findOne({ _id: packId, isActive: true });
  if (!pack) throw ApiError.notFound('Credit pack not found or no longer available');

  const order = await razorpay.createOrder({
    amountInr: pack.priceInr,
    // Razorpay receipts are limited to 40 characters.
    receipt: `pack_${crypto.randomBytes(8).toString('hex')}`,
    notes: { userId: String(user._id), creditPackId: String(pack._id), kind: 'credit_pack' },
  });

  const payment = await Payment.create({
    user: user._id,
    kind: 'credit_pack',
    status: 'created',
    amountInr: pack.priceInr,
    razorpayOrderId: order.id,
    creditPack: pack._id,
    packSnapshot: {
      name: pack.name,
      credits: pack.credits,
      priceInr: pack.priceInr,
      validityDays: pack.validityDays,
    },
  });

  return {
    payment,
    checkout: {
      key: razorpay.publicKeyId(),
      order_id: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Feelvie',
      description: pack.name,
      prefill: { contact: user.phone, ...(user.email && { email: user.email }), ...(user.name && { name: user.name }) },
      notes: { paymentId: String(payment._id) },
    },
  };
};

/**
 * Marks a pack payment as paid and grants its credits. Shared by the checkout verify
 * endpoint and the webhook fallback. Idempotent: the grant is keyed by our payment id.
 * The subscription is not re-checked here because the money has already been taken.
 */
export const fulfillPackPayment = async (payment, razorpayPaymentId) => {
  const paid = await Payment.findOneAndUpdate(
    { _id: payment._id },
    {
      $set: { status: 'paid', paidAt: payment.paidAt || new Date(), razorpayPaymentId },
      $unset: { failureReason: 1 },
    },
    { new: true }
  );

  const { credits, validityDays, name } = paid.packSnapshot;
  const lot = await walletService.grantCredits({
    userId: paid.user,
    credits,
    source: 'credit_pack',
    // Counted from the first time this payment was confirmed, so a retry does not extend it.
    expiresOn: addDays(paid.paidAt, validityDays),
    grantKey: `pack:${paid._id}`,
    description: name,
    creditPack: paid.creditPack,
    payment: paid._id,
  });

  return { payment: paid, lot };
};

export const verifyPackPayment = async (user, payload) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = payload;

  const payment = await Payment.findOne({ user: user._id, razorpayOrderId: orderId, kind: 'credit_pack' });
  if (!payment) throw ApiError.notFound('Order not found');
  if (!razorpay.verifyOrderSignature(orderId, paymentId, signature)) {
    throw ApiError.badRequest('Payment verification failed');
  }

  const { payment: paid, lot } = await fulfillPackPayment(payment, paymentId);
  const wallet = await walletService.getSummary(user._id);
  return { payment: paid, creditsAdded: lot?.creditsAdded ?? 0, expiresOn: lot?.expiresOn, balance: wallet.balance };
};

export const markPackPaymentFailed = async (orderId, razorpayPaymentId, reason) => {
  const updated = await Payment.findOneAndUpdate(
    { razorpayOrderId: orderId, kind: 'credit_pack', status: { $ne: 'paid' } },
    { $set: { status: 'failed', failureReason: reason || 'Payment failed' } },
    { new: true }
  );
  if (updated) logger.info(`Pack payment ${updated._id} failed (${razorpayPaymentId}): ${reason}`);
  return updated;
};
