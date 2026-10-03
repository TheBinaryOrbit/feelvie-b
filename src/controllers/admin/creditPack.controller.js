import * as creditPackService from '../../services/creditPack.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { parseBooleanQuery } from '../../utils/query.js';

export const listPacks = asyncHandler(async (req, res) => {
  const result = await creditPackService.listAll(
    { isActive: parseBooleanQuery(req.query.isActive) },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getPack = asyncHandler(async (req, res) => {
  const pack = await creditPackService.getById(req.params.id);
  return ApiResponse.ok(res, pack);
});

export const createPack = asyncHandler(async (req, res) => {
  const pack = await creditPackService.create(req.admin._id, req.body);
  return ApiResponse.created(res, pack, 'Credit pack created');
});

export const updatePack = asyncHandler(async (req, res) => {
  const pack = await creditPackService.update(req.params.id, req.body);
  return ApiResponse.ok(res, pack, 'Credit pack updated');
});

export const deactivatePack = asyncHandler(async (req, res) => {
  const pack = await creditPackService.deactivate(req.params.id);
  return ApiResponse.ok(res, pack, 'Credit pack deactivated');
});
