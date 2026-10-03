import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { protect, selfOnly } from '../middleware/auth.js';

const router = Router();

// Users manage only their own account. Admin user management lives under /admin/users.
router.use(protect);

router.get('/:id', selfOnly, userController.getUser);
router.patch('/:id', selfOnly, userController.updateUser);

export default router;
