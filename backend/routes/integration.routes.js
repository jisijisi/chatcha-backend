// backend/utils/integration.routes.js

import express from 'express';
import * as integrationController from '../controllers/integrationController.js';
import { adminAuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use('/admin/integrations', adminAuthMiddleware);

router.post("/admin/integrations/google-sheet", integrationController.linkLiveGoogleSheet);
router.get("/admin/integrations", integrationController.getLiveDataSources);
router.put("/admin/integrations/:id", integrationController.updateLiveDataSource);
router.delete("/admin/integrations/:id", integrationController.deleteLiveDataSource);
router.post("/admin/integrations/analyze-sheet", integrationController.analyzeGoogleSheet);

export default router;