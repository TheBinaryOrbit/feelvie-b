import * as orderService from '../../services/order.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';

export const listOrders = asyncHandler(async (req, res) => {
  const { status, type, buyer, seller, paymentMethod, refundStatus } = req.query;
  const result = await orderService.listForAdmin(
    { status, type, buyer, seller, paymentMethod, refundStatus },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getOrder = asyncHandler(async (req, res) => {
  const result = await orderService.getForAdmin(req.params.id);
  return ApiResponse.ok(res, result);
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await orderService.advanceByAdmin(req.params.id, req.body.status);
  return ApiResponse.ok(res, order, `Order marked ${order.status}`);
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelByAdmin(req.params.id, req.body.reason);
  return ApiResponse.ok(res, order, 'Order cancelled');
});

export const markRefundDone = asyncHandler(async (req, res) => {
  const order = await orderService.markRefundDone(req.params.id, req.admin._id, req.body?.note);
  return ApiResponse.ok(res, order, 'Refund marked as done');
});
