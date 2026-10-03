import mongoose from 'mongoose';

export const MAX_WISHLIST_ITEMS = 200;

// One saved product for one user.
const wishlistItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A product can be saved only once per user. Also serves "my wishlist" queries.
wishlistItemSchema.index({ user: 1, product: 1 }, { unique: true });

export const WishlistItem = mongoose.model('WishlistItem', wishlistItemSchema);
