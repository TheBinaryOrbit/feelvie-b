import mongoose from 'mongoose';
import { SLUG_PATTERN, MAX_SLUG_LENGTH } from '../utils/slug.js';
import { publicUrl } from '../services/storage.service.js';

export const MAX_SCREEN_NAME_LENGTH = 100;

// A banner shown in the mobile app. Tapping it opens `screenName`, with `slug` passed to
// that screen (for example a category or product slug) when one is set.
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 100 },
    // Public path such as "/uploads/banners/x.webp". The absolute URL is exposed as imageUrl.
    image: { type: String, required: [true, 'Image is required'] },
    // Not unique: several banners can point to the same category or product.
    slug: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: MAX_SLUG_LENGTH,
      match: [SLUG_PATTERN, 'Slug can only contain lowercase letters, numbers and single hyphens'],
    },
    screenName: {
      type: String,
      required: [true, 'Screen name is required'],
      trim: true,
      maxlength: MAX_SCREEN_NAME_LENGTH,
    },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

bannerSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.imageUrl = publicUrl(obj.image);
  delete obj.__v;
  return obj;
};

export const Banner = mongoose.model('Banner', bannerSchema);
