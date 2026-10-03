import mongoose from 'mongoose';
import { PHONE_REGEX, normalizePhone } from '../utils/phone.js';

export const ADDRESS_LABELS = ['home', 'work', 'other'];
export const MAX_ADDRESSES_PER_USER = 10;

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: {
      type: String,
      enum: { values: ADDRESS_LABELS, message: 'Label must be one of: home, work, other' },
      required: [true, 'Label is required'],
    },
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 100 },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      set: (v) => (v == null ? v : normalizePhone(v)),
      match: [PHONE_REGEX, 'Please provide a valid phone number'],
    },
    addressLine1: { type: String, required: [true, 'Address line 1 is required'], trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 100 },
    city: { type: String, required: [true, 'City is required'], trim: true, maxlength: 100 },
    state: { type: String, required: [true, 'State is required'], trim: true, maxlength: 100 },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
      match: [/^[1-9]\d{5}$/, 'Pincode must be a valid 6-digit Indian PIN code'],
    },
    country: { type: String, trim: true, default: 'India', maxlength: 100 },
    location: {
      type: {
        lat: { type: Number, min: -90, max: 90, required: true },
        lng: { type: Number, min: -180, max: 180, required: true },
      },
      required: false,
      _id: false,
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Guarantees at most one default address per user at the database level.
addressSchema.index(
  { user: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

addressSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const Address = mongoose.model('Address', addressSchema);
