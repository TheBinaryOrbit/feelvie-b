import { Router } from 'express';
import * as generationController from '../../controllers/admin/generation.controller.js';
import { validate } from '../../middleware/validate.js';
import { GENERATION_STATUSES } from '../../models/generation.model.js';

const router = Router();

const listSchema = {
  query: {
    status: { enum: GENERATION_STATUSES },
    userId: { pattern: /^[a-f\d]{24}$/i, message: 'query.userId must be a valid id' },
  },
};

router.get('/', validate(listSchema), generationController.listGenerations);
router.get('/:id', generationController.getGeneration);

export default router;
