import express from 'express';
import * as speechController from '../controllers/speechController.js';
import { adminAuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public read access (optional, if frontend needs it without auth, but usually admin only)
// For now, let's keep it protected or at least admin-only for modification
router.get('/rules', adminAuthMiddleware, speechController.getRules);
router.post('/rules', adminAuthMiddleware, speechController.addRule);
router.put('/rules/:id', adminAuthMiddleware, speechController.updateRule);
router.delete('/rules/:id', adminAuthMiddleware, speechController.deleteRule);

export default router;
