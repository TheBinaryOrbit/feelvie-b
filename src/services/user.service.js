import { User } from '../models/user.model.js';
import { UserSubscription } from '../models/userSubscription.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { removeAllForUser as removeUserAddresses } from './address.service.js';
import { Vendor } from '../models/vendor.model.js';

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
  // Razorpay would keep charging a deleted user, so the subscription must end first.
  const live = await UserSubscription.exists({ user: id, isLive: true });
  if (live) {
    throw ApiError.conflict('This user has a subscription that is not cancelled. Cancel it before deleting the user');
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found');
  await removeUserAddresses(id);
  await Vendor.deleteOne({ user: id });
  return user;
};
