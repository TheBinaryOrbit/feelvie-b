import rateLimit from 'express-rate-limit';

const limitMessage = (message) => ({ success: false, statusCode: 429, message });

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many requests, please try again later'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many auth attempts, please try again later'),
});
