import * as userService from '../services/user.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const result = await userService.getAll({ page, limit });
  return ApiResponse.ok(res, result);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  return ApiResponse.ok(res, user);
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  return ApiResponse.ok(res, user, 'User updated');
});

export const deleteUser = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id);
  return ApiResponse.ok(res, null, 'User deleted');
});
