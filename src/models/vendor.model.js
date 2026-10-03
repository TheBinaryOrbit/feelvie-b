import mongoose from 'mongoose';

export const VENDOR_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

// Products a user must have added before applying. Not enforced until the product
// model exists. See checkProductRequirement in vendor.service.js.
export const MIN_PRODUCTS_TO_APPLY = 5;

// A user's vendor application and its admin decision. One per user. Products are only
// shown in stores when the vendor is approved (see vendor.service.js canSell).
const vendorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: VENDOR_STATUSES, default: 'pending', index: true },

    // The B2B subscription that made the user eligible when they applied.
    subscriptionAtApply: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSubscription' },
    appliedAt: { type: Date, default: Date.now },
    applicationCount: { type: Number, default: 1 },

    // Latest admin decision.
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: { type: Date },
    approvedAt: { type: Date },
    // Why the application was rejected or the vendor suspended. Shown to the user.
    statusReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

vendorSchema.index({ status: 1, appliedAt: -1 });

vendorSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Vendor = mongoose.model('Vendor', vendorSchema);
