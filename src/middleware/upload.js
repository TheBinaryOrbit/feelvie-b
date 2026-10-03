import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Images are kept in memory: try-on images are forwarded to the try-on service, and
// category images are written to disk by storage.service only after validation passes.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`${file.fieldname} must be a JPEG, PNG or WebP image`));
  },
});

// Admin category forms: one optional "image" file plus text fields.
export const categoryImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`${file.fieldname} must be a JPEG, PNG or WebP image`));
  },
}).single('image');

export const MAX_PRODUCT_IMAGES = 6;

// Product forms: up to 6 "images" files uploaded by the user, plus text fields.
export const productImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_PRODUCT_IMAGES, fields: 30 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`${file.fieldname} must be JPEG, PNG or WebP images`));
  },
}).array('images', MAX_PRODUCT_IMAGES);

export const tryOnUpload = imageUpload.fields([
  { name: 'personImage', maxCount: 1 },
  { name: 'garmentImage', maxCount: 1 },
]);
