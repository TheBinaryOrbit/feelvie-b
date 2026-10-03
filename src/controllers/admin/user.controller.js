import * as userService from '../../services/user.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';

export const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.getAll(parsePagination(req.query));
  return ApiResponse.ok(res, result);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  return ApiResponse.ok(res, user);
});

export const deleteUser = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id);
  return ApiResponse.ok(res, null, 'User deleted');
});
