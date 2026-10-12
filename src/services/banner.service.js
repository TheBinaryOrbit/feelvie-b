import mongoose from 'mongoose';
import { Banner, MAX_SCREEN_NAME_LENGTH } from '../models/banner.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { SLUG_PATTERN, MAX_SLUG_LENGTH } from '../utils/slug.js';
import * as storage from './storage.service.js';

const IMAGE_FOLDER = 'banners';
const SORT = { sortOrder: 1, createdAt: -1 };

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

  if (has('screenName') || !partial) {
    const screenName = typeof body.screenName === 'string' ? body.screenName.trim() : '';
    if (!screenName) errors.push('screenName is required');
    else if (screenName.length > MAX_SCREEN_NAME_LENGTH) {
      errors.push(`screenName must be at most ${MAX_SCREEN_NAME_LENGTH} characters`);
    } else input.screenName = screenName;
  }

  // An empty slug or title clears the field.
  if (has('slug')) {
    const slug = String(body.slug ?? '').trim().toLowerCase();
    if (!slug) input.slug = undefined;
    else if (!SLUG_PATTERN.test(slug) || slug.length > MAX_SLUG_LENGTH) {
      errors.push(`slug can only contain lowercase letters, numbers and single hyphens (max ${MAX_SLUG_LENGTH})`);
    } else input.slug = slug;
  }

  if (has('title')) {
    const title = String(body.title ?? '').trim();
    if (title.length > 100) errors.push('title must be at most 100 characters');
    else input.title = title || undefined;
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

  return { input, errors };
};

const findOr404 = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Banner not found');
  const banner = await Banner.findById(id);
  if (!banner) throw ApiError.notFound('Banner not found');
  return banner;
};

// ---- Admin -----------------------------------------------------------------------

export const create = async (adminId, body, file) => {
  const { input, errors } = normalizeInput(body, { partial: false });
  if (!file) errors.push('image is required');
  if (errors.length) throw ApiError.badRequest('Validation failed', errors);

  // Write the file only once everything else is known to be valid.
  const image = await storage.saveImage(file, IMAGE_FOLDER);
  try {
    return await Banner.create({
      title: input.title,
      image,
      slug: input.slug,
      screenName: input.screenName,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      createdBy: adminId,
      updatedBy: adminId,
    });
  } catch (err) {
    await storage.deleteFile(image);
    throw err;
  }
};

export const update = async (adminId, id, body, file) => {
  const banner = await findOr404(id);
  const { input, errors } = normalizeInput(body, { partial: true });
  if (errors.length) throw ApiError.badRequest('Validation failed', errors);

  for (const key of ['title', 'slug', 'screenName', 'sortOrder', 'isActive']) {
    if (key in input) banner[key] = input[key];
  }
  banner.updatedBy = adminId;
  await banner.validate();

  const oldImage = banner.image;
  let newImage = null;
  if (file) {
    newImage = await storage.saveImage(file, IMAGE_FOLDER);
    banner.image = newImage;
  }

  try {
    await banner.save();
  } catch (err) {
    await storage.deleteFile(newImage);
    throw err;
  }

  if (newImage) await storage.deleteFile(oldImage);
  return banner;
};

// Banners are not referenced by anything, so delete removes the document and its image.
export const remove = async (id) => {
  const banner = await findOr404(id);
  await banner.deleteOne();
  await storage.deleteFile(banner.image);
};

export const getForAdmin = (id) => findOr404(id);

export const listForAdmin = ({ isActive } = {}, pagination) => {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  return paginate(Banner, filter, pagination, { sort: SORT });
};

// ---- App -------------------------------------------------------------------------

export const listPublic = async () => {
  const banners = await Banner.find({ isActive: true }).sort(SORT).select('title image slug screenName sortOrder').lean();
  return banners.map((b) => ({
    _id: b._id,
    title: b.title,
    imageUrl: storage.publicUrl(b.image),
    slug: b.slug ?? null,
    screenName: b.screenName,
    sortOrder: b.sortOrder,
  }));
};
