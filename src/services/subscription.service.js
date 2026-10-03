import { SubscriptionPlan } from '../models/subscriptionPlan.model.js';
import {
  UserSubscription,
  LIVE_STATUSES,
  TERMINAL_STATUSES,
} from '../models/userSubscription.model.js';
import { Payment } from '../models/payment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { addMonthsUTC, fromUnix, formatDay } from '../utils/date.js';
import { logger } from '../utils/logger.js';
import * as razorpay from './razorpay.service.js';
import * as walletService from './wallet.service.js';

// Number of billing cycles Razorpay will charge before the subscription completes.
const TOTAL_CYCLES = { monthly: 120, yearly: 10 };
const MONTHS_PER_CYCLE = { monthly: 1, yearly: 12 };

export const findLive = (userId) => UserSubscription.findOne({ user: userId, isLive: true });

// Throws 403 unless the user has a subscription that is paid for right now.
export const requireActive = async (userId) => {
  const sub = await UserSubscription.findOne({ user: userId, status: 'active' });
  if (!sub) throw ApiError.forbidden('An active subscription is required to buy credit packs');
  return sub;
};

/**
 * Copies Razorpay's view of a subscription onto ours. Guards against webhooks arriving
 * out of order: a terminal status is never reverted, and periods never move backwards.
 */
export const applyRemote = (sub, entity) => {
  if (!entity) return sub;

  const remotePaid = entity.paid_count ?? 0;
  const isStale = remotePaid < sub.paidCount;

  if (!TERMINAL_STATUSES.includes(sub.status) && !isStale) {
    sub.status = entity.status;
  }
  if (!isStale && entity.current_start && entity.current_end) {
    sub.currentPeriodStart = fromUnix(entity.current_start);
    sub.currentPeriodEnd = fromUnix(entity.current_end);
  }
  sub.paidCount = Math.max(sub.paidCount || 0, remotePaid);
  if (entity.total_count) sub.totalCount = entity.total_count;
  if (entity.short_url) sub.shortUrl = entity.short_url;
  if (sub.status === 'active' && !sub.startedAt) {
    sub.startedAt = fromUnix(entity.start_at) || new Date();
  }
  if (TERMINAL_STATUSES.includes(sub.status) && !sub.endedAt) {
    sub.endedAt = fromUnix(entity.ended_at) || new Date();
  }
  return sub;
};

/**
 * Grants one credit lot per month of the paid period that has started, each expiring at
 * the end of its month. Monthly plans have one window per period. Yearly plans have 12,
 * granted as each month begins. Idempotent through grantKey, so it is safe to call from
 * checkout verify, every webhook and the scheduled job.
 */
export const syncGrants = async (sub, now = new Date()) => {
  if (sub.status !== 'active' || !sub.currentPeriodStart || !sub.currentPeriodEnd) return [];

  const { billingCycle, creditsPerMonth, name } = sub.planSnapshot;
  const periodStart = sub.currentPeriodStart;
  const periodEnd = sub.currentPeriodEnd;
  const granted = [];

  for (let month = 0; month < MONTHS_PER_CYCLE[billingCycle]; month += 1) {
    const windowStart = addMonthsUTC(periodStart, month);
    if (windowStart >= periodEnd || windowStart > now) break;

    const nextStart = addMonthsUTC(periodStart, month + 1);
    const windowEnd = nextStart < periodEnd ? nextStart : periodEnd;

    const lot = await walletService.grantCredits({
      userId: sub.user,
      credits: creditsPerMonth,
      source: 'subscription',
      expiresOn: windowEnd,
      grantKey: `sub:${sub._id}:${windowStart.toISOString()}`,
      description: `${name}: credits for ${formatDay(windowStart)} to ${formatDay(windowEnd)}`,
      subscription: sub._id,
    });
    if (lot) granted.push(lot);
  }
  return granted;
};

