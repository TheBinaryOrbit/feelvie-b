import * as orderService from '../services/order.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';

const filters = (req) => ({ status: req.query.status, type: req.query.type });

// ---- Buyer ----

export const createOrder = asyncHandler(async (req, res) => {
  const result = await orderService.create(req.user, req.body);
  const message = result.checkout ? 'Order created. Complete the payment to confirm it' : 'Order placed';
  return ApiResponse.created(res, result, message);
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const order = await orderService.verifyPayment(req.user, req.params.id, req.body);
  return ApiResponse.ok(res, order, 'Payment verified. Order placed');
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listForBuyer(req.user._id, filters(req), parsePagination(req.query));
  return ApiResponse.ok(res, result);
});

export const getMyOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getForBuyer(req.user._id, req.params.id);
  return ApiResponse.ok(res, order);
});

export const cancelMyOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelByBuyer(req.user._id, req.params.id, req.body?.reason);
  return ApiResponse.ok(res, order, 'Order cancelled');
});

// ---- Seller ----

export const listSellingOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listForSeller(req.user._id, filters(req), parsePagination(req.query));
  return ApiResponse.ok(res, result);
});

export const getSellingOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getForSeller(req.user._id, req.params.id);
  return ApiResponse.ok(res, order);
});

export const updateSellingOrderStatus = asyncHandler(async (req, res) => {
  const order = await orderService.advanceBySeller(req.user._id, req.params.id, req.body.status);
  return ApiResponse.ok(res, order, `Order marked ${order.status}`);
});

export const cancelSellingOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelBySeller(req.user._id, req.params.id, req.body.reason);
  return ApiResponse.ok(res, order, 'Order cancelled');
});
