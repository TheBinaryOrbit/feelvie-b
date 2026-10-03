import * as userService from '../services/user.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  return ApiResponse.ok(res, user);
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  return ApiResponse.ok(res, user, 'User updated');
});
