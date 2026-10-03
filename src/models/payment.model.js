import mongoose from 'mongoose';

export const PAYMENT_KINDS = ['subscription', 'credit_pack', 'order'];
export const PAYMENT_STATUSES = ['created', 'paid', 'failed'];

const packSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    credits: { type: Number, required: true },
    priceInr: { type: Number, required: true },
    validityDays: { type: Number, required: true },
  },
  { _id: false }
);

// One record per Razorpay charge: every subscription cycle, pack purchase and product order.
const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: PAYMENT_KINDS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created' },
    amountInr: { type: Number, required: true },

    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpaySubscriptionId: { type: String, index: true },

    userSubscription: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSubscription' },
    creditPack: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditPack' },
    // What the user is buying, frozen at order time so later pack edits do not change it.
    packSnapshot: { type: packSnapshotSchema },
    // The product order this payment is for, when kind is "order".
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },

    paidAt: { type: Date },
    failureReason: { type: String },
  },
  { timestamps: true }
);

paymentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Payment = mongoose.model('Payment', paymentSchema);
