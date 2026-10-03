import * as creditPackService from '../services/creditPack.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listPacks = asyncHandler(async (_req, res) => {
  const packs = await creditPackService.listActive();
  return ApiResponse.ok(res, packs);
});
