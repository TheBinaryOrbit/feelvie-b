import mongoose from 'mongoose';
import { Vendor, MIN_PRODUCTS_TO_APPLY } from '../models/vendor.model.js';
import { UserSubscription } from '../models/userSubscription.model.js';
import { Address } from '../models/address.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';

const PROFILE_FIELDS = ['storeName', 'description', 'contactPhone', 'contactEmail', 'gstNumber', 'pickupAddress'];
// Optional fields the user can clear by sending null or an empty string.
const CLEARABLE_FIELDS = ['description', 'contactEmail', 'gstNumber', 'pickupAddress'];

const pickProfile = (data) => {
  const picked = {};
  for (const key of PROFILE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data || {}, key)) continue;
    const value = data[key];
    const isEmpty = value === null || value === '';
    if (isEmpty && CLEARABLE_FIELDS.includes(key)) picked[key] = undefined;
    else picked[key] = value;
  }
  return picked;
};

// ---- Eligibility -----------------------------------------------------------------

// The user's paid-up B2B subscription, or null.
export const findActiveB2BSubscription = (userId) =>
  UserSubscription.findOne({ user: userId, status: 'active', 'planSnapshot.audience': 'B2B' });

/**
 * TODO(products): when the Product model exists, count the user's products here and
 * return { enforced: true, count, met: count >= MIN_PRODUCTS_TO_APPLY }.
 * Until then the rule is reported but not enforced.
 */
const checkProductRequirement = async () => ({
  required: MIN_PRODUCTS_TO_APPLY,
  enforced: false,
  count: null,
  met: true,
});

export const getEligibility = async (userId) => {
  const [subscription, products] = await Promise.all([
    findActiveB2BSubscription(userId),
    checkProductRequirement(userId),
  ]);

  const unmet = [];
  if (!subscription) unmet.push('An active B2B subscription is required');
  if (!products.met) unmet.push(`Add at least ${products.required} products before applying`);

  return {
    hasActiveB2BSubscription: Boolean(subscription),
    products,
    eligible: unmet.length === 0,
    unmet,
    subscription,
  };
};

const assertEligible = async (userId) => {
  const eligibility = await getEligibility(userId);
  if (!eligibility.eligible) {
    throw new ApiError(403, eligibility.unmet[0], eligibility.unmet);
  }
  return eligibility;
};

const assertOwnAddress = async (userId, addressId) => {
  if (addressId === undefined) return;
  const owned = mongoose.isValidObjectId(addressId) && (await Address.exists({ _id: addressId, user: userId }));
  if (!owned) throw ApiError.badRequest('pickupAddress must be one of your saved addresses');
};

/**
 * True when the user's products may be shown in stores: an approved vendor whose B2B
 * subscription is still active. The product module must check this before listing.
 */
export const canSell = async (userId) => {
  const vendor = await Vendor.findOne({ user: userId, status: 'approved' }).select('_id');
  if (!vendor) return false;
  return Boolean(await findActiveB2BSubscription(userId));
};

// Ids of every user whose products may be shown in stores. For product listing queries.
export const sellingUserIds = async () => {
  const approved = await Vendor.find({ status: 'approved' }).distinct('user');
  if (!approved.length) return [];
  return UserSubscription.find({
    user: { $in: approved },
    status: 'active',
    'planSnapshot.audience': 'B2B',
  }).distinct('user');
};

// ---- User ------------------------------------------------------------------------

const eligibilityView = ({ subscription: _subscription, ...rest }) => rest;

export const getMine = async (userId) => {
  const [vendor, eligibility] = await Promise.all([Vendor.findOne({ user: userId }), getEligibility(userId)]);
  const status = vendor?.status ?? 'not_applied';
  return {
    status,
    vendor,
    eligibility: eligibilityView(eligibility),
    // A first application, or a new one after a rejection.
    canApply: eligibility.eligible && (status === 'not_applied' || status === 'rejected'),
    canSell: status === 'approved' && eligibility.hasActiveB2BSubscription,
  };
};

