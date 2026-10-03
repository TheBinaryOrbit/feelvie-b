import * as planService from '../services/plan.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listPlans = asyncHandler(async (req, res) => {
  const { audience, billingCycle } = req.query;
  const plans = await planService.listActive({ audience, billingCycle });
  return ApiResponse.ok(res, plans);
});
