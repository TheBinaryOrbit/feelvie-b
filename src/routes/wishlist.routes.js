import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(protect);

const objectId = { required: true, type: 'string', pattern: /^[a-f\d]{24}$/i, message: 'productId must be a valid product id' };

router.get('/', wishlistController.getWishlist);
router.post('/', validate({ body: { productId: objectId } }), wishlistController.addToWishlist);
router.delete('/:productId', validate({ params: { productId: objectId } }), wishlistController.removeFromWishlist);

export default router;
