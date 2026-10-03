import { Router } from 'express';
import { protectAdmin } from '../../middleware/auth.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import planRoutes from './plan.routes.js';
import creditPackRoutes from './creditPack.routes.js';
import subscriptionRoutes from './subscription.routes.js';
import generationRoutes from './generation.routes.js';
import categoryRoutes from './category.routes.js';
import vendorRoutes from './vendor.routes.js';
import productRoutes from './product.routes.js';

const router = Router();

// Login is public. Everything registered after protectAdmin needs an admin token.
router.use('/auth', authRoutes);

router.use(protectAdmin);
router.use('/users', userRoutes);
router.use('/plans', planRoutes);
router.use('/credit-packs', creditPackRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/generations', generationRoutes);
router.use('/categories', categoryRoutes);
router.use('/vendors', vendorRoutes);
router.use('/products', productRoutes);

export default router;
