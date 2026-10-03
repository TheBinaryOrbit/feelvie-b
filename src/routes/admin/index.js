import { Router } from 'express';
import { protectAdmin } from '../../middleware/auth.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

// Login is public. Everything registered after protectAdmin needs an admin token.
router.use('/auth', authRoutes);

router.use(protectAdmin);
router.use('/users', userRoutes);

export default router;
