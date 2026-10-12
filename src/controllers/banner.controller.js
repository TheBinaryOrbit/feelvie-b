import * as bannerService from '../services/banner.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listBanners = asyncHandler(async (_req, res) => {
  const banners = await bannerService.listPublic();
  return ApiResponse.ok(res, banners);
});
