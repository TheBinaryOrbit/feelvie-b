import * as productService from '../services/product.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { parseBooleanQuery } from '../utils/query.js';

const toNumber = (value) => (value === undefined || value === '' ? undefined : Number(value));

// ---- Store (public) ----

export const listProducts = asyncHandler(async (req, res) => {
  const { category, listingType, size, search, sort, vendor } = req.query;
  const result = await productService.listPublic(
    {
      category,
      listingType,
      size,
      search,
      sort,
      vendor,
      minPrice: toNumber(req.query.minPrice),
      maxPrice: toNumber(req.query.maxPrice),
      inStock: parseBooleanQuery(req.query.inStock),
    },
    parsePagination(req.query),
    req.user?._id
  );
  return ApiResponse.ok(res, result);
});

export const getProduct = asyncHandler(async (req, res) => {
  const result = await productService.getPublicBySlug(req.params.slug, req.user?._id);
  return ApiResponse.ok(res, result);
});

// ---- Owner ----

export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.create(req.user, req.body, req.files);
  return ApiResponse.created(res, product, 'Product added');
});

export const listMyProducts = asyncHandler(async (req, res) => {
  const result = await productService.listMine(
    req.user._id,
    { listingType: req.query.listingType, isActive: parseBooleanQuery(req.query.isActive) },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getMyProduct = asyncHandler(async (req, res) => {
  const product = await productService.getMine(req.user._id, req.params.id);
  return ApiResponse.ok(res, product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.update(req.user._id, req.params.id, req.body, req.files);
  return ApiResponse.ok(res, product, 'Product updated');
});

export const deleteProduct = asyncHandler(async (req, res) => {
  await productService.remove(req.user._id, req.params.id);
  return ApiResponse.ok(res, null, 'Product deleted');
});
