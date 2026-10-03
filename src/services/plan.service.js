import { SubscriptionPlan } from '../models/subscriptionPlan.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';
import * as razorpay from './razorpay.service.js';

const CREATE_FIELDS = [
  'name',
  'description',
  'audience',
  'billingCycle',
  'originalPriceInr',
  'offerPriceInr',
  'creditsPerMonth',
];
const EDITABLE_FIELDS = ['name', 'description', 'audience', 'originalPriceInr', 'creditsPerMonth', 'isActive'];
const LOCKED_FIELDS = ['billingCycle', 'offerPriceInr'];

// Fields hidden from app users.
const PUBLIC_PROJECTION = '-razorpayPlanId -createdBy -__v';

const pick = (data, fields) =>
  Object.fromEntries(Object.entries(data || {}).filter(([key]) => fields.includes(key)));

export const create = async (adminId, data) => {
  const plan = new SubscriptionPlan({
    ...pick(data, CREATE_FIELDS),
    razorpayPlanId: 'pending',
    createdBy: adminId,
  });

  // Validate locally first so a bad request never creates an orphan plan in Razorpay.
  await plan.validate();

  const rzpPlan = await razorpay.createPlan({
    name: plan.name,
    description: plan.description,
    billingCycle: plan.billingCycle,
    amountInr: plan.offerPriceInr,
  });
  plan.razorpayPlanId = rzpPlan.id;
  return plan.save();
};

export const getById = async (id) => {
  const plan = await SubscriptionPlan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
};

export const update = async (id, data) => {
  const plan = await getById(id);

  const changedLocked = LOCKED_FIELDS.filter(
    (field) => data?.[field] !== undefined && data[field] !== plan[field]
  );
  if (changedLocked.length) {
    throw ApiError.badRequest(
      `${changedLocked.join(' and ')} cannot be changed after a plan is created. Deactivate this plan and create a new one instead`
    );
  }

  plan.set(pick(data, EDITABLE_FIELDS));
  return plan.save();
};

export const deactivate = async (id) => {
  const plan = await getById(id);
  plan.isActive = false;
  return plan.save();
};

export const listAll = ({ audience, billingCycle, isActive } = {}, pagination) => {
  const filter = {};
  if (audience) filter.audience = audience;
  if (billingCycle) filter.billingCycle = billingCycle;
  if (isActive !== undefined) filter.isActive = isActive;
  return paginate(SubscriptionPlan, filter, pagination);
};

export const listActive = ({ audience, billingCycle } = {}) => {
  const filter = { isActive: true };
  if (audience) filter.audience = audience;
  if (billingCycle) filter.billingCycle = billingCycle;
  return SubscriptionPlan.find(filter).select(PUBLIC_PROJECTION).sort({ offerPriceInr: 1 });
};
