import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  Order,
  OPEN_STATUSES,
  MAX_ORDER_QUANTITY,
  MAX_RENT_START_DAYS_AHEAD,
  PAYMENT_WINDOW_MINUTES,
} from '../models/order.model.js';
import { Address } from '../models/address.model.js';
import { Payment } from '../models/payment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { addDays } from '../utils/date.js';
import { logger } from '../utils/logger.js';
import * as razorpay from './razorpay.service.js';
import { findVisibleById, reserveStock, releaseStock } from './product.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_FIELDS = 'phone name email';

// ---- Helpers ---------------------------------------------------------------------

const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// For example "FV-20261003-7K2M9Q". Easy to read out over the phone.
const newOrderNumber = () => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const code = Array.from(crypto.randomBytes(6), (b) => ORDER_NUMBER_ALPHABET[b % ORDER_NUMBER_ALPHABET.length]).join('');
  return `FV-${day}-${code}`;
};

const history = (status, by, note) => ({ status, by, at: new Date(), ...(note && { note }) });

/**
 * Moves an order from `from` to a new state with one conditional update, so two requests
 * acting on the same order at once cannot both succeed. Returns null if the order was no
 * longer in `from`.
 */
const transition = (order, from, set, entry) =>
  Order.findOneAndUpdate(
    { _id: order._id, status: from },
    { $set: set, $push: { statusHistory: entry } },
    { new: true }
  );

const changedError = () => ApiError.conflict('This order was just updated by someone else. Please refresh and try again');

const pendingRefund = (amountInr, reason) => ({ amountInr, status: 'pending', reason });

const startOfTodayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

// Reads "2026-10-20" (or a full ISO date) as that calendar day in UTC.
const parseDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(match[3]) ? null : date;
};

const buildPricing = (product, quantity, { startDate, days }) => {
  if (product.listingType === 'sale') {
    const unitPriceInr = product.sale.priceInr;
    const itemsTotalInr = unitPriceInr * quantity;
    return { pricing: { unitPriceInr, itemsTotalInr, totalInr: itemsTotalInr } };
  }

  const { pricePerDayInr, securityDepositInr = 0, minDays, maxDays } = product.rent;
  if (!Number.isInteger(days) || days < minDays || days > maxDays) {
    throw ApiError.badRequest(`This product can be rented for ${minDays} to ${maxDays} days`);
  }
  const start = parseDay(startDate);
  if (!start) throw ApiError.badRequest('startDate is required for a rental, as YYYY-MM-DD');
  const today = startOfTodayUTC();
  if (start < today) throw ApiError.badRequest('startDate cannot be in the past');
  if (start > new Date(today.getTime() + MAX_RENT_START_DAYS_AHEAD * DAY_MS)) {
    throw ApiError.badRequest(`startDate can be at most ${MAX_RENT_START_DAYS_AHEAD} days from today`);
  }

  const rentTotalInr = pricePerDayInr * days * quantity;
  const deposit = securityDepositInr * quantity;
  return {
    pricing: { pricePerDayInr, days, rentTotalInr, securityDepositInr: deposit, totalInr: rentTotalInr + deposit },
    rental: { startDate: start, endDate: addDays(start, days), days },
  };
};

const copyAddress = (address) => {
  const { fullName, phone, addressLine1, addressLine2, landmark, city, state, pincode, country } = address;
  return { fullName, phone, addressLine1, addressLine2, landmark, city, state, pincode, country };
};

const checkoutOptions = (order, buyer) => ({
  key: razorpay.publicKeyId(),
  order_id: order.razorpayOrderId,
  amount: razorpay.toPaise(order.pricing.totalInr),
  currency: 'INR',
  name: 'Feelvie',
  description: order.productSnapshot.title,
  prefill: { contact: buyer.phone, ...(buyer.email && { email: buyer.email }), ...(buyer.name && { name: buyer.name }) },
  notes: { orderId: String(order._id), orderNumber: order.orderNumber },
});

// ---- Buyer -----------------------------------------------------------------------

