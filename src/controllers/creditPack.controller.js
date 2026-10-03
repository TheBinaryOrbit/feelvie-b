import * as creditPackService from '../services/creditPack.service.js';
import * as purchaseService from '../services/purchase.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listPacks = asyncHandler(async (_req, res) => {
  const packs = await creditPackService.listActive();
  return ApiResponse.ok(res, packs);
});

export const purchase = asyncHandler(async (req, res) => {
  const result = await purchaseService.createPackOrder(req.user, req.params.id);
  return ApiResponse.created(res, result, 'Order created. Complete payment in Razorpay Checkout');
});

export const verify = asyncHandler(async (req, res) => {
  const result = await purchaseService.verifyPackPayment(req.user, req.body);
  return ApiResponse.ok(res, result, 'Payment verified, credits added');
});
