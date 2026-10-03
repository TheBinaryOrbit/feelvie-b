import mongoose from 'mongoose';
import { Category, MAX_CATEGORY_DEPTH } from '../models/category.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { slugify, SLUG_PATTERN, MAX_SLUG_LENGTH } from '../utils/slug.js';
import * as storage from './storage.service.js';

const IMAGE_FOLDER = 'categories';
const PUBLIC_FIELDS = '_id title slug description image parentId level sortOrder';

// ---- Input -----------------------------------------------------------------------
// Admin requests arrive as multipart/form-data (all strings) or JSON, so values are
// normalised here rather than with the JSON validator.

const toBool = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

const normalizeInput = (body = {}, { partial }) => {
  const input = {};
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (has('title') || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) errors.push('title is required');
    else if (title.length > 100) errors.push('title must be at most 100 characters');
    else input.title = title;
  }

  if (has('slug') && body.slug !== '') {
    const slug = String(body.slug).trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || slug.length > MAX_SLUG_LENGTH) {
      errors.push(`slug can only contain lowercase letters, numbers and single hyphens (max ${MAX_SLUG_LENGTH})`);
    } else input.slug = slug;
  }

  if (has('description')) {
    const description = String(body.description ?? '').trim();
    if (description.length > 1000) errors.push('description must be at most 1000 characters');
    else input.description = description || undefined;
  }

  if (has('parentId')) {
    const raw = body.parentId;
    if (raw === null || raw === '' || raw === 'null') input.parentId = null;
    else if (mongoose.isValidObjectId(raw)) input.parentId = String(raw);
    else errors.push('parentId must be a valid category id, or empty for a top-level category');
  }

  if (has('sortOrder') && body.sortOrder !== '') {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) {
      errors.push('sortOrder must be a whole number between -100000 and 100000');
    } else input.sortOrder = sortOrder;
  }

  if (has('isActive')) {
    const isActive = toBool(body.isActive);
    if (isActive === undefined) errors.push('isActive must be true or false');
    else input.isActive = isActive;
  }

  if (has('removeImage')) {
    const removeImage = toBool(body.removeImage);
    if (removeImage === undefined) errors.push('removeImage must be true or false');
    else input.removeImage = removeImage;
  }

  if (errors.length) throw ApiError.badRequest('Validation failed', errors);
  return input;
};

// ---- Helpers ---------------------------------------------------------------------

const findOr404 = async (id, message = 'Category not found') => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound(message);
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound(message);
  return category;
};

const assertSlugFree = async (slug, excludeId) => {
  const taken = await Category.exists({ slug, ...(excludeId && { _id: { $ne: excludeId } }) });
  if (taken) throw ApiError.conflict(`The slug "${slug}" is already used by another category`);
};

// "t-shirts" -> "t-shirts", or "t-shirts-2", "t-shirts-3" ... if taken.
const uniqueSlugFrom = async (title) => {
  const base = slugify(title);
  if (!base) throw ApiError.badRequest('Could not build a slug from this title. Send a slug');
  for (let n = 1; n <= 50; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!(await Category.exists({ slug: candidate }))) return candidate;
  }
  throw ApiError.conflict('Too many categories share this title. Send a unique slug');
};

const resolveParent = async (parentId) => {
  if (!parentId) return null;
  const parent = await findOr404(parentId, 'Parent category not found');
  return parent;
};

// How many levels sit below this category (0 when it has no children).
const subtreeHeight = async (category) => {
  const deepest = await Category.findOne({ ancestors: category._id }).sort({ level: -1 }).select('level');
  return deepest ? deepest.level - category.level : 0;
};

const sortSiblings = (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);

// ---- Admin -----------------------------------------------------------------------

export const create = async (adminId, body, file) => {
  const input = normalizeInput(body, { partial: false });
  const parent = await resolveParent(input.parentId);
  if (parent && parent.level >= MAX_CATEGORY_DEPTH) {
    throw ApiError.badRequest(`Categories can only be nested ${MAX_CATEGORY_DEPTH} levels deep`);
  }

  if (input.slug) await assertSlugFree(input.slug);
  const slug = input.slug || (await uniqueSlugFrom(input.title));

  const category = new Category({
    title: input.title,
    slug,
    description: input.description,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
    parentId: parent?._id ?? null,
    ancestors: parent ? [...parent.ancestors, parent._id] : [],
    level: parent ? parent.level + 1 : 1,
    createdBy: adminId,
    updatedBy: adminId,
  });
  await category.validate();

  // Write the file only once everything else is known to be valid.
  if (file) category.image = await storage.saveImage(file, IMAGE_FOLDER);
  try {
    return await category.save();
  } catch (err) {
    await storage.deleteFile(category.image);
    throw err;
  }
};

/**
 * Moves `category` under `newParent` (or to the top level), updating `ancestors` and
 * `level` for it and every category below it. Rejects cycles and depth over 3.
 */
const planMove = async (category, newParent) => {
  if (newParent) {
    const isSelf = newParent._id.equals(category._id);
    const isDescendant = newParent.ancestors.some((id) => id.equals(category._id));
    if (isSelf || isDescendant) {
      throw ApiError.badRequest('A category cannot be moved under itself or one of its subcategories');
    }
  }

  const newLevel = newParent ? newParent.level + 1 : 1;
  const height = await subtreeHeight(category);
  if (newLevel + height > MAX_CATEGORY_DEPTH) {
    throw ApiError.badRequest(
      `This move would make the tree deeper than ${MAX_CATEGORY_DEPTH} levels (this category has ${height} level(s) below it)`
    );
  }

  const oldPrefixLength = category.ancestors.length + 1; // ancestors + the category itself
  const newAncestors = newParent ? [...newParent.ancestors, newParent._id] : [];

  category.parentId = newParent?._id ?? null;
  category.ancestors = newAncestors;
  category.level = newLevel;

  // Applied after the category itself is saved.
  return async () => {
    const descendants = await Category.find({ ancestors: category._id }).select('ancestors');
    if (!descendants.length) return;
    await Category.bulkWrite(
      descendants.map((d) => {
        const ancestors = [...newAncestors, category._id, ...d.ancestors.slice(oldPrefixLength)];
        return {
          updateOne: { filter: { _id: d._id }, update: { $set: { ancestors, level: ancestors.length + 1 } } },
        };
      })
    );
  };
};

export const update = async (adminId, id, body, file) => {
  const category = await findOr404(id);
  const input = normalizeInput(body, { partial: true });

  if (input.slug && input.slug !== category.slug) await assertSlugFree(input.slug, category._id);

  let moveDescendants = null;
  if ('parentId' in input && String(input.parentId ?? '') !== String(category.parentId ?? '')) {
    const newParent = await resolveParent(input.parentId);
    moveDescendants = await planMove(category, newParent);
  }

  for (const key of ['title', 'slug', 'description', 'sortOrder', 'isActive']) {
    if (key in input) category[key] = input[key];
  }
  category.updatedBy = adminId;
  await category.validate();

  const oldImage = category.image;
  let newImage = null;
  if (file) {
    newImage = await storage.saveImage(file, IMAGE_FOLDER);
    category.image = newImage;
  } else if (input.removeImage) {
    category.image = undefined;
  }

  try {
    await category.save();
  } catch (err) {
    await storage.deleteFile(newImage);
    throw err;
  }

  if (moveDescendants) await moveDescendants();
  if (oldImage && oldImage !== category.image) await storage.deleteFile(oldImage);
  return category;
};

// "Delete" never removes data: it deactivates the category and everything below it.
export const deactivate = async (adminId, id) => {
  const category = await findOr404(id);
  const result = await Category.updateMany(
    { $or: [{ _id: category._id }, { ancestors: category._id }] },
    { $set: { isActive: false, updatedBy: adminId } }
  );
  return { category: await Category.findById(category._id), deactivated: result.modifiedCount };
};

export const getForAdmin = async (id) => {
  const category = await findOr404(id);
  const [breadcrumb, children, descendantCount] = await Promise.all([
    Category.find({ _id: { $in: category.ancestors } }).select('_id title slug level isActive'),
    Category.find({ parentId: category._id }).sort({ sortOrder: 1, title: 1 }),
    Category.countDocuments({ ancestors: category._id }),
  ]);
  breadcrumb.sort((a, b) => a.level - b.level);
  return { category, breadcrumb, children, descendantCount };
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listForAdmin = ({ parentId, isActive, level, search } = {}, pagination) => {
  const filter = {};
  if (parentId === 'root') filter.parentId = null;
  else if (parentId) filter.parentId = parentId;
  if (isActive !== undefined) filter.isActive = isActive;
  if (level) filter.level = level;
  if (search) filter.title = { $regex: escapeRegex(search.trim()), $options: 'i' };
  return paginate(Category, filter, pagination, { sort: { level: 1, sortOrder: 1, title: 1 } });
};

// ---- Tree ------------------------------------------------------------------------

const toNode = (doc) => ({
  _id: doc._id,
  title: doc.title,
  slug: doc.slug,
  description: doc.description,
  imageUrl: storage.publicUrl(doc.image),
  parentId: doc.parentId,
  level: doc.level,
  sortOrder: doc.sortOrder,
  ...(doc.isActive !== undefined && { isActive: doc.isActive }),
  children: [],
});

// Builds a nested tree. A node is included only if its parent is included, so an
// inactive category hides everything below it from the public tree.
const buildTree = (docs) => {
  const nodes = new Map(docs.map((d) => [String(d._id), toNode(d)]));
  const roots = [];
  for (const doc of [...docs].sort((a, b) => a.level - b.level)) {
    const node = nodes.get(String(doc._id));
    if (!doc.parentId) roots.push(node);
    else nodes.get(String(doc.parentId))?.children.push(node);
  }
  const sortDeep = (list) => {
    list.sort(sortSiblings);
    list.forEach((n) => sortDeep(n.children));
    return list;
  };
  return sortDeep(roots);
};

export const adminTree = async () => {
  const docs = await Category.find().select(`${PUBLIC_FIELDS} isActive`).lean();
  return buildTree(docs);
};

export const publicTree = async () => {
  const docs = await Category.find({ isActive: true }).select(PUBLIC_FIELDS).lean();
  return buildTree(docs);
};

// A category is publicly visible only if it and every ancestor are active.
export const getPublicBySlug = async (slug) => {
  const category = await Category.findOne({ slug: String(slug).toLowerCase(), isActive: true })
    .select(PUBLIC_FIELDS + ' ancestors')
    .lean();
  if (!category) throw ApiError.notFound('Category not found');

  const ancestors = await Category.find({ _id: { $in: category.ancestors } })
    .select('_id title slug level isActive')
    .lean();
  if (ancestors.length !== category.ancestors.length || ancestors.some((a) => !a.isActive)) {
    throw ApiError.notFound('Category not found');
  }

  const children = await Category.find({ parentId: category._id, isActive: true }).select(PUBLIC_FIELDS).lean();
  return {
    category: { ...toNode(category), children: undefined },
    breadcrumb: ancestors
      .sort((a, b) => a.level - b.level)
      .map(({ _id, title, slug: s, level }) => ({ _id, title, slug: s, level })),
    children: children.sort(sortSiblings).map((c) => ({ ...toNode(c), children: undefined })),
  };
};
