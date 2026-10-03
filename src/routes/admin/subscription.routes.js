import { Router } from 'express';
import * as subscriptionController from '../../controllers/admin/subscription.controller.js';
import { validate } from '../../middleware/validate.js';
import { SUBSCRIPTION_STATUSES } from '../../models/userSubscription.model.js';

const router = Router();

const listSchema = {
  query: {
    status: { enum: SUBSCRIPTION_STATUSES },
    userId: { pattern: /^[a-f\d]{24}$/i, message: 'query.userId must be a valid id' },
  },
};

router.get('/', validate(listSchema), subscriptionController.listSubscriptions);
router.get('/:id', subscriptionController.getSubscription);

export default router;
