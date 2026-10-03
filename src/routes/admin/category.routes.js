import { Router } from 'express';
import * as categoryController from '../../controllers/admin/category.controller.js';
import { categoryImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

const listSchema = {
  query: {
    parentId: { pattern: /^(root|[a-f\d]{24})$/i, message: 'query.parentId must be a category id or "root"' },
    level: { pattern: /^[1-3]$/, message: 'query.level must be 1, 2 or 3' },
  },
};

router.get('/', validate(listSchema), categoryController.listCategories);
router.get('/tree', categoryController.getTree);
router.get('/:id', categoryController.getCategory);
// multipart/form-data with an optional "image" file, or JSON without an image.
router.post('/', categoryImageUpload, categoryController.createCategory);
router.patch('/:id', categoryImageUpload, categoryController.updateCategory);
router.delete('/:id', categoryController.deactivateCategory);

export default router;
