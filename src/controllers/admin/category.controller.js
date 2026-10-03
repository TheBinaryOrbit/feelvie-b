import * as categoryService from '../../services/category.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { parseBooleanQuery } from '../../utils/query.js';

export const listCategories = asyncHandler(async (req, res) => {
  const { parentId, search } = req.query;
  const level = Number.parseInt(req.query.level, 10) || undefined;
  const result = await categoryService.listForAdmin(
    { parentId, search, level, isActive: parseBooleanQuery(req.query.isActive) },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getTree = asyncHandler(async (_req, res) => {
  const tree = await categoryService.adminTree();
  return ApiResponse.ok(res, tree);
});

export const getCategory = asyncHandler(async (req, res) => {
  const result = await categoryService.getForAdmin(req.params.id);
  return ApiResponse.ok(res, result);
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.create(req.admin._id, req.body, req.file);
  return ApiResponse.created(res, category, 'Category created');
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.update(req.admin._id, req.params.id, req.body, req.file);
  return ApiResponse.ok(res, category, 'Category updated');
});

export const deactivateCategory = asyncHandler(async (req, res) => {
  const result = await categoryService.deactivate(req.admin._id, req.params.id);
  return ApiResponse.ok(res, result, `Category deactivated (${result.deactivated} including subcategories)`);
});
