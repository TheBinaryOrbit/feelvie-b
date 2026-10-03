import mongoose from 'mongoose';
import { LISTING_TYPES } from './product.model.js';

export const ORDER_STATUSES = ['pending_payment', 'placed', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled'];
export const PAYMENT_METHODS = ['online', 'cod'];
export const ORDER_PAYMENT_STATUSES = ['pending', 'paid', 'failed'];
export const REFUND_STATUSES = ['none', 'pending', 'done'];
export const ORDER_ACTORS = ['buyer', 'seller', 'admin', 'system'];

export const MAX_ORDER_QUANTITY = 10;
export const MAX_RENT_START_DAYS_AHEAD = 90;
export const PAYMENT_WINDOW_MINUTES = 30;

// Orders in these statuses still need action from someone.
export const OPEN_STATUSES = ['pending_payment', 'placed', 'confirmed', 'shipped'];

const productSnapshotSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String },
    image: { type: String },
    brand: { type: String },
    color: { type: String },
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    // Sale orders.
    unitPriceInr: { type: Number },
    itemsTotalInr: { type: Number },
    // Rent orders.
    pricePerDayInr: { type: Number },
    days: { type: Number },
    rentTotalInr: { type: Number },
    // Refundable deposit for the whole order (deposit per piece x quantity).
    securityDepositInr: { type: Number },
    // What the buyer pays.
    totalInr: { type: Number, required: true },
  },
  { _id: false }
);

const rentalSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true },
    returnedAt: { type: Date },
  },
  { _id: false }
);

// A copy of the buyer's address when the order was placed.
const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    country: String,
  },
  { _id: false }
);

const refundSchema = new mongoose.Schema(
  {
    amountInr: { type: Number, default: 0 },
    status: { type: String, enum: REFUND_STATUSES, default: 'none' },
    reason: { type: String },
    note: { type: String },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    doneAt: { type: Date },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    by: { type: String, enum: ORDER_ACTORS, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false }
);

// One order is one product, in one size, from one seller.
const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Kept so the order still reads correctly if the product is edited or deleted.
    productSnapshot: { type: productSnapshotSchema, required: true },
    type: { type: String, enum: LISTING_TYPES, required: true },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: MAX_ORDER_QUANTITY },

    pricing: { type: pricingSchema, required: true },
    rental: { type: rentalSchema },
    shippingAddress: { type: shippingAddressSchema, required: true },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: ORDER_PAYMENT_STATUSES, default: 'pending' },
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String },
    paidAt: { type: Date },
    // Online orders must be paid before this, or they are cancelled and the stock released.
    expiresAt: { type: Date },

    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    statusHistory: { type: [historySchema], default: [] },
    deliveredAt: { type: Date },

    cancelledBy: { type: String, enum: ORDER_ACTORS },
    cancelReason: { type: String, trim: true, maxlength: 500 },
    cancelledAt: { type: Date },

    // Money owed back to the buyer. Paid out manually by an admin.
    refund: { type: refundSchema, default: () => ({}) },
  },
  { timestamps: true }
);

orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 });

orderSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Order = mongoose.model('Order', orderSchema);
