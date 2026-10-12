import { Router } from 'express';
import * as bannerController from '../controllers/banner.controller.js';

const router = Router();

// Public: the home screen shows banners before login.
router.get('/', bannerController.listBanners);

export default router;
