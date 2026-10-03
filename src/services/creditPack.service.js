import { CreditPack } from '../models/creditPack.model.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/pagination.js';

const EDITABLE_FIELDS = ['name', 'description', 'credits', 'priceInr', 'validityDays', 'isActive'];
const PUBLIC_PROJECTION = '-createdBy -__v';

const pick = (data, fields) =>
  Object.fromEntries(Object.entries(data || {}).filter(([key]) => fields.includes(key)));

export const create = (adminId, data) =>
  CreditPack.create({ ...pick(data, EDITABLE_FIELDS), createdBy: adminId });

export const getById = async (id) => {
  const pack = await CreditPack.findById(id);
  if (!pack) throw ApiError.notFound('Credit pack not found');
  return pack;
};

// Changes apply to future purchases only. Credits already bought keep their original expiry.
export const update = async (id, data) => {
  const pack = await getById(id);
  pack.set(pick(data, EDITABLE_FIELDS));
  return pack.save();
};

export const deactivate = async (id) => {
  const pack = await getById(id);
  pack.isActive = false;
  return pack.save();
};

export const listAll = ({ isActive } = {}, pagination) => {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  return paginate(CreditPack, filter, pagination);
};

export const listActive = () =>
  CreditPack.find({ isActive: true }).select(PUBLIC_PROJECTION).sort({ priceInr: 1 });
