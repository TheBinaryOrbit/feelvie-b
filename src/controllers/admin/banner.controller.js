import * as bannerService from '../../services/banner.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { parseBooleanQuery } from '../../utils/query.js';

export const listBanners = asyncHandler(async (req, res) => {
  const result = await bannerService.listForAdmin(
    { isActive: parseBooleanQuery(req.query.isActive) },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.getForAdmin(req.params.id);
  return ApiResponse.ok(res, banner);
});

export const createBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.create(req.admin._id, req.body, req.file);
  return ApiResponse.created(res, banner, 'Banner created');
});

export const updateBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.update(req.admin._id, req.params.id, req.body, req.file);
  return ApiResponse.ok(res, banner, 'Banner updated');
});

export const deleteBanner = asyncHandler(async (req, res) => {
  await bannerService.remove(req.params.id);
  return ApiResponse.ok(res, null, 'Banner deleted');
});
