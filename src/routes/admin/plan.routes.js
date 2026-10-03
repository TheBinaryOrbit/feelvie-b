import { Router } from 'express';
import * as planController from '../../controllers/admin/plan.controller.js';
import { validate } from '../../middleware/validate.js';
import { AUDIENCES, BILLING_CYCLES } from '../../models/subscriptionPlan.model.js';

const router = Router();

const fields = (required) => ({
  name: { required, type: 'string' },
  description: { type: 'string' },
  audience: { required, type: 'string', enum: AUDIENCES },
  billingCycle: { required, type: 'string', enum: BILLING_CYCLES },
  originalPriceInr: { required, type: 'number', min: 1 },
  offerPriceInr: { required, type: 'number', min: 1 },
  creditsPerMonth: { required, type: 'number', integer: true, min: 1 },
});

const createSchema = { body: fields(true) };
const updateSchema = { body: { ...fields(false), isActive: { type: 'boolean' } } };
const listSchema = {
  query: {
    audience: { enum: AUDIENCES },
    billingCycle: { enum: BILLING_CYCLES },
  },
};

router.get('/', validate(listSchema), planController.listPlans);
router.post('/', validate(createSchema), planController.createPlan);
router.get('/:id', planController.getPlan);
router.patch('/:id', validate(updateSchema), planController.updatePlan);
router.delete('/:id', planController.deactivatePlan);

export default router;
