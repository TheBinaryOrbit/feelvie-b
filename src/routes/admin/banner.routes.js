import { Router } from 'express';
import * as bannerController from '../../controllers/admin/banner.controller.js';
import { bannerImageUpload } from '../../middleware/upload.js';

const router = Router();

router.get('/', bannerController.listBanners);
router.get('/:id', bannerController.getBanner);
// multipart/form-data with an "image" file. PATCH also accepts JSON when the image stays.
router.post('/', bannerImageUpload, bannerController.createBanner);
router.patch('/:id', bannerImageUpload, bannerController.updateBanner);
router.delete('/:id', bannerController.deleteBanner);

export default router;
