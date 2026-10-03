import { Router } from 'express';
import * as userController from '../../controllers/admin/user.controller.js';

const router = Router();

router.get('/', userController.listUsers);
router.get('/:id', userController.getUser);
router.delete('/:id', userController.deleteUser);

export default router;
