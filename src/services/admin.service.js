import { Admin } from '../models/admin.model.js';
import { ApiError } from '../utils/ApiError.js';
import { signAdminToken } from '../utils/jwt.js';

const normalizeEmail = (email) => String(email).toLowerCase().trim();

export const login = async ({ email, password }) => {
  const admin = await Admin.findOne({ email: normalizeEmail(email) }).select('+password');
  if (!admin || !(await admin.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!admin.isActive) throw ApiError.forbidden('Admin account is deactivated');

  admin.lastLoginAt = new Date();
  await admin.save();

  return { admin, token: signAdminToken(admin._id) };
};

// Used by scripts/create-admin.js. There is no public admin signup.
export const create = async ({ email, password, name }) => {
  const exists = await Admin.exists({ email: normalizeEmail(email) });
  if (exists) throw ApiError.conflict('An admin with this email already exists');
  return Admin.create({ email, password, name });
};
