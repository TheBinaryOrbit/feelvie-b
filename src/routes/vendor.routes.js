import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(protect);

// Field formats (phone, email, GST number) are checked by the Vendor model.
const profileRules = {
  description: { type: 'string' },
  contactPhone: { type: 'string' },
  contactEmail: { type: 'string' },
  gstNumber: { type: 'string' },
  pickupAddress: { type: 'string' },
};

const applySchema = { body: { storeName: { required: true, type: 'string' }, ...profileRules } };
const updateSchema = { body: { storeName: { type: 'string' }, ...profileRules } };

router.get('/me', vendorController.getMine);
router.post('/apply', validate(applySchema), vendorController.apply);
router.patch('/me', validate(updateSchema), vendorController.updateMine);

export default router;