// Upserts a Payment for a subscription charge. The Razorpay payment id makes it idempotent.
export const recordSubscriptionPayment = async (sub, { paymentId, amountPaise, status = 'paid', failureReason }) => {
  if (!paymentId) return null;
  const update = {
    $setOnInsert: {
      user: sub.user,
      kind: 'subscription',
      razorpayPaymentId: paymentId,
      razorpaySubscriptionId: sub.razorpaySubscriptionId,
      userSubscription: sub._id,
    },
    $set: {
      status,
      amountInr: amountPaise != null ? amountPaise / 100 : sub.planSnapshot.offerPriceInr,
      ...(status === 'paid' && { paidAt: new Date() }),
      ...(failureReason && { failureReason }),
    },
  };
  // Never downgrade a paid charge to failed.
  const filter = { razorpayPaymentId: paymentId, ...(status !== 'paid' && { status: { $ne: 'paid' } }) };
  try {
    return await Payment.findOneAndUpdate(filter, update, { upsert: true, new: true });
  } catch (err) {
    if (err.code === 11000) return Payment.findOne({ razorpayPaymentId: paymentId });
    throw err;
  }
};

const checkoutOptions = (sub, plan, user) => ({
  key: razorpay.publicKeyId(),
  subscription_id: sub.razorpaySubscriptionId,
  name: 'Feelvie',
  description: plan.name,
  prefill: { contact: user.phone, ...(user.email && { email: user.email }), ...(user.name && { name: user.name }) },
  notes: { userId: String(user._id), subscriptionId: String(sub._id) },
});

// A subscription left in "created" means checkout was never completed. Close it so the user can start again.
const abandon = async (sub) => {
  try {
    await razorpay.cancelSubscription(sub.razorpaySubscriptionId, false);
  } catch (err) {
    logger.warn(`Could not cancel abandoned Razorpay subscription ${sub.razorpaySubscriptionId}: ${err.message}`);
  }
  sub.status = 'cancelled';
  sub.cancelledAt = new Date();
  sub.endedAt = new Date();
  await sub.save();
};

export const subscribe = async (user, planId) => {
  const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
  if (!plan) throw ApiError.notFound('Plan not found or no longer available');

  const existing = await findLive(user._id);
  if (existing?.status === 'created') {
    await abandon(existing);
  } else if (existing) {
    throw ApiError.conflict('You already have a subscription. Cancel it before choosing a new plan');
  }

  const remote = await razorpay.createSubscription({
    razorpayPlanId: plan.razorpayPlanId,
    totalCount: TOTAL_CYCLES[plan.billingCycle],
    notes: { userId: String(user._id), planId: String(plan._id) },
  });

  const sub = new UserSubscription({
    user: user._id,
    plan: plan._id,
    planSnapshot: {
      name: plan.name,
      audience: plan.audience,
      billingCycle: plan.billingCycle,
      originalPriceInr: plan.originalPriceInr,
      offerPriceInr: plan.offerPriceInr,
      creditsPerMonth: plan.creditsPerMonth,
    },
    razorpaySubscriptionId: remote.id,
    status: 'created',
  });
  applyRemote(sub, remote);

  try {
    await sub.save();
  } catch (err) {
    // Another subscribe request for this user won the race.
    if (err.code === 11000) {
      await abandon(sub).catch(() => {});
      throw ApiError.conflict('You already have a subscription. Cancel it before choosing a new plan');
    }
    throw err;
  }

  return { subscription: sub, checkout: checkoutOptions(sub, plan, user) };
};

const findOwnedByRazorpayId = async (userId, razorpaySubscriptionId) => {
  const sub = await UserSubscription.findOne({ user: userId, razorpaySubscriptionId });
  if (!sub) throw ApiError.notFound('Subscription not found');
  return sub;
};

