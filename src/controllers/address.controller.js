import * as addressService from '../services/address.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.list(req.user._id);
  return ApiResponse.ok(res, addresses);
});

export const getAddress = asyncHandler(async (req, res) => {
  const address = await addressService.getById(req.user._id, req.params.id);
  return ApiResponse.ok(res, address);
});

export const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.create(req.user._id, req.body);
  return ApiResponse.created(res, address, 'Address added');
});

export const updateAddress = asyncHandler(async (req, res) => {
  const address = await addressService.update(req.user._id, req.params.id, req.body);
  return ApiResponse.ok(res, address, 'Address updated');
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
  const address = await addressService.setDefault(req.user._id, req.params.id);
  return ApiResponse.ok(res, address, 'Default address updated');
});

export const deleteAddress = asyncHandler(async (req, res) => {
  await addressService.remove(req.user._id, req.params.id);
  return ApiResponse.ok(res, null, 'Address deleted');
});
