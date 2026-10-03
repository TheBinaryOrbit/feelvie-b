import { Router } from 'express';
import * as creditPackController from '../controllers/creditPack.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const verifySchema = {
  body: {
    razorpay_order_id: { required: true, type: 'string' },
    razorpay_payment_id: { required: true, type: 'string' },
    razorpay_signature: { required: true, type: 'string' },
  },
};

// Public: packs can be shown before login.
router.get('/', creditPackController.listPacks);

// Buying needs a user token and an active subscription.
router.post('/verify', protect, validate(verifySchema), creditPackController.verify);
router.post('/:id/purchase', protect, creditPackController.purchase);

export default router;