export const create = async (buyer, { productId, size, quantity = 1, addressId, paymentMethod, startDate, days }) => {
  const product = await findVisibleById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  if (product.owner.equals(buyer._id)) throw ApiError.badRequest('You cannot order your own product');

  if (product.listingType === 'rent' && paymentMethod === 'cod') {
    throw ApiError.badRequest('Rentals must be paid online. Cash on delivery is only for purchases');
  }

  const sizeLabel = String(size).trim().toUpperCase();
  const sizeEntry = product.sizes.find((s) => s.size === sizeLabel);
  if (!sizeEntry) throw ApiError.badRequest(`This product is not available in size ${sizeLabel}`);

  const address = mongoose.isValidObjectId(addressId)
    ? await Address.findOne({ _id: addressId, user: buyer._id })
    : null;
  if (!address) throw ApiError.badRequest('addressId must be one of your saved addresses');

  const { pricing, rental } = buildPricing(product, quantity, { startDate, days });

  const reserved = await reserveStock(product._id, sizeLabel, quantity);
  if (!reserved) {
    const left = sizeEntry.stock;
    throw ApiError.conflict(
      left > 0 && left < quantity ? `Only ${left} left in size ${sizeLabel}` : `Size ${sizeLabel} is out of stock`
    );
  }

  // From here on, any failure must give the stock back.
  try {
    const isOnline = paymentMethod === 'online';
    const status = isOnline ? 'pending_payment' : 'placed';
    const orderNumber = newOrderNumber();

    const remote = isOnline
      ? await razorpay.createOrder({
          amountInr: pricing.totalInr,
          receipt: orderNumber,
          notes: { kind: 'order', orderNumber, buyerId: String(buyer._id) },
        })
      : null;

    const order = await Order.create({
      orderNumber,
      buyer: buyer._id,
      seller: product.owner,
      product: product._id,
      productSnapshot: {
        title: product.title,
        slug: product.slug,
        image: product.images[0],
        brand: product.brand,
        color: product.color,
      },
      type: product.listingType,
      size: sizeLabel,
      quantity,
      pricing,
      rental,
      shippingAddress: copyAddress(address),
      paymentMethod,
      paymentStatus: 'pending',
      razorpayOrderId: remote?.id,
      expiresAt: isOnline ? new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000) : undefined,
      status,
      statusHistory: [history(status, 'buyer')],
    });

    if (isOnline) {
      await Payment.create({
        user: buyer._id,
        kind: 'order',
        status: 'created',
        amountInr: pricing.totalInr,
        razorpayOrderId: remote.id,
        order: order._id,
      });
    }

    return { order, ...(isOnline && { checkout: checkoutOptions(order, buyer) }) };
  } catch (err) {
    await releaseStock(product._id, sizeLabel, quantity);
    throw err;
  }
};

/**
 * Records a successful online payment. Shared by the checkout verify endpoint and the
 * webhook, and safe to call more than once.
 */
export const markPaid = async (order, razorpayPaymentId) => {
  await Payment.updateOne(
    { razorpayOrderId: order.razorpayOrderId, kind: 'order' },
    { $set: { status: 'paid', razorpayPaymentId, paidAt: new Date() }, $unset: { failureReason: 1 } }
  );

  const paid = { paymentStatus: 'paid', razorpayPaymentId, paidAt: new Date() };

  const placed = await transition(order, 'pending_payment', { ...paid, status: 'placed' }, history('placed', 'system', 'Payment received'));
  if (placed) return placed;

  // The order expired or was cancelled before the money arrived: keep it cancelled and
  // owe the buyer a refund. The filter makes sure this happens only once.
  const late = await Order.findOneAndUpdate(
    { _id: order._id, status: 'cancelled', paymentStatus: { $ne: 'paid' } },
    { $set: { ...paid, refund: pendingRefund(order.pricing.totalInr, 'Payment received after the order was cancelled') } },
    { new: true }
  );
  if (late) {
    logger.warn(`Order ${order.orderNumber} was paid after cancellation. Refund pending`);
    return late;
  }

  return Order.findById(order._id);
};

const findForBuyer = async (buyerId, id) => {
  const order = mongoose.isValidObjectId(id) ? await Order.findOne({ _id: id, buyer: buyerId }) : null;
  if (!order) throw ApiError.notFound('Order not found');
  return order;
};

export const verifyPayment = async (buyer, id, payload) => {
  const order = await findForBuyer(buyer._id, id);
  if (order.paymentMethod !== 'online') throw ApiError.badRequest('This order is not paid online');

  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = payload;
  if (orderId !== order.razorpayOrderId || !razorpay.verifyOrderSignature(orderId, paymentId, signature)) {
    throw ApiError.badRequest('Payment verification failed');
  }
  return markPaid(order, paymentId);
};

