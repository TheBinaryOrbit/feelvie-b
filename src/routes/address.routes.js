import { Router } from 'express';
import * as addressController from '../controllers/address.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// All address routes act on the logged-in user's own addresses.
router.use(protect);

router.get('/', addressController.listAddresses);
router.post('/', addressController.createAddress);
router.get('/:id', addressController.getAddress);
router.patch('/:id', addressController.updateAddress);
router.patch('/:id/default', addressController.setDefaultAddress);
router.delete('/:id', addressController.deleteAddress);

export default router;
