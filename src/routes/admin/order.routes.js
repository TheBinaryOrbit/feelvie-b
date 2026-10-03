import { Router } from 'express';
import * as orderController from '../../controllers/admin/order.controller.js';
import { validate } from '../../middleware/validate.js';
import { ORDER_STATUSES, PAYMENT_METHODS, REFUND_STATUSES } from '../../models/order.model.js';
import { LISTING_TYPES } from '../../models/product.model.js';

const router = Router();

const userId = (name) => ({ pattern: /^[a-f\d]{24}$/i, message: `query.${name} must be a valid user id` });

const listSchema = {
  query: {
    status: { enum: ORDER_STATUSES },
    type: { enum: LISTING_TYPES },
    paymentMethod: { enum: PAYMENT_METHODS },
    refundStatus: { enum: REFUND_STATUSES },
    buyer: userId('buyer'),
    seller: userId('seller'),
  },
};
const statusSchema = { body: { status: { required: true, enum: ['confirmed', 'shipped', 'delivered', 'returned'] } } };
const reasonSchema = { body: { reason: { required: true, type: 'string' } } };
const refundSchema = { body: { note: { type: 'string' } } };

router.get('/', validate(listSchema), orderController.listOrders);
router.get('/:id', orderController.getOrder);
router.patch('/:id/status', validate(statusSchema), orderController.updateOrderStatus);
router.post('/:id/cancel', validate(reasonSchema), orderController.cancelOrder);
router.post('/:id/refund-done', validate(refundSchema), orderController.markRefundDone);

export default router;
