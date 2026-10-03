import mongoose from 'mongoose';
import { Vendor, MIN_PRODUCTS_TO_APPLY } from '../models/vendor.model.js';
import { UserSubscription } from '../models/userSubscription.model.js';
import { Product } from '../models/product.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';

// ---- Eligibility -----------------------------------------------------------------

// The user's paid-up B2B subscription, or null.
export const findActiveB2BSubscription = (userId) =>
  UserSubscription.findOne({ user: userId, status: 'active', 'planSnapshot.audience': 'B2B' });

// The user must have added enough products before applying. Blocked products do not count.
const checkProductRequirement = async (userId) => {
  const count = await Product.countDocuments({ owner: userId, isBlocked: false });
  return {
    required: MIN_PRODUCTS_TO_APPLY,
    enforced: true,
    count,
    met: count >= MIN_PRODUCTS_TO_APPLY,
  };
};

export const getEligibility = async (userId) => {
  const [subscription, products] = await Promise.all([
    findActiveB2BSubscription(userId),
    checkProductRequirement(userId),
  ]);

  const unmet = [];
  if (!subscription) unmet.push('An active B2B subscription is required');
  if (!products.met) {
    unmet.push(`Add at least ${products.required} products before applying. You have ${products.count}`);
  }

  return {
    hasActiveB2BSubscription: Boolean(subscription),
    products,
    eligible: unmet.length === 0,
    unmet,
    subscription,
  };
};

// True when the user's products may be shown in stores: the vendor is approved.
// The product module must check this before listing.
export const canSell = async (userId) => Boolean(await Vendor.exists({ user: userId, status: 'approved' }));

// Ids of every user whose products may be shown in stores. For product listing queries.
export const sellingUserIds = () => Vendor.find({ status: 'approved' }).distinct('user');

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
    canSell: status === 'approved',
  };
};

export const apply = async (user) => {
  const existing = await Vendor.findOne({ user: user._id });
  if (existing?.status === 'pending') throw ApiError.conflict('Your vendor application is already under review');
  if (existing?.status === 'approved') throw ApiError.conflict('You are already an approved vendor');
  if (existing?.status === 'suspended') {
    throw ApiError.forbidden('Your vendor account is suspended. Please contact support');
  }

  const eligibility = await getEligibility(user._id);
  if (!eligibility.eligible) throw new ApiError(403, eligibility.unmet[0], eligibility.unmet);

  const vendor = existing || new Vendor({ user: user._id });
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

// ---- Admin -----------------------------------------------------------------------

const USER_FIELDS = 'phone name email isActive';

const findOr404 = async (id) => {
  const vendor = mongoose.isValidObjectId(id) ? await Vendor.findById(id) : null;
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
};

export const listForAdmin = ({ status } = {}, pagination) => {
  const filter = {};
  if (status) filter.status = status;
  return paginate(Vendor, filter, pagination, {
    sort: { appliedAt: -1 },
    populate: { path: 'user', select: USER_FIELDS },
  });
};

export const getForAdmin = async (id) => {
  const vendor = await findOr404(id);
  await vendor.populate([
    { path: 'user', select: USER_FIELDS },
    { path: 'reviewedBy', select: 'name email' },
  ]);
  // Shown for information only. Approval does not depend on it.
  const eligibility = await getEligibility(vendor.user?._id ?? vendor.user);
  return {
    vendor,
    eligibility: eligibilityView(eligibility),
    subscription: eligibility.subscription,
    canSell: vendor.status === 'approved',
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
