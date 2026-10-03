import * as categoryService from '../services/category.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getTree = asyncHandler(async (_req, res) => {
  const tree = await categoryService.publicTree();
  return ApiResponse.ok(res, tree);
});

export const getBySlug = asyncHandler(async (req, res) => {
  const result = await categoryService.getPublicBySlug(req.params.slug);
  return ApiResponse.ok(res, result);
});
