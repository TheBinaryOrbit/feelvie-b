import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { removeAllForUser as removeUserAddresses } from './address.service.js';

const UPDATABLE_FIELDS = ['name', 'email'];

export const getAll = (pagination) => paginate(User, {}, pagination);

export const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

export const update = async (id, data) => {
  const payload = Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => UPDATABLE_FIELDS.includes(key))
  );

  const user = await User.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

export const remove = async (id) => {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found');
  await removeUserAddresses(id);
  return user;
};
