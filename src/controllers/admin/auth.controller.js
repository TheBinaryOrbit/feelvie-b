import * as adminService from '../../services/admin.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const login = asyncHandler(async (req, res) => {
  const result = await adminService.login(req.body);
  return ApiResponse.ok(res, result, 'Login successful');
});

export const me = asyncHandler(async (req, res) => ApiResponse.ok(res, req.admin));
