import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// The only module that reads or writes uploaded files. Files live on the server disk under
// UPLOADS_DIR and are served at /uploads. To move to S3 or Cloudinary later, change this
// module only: callers store and pass around the returned public path.

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export const uploadsRoot = () => path.resolve(process.cwd(), env.uploadsDir);

// Saves a buffer and returns its public path, for example "/uploads/categories/3f9c....webp".
export const saveImage = async ({ buffer, mimetype }, folder) => {
  const ext = EXTENSIONS[mimetype];
  if (!ext) throw new Error(`Unsupported image type: ${mimetype}`);

  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const dir = path.join(uploadsRoot(), folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/${folder}/${name}`;
};

// Deletes a file previously returned by saveImage. Never throws: a missing file is fine.
export const deleteFile = async (publicPath) => {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const root = uploadsRoot();
  const target = path.resolve(root, publicPath.slice('/uploads/'.length));
  // Refuse anything that would escape the uploads directory.
  if (!target.startsWith(root + path.sep)) return;
  try {
    await fs.unlink(target);
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`Could not delete ${publicPath}: ${err.message}`);
  }
};

export const publicUrl = (publicPath) => (publicPath ? `${env.publicBaseUrl}${publicPath}` : null);
