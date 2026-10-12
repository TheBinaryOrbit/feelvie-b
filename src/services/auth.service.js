import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import {
  SIGNUP_TOKEN_TTL_SECONDS,
  TOKEN_TYPES,
  signSignupToken,
  signUserToken,
  verifyToken,
} from '../utils/jwt.js';
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
  if (!user) {
    // The OTP is consumed, so hand back a short-lived token that lets this phone sign up.
    throw new ApiError(404, 'OTP matched, account not found', {
      signupToken: signSignupToken(phone),
      expiresInSeconds: SIGNUP_TOKEN_TTL_SECONDS,
    });
  }
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  user.lastLoginAt = new Date();
  await user.save();

  const token = signUserToken(user._id);
  return { user, token };
};

// Creates the account for a phone that passed OTP verification, and logs the user in.
export const signup = async (signupToken, rawName) => {
  let decoded;
  try {
    decoded = verifyToken(signupToken);
  } catch {
    decoded = null;
  }
  if (decoded?.type !== TOKEN_TYPES.SIGNUP || !decoded.phone) {
    throw ApiError.badRequest('Signup session expired. Please verify your phone number again');
  }

  const { phone } = decoded;
  if (await User.exists({ phone })) {
    throw ApiError.conflict('An account already exists for this phone number. Please log in');
  }

  const user = await User.create({ phone, name: rawName.trim(), lastLoginAt: new Date() });
  const token = signUserToken(user._id);
  return { user, token };
};
