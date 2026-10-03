import { Address, MAX_ADDRESSES_PER_USER } from '../models/address.model.js';
import { ApiError } from '../utils/ApiError.js';

const EDITABLE_FIELDS = [
  'label',
  'fullName',
  'phone',
  'addressLine1',
  'addressLine2',
  'landmark',
  'city',
  'state',
  'pincode',
  'country',
  'location',
];

const pick = (data, fields) =>
  Object.fromEntries(Object.entries(data || {}).filter(([key]) => fields.includes(key)));

const findOwned = async (userId, addressId) => {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) throw ApiError.notFound('Address not found');
  return address;
};

const clearDefault = (userId, exceptId) =>
  Address.updateMany({ user: userId, isDefault: true, _id: { $ne: exceptId } }, { isDefault: false });

// Validates first, so a bad payload never leaves the user without a default.
const saveAsDefault = async (address) => {
  await address.validate();
  await clearDefault(address.user, address._id);
  address.isDefault = true;
  return address.save();
};

export const list = (userId) => Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });

export const getById = (userId, addressId) => findOwned(userId, addressId);

export const create = async (userId, data) => {
  const count = await Address.countDocuments({ user: userId });
  if (count >= MAX_ADDRESSES_PER_USER) {
    throw ApiError.badRequest(`You can save at most ${MAX_ADDRESSES_PER_USER} addresses`);
  }

  const address = new Address({ ...pick(data, EDITABLE_FIELDS), user: userId });

  // The first address is always the default.
  if (count === 0 || data?.isDefault === true) return saveAsDefault(address);
  return address.save();
};

export const update = async (userId, addressId, data) => {
  const address = await findOwned(userId, addressId);
  address.set(pick(data, EDITABLE_FIELDS));

  // isDefault: false is ignored. Unset a default by choosing another address as default.
  if (data?.isDefault === true && !address.isDefault) return saveAsDefault(address);
  return address.save();
};

export const setDefault = async (userId, addressId) => {
  const address = await findOwned(userId, addressId);
  if (address.isDefault) return address;
  return saveAsDefault(address);
};

export const remove = async (userId, addressId) => {
  const address = await findOwned(userId, addressId);
  await address.deleteOne();

  // Promote the most recently created remaining address to default.
  if (address.isDefault) {
    await Address.findOneAndUpdate(
      { user: userId },
      { isDefault: true },
      { sort: { createdAt: -1 } }
    );
  }
};

export const removeAllForUser = (userId) => Address.deleteMany({ user: userId });
