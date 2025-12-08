// backend/utils/auth.routes.js

import express from 'express';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post("/auth/connect-google", authController.connectGoogle);
router.get("/auth/google-status", authController.checkGoogleStatus);
router.post("/auth/disconnect-google", authController.disconnectGoogle);

export default router;