import * as subscriptionService from '../services/subscription.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const subscribe = asyncHandler(async (req, res) => {
  const result = await subscriptionService.subscribe(req.user, req.body.planId);
  return ApiResponse.created(res, result, 'Subscription created. Complete payment in Razorpay Checkout');
});

export const verify = asyncHandler(async (req, res) => {
  const result = await subscriptionService.verifyCheckout(req.user, req.body);
  return ApiResponse.ok(res, result, 'Payment verified');
});

export const getMine = asyncHandler(async (req, res) => {
  const result = await subscriptionService.getMine(req.user._id);
  return ApiResponse.ok(res, result);
});

export const cancel = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancel(req.user);
  const message = subscription.cancelAtPeriodEnd
    ? 'Subscription will end at the end of the current period'
    : 'Subscription cancelled';
  return ApiResponse.ok(res, subscription, message);
});
