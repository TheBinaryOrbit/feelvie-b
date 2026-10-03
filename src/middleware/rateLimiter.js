import rateLimit from 'express-rate-limit';

const limitMessage = (message) => ({ success: false, statusCode: 429, message });

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many requests, please try again later'),
});

// Per user, not per IP. Must run after protect so req.user is set.
export const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user._id}`,
  message: limitMessage('Too many generation requests, please try again later'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many auth attempts, please try again later'),
});
