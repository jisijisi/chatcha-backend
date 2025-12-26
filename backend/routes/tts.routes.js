// backend/routes/tts.routes.js
import express from "express";
import * as ttsController from "../controllers/ttsController.js";

const router = express.Router();

// POST endpoint for generating speech
// Usage: POST /tts/speak
router.post("/speak", ttsController.speak);

export default router;