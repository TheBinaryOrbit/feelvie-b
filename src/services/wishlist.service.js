import { WishlistItem, MAX_WISHLIST_ITEMS } from '../models/wishlistItem.model.js';
import { Product } from '../models/product.model.js';
import { ApiError } from '../utils/ApiError.js';
import { publicFilter, findVisibleById, toPublic } from './product.service.js';

// Saved products that shoppers can still see, newest saved first. Products that were
// hidden, blocked or deleted since being saved are left out, and reappear if they return.
export const list = async (userId, { page, limit }) => {
  const saved = await WishlistItem.find({ user: userId }).sort({ createdAt: -1 }).select('product createdAt').lean();
  if (!saved.length) return { items: [], total: 0, page, pages: 0 };

  const products = await Product.find({ ...(await publicFilter()), _id: { $in: saved.map((s) => s.product) } }).populate({
    path: 'category',
    select: 'title slug',
  });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  // A wishlist holds at most 200 items, so paging in memory is fine.
  const visible = saved.filter((s) => byId.has(String(s.product)));
  const items = visible.slice((page - 1) * limit, page * limit).map((s) => ({
    ...toPublic(byId.get(String(s.product))),
    isWishlisted: true,
    savedAt: s.createdAt,
  }));

  return { items, total: visible.length, page, pages: Math.ceil(visible.length / limit) };
};

export const add = async (user, productId) => {
  const product = await findVisibleById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  if (product.owner.equals(user._id)) throw ApiError.badRequest('You cannot add your own product to your wishlist');

  const existing = await WishlistItem.findOne({ user: user._id, product: product._id });
  if (existing) return { item: existing, added: false };

  const count = await WishlistItem.countDocuments({ user: user._id });
  if (count >= MAX_WISHLIST_ITEMS) {
    throw ApiError.badRequest(`Your wishlist can hold at most ${MAX_WISHLIST_ITEMS} products`);
  }

  try {
    return { item: await WishlistItem.create({ user: user._id, product: product._id }), added: true };
  } catch (err) {
    // Two taps at once: the unique index keeps a single item.
    if (err.code === 11000) return { item: await WishlistItem.findOne({ user: user._id, product: product._id }), added: false };
    throw err;
  }
};

// Removing a product that is not saved is not an error.
export const remove = async (userId, productId) => {
  const result = await WishlistItem.deleteOne({ user: userId, product: productId });
  return { removed: result.deletedCount > 0 };
};

export const removeAllForUser = (userId) => WishlistItem.deleteMany({ user: userId });
