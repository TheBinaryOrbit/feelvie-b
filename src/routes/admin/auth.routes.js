import { Router } from 'express';
import * as authController from '../../controllers/admin/auth.controller.js';
import { protectAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

const loginSchema = {
  body: {
    email: { required: true, type: 'string' },
    password: { required: true, type: 'string' },
  },
};

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.get('/me', protectAdmin, authController.me);

export default router;
