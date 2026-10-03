import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/me', vendorController.getMine);
router.post('/apply', vendorController.apply);

export default router;
