import * as productService from '../../services/product.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';
import { parseBooleanQuery } from '../../utils/query.js';

export const listProducts = asyncHandler(async (req, res) => {
  const { owner, listingType, search } = req.query;
  const result = await productService.listForAdmin(
    {
      owner,
      listingType,
      search,
      isBlocked: parseBooleanQuery(req.query.isBlocked),
      isActive: parseBooleanQuery(req.query.isActive),
    },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getProduct = asyncHandler(async (req, res) => {
  const result = await productService.getForAdmin(req.params.id);
  return ApiResponse.ok(res, result);
});

export const blockProduct = asyncHandler(async (req, res) => {
  const product = await productService.block(req.params.id, req.admin._id, req.body.reason);
  return ApiResponse.ok(res, product, 'Product blocked');
});

export const unblockProduct = asyncHandler(async (req, res) => {
  const product = await productService.unblock(req.params.id);
  return ApiResponse.ok(res, product, 'Product unblocked');
});
