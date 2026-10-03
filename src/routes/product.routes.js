import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { productImagesUpload } from '../middleware/upload.js';
import { LISTING_TYPES } from '../models/product.model.js';

const router = Router();

const price = { pattern: /^\d+(\.\d+)?$/, message: 'minPrice and maxPrice must be numbers' };

const storeListSchema = {
  query: {
    listingType: { enum: LISTING_TYPES },
    sort: { enum: ['newest', 'price_asc', 'price_desc'] },
    minPrice: price,
    maxPrice: price,
  },
};
const myListSchema = { query: { listingType: { enum: LISTING_TYPES } } };

// Store: public, like the category tree.
router.get('/', validate(storeListSchema), productController.listProducts);

// The owner's own products. Registered before "/:slug" so "mine" is not read as a slug.
router.get('/mine', protect, validate(myListSchema), productController.listMyProducts);
router.get('/mine/:id', protect, productController.getMyProduct);

router.get('/:slug', productController.getProduct);

// multipart/form-data: text fields plus image files in the "images" field.
router.post('/', protect, productImagesUpload, productController.createProduct);
router.patch('/:id', protect, productImagesUpload, productController.updateProduct);
router.delete('/:id', protect, productController.deleteProduct);

export default router;
