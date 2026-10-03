import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';

const router = Router();

// Public: menus and category pages can be shown before login.
router.get('/', categoryController.getTree);
router.get('/:slug', categoryController.getBySlug);

export default router;
