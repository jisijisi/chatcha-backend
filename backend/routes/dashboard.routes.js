// backend/routes/dashboard.routes.js
import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/api/dashboard/stats', dashboardController.getStats);
router.get('/api/dashboard/messages', dashboardController.getMessages);
router.get('/api/dashboard/users', dashboardController.getUsers);
router.get('/api/dashboard/categories', dashboardController.getCategories);
router.get('/api/dashboard/documents', dashboardController.getDocuments);
router.get('/api/dashboard/subcategories', dashboardController.getSubcategories);
router.get('/api/dashboard/activity', dashboardController.getActivity);
router.get('/api/dashboard/active-users', dashboardController.getActiveUsers);

export default router;
