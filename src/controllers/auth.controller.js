import * as authService from '../services/auth.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestOtp(req.body.phone);
  return ApiResponse.ok(res, result, 'OTP sent successfully');
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtp(req.body.phone, req.body.otp);
  return ApiResponse.ok(res, result, 'OTP verified, login successful');
});

export const me = asyncHandler(async (req, res) => {
  return ApiResponse.ok(res, req.user);
});
