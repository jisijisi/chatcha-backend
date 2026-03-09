import express from 'express';
import * as themeController from '../controllers/themeController.js';
import { adminAuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public route for loading the theme
router.get('/api/theme/active', themeController.getActiveTheme);

// Admin routes
router.get('/api/admin/themes', adminAuthMiddleware, themeController.getThemes);
router.post('/api/admin/themes', adminAuthMiddleware, themeController.createTheme);
router.post('/api/admin/themes/generate', adminAuthMiddleware, themeController.generateThemeFromPrompt);
router.put('/api/admin/themes/:id', adminAuthMiddleware, themeController.updateTheme);
router.post('/api/admin/themes/:id/activate', adminAuthMiddleware, themeController.activateTheme);
router.delete('/api/admin/themes/:id', adminAuthMiddleware, themeController.deleteTheme);
router.post('/api/admin/themes/upload-avatar', adminAuthMiddleware, themeController.uploadAvatar);

export default router;
