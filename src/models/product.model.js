import mongoose from 'mongoose';
import { SLUG_PATTERN, MAX_SLUG_LENGTH } from '../utils/slug.js';
import { publicUrl } from '../services/storage.service.js';

export const LISTING_TYPES = ['sale', 'rent'];
export const PRODUCT_CONDITIONS = ['new', 'like_new', 'good', 'fair'];
export const MAX_PRODUCTS_PER_USER = 200;
export const MAX_SIZES_PER_PRODUCT = 20;

const wholeNumber = { validator: Number.isInteger, message: '{PATH} must be a whole number' };

const saleSchema = new mongoose.Schema(
  {
    // The price before discount (MRP) and the price the buyer pays.
    originalPriceInr: { type: Number, required: true, min: 1 },
    priceInr: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const rentSchema = new mongoose.Schema(
  {
    pricePerDayInr: { type: Number, required: true, min: 1 },
    // Refundable. 0 means no deposit.
    securityDepositInr: { type: Number, default: 0, min: 0 },
    minDays: { type: Number, default: 1, min: 1, validate: wholeNumber },
    maxDays: { type: Number, default: 30, min: 1, max: 365, validate: wholeNumber },
  },
  { _id: false }
);

const sizeSchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    stock: { type: Number, required: true, min: 0, validate: wholeNumber },
  },
  { _id: false }
);

// A dress listed by a user, either for sale or for rent. It is shown in stores only when
// the owner is an approved vendor (see product.service.js publicFilter).
const productSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, minlength: 3, maxlength: 150 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      maxlength: MAX_SLUG_LENGTH,
      match: [SLUG_PATTERN, 'Invalid slug'],
    },
    description: { type: String, trim: true, maxlength: 2000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },

    // Fixed at creation. Exactly one of `sale` and `rent` is set, matching this.
    listingType: { type: String, enum: LISTING_TYPES, required: true },
    sale: { type: saleSchema },
    rent: { type: rentSchema },
    // sale.priceInr or rent.pricePerDayInr, kept in sync for price filters and sorting.
    listPriceInr: { type: Number },

    sizes: { type: [sizeSchema], required: true },
    // Sum of sizes[].stock, kept in sync.
    totalStock: { type: Number, default: 0 },

    // Public paths of the image files the owner uploaded. The first is the cover.
    images: { type: [String], default: [] },

    brand: { type: String, trim: true, maxlength: 100 },
    color: { type: String, trim: true, maxlength: 50 },
    condition: { type: String, enum: PRODUCT_CONDITIONS },

    // The owner's own show/hide switch.
    isActive: { type: Boolean, default: true },
    // Admin moderation. A blocked product is hidden from stores.
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, trim: true, maxlength: 500 },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    blockedAt: { type: Date },
  },
  { timestamps: true }
);

productSchema.pre('validate', function () {
  if (this.listingType === 'sale') {
    this.rent = undefined;
    if (!this.sale) this.invalidate('sale', 'sale prices are required for a product listed for sale');
    else if (this.sale.priceInr > this.sale.originalPriceInr) {
      this.invalidate('sale.priceInr', 'sale.priceInr cannot be higher than sale.originalPriceInr');
    }
    this.listPriceInr = this.sale?.priceInr;
  }
  if (this.listingType === 'rent') {
    this.sale = undefined;
    if (!this.rent) this.invalidate('rent', 'rent prices are required for a product listed for rent');
    else if (this.rent.minDays > this.rent.maxDays) {
      this.invalidate('rent.minDays', 'rent.minDays cannot be more than rent.maxDays');
    }
    this.listPriceInr = this.rent?.pricePerDayInr;
  }

  const sizes = this.sizes || [];
  if (sizes.length < 1) this.invalidate('sizes', 'At least one size is required');
  if (sizes.length > MAX_SIZES_PER_PRODUCT) {
    this.invalidate('sizes', `A product can have at most ${MAX_SIZES_PER_PRODUCT} sizes`);
  }
  const labels = sizes.map((s) => String(s.size || '').trim().toUpperCase());
  if (new Set(labels).size !== labels.length) this.invalidate('sizes', 'Each size can only be listed once');
  this.totalStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
});

productSchema.index({ owner: 1, createdAt: -1 });
productSchema.index({ category: 1, listingType: 1, isActive: 1, isBlocked: 1 });
productSchema.index({ listPriceInr: 1 });

productSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.imageUrls = (obj.images || []).map(publicUrl);
  obj.inStock = obj.totalStock > 0;
  delete obj.__v;
  return obj;
};

export const Product = mongoose.model('Product', productSchema);
