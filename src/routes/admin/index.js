import { Router } from 'express';
import { protectAdmin } from '../../middleware/auth.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import planRoutes from './plan.routes.js';
import creditPackRoutes from './creditPack.routes.js';
import subscriptionRoutes from './subscription.routes.js';

const router = Router();

// Login is public. Everything registered after protectAdmin needs an admin token.
router.use('/auth', authRoutes);

router.use(protectAdmin);
router.use('/users', userRoutes);
router.use('/plans', planRoutes);
router.use('/credit-packs', creditPackRoutes);
router.use('/subscriptions', subscriptionRoutes);

export default router;
