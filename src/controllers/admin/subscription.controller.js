import * as subscriptionService from '../../services/subscription.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';

export const listSubscriptions = asyncHandler(async (req, res) => {
  const result = await subscriptionService.listAll(
    { status: req.query.status, userId: req.query.userId },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getSubscription = asyncHandler(async (req, res) => {
  const result = await subscriptionService.getById(req.params.id);
  return ApiResponse.ok(res, result);
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelByAdmin(req.params.id, {
    immediately: req.body.immediately === true,
    reason: req.body.reason,
    adminId: req.admin._id,
  });
  const message = subscription.cancelAtPeriodEnd && subscription.status === 'active'
    ? 'Subscription will end at the end of the current period'
    : 'Subscription cancelled';
  return ApiResponse.ok(res, subscription, message);
});
