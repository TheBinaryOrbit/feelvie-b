import { Router } from 'express';
import * as creditPackController from '../../controllers/admin/creditPack.controller.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

const fields = (required) => ({
  name: { required, type: 'string' },
  description: { type: 'string' },
  credits: { required, type: 'number', integer: true, min: 1 },
  priceInr: { required, type: 'number', min: 1 },
  validityDays: { required, type: 'number', integer: true, min: 1, max: 3650 },
});

const createSchema = { body: fields(true) };
const updateSchema = { body: { ...fields(false), isActive: { type: 'boolean' } } };

router.get('/', creditPackController.listPacks);
router.post('/', validate(createSchema), creditPackController.createPack);
router.get('/:id', creditPackController.getPack);
router.patch('/:id', validate(updateSchema), creditPackController.updatePack);
router.delete('/:id', creditPackController.deactivatePack);

export default router;
