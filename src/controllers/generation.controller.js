import * as generationService from '../services/generation.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';

export const createTryOn = asyncHandler(async (req, res) => {
  const result = await generationService.createTryOn(req.user, req.files);
  return ApiResponse.created(res, result, 'Image generated');
});

export const listGenerations = asyncHandler(async (req, res) => {
  const result = await generationService.listForUser(
    req.user._id,
    { status: req.query.status },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getGeneration = asyncHandler(async (req, res) => {
  const generation = await generationService.getForUser(req.user._id, req.params.id);
  return ApiResponse.ok(res, generation);
});
