import { Router } from 'express';
import * as vendorController from '../../controllers/admin/vendor.controller.js';
import { validate } from '../../middleware/validate.js';
import { VENDOR_STATUSES } from '../../models/vendor.model.js';

const router = Router();

const listSchema = { query: { status: { enum: VENDOR_STATUSES } } };
const reasonSchema = { body: { reason: { required: true, type: 'string' } } };

router.get('/', validate(listSchema), vendorController.listVendors);
router.get('/:id', vendorController.getVendor);
router.post('/:id/approve', vendorController.approveVendor);
router.post('/:id/reject', validate(reasonSchema), vendorController.rejectVendor);
router.post('/:id/suspend', validate(reasonSchema), vendorController.suspendVendor);
router.post('/:id/reinstate', vendorController.reinstateVendor);

export default router;
