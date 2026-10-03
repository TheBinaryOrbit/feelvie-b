import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Images are kept in memory only long enough to forward them to the try-on service.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.badRequest(`${file.fieldname} must be a JPEG, PNG or WebP image`));
  },
});

export const tryOnUpload = imageUpload.fields([
  { name: 'personImage', maxCount: 1 },
  { name: 'garmentImage', maxCount: 1 },
]);
