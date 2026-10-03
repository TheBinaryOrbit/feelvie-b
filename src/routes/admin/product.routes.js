import { Router } from 'express';
import * as productController from '../../controllers/admin/product.controller.js';
import { validate } from '../../middleware/validate.js';
import { LISTING_TYPES } from '../../models/product.model.js';

const router = Router();

const listSchema = {
  query: {
    listingType: { enum: LISTING_TYPES },
    owner: { pattern: /^[a-f\d]{24}$/i, message: 'query.owner must be a valid user id' },
  },
};
const blockSchema = { body: { reason: { required: true, type: 'string' } } };

router.get('/', validate(listSchema), productController.listProducts);
router.get('/:id', productController.getProduct);
router.post('/:id/block', validate(blockSchema), productController.blockProduct);
router.post('/:id/unblock', productController.unblockProduct);

export default router;
