import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/jwt.js';
import { normalizePhone } from '../utils/phone.js';
import * as otpService from './otp.service.js';

export const requestOtp = async (rawPhone) => {
  const phone = normalizePhone(rawPhone);
  const { expiresInSeconds } = await otpService.sendOtp(phone);
  return { phone, expiresInSeconds };
};

export const verifyOtp = async (rawPhone, otp) => {
  const phone = normalizePhone(rawPhone);
  await otpService.verifyOtp(phone, otp);

  const user = await User.findOne({ phone });
  if (!user) throw ApiError.notFound('OTP matched, account not found');
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ id: user._id, role: user.role });
  return { user, token };
};
