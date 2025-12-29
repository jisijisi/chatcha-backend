// backend/routes/suggestions.routes.js
import express from 'express';
import * as suggestionsController from '../controllers/suggestionsController.js';

const router = express.Router();

/**
 * GET /api/suggestions/get
 * Get the stored suggested questions for the current user
 * If not generated yet, will generate and store them
 */
router.get('/get', suggestionsController.getSuggestedQuestion);

/**
 * POST /api/suggestions/generate
 * Force generate new suggested questions based on current access control
 */
router.post('/generate', suggestionsController.generateSuggestedQuestion);

export default router;