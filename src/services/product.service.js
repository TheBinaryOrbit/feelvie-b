import mongoose from 'mongoose';
import {
  Product,
  LISTING_TYPES,
  PRODUCT_CONDITIONS,
  MAX_PRODUCTS_PER_USER,
} from '../models/product.model.js';
import { Category } from '../models/category.model.js';
import { Vendor } from '../models/vendor.model.js';
import { WishlistItem } from '../models/wishlistItem.model.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { uniqueSlug } from '../utils/slug.js';
import { MAX_PRODUCT_IMAGES } from '../middleware/upload.js';
import * as storage from './storage.service.js';
import { sellingUserIds } from './vendor.service.js';

const IMAGE_FOLDER = 'products';

// ---- Input -----------------------------------------------------------------------
// Requests arrive as multipart/form-data, where every value is a string and objects are
// JSON strings, or as JSON when no files are sent. Both are normalised here.

const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key);

const toBool = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

// Returns the parsed value, or undefined after recording an error.
const parseJson = (value, name, errors) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    errors.push(`${name} must be valid JSON`);
    return undefined;
  }
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Keeps only the known numeric keys that were sent, converted to numbers.
const pickNumbers = (source, keys, name, errors) => {
  if (!isPlainObject(source)) {
    errors.push(`${name} must be an object`);
    return undefined;
  }
  const out = {};
  for (const key of keys) {
    if (source[key] === undefined || source[key] === null || source[key] === '') continue;
    const number = Number(source[key]);
    if (!Number.isFinite(number)) errors.push(`${name}.${key} must be a number`);
    else out[key] = number;
  }
  return out;
};

const optionalText = (body, key, max, input, errors) => {
  if (!has(body, key)) return;
  const text = String(body[key] ?? '').trim();
  if (text.length > max) errors.push(`${key} must be at most ${max} characters`);
  else input[key] = text || undefined;
};

const normalizeInput = (body = {}, { partial }) => {
  const input = {};
  const errors = [];

  if (has(body, 'title') || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 3 || title.length > 150) errors.push('title must be 3 to 150 characters');
    else input.title = title;
  }

  optionalText(body, 'description', 2000, input, errors);
  optionalText(body, 'brand', 100, input, errors);
  optionalText(body, 'color', 50, input, errors);

  if (has(body, 'category') || !partial) {
    if (mongoose.isValidObjectId(body.category)) input.category = String(body.category);
    else errors.push('category must be a valid category id');
  }

  if (has(body, 'listingType') || !partial) {
    if (LISTING_TYPES.includes(body.listingType)) input.listingType = body.listingType;
    else errors.push(`listingType must be one of: ${LISTING_TYPES.join(', ')}`);
  }

  if (has(body, 'sale')) {
    const sale = parseJson(body.sale, 'sale', errors);
    if (sale !== undefined) input.sale = pickNumbers(sale, ['originalPriceInr', 'priceInr'], 'sale', errors);
  }

  if (has(body, 'rent')) {
    const rent = parseJson(body.rent, 'rent', errors);
    if (rent !== undefined) {
      input.rent = pickNumbers(rent, ['pricePerDayInr', 'securityDepositInr', 'minDays', 'maxDays'], 'rent', errors);
    }
  }

  if (has(body, 'sizes') || !partial) {
    const sizes = has(body, 'sizes') ? parseJson(body.sizes, 'sizes', errors) : [];
    if (sizes !== undefined) {
      if (!Array.isArray(sizes) || sizes.length === 0) {
        errors.push('sizes must be a list with at least one { size, stock }');
      } else {
        input.sizes = sizes.map((entry, i) => {
          const size = isPlainObject(entry) ? String(entry.size ?? '').trim() : '';
          const stock = isPlainObject(entry) ? Number(entry.stock) : NaN;
          if (!size) errors.push(`sizes[${i}].size is required`);
          if (!Number.isInteger(stock) || stock < 0) errors.push(`sizes[${i}].stock must be a whole number, 0 or more`);
          return { size, stock };
        });
      }
    }
  }

  if (has(body, 'condition')) {
    if (body.condition === '' || body.condition === null) input.condition = undefined;
    else if (PRODUCT_CONDITIONS.includes(body.condition)) input.condition = body.condition;
    else errors.push(`condition must be one of: ${PRODUCT_CONDITIONS.join(', ')}`);
  }

  if (has(body, 'isActive')) {
    const isActive = toBool(body.isActive);
    if (isActive === undefined) errors.push('isActive must be true or false');
    else input.isActive = isActive;
  }

  if (has(body, 'removeImages')) {
    let list = body.removeImages;
    if (typeof list === 'string' && list.trim().startsWith('[')) list = parseJson(list, 'removeImages', errors);
    if (list !== undefined) {
      // Accepts either the stored path or the full imageUrl.
      input.removeImages = (Array.isArray(list) ? list : [list])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .map((item) => (item.startsWith(env.publicBaseUrl) ? item.slice(env.publicBaseUrl.length) : item));
    }
  }

  if (errors.length) throw ApiError.badRequest('Validation failed', errors);
  return input;
};

// ---- Helpers ---------------------------------------------------------------------

const findOwned = async (userId, id) => {
  const product = mongoose.isValidObjectId(id) ? await Product.findOne({ _id: id, owner: userId }) : null;
  if (!product) throw ApiError.notFound('Product not found');
  return product;
};

const assertActiveCategory = async (categoryId) => {
  const category = await Category.findOne({ _id: categoryId, isActive: true }).select('_id');
  if (!category) throw ApiError.badRequest('category must be an active category');
};

const saveImages = (files) => Promise.all(files.map((file) => storage.saveImage(file, IMAGE_FOLDER)));
const deleteImages = (paths) => Promise.all((paths || []).map((p) => storage.deleteFile(p)));

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- Owner -----------------------------------------------------------------------

export const create = async (user, body, files = []) => {
  const input = normalizeInput(body, { partial: false });
  if (!files.length) throw ApiError.badRequest('Upload at least one image in the "images" field');

  const count = await Product.countDocuments({ owner: user._id });
  if (count >= MAX_PRODUCTS_PER_USER) {
    throw ApiError.badRequest(`You can add at most ${MAX_PRODUCTS_PER_USER} products`);
  }
  await assertActiveCategory(input.category);

  const slug = await uniqueSlug(Product, input.title);
  if (!slug) throw ApiError.badRequest('title must contain letters or numbers');

  const product = new Product({
    owner: user._id,
    title: input.title,
    slug,
    description: input.description,
    category: input.category,
    listingType: input.listingType,
    sale: input.listingType === 'sale' ? input.sale : undefined,
    rent: input.listingType === 'rent' ? input.rent : undefined,
    sizes: input.sizes,
    brand: input.brand,
    color: input.color,
    condition: input.condition,
    isActive: input.isActive ?? true,
    // Placeholder so validation runs before any file is written.
    images: [],
  });
  await product.validate();

  product.images = await saveImages(files);
  try {
    return await product.save();
  } catch (err) {
    await deleteImages(product.images);
    throw err;
  }
};

export const listMine = (userId, { listingType, isActive } = {}, pagination) => {
  const filter = { owner: userId };
  if (listingType) filter.listingType = listingType;
  if (isActive !== undefined) filter.isActive = isActive;
  return paginate(Product, filter, pagination, { populate: { path: 'category', select: 'title slug' } });
};

export const getMine = async (userId, id) => {
  const product = await findOwned(userId, id);
  return product.populate({ path: 'category', select: 'title slug' });
};

export const update = async (userId, id, body, files = []) => {
  const product = await findOwned(userId, id);
  const input = normalizeInput(body, { partial: true });

  if (input.listingType && input.listingType !== product.listingType) {
    throw ApiError.badRequest('listingType cannot be changed. Add a new product instead');
  }
  const otherType = product.listingType === 'sale' ? 'rent' : 'sale';
  if (input[otherType]) {
    throw ApiError.badRequest(`This product is listed for ${product.listingType}. It cannot have ${otherType} prices`);
  }

  if (input.category && String(input.category) !== String(product.category)) {
    await assertActiveCategory(input.category);
  }

  for (const key of ['title', 'description', 'category', 'sizes', 'brand', 'color', 'condition', 'isActive']) {
    if (key in input) product[key] = input[key];
  }
  // Prices are merged, so one price can be changed without resending the others.
  const prices = input[product.listingType];
  if (prices) product[product.listingType] = { ...product[product.listingType].toObject(), ...prices };

  const toRemove = input.removeImages || [];
  const unknown = toRemove.filter((p) => !product.images.includes(p));
  if (unknown.length) throw ApiError.badRequest('removeImages contains an image that is not on this product');

  const kept = product.images.filter((p) => !toRemove.includes(p));
  const finalCount = kept.length + files.length;
  if (finalCount < 1) throw ApiError.badRequest('A product must keep at least one image');
  if (finalCount > MAX_PRODUCT_IMAGES) {
    throw ApiError.badRequest(`A product can have at most ${MAX_PRODUCT_IMAGES} images`);
  }

  await product.validate();

  const added = await saveImages(files);
  product.images = [...kept, ...added];
  try {
    await product.save();
  } catch (err) {
    await deleteImages(added);
    throw err;
  }
  await deleteImages(toRemove);
  return product;
};

export const remove = async (userId, id) => {
  const product = await findOwned(userId, id);
  await product.deleteOne();
  await WishlistItem.deleteMany({ product: product._id });
  await deleteImages(product.images);
};

// Used when a user is deleted.
export const removeAllForOwner = async (userId) => {
  const products = await Product.find({ owner: userId }).select('images');
  await Product.deleteMany({ owner: userId });
  await WishlistItem.deleteMany({ product: { $in: products.map((p) => p._id) } });
  await Promise.all(products.map((p) => deleteImages(p.images)));
};

// ---- Stock -----------------------------------------------------------------------

/**
 * Takes `quantity` pieces of one size out of stock. One atomic update that only matches
 * while enough stock is left, so two orders can never both take the last piece.
 * Returns the updated product, or null when there is not enough stock.
 */
export const reserveStock = (productId, size, quantity) =>
  Product.findOneAndUpdate(
    { _id: productId, sizes: { $elemMatch: { size, stock: { $gte: quantity } } } },
    { $inc: { 'sizes.$.stock': -quantity, totalStock: -quantity } },
    { new: true }
  );

// Puts pieces back. Does nothing if the product or the size no longer exists.
export const releaseStock = (productId, size, quantity) =>
  Product.updateOne(
    { _id: productId, 'sizes.size': size },
    { $inc: { 'sizes.$.stock': quantity, totalStock: quantity } }
  );

// ---- Store (public) --------------------------------------------------------------

// Ids of categories that are active and whose ancestors are all active. With `rootId`,
// only that category and the ones below it.
const visibleCategoryIds = async (rootId) => {
  const all = await Category.find().select('_id ancestors isActive').lean();
  const inactive = new Set(all.filter((c) => !c.isActive).map((c) => String(c._id)));
  return all
    .filter((c) => c.isActive && !c.ancestors.some((a) => inactive.has(String(a))))
    .filter((c) => !rootId || c._id.equals(rootId) || c.ancestors.some((a) => a.equals(rootId)))
    .map((c) => c._id);
};

/**
 * The single definition of "shown in stores": the owner switched it on, no admin blocked
 * it, the owner is an approved vendor, and the category is visible.
 */
export const publicFilter = async (rootCategoryId) => {
  const [owners, categories] = await Promise.all([sellingUserIds(), visibleCategoryIds(rootCategoryId)]);
  return { isActive: true, isBlocked: false, owner: { $in: owners }, category: { $in: categories } };
};

// One product, only if shoppers can see it. Used by the wishlist and orders.
export const findVisibleById = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Product.findOne({ ...(await publicFilter()), _id: id });
};

// Owner and admin fields that shoppers should not see.
const PRIVATE_FIELDS = ['images', 'isActive', 'isBlocked', 'blockedReason', 'blockedBy', 'blockedAt'];

export const toPublic = (product) => {
  const view = product.toJSON();
  for (const field of PRIVATE_FIELDS) delete view[field];
  return view;
};

// Adds isWishlisted to each public product view when a logged-in user is browsing.
const withWishlistFlags = async (views, viewerId) => {
  if (!viewerId || !views.length) return views;
  const saved = await WishlistItem.find({ user: viewerId, product: { $in: views.map((v) => v._id) } }).distinct('product');
  const savedIds = new Set(saved.map(String));
  return views.map((view) => ({ ...view, isWishlisted: savedIds.has(String(view._id)) }));
};

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { listPriceInr: 1, createdAt: -1 },
  price_desc: { listPriceInr: -1, createdAt: -1 },
};

export const listPublic = async (
  { category, listingType, size, minPrice, maxPrice, search, inStock, sort, vendor } = {},
  pagination,
  viewerId
) => {
  let rootId;
  if (category) {
    const root = await Category.findOne({ slug: String(category).toLowerCase() }).select('_id');
    if (!root) throw ApiError.notFound('Category not found');
    rootId = root._id;
  }

  const filter = await publicFilter(rootId);
  // One vendor's store page. A vendor who is not approved has no visible products.
  if (vendor) {
    const isSelling = filter.owner.$in.some((id) => String(id) === String(vendor));
    filter.owner = isSelling ? vendor : { $in: [] };
  }
  if (listingType) filter.listingType = listingType;
  // Only products that have this size in stock.
  if (size) filter.sizes = { $elemMatch: { size: String(size).trim().toUpperCase(), stock: { $gt: 0 } } };
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.listPriceInr = {
      ...(minPrice !== undefined && { $gte: minPrice }),
      ...(maxPrice !== undefined && { $lte: maxPrice }),
    };
  }
  if (inStock) filter.totalStock = { $gt: 0 };
  if (search) {
    const regex = { $regex: escapeRegex(String(search).trim()), $options: 'i' };
    filter.$or = [{ title: regex }, { brand: regex }];
  }

  const result = await paginate(Product, filter, pagination, {
    sort: SORTS[sort] || SORTS.newest,
    populate: { path: 'category', select: 'title slug' },
  });
  return { ...result, items: await withWishlistFlags(result.items.map(toPublic), viewerId) };
};

export const getPublicBySlug = async (slug, viewerId) => {
  const filter = await publicFilter();
  const product = await Product.findOne({ ...filter, slug: String(slug).toLowerCase() });
  if (!product) throw ApiError.notFound('Product not found');

  const category = await Category.findById(product.category).select('_id title slug ancestors level').lean();
  const ancestors = await Category.find({ _id: { $in: category.ancestors } }).select('_id title slug level').lean();
  const breadcrumb = [...ancestors, category]
    .sort((a, b) => a.level - b.level)
    .map(({ _id, title, slug: s, level }) => ({ _id, title, slug: s, level }));

  const [view] = await withWishlistFlags([toPublic(product)], viewerId);
  return { product: view, breadcrumb };
};

// ---- Admin -----------------------------------------------------------------------

const findOr404 = async (id) => {
  const product = mongoose.isValidObjectId(id) ? await Product.findById(id) : null;
  if (!product) throw ApiError.notFound('Product not found');
  return product;
};

export const listForAdmin = ({ owner, listingType, isBlocked, isActive, search } = {}, pagination) => {
  const filter = {};
  if (owner) filter.owner = owner;
  if (listingType) filter.listingType = listingType;
  if (isBlocked !== undefined) filter.isBlocked = isBlocked;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const regex = { $regex: escapeRegex(String(search).trim()), $options: 'i' };
    filter.$or = [{ title: regex }, { brand: regex }];
  }
  return paginate(Product, filter, pagination, {
    populate: [
      { path: 'owner', select: 'phone name email' },
      { path: 'category', select: 'title slug' },
    ],
  });
};

export const getForAdmin = async (id) => {
  const product = await findOr404(id);
  const ownerId = product.owner;
  await product.populate([
    { path: 'owner', select: 'phone name email isActive' },
    { path: 'category', select: 'title slug isActive' },
    { path: 'blockedBy', select: 'name email' },
  ]);
  const [vendor, visible] = await Promise.all([
    Vendor.findOne({ user: ownerId }).select('status'),
    publicFilter().then((filter) => Product.exists({ ...filter, _id: product._id })),
  ]);
  return {
    product,
    vendorStatus: vendor?.status ?? 'not_applied',
    // Whether shoppers can see it right now.
    visibleInStore: Boolean(visible),
  };
};

export const block = async (id, adminId, reason) => {
  const product = await findOr404(id);
  if (product.isBlocked) throw ApiError.badRequest('This product is already blocked');
  product.isBlocked = true;
  product.blockedReason = reason;
  product.blockedBy = adminId;
  product.blockedAt = new Date();
  return product.save();
};

export const unblock = async (id) => {
  const product = await findOr404(id);
  if (!product.isBlocked) throw ApiError.badRequest('This product is not blocked');
  product.isBlocked = false;
  product.blockedReason = undefined;
  product.blockedBy = undefined;
  product.blockedAt = undefined;
  return product.save();
};