// Checkout options to retry payment on an order still waiting for it, with the same
// Razorpay order. Lets the buyer pay after closing Checkout or reopening the app.
export const getCheckout = async (buyer, id) => {
  const order = await findForBuyer(buyer._id, id);
  if (order.status !== 'pending_payment') {
    throw ApiError.badRequest(`This order is ${order.status} and does not need payment`);
  }
  // The expiry job runs every few minutes, so check the deadline here too.
  if (order.expiresAt && order.expiresAt <= new Date()) {
    throw ApiError.badRequest('The time to pay for this order has run out. Please place a new order');
  }
  return { order, checkout: checkoutOptions(order, buyer) };
};

// Webhook entry points. Return null when the Razorpay order is not a product order.
export const markPaidByRazorpayOrder = async (razorpayOrderId, razorpayPaymentId) => {
  const order = await Order.findOne({ razorpayOrderId });
  return order ? markPaid(order, razorpayPaymentId) : null;
};

export const markPaymentFailed = async (razorpayOrderId, reason) => {
  // The buyer can retry the same Razorpay order until the order expires.
  const order = await Order.findOneAndUpdate(
    { razorpayOrderId, status: 'pending_payment', paymentStatus: 'pending' },
    { $set: { paymentStatus: 'failed' } },
    { new: true }
  );
  if (!order) return null;
  await Payment.updateOne(
    { razorpayOrderId, kind: 'order', status: { $ne: 'paid' } },
    { $set: { status: 'failed', failureReason: reason || 'Payment failed' } }
  );
  return order;
};

const listFilter = (base, { status, type }) => ({
  ...base,
  ...(status && { status }),
  ...(type && { type }),
});

export const listForBuyer = (buyerId, filters, pagination) =>
  paginate(Order, listFilter({ buyer: buyerId }, filters), pagination);

export const getForBuyer = async (buyerId, id) => {
  const order = await findForBuyer(buyerId, id);
  return order.populate({ path: 'seller', select: 'name' });
};

// ---- Status changes --------------------------------------------------------------

const NEXT_STATUS = { placed: 'confirmed', confirmed: 'shipped', shipped: 'delivered' };

const nextStatusOf = (order) => {
  if (order.status === 'delivered' && order.type === 'rent') return 'returned';
  return NEXT_STATUS[order.status] || null;
};

// Moves an order one step forward. `actor` is 'seller' or 'admin'.
const advance = async (order, toStatus, actor) => {
  const next = nextStatusOf(order);
  if (!next) throw ApiError.badRequest(`This order is ${order.status} and has no further steps`);
  if (toStatus !== next) {
    throw ApiError.badRequest(`This order is ${order.status}. The next step is ${next}`);
  }

  const set = { status: next };
  if (next === 'delivered') {
    set.deliveredAt = new Date();
    // Cash is collected on delivery.
    if (order.paymentMethod === 'cod') Object.assign(set, { paymentStatus: 'paid', paidAt: new Date() });
  }
  if (next === 'returned') {
    set['rental.returnedAt'] = new Date();
    const deposit = order.pricing.securityDepositInr || 0;
    if (deposit > 0) set.refund = pendingRefund(deposit, 'Security deposit for a returned rental');
  }

  const updated = await transition(order, order.status, set, history(next, actor));
  if (!updated) throw changedError();

  // The rented piece is back and can be ordered again.
  if (next === 'returned') await releaseStock(order.product, order.size, order.quantity);
  return updated;
};

const BUYER_CAN_CANCEL = ['pending_payment', 'placed', 'confirmed'];
const STAFF_CAN_CANCEL = [...BUYER_CAN_CANCEL, 'shipped'];

const cancel = async (order, actor, reason) => {
  if (order.status === 'cancelled') throw ApiError.badRequest('This order is already cancelled');
  const allowed = actor === 'buyer' ? BUYER_CAN_CANCEL : STAFF_CAN_CANCEL;
  if (!allowed.includes(order.status)) {
    throw ApiError.badRequest(
      actor === 'buyer'
        ? `This order is ${order.status} and can no longer be cancelled`
        : `An order that is ${order.status} cannot be cancelled`
    );
  }

  const set = { status: 'cancelled', cancelledBy: actor, cancelledAt: new Date(), ...(reason && { cancelReason: reason }) };
  if (order.paymentStatus === 'paid') set.refund = pendingRefund(order.pricing.totalInr, 'Order cancelled after payment');

  const updated = await transition(order, order.status, set, history('cancelled', actor, reason));
  if (!updated) throw changedError();

  await releaseStock(order.product, order.size, order.quantity);
  return updated;
};

