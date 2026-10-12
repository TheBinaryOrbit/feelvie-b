import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { PHONE_REGEX } from '../utils/phone.js';

const router = Router();

const phoneRule = {
  required: true,
  type: 'string',
  pattern: { test: (v) => PHONE_REGEX.test(v.replace(/[\s\-()]/g, '')) },
  message: 'body.phone must be a valid phone number (10-15 digits, optional +)',
};

const getOtpSchema = { body: { phone: phoneRule } };

const verifyOtpSchema = {
  body: {
    phone: phoneRule,
    otp: { required: true, type: 'string', pattern: /^\d{6}$/, message: 'body.otp must be a 6-digit string' },
  },
};

const signupSchema = {
  body: {
    signupToken: { required: true, type: 'string' },
    name: {
      required: true,
      type: 'string',
      pattern: { test: (v) => v.trim().length >= 2 && v.trim().length <= 100 },
      message: 'body.name must be 2 to 100 characters',
    },
  },
};

router.post('/get-otp', authLimiter, validate(getOtpSchema), authController.getOtp);
router.post('/verify-otp', authLimiter, validate(verifyOtpSchema), authController.verifyOtp);
router.post('/signup', authLimiter, validate(signupSchema), authController.signup);
router.get('/me', protect, authController.me);

export default router;
