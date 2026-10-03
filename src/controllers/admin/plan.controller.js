import * as planService from '../../services/plan.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { parseBooleanQuery } from '../../utils/query.js';

export const listPlans = asyncHandler(async (req, res) => {
  const { audience, billingCycle } = req.query;
  const result = await planService.listAll(
    { audience, billingCycle, isActive: parseBooleanQuery(req.query.isActive) },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await planService.getById(req.params.id);
  return ApiResponse.ok(res, plan);
});

export const createPlan = asyncHandler(async (req, res) => {
  const plan = await planService.create(req.admin._id, req.body);
  return ApiResponse.created(res, plan, 'Plan created');
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await planService.update(req.params.id, req.body);
  return ApiResponse.ok(res, plan, 'Plan updated');
});

export const deactivatePlan = asyncHandler(async (req, res) => {
  const plan = await planService.deactivate(req.params.id);
  return ApiResponse.ok(res, plan, 'Plan deactivated');
});