// Called by the app with the Razorpay Checkout result after the first payment.
export const verifyCheckout = async (user, payload) => {
  const {
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: signature,
  } = payload;

  const sub = await findOwnedByRazorpayId(user._id, subscriptionId);
  if (!razorpay.verifySubscriptionSignature(paymentId, subscriptionId, signature)) {
    throw ApiError.badRequest('Payment verification failed');
  }

  const remote = await razorpay.fetchSubscription(subscriptionId);
  applyRemote(sub, remote);
  sub.lastPaymentId = paymentId;
  await sub.save();

  await recordSubscriptionPayment(sub, { paymentId });
  await syncGrants(sub);

  const wallet = await walletService.getSummary(user._id);
  return { subscription: sub, balance: wallet.balance };
};

/**
 * Cancels a live subscription. Shared by the user and admin endpoints.
 * - An active subscription ends at the period end by default: no further charges, access
 *   and this period's credits remain. `immediately: true` ends it now.
 * - Anything not paid up (created, authenticated, pending, halted, paused) always ends now.
 * Credits already granted are never removed. They stay usable until they expire.
 */
export const cancelSubscription = async (sub, { immediately = false, actor = 'user', adminId, reason } = {}) => {
  if (!sub.isLive) throw ApiError.badRequest('This subscription has already ended');

  const record = () => {
    sub.cancelledAt = new Date();
    sub.cancelledBy = actor;
    if (adminId) sub.cancelledByAdmin = adminId;
    if (reason) sub.cancelReason = reason;
  };

  if (sub.status === 'active' && !immediately) {
    if (sub.cancelAtPeriodEnd) {
      throw ApiError.badRequest('This subscription is already set to cancel at the end of the current period');
    }
    const remote = await razorpay.cancelSubscription(sub.razorpaySubscriptionId, true);
    applyRemote(sub, remote);
    sub.cancelAtPeriodEnd = true;
    record();
    return sub.save();
  }

  if (sub.status !== 'created') {
    const remote = await razorpay.cancelSubscription(sub.razorpaySubscriptionId, false);
    applyRemote(sub, remote);
  }
  sub.status = 'cancelled';
  sub.endedAt = sub.endedAt || new Date();
  record();
  return sub.save();
};

export const cancel = async (user) => {
  const sub = await findLive(user._id);
  if (!sub) throw ApiError.notFound('You do not have a subscription to cancel');
  return cancelSubscription(sub, { actor: 'user' });
};

export const cancelByAdmin = async (subscriptionId, { immediately, reason, adminId }) => {
  const sub = await UserSubscription.findById(subscriptionId);
  if (!sub) throw ApiError.notFound('Subscription not found');
  return cancelSubscription(sub, { immediately, actor: 'admin', adminId, reason });
};

export const getMine = async (userId) => {
  const [current, history] = await Promise.all([
    findLive(userId),
    UserSubscription.find({ user: userId }).sort({ createdAt: -1 }).limit(20),
  ]);
  return { current, history };
};

export const listAll = ({ status, userId } = {}, pagination) => {
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.user = userId;
  return paginate(UserSubscription, filter, pagination, { populate: { path: 'user', select: 'phone name email' } });
};

export const getById = async (id) => {
  const sub = await UserSubscription.findById(id).populate('user', 'phone name email');
  if (!sub) throw ApiError.notFound('Subscription not found');
  const payments = await Payment.find({ userSubscription: sub._id }).sort({ createdAt: -1 });
  return { subscription: sub, payments };
};

// Used by the scheduled job: catches up monthly grants for yearly plans and any missed grants.
export const syncAllActive = async (now = new Date()) => {
  const subs = await UserSubscription.find({ status: 'active' });
  let lots = 0;
  for (const sub of subs) {
    try {
      lots += (await syncGrants(sub, now)).length;
    } catch (err) {
      logger.error(`syncGrants failed for subscription ${sub._id}: ${err.message}`);
    }
  }
  return { subscriptions: subs.length, lots };
};

export { LIVE_STATUSES };
