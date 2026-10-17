import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ORDER_STATUSES, PAYMENT_METHODS, MAX_ORDER_QUANTITY } from '../models/order.model.js';
import { LISTING_TYPES } from '../models/product.model.js';

const router = Router();

router.use(protect);

const objectId = (name) => ({ type: 'string', pattern: /^[a-f\d]{24}$/i, message: `${name} must be a valid id` });

const createSchema = {
  body: {
    productId: { required: true, ...objectId('productId') },
    size: { required: true, type: 'string' },
    quantity: { type: 'number', integer: true, min: 1, max: MAX_ORDER_QUANTITY },
    addressId: { required: true, ...objectId('addressId') },
    paymentMethod: { required: true, enum: PAYMENT_METHODS },
    // Rentals only.
    startDate: { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}/, message: 'body.startDate must be a date as YYYY-MM-DD' },
    days: { type: 'number', integer: true, min: 1 },
  },
};

const verifySchema = {
  body: {
    razorpay_order_id: { required: true, type: 'string' },
    razorpay_payment_id: { required: true, type: 'string' },
    razorpay_signature: { required: true, type: 'string' },
  },
};

const listSchema = { query: { status: { enum: ORDER_STATUSES }, type: { enum: LISTING_TYPES } } };
// Sellers never see orders that are still waiting for payment.
const sellingListSchema = {
  query: { status: { enum: ORDER_STATUSES.filter((s) => s !== 'pending_payment') }, type: { enum: LISTING_TYPES } },
};
const statusSchema = { body: { status: { required: true, enum: ['confirmed', 'shipped', 'delivered', 'returned'] } } };
const reasonSchema = { body: { reason: { required: true, type: 'string' } } };
const optionalReasonSchema = { body: { reason: { type: 'string' } } };

// Orders I received as a seller. Registered before "/:id" so "selling" is not read as an id.
router.get('/selling', validate(sellingListSchema), orderController.listSellingOrders);
router.get('/selling/:id', orderController.getSellingOrder);
router.patch('/selling/:id/status', validate(statusSchema), orderController.updateSellingOrderStatus);
router.post('/selling/:id/cancel', validate(reasonSchema), orderController.cancelSellingOrder);

// Orders I placed as a buyer.
router.post('/', validate(createSchema), orderController.createOrder);
router.get('/', validate(listSchema), orderController.listMyOrders);
router.get('/:id', orderController.getMyOrder);
router.post('/:id/checkout', orderController.getCheckout);
router.post('/:id/verify', validate(verifySchema), orderController.verifyPayment);
router.post('/:id/cancel', validate(optionalReasonSchema), orderController.cancelMyOrder);

export default router;
