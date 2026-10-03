import mongoose from 'mongoose';
import { AUDIENCES, BILLING_CYCLES } from './subscriptionPlan.model.js';

// Mirrors Razorpay subscription statuses.
export const SUBSCRIPTION_STATUSES = [
  'created', // Checkout not completed yet
  'authenticated', // mandate approved, first charge in progress
  'active', // paid for the current period
  'pending', // a renewal charge failed, Razorpay is retrying
  'halted', // all retries failed
  'paused',
  'cancelled',
  'completed', // all billing cycles done
  'expired',
];

// A user can have only one subscription in any of these statuses.
export const LIVE_STATUSES = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'];
export const TERMINAL_STATUSES = ['cancelled', 'completed', 'expired'];

const planSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    audience: { type: String, enum: AUDIENCES, required: true },
    billingCycle: { type: String, enum: BILLING_CYCLES, required: true },
    originalPriceInr: { type: Number, required: true },
    offerPriceInr: { type: Number, required: true },
    creditsPerMonth: { type: Number, required: true },
  },
  { _id: false }
);

const userSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    // The terms the user signed up for. Later admin edits to the plan do not change these.
    planSnapshot: { type: planSnapshotSchema, required: true },

    razorpaySubscriptionId: { type: String, required: true, unique: true },
    shortUrl: { type: String },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'created', index: true },
    // Maintained from status. Backs the one-live-subscription-per-user unique index.
    isLive: { type: Boolean, default: true },

    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    paidCount: { type: Number, default: 0 },
    totalCount: { type: Number },

    startedAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    endedAt: { type: Date },
    lastPaymentId: { type: String },

    // Who cancelled, and why (admin cancellations only).
    cancelledBy: { type: String, enum: ['user', 'admin', 'razorpay'] },
    cancelledByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

userSubscriptionSchema.pre('validate', function () {
  this.isLive = LIVE_STATUSES.includes(this.status);
});

userSubscriptionSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { isLive: true }, name: 'one_live_subscription_per_user' }
);

userSubscriptionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  delete obj.isLive;
  return obj;
};

export const UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);
