import mongoose from 'mongoose';
import { PHONE_REGEX, normalizePhone } from '../utils/phone.js';

export const VENDOR_STATUSES = ['pending', 'approved', 'rejected', 'suspended'];
export const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

// Products a user must have added before applying. Not enforced until the product
// model exists. See checkProductRequirement in vendor.service.js.
export const MIN_PRODUCTS_TO_APPLY = 5;

// A user's seller profile. One per user. Products are only shown in stores when the
// vendor is approved (see vendor.service.js canSell).
const vendorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: VENDOR_STATUSES, default: 'pending', index: true },

    storeName: { type: String, required: [true, 'Store name is required'], trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    contactPhone: {
      type: String,
      required: [true, 'Contact phone is required'],
      set: (v) => (v == null ? v : normalizePhone(v)),
      match: [PHONE_REGEX, 'Please provide a valid contact phone number'],
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid contact email'],
    },
    gstNumber: {
      type: String,
      uppercase: true,
      trim: true,
      match: [GSTIN_REGEX, 'Please provide a valid 15-character GST number'],
    },
    // One of the user's saved addresses, used for pickups.
    pickupAddress: { type: mongoose.Schema.Types.ObjectId, ref: 'Address' },

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
