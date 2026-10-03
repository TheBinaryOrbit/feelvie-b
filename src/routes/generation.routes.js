import { Router } from 'express';
import * as generationController from '../controllers/generation.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { tryOnUpload } from '../middleware/upload.js';
import { generationLimiter } from '../middleware/rateLimiter.js';
import { GENERATION_STATUSES } from '../models/generation.model.js';

const router = Router();

router.use(protect);

// multipart/form-data with personImage and garmentImage files.
router.post('/try-on', generationLimiter, tryOnUpload, generationController.createTryOn);
router.get('/', validate({ query: { status: { enum: GENERATION_STATUSES } } }), generationController.listGenerations);
router.get('/:id', generationController.getGeneration);

export default router;
