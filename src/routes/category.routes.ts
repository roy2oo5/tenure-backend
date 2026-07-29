import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// Protect all routes
router.use(protect);

router.get('/languages', CategoryController.languages);
router.get('/qualifications', CategoryController.qualifications);
router.get('/professions', CategoryController.professions);
router.get('/', CategoryController.list);

export default router;
