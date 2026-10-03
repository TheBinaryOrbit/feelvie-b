import { User } from '../models/user.model.js';
import { UserSubscription } from '../models/userSubscription.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import { removeAllForUser as removeUserAddresses } from './address.service.js';
import { Vendor } from '../models/vendor.model.js';
import { removeAllForOwner as removeUserProducts } from './product.service.js';
import { WishlistItem } from '../models/wishlistItem.model.js';
import { hasUnfinishedOrders } from './order.service.js';

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

  // Orders in progress, unreturned rentals and unpaid refunds still need this user.
  if (await hasUnfinishedOrders(id)) {
    throw ApiError.conflict('This user has unfinished orders or a pending refund. Complete or cancel them before deleting the user');
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found');
  await removeUserAddresses(id);
  await Vendor.deleteOne({ user: id });
  await removeUserProducts(id);
  await WishlistItem.deleteMany({ user: id });
  return user;
};
