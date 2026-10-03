import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import addressRoutes from './address.routes.js';
import planRoutes from './plan.routes.js';
import creditPackRoutes from './creditPack.routes.js';
import adminRoutes from './admin/index.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/addresses', addressRoutes);
router.use('/plans', planRoutes);
router.use('/credit-packs', creditPackRoutes);
router.use('/admin', adminRoutes);

export default router;
