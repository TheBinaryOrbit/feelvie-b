import * as generationService from '../../services/generation.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';

export const listGenerations = asyncHandler(async (req, res) => {
  const result = await generationService.listAll(
    { status: req.query.status, userId: req.query.userId },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

export const getGeneration = asyncHandler(async (req, res) => {
  const generation = await generationService.getById(req.params.id);
  return ApiResponse.ok(res, generation);
});