export const cancelByBuyer = async (buyerId, id, reason) => cancel(await findForBuyer(buyerId, id), 'buyer', reason);

// Cancels online orders that were not paid in time and gives their stock back.
export const expireUnpaid = async (now = new Date()) => {
  const due = await Order.find({ status: 'pending_payment', expiresAt: { $lte: now } });
  let expired = 0;
  for (const order of due) {
    const updated = await transition(
      order,
      'pending_payment',
      { status: 'cancelled', cancelledBy: 'system', cancelledAt: new Date(), cancelReason: 'Payment was not completed in time' },
      history('cancelled', 'system', 'Payment was not completed in time')
    );
    if (!updated) continue;
    await releaseStock(order.product, order.size, order.quantity);
    expired += 1;
  }
  return expired;
};

// ---- Seller ----------------------------------------------------------------------

const findForSeller = async (sellerId, id) => {
  const order = mongoose.isValidObjectId(id) ? await Order.findOne({ _id: id, seller: sellerId }) : null;
  if (!order) throw ApiError.notFound('Order not found');
  return order;
};

// Unpaid online orders are not shown to the seller: there is nothing to fulfil yet.
export const listForSeller = (sellerId, filters, pagination) =>
  paginate(Order, listFilter({ seller: sellerId, status: { $ne: 'pending_payment' } }, filters), pagination, {
    populate: { path: 'buyer', select: 'name phone' },
  });

export const getForSeller = async (sellerId, id) => {
  const order = await findForSeller(sellerId, id);
  return order.populate({ path: 'buyer', select: 'name phone' });
};

export const advanceBySeller = async (sellerId, id, status) => advance(await findForSeller(sellerId, id), status, 'seller');

export const cancelBySeller = async (sellerId, id, reason) => cancel(await findForSeller(sellerId, id), 'seller', reason);

// ---- Admin -----------------------------------------------------------------------

const findOr404 = async (id) => {
  const order = mongoose.isValidObjectId(id) ? await Order.findById(id) : null;
  if (!order) throw ApiError.notFound('Order not found');
  return order;
};

export const listForAdmin = ({ status, type, buyer, seller, paymentMethod, refundStatus } = {}, pagination) => {
  const filter = listFilter({}, { status, type });
  if (buyer) filter.buyer = buyer;
  if (seller) filter.seller = seller;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (refundStatus) filter['refund.status'] = refundStatus;
  return paginate(Order, filter, pagination, {
    populate: [
      { path: 'buyer', select: USER_FIELDS },
      { path: 'seller', select: USER_FIELDS },
    ],
  });
};

export const getForAdmin = async (id) => {
  const order = await findOr404(id);
  await order.populate([
    { path: 'buyer', select: USER_FIELDS },
    { path: 'seller', select: USER_FIELDS },
    { path: 'refund.doneBy', select: 'name email' },
  ]);
  const payment = await Payment.findOne({ order: order._id });
  return { order, payment };
};

export const advanceByAdmin = async (id, status) => advance(await findOr404(id), status, 'admin');

export const cancelByAdmin = async (id, reason) => cancel(await findOr404(id), 'admin', reason);

// The admin has paid the refund out by hand (Razorpay dashboard, bank transfer or cash).
export const markRefundDone = async (id, adminId, note) => {
  const order = await findOr404(id);
  if (order.refund?.status !== 'pending') throw ApiError.badRequest('This order has no pending refund');
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'refund.status': 'pending' },
    { $set: { 'refund.status': 'done', 'refund.doneBy': adminId, 'refund.doneAt': new Date(), ...(note && { 'refund.note': note }) } },
    { new: true }
  );
  if (!updated) throw changedError();
  return updated;
};

// ---- Used by user deletion -------------------------------------------------------

// True when the user still has an order in progress, an unreturned rental or an unpaid refund.
export const hasUnfinishedOrders = async (userId) =>
  Boolean(
    await Order.exists({
      $and: [
        { $or: [{ buyer: userId }, { seller: userId }] },
        { $or: [{ status: { $in: OPEN_STATUSES } }, { type: 'rent', status: 'delivered' }, { 'refund.status': 'pending' }] },
      ],
    })
  );

export { MAX_ORDER_QUANTITY };