export const apply = async (user, data) => {
  const existing = await Vendor.findOne({ user: user._id });
  if (existing?.status === 'pending') throw ApiError.conflict('Your vendor application is already under review');
  if (existing?.status === 'approved') throw ApiError.conflict('You are already an approved vendor');
  if (existing?.status === 'suspended') {
    throw ApiError.forbidden('Your vendor account is suspended. Please contact support');
  }

  const eligibility = await assertEligible(user._id);
  const profile = pickProfile(data);
  await assertOwnAddress(user._id, profile.pickupAddress);

  const vendor = existing || new Vendor({ user: user._id });
  vendor.set(profile);
  if (!vendor.contactPhone) vendor.contactPhone = user.phone;
  if (!vendor.contactEmail && user.email) vendor.contactEmail = user.email;

  vendor.status = 'pending';
  vendor.subscriptionAtApply = eligibility.subscription._id;
  vendor.appliedAt = new Date();
  if (existing) vendor.applicationCount += 1;
  // A new application clears the previous decision.
  vendor.statusReason = undefined;
  vendor.reviewedBy = undefined;
  vendor.reviewedAt = undefined;

  try {
    return await vendor.save();
  } catch (err) {
    // Two apply requests at once: the unique index on user lets only one through.
    if (err.code === 11000) throw ApiError.conflict('Your vendor application is already under review');
    throw err;
  }
};

export const updateMine = async (userId, data) => {
  const vendor = await Vendor.findOne({ user: userId });
  if (!vendor) throw ApiError.notFound('You have not applied to become a vendor');
  if (vendor.status === 'rejected') {
    throw ApiError.badRequest('Your application was rejected. Apply again with the updated details');
  }
  if (vendor.status === 'suspended') {
    throw ApiError.forbidden('Your vendor account is suspended. Please contact support');
  }

  const profile = pickProfile(data);
  await assertOwnAddress(userId, profile.pickupAddress);
  vendor.set(profile);
  return vendor.save();
};

export const removeForUser = (userId) => Vendor.deleteOne({ user: userId });

// ---- Admin -----------------------------------------------------------------------

const USER_FIELDS = 'phone name email isActive';

const findOr404 = async (id) => {
  const vendor = mongoose.isValidObjectId(id) ? await Vendor.findById(id) : null;
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listForAdmin = ({ status, search } = {}, pagination) => {
  const filter = {};
  if (status) filter.status = status;
  if (search) filter.storeName = { $regex: escapeRegex(search.trim()), $options: 'i' };
  return paginate(Vendor, filter, pagination, {
    sort: { appliedAt: -1 },
    populate: { path: 'user', select: USER_FIELDS },
  });
};

export const getForAdmin = async (id) => {
  const vendor = await findOr404(id);
  await vendor.populate([
    { path: 'user', select: USER_FIELDS },
    { path: 'pickupAddress' },
    { path: 'reviewedBy', select: 'name email' },
  ]);
  const eligibility = await getEligibility(vendor.user?._id ?? vendor.user);
  return {
    vendor,
    eligibility: eligibilityView(eligibility),
    subscription: eligibility.subscription,
    canSell: vendor.status === 'approved' && eligibility.hasActiveB2BSubscription,
  };
};

const review = (vendor, adminId, status, reason) => {
  vendor.status = status;
  vendor.reviewedBy = adminId;
  vendor.reviewedAt = new Date();
  vendor.statusReason = reason || undefined;
  return vendor.save();
};

export const approve = async (id, adminId) => {
  const vendor = await findOr404(id);
  if (vendor.status === 'approved') throw ApiError.badRequest('This vendor is already approved');
  if (vendor.status !== 'pending') {
    throw ApiError.badRequest(`Only a pending application can be approved. This one is ${vendor.status}`);
  }
  if (!(await User.exists({ _id: vendor.user }))) throw ApiError.notFound('The user for this vendor no longer exists');

  // The conditions must still hold on the day of approval.
  const eligibility = await getEligibility(vendor.user);
  if (!eligibility.eligible) {
    throw ApiError.conflict(`This user no longer meets the vendor conditions: ${eligibility.unmet.join('; ')}`);
  }

  vendor.approvedAt = new Date();
  return review(vendor, adminId, 'approved');
};

export const reject = async (id, adminId, reason) => {
  const vendor = await findOr404(id);
  if (vendor.status !== 'pending') {
    throw ApiError.badRequest(`Only a pending application can be rejected. This one is ${vendor.status}`);
  }
  return review(vendor, adminId, 'rejected', reason);
};

export const suspend = async (id, adminId, reason) => {
  const vendor = await findOr404(id);
  if (vendor.status !== 'approved') {
    throw ApiError.badRequest(`Only an approved vendor can be suspended. This one is ${vendor.status}`);
  }
  return review(vendor, adminId, 'suspended', reason);
};

export const reinstate = async (id, adminId) => {
  const vendor = await findOr404(id);
  if (vendor.status !== 'suspended') {
    throw ApiError.badRequest(`Only a suspended vendor can be reinstated. This one is ${vendor.status}`);
  }
  return review(vendor, adminId, 'approved');
};
