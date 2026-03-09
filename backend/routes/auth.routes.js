
import express from 'express';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post("/auth/connect-google", authController.connectGoogle);
router.get("/auth/google-status", authController.checkGoogleStatus);
router.post("/auth/disconnect-google", authController.disconnectGoogle);
router.post("/auth/request-otp", authController.requestOtp);
router.post("/auth/verify-otp", authController.verifyOtp);
router.post("/auth/validate-employee", authController.validateEmployee);
router.post("/auth/register-employee", authController.registerEmployee);
router.post("/auth/google-login", authController.googleLogin);

export default router;
