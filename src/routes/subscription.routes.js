import { Router } from 'express';
import * as subscriptionController from '../controllers/subscription.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(protect);

const subscribeSchema = { body: { planId: { required: true, type: 'string' } } };
const verifySchema = {
  body: {
    razorpay_payment_id: { required: true, type: 'string' },
    razorpay_subscription_id: { required: true, type: 'string' },
    razorpay_signature: { required: true, type: 'string' },
  },
};

router.post('/', validate(subscribeSchema), subscriptionController.subscribe);
router.post('/verify', validate(verifySchema), subscriptionController.verify);
router.get('/me', subscriptionController.getMine);
router.post('/cancel', subscriptionController.cancel);

export default router;
