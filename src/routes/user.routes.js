import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { protect, authorize, selfOrAdmin } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/', authorize('admin'), userController.getUsers);
router.get('/:id', selfOrAdmin, userController.getUser);
router.patch('/:id', selfOrAdmin, userController.updateUser);
router.delete('/:id', authorize('admin'), userController.deleteUser);

export default router;
