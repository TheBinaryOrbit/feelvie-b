import { Router } from 'express';
import * as userController from '../../controllers/admin/user.controller.js';
import * as walletController from '../../controllers/admin/wallet.controller.js';
import { validate } from '../../middleware/validate.js';
import { TRANSACTION_TYPES } from '../../models/creditTransaction.model.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();

const adjustSchema = {
  body: {
    action: { required: true, type: 'string', enum: ['grant', 'debit'] },
    credits: { required: true, type: 'number', integer: true, min: 1, max: 1_000_000 },
    expiresInDays: { type: 'number', integer: true, min: 1, max: 3650 },
    reason: { required: true, type: 'string' },
  },
};

const requireExpiryForGrant = (req, _res, next) => {
  if (req.body.action === 'grant' && req.body.expiresInDays === undefined) {
    return next(ApiError.badRequest('Validation failed', ['body.expiresInDays is required for a grant']));
  }
  next();
};

router.get('/', userController.listUsers);
router.get('/:id', userController.getUser);
router.delete('/:id', userController.deleteUser);

router.get('/:id/wallet', walletController.getUserWallet);
router.get(
  '/:id/wallet/transactions',
  validate({ query: { type: { enum: TRANSACTION_TYPES } } }),
  walletController.listUserTransactions
);
router.post('/:id/credits', validate(adjustSchema), requireExpiryForGrant, walletController.adjustCredits);

export default router;
