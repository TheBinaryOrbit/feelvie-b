import { Router } from 'express';
import * as creditPackController from '../controllers/creditPack.controller.js';

const router = Router();

// Public: packs can be shown before login. Buying one needs an active subscription.
router.get('/', creditPackController.listPacks);

export default router;
