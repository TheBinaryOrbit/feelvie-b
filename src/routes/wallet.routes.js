import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { TRANSACTION_TYPES } from '../models/creditTransaction.model.js';

const router = Router();

router.use(protect);

router.get('/', walletController.getWallet);
router.get(
  '/transactions',
  validate({ query: { type: { enum: TRANSACTION_TYPES } } }),
  walletController.listTransactions
);

export default router;
