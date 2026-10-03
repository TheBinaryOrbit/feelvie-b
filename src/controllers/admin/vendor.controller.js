import * as vendorService from '../../services/vendor.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';

export const listVendors = asyncHandler(async (req, res) => {
  const result = await vendorService.listForAdmin({ status: req.query.status }, parsePagination(req.query));
  return ApiResponse.ok(res, result);
});

export const getVendor = asyncHandler(async (req, res) => {
  const result = await vendorService.getForAdmin(req.params.id);
  return ApiResponse.ok(res, result);
});

export const approveVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.approve(req.params.id, req.admin._id);
  return ApiResponse.ok(res, vendor, 'Vendor approved');
});

export const rejectVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.reject(req.params.id, req.admin._id, req.body.reason);
  return ApiResponse.ok(res, vendor, 'Vendor application rejected');
});

export const suspendVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.suspend(req.params.id, req.admin._id, req.body.reason);
  return ApiResponse.ok(res, vendor, 'Vendor suspended');
});

export const reinstateVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.reinstate(req.params.id, req.admin._id);
  return ApiResponse.ok(res, vendor, 'Vendor reinstated');
});
