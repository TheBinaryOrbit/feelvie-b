import * as wishlistService from '../services/wishlist.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';

export const getWishlist = asyncHandler(async (req, res) => {
  const result = await wishlistService.list(req.user._id, parsePagination(req.query));
  return ApiResponse.ok(res, result);
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const { added } = await wishlistService.add(req.user, req.body.productId);
  const data = { productId: req.body.productId, isWishlisted: true };
  return added
    ? ApiResponse.created(res, data, 'Added to wishlist')
    : ApiResponse.ok(res, data, 'Already in wishlist');
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  await wishlistService.remove(req.user._id, req.params.productId);
  return ApiResponse.ok(res, { productId: req.params.productId, isWishlisted: false }, 'Removed from wishlist');
});
