import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';

const UPDATABLE_FIELDS = ['name', 'email'];

export const getAll = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
};

export const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

export const update = async (id, data) => {
  const payload = Object.fromEntries(
    Object.entries(data).filter(([key]) => UPDATABLE_FIELDS.includes(key))
  );

  const user = await User.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

export const remove = async (id) => {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
};
