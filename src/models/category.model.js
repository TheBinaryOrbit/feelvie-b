import mongoose from 'mongoose';
import { SLUG_PATTERN, MAX_SLUG_LENGTH } from '../utils/slug.js';
import { publicUrl } from '../services/storage.service.js';

export const MAX_CATEGORY_DEPTH = 3;

// A tree of categories: level 1 has no parent, level 2 and 3 point to a parent.
// `ancestors` (root first) is kept in sync by category.service so a whole subtree can be
// found or updated with one query.
const categorySchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 100 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: MAX_SLUG_LENGTH,
      match: [SLUG_PATTERN, 'Slug can only contain lowercase letters, numbers and single hyphens'],
    },
    description: { type: String, trim: true, maxlength: 1000 },
    // Public path such as "/uploads/categories/x.webp". The absolute URL is exposed as imageUrl.
    image: { type: String },

    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    ancestors: { type: [mongoose.Schema.Types.ObjectId], default: [], index: true },
    level: { type: Number, min: 1, max: MAX_CATEGORY_DEPTH, default: 1 },

    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

categorySchema.index({ parentId: 1, sortOrder: 1, title: 1 });

categorySchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.imageUrl = publicUrl(obj.image);
  delete obj.__v;
  return obj;
};

export const Category = mongoose.model('Category', categorySchema);
