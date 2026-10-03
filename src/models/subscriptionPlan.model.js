import mongoose from 'mongoose';

export const AUDIENCES = ['B2B', 'B2C'];
export const BILLING_CYCLES = ['monthly', 'yearly'];

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    audience: {
      type: String,
      required: [true, 'Audience is required'],
      enum: { values: AUDIENCES, message: 'Audience must be B2B or B2C' },
    },
    billingCycle: {
      type: String,
      required: [true, 'Billing cycle is required'],
      enum: { values: BILLING_CYCLES, message: 'Billing cycle must be monthly or yearly' },
    },
    // Display price, shown struck through. The customer pays offerPriceInr.
    originalPriceInr: {
      type: Number,
      required: [true, 'Original price is required'],
      min: [1, 'Original price must be at least 1'],
    },
    offerPriceInr: {
      type: Number,
      required: [true, 'Offer price is required'],
      min: [1, 'Offer price must be at least 1'],
      validate: {
        validator(value) {
          return this.originalPriceInr == null || value <= this.originalPriceInr;
        },
        message: 'Offer price cannot be more than the original price',
      },
    },
    creditsPerMonth: {
      type: Number,
      required: [true, 'Credits per month is required'],
      min: [1, 'Credits per month must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Credits per month must be a whole number' },
    },
    // Razorpay plans are immutable, so price and billing cycle are locked after creation.
    razorpayPlanId: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

subscriptionPlanSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
