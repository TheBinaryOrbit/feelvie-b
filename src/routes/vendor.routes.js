import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller.js';
import * as productController from '../controllers/product.controller.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { LISTING_TYPES } from '../models/product.model.js';

const router = Router();

const price = { pattern: /^\d+(\.\d+)?$/, message: 'minPrice and maxPrice must be numbers' };

const vendorProductsSchema = {
  params: { vendorId: { pattern: /^[a-f\d]{24}$/i, message: 'vendorId must be a valid user id' } },
  query: {
    listingType: { enum: LISTING_TYPES },
    sort: { enum: ['newest', 'price_asc', 'price_desc'] },
    minPrice: price,
    maxPrice: price,
  },
};

// Public: one vendor's store page. A user token is optional and adds isWishlisted.
router.get('/:vendorId/products', optionalAuth, validate(vendorProductsSchema), productController.listVendorProducts);

// My own vendor application.
router.get('/me', protect, vendorController.getMine);
router.post('/apply', protect, vendorController.apply);

export default router;
