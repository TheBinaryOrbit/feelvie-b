import * as vendorService from '../services/vendor.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getMine = asyncHandler(async (req, res) => {
  const result = await vendorService.getMine(req.user._id);
  return ApiResponse.ok(res, result);
});

export const apply = asyncHandler(async (req, res) => {
  const vendor = await vendorService.apply(req.user, req.body);
  return ApiResponse.created(res, vendor, 'Application submitted. We will review it shortly');
});

export const updateMine = asyncHandler(async (req, res) => {
  const vendor = await vendorService.updateMine(req.user._id, req.body);
  return ApiResponse.ok(res, vendor, 'Vendor details updated');
});
