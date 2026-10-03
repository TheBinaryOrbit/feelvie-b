import { Router } from 'express';
import * as planController from '../controllers/plan.controller.js';
import { validate } from '../middleware/validate.js';
import { AUDIENCES, BILLING_CYCLES } from '../models/subscriptionPlan.model.js';

const router = Router();

const listSchema = {
  query: {
    audience: { enum: AUDIENCES },
    billingCycle: { enum: BILLING_CYCLES },
  },
};

// Public: the pricing page can be shown before login.
router.get('/', validate(listSchema), planController.listPlans);

export default router;
