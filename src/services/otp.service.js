import crypto from 'crypto';
import { env } from '../config/env.js';
import { Otp } from '../models/otp.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const MOCK_OTP = '123456';

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const generateCode = () =>
  env.otp.mock ? MOCK_OTP : crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

// TODO: replace with a real SMS provider (MSG91, Twilio, etc.).
const deliverCode = async (phone, code) => {
  logger.info(`[OTP] ${phone} -> ${env.otp.mock ? code : 'sent via SMS'}`);
};

export const sendOtp = async (phone) => {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + env.otp.expiryMinutes * 60 * 1000);

  // One active OTP per phone: requesting a new one replaces the old one.
  await Otp.findOneAndUpdate(
    { phone },
    { codeHash: hashCode(code), attempts: 0, expiresAt },
    { upsert: true, setDefaultsOnInsert: true }
  );

  await deliverCode(phone, code);
  return { expiresInSeconds: env.otp.expiryMinutes * 60 };
};

// Throws on a missing, expired, exhausted or wrong code. Consumes the OTP on success.
export const verifyOtp = async (phone, code) => {
  const record = await Otp.findOne({ phone });

  if (!record || record.expiresAt < new Date()) {
    throw ApiError.badRequest('OTP expired or not requested. Please request a new OTP');
  }

  if (record.attempts >= env.otp.maxAttempts) {
    await record.deleteOne();
    throw ApiError.tooManyRequests('Too many invalid attempts. Please request a new OTP');
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(record.codeHash, 'hex'),
    Buffer.from(hashCode(code), 'hex')
  );

  if (!valid) {
    record.attempts += 1;
    await record.save();
    const left = env.otp.maxAttempts - record.attempts;
    throw ApiError.badRequest(`Invalid OTP. ${left} attempt(s) remaining`);
  }

  await record.deleteOne();
};
