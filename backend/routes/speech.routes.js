import express from 'express';
import * as speechController from '../controllers/speechController.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { pool } from '../config/database.js';

const router = express.Router();

// Middleware: Check for Speech Settings Access
async function requireSpeechSettingsAccess(req, res, next) {
  try {
    // If admin role in token, bypass
    if (req.user && req.user.role === 'admin') {
        return next();
    }

    const userEmail = req.user ? req.user.email : req.header('X-User-Email');
    if (!userEmail) {
      return res.status(403).json({ error: 'Forbidden: No user email' });
    }

    const [employees] = await pool.execute(
      'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
      [userEmail]
    );
    if (employees.length === 0) {
      return res.status(403).json({ error: 'Forbidden: User inactive or not found' });
    }
    const employeeId = employees[0].id;

    const [rows] = await pool.execute(
      `SELECT 1 
       FROM employee_access_permissions 
       WHERE employee_id = ? 
         AND (
           source_id IN (
             SELECT id FROM live_data_sources 
             WHERE source_type = 'internal_flag' AND name = 'SPEECH_SETTINGS_ACCESS'
           )
           OR (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
         )
       LIMIT 1`,
      [employeeId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden: Speech Settings access not granted' });
    }
    next();
  } catch (error) {
    console.error('Speech Settings access middleware error:', error);
    res.status(403).json({ error: 'Forbidden' });
  }
}

// Routes now use jwtAuth + permission check instead of just adminAuthMiddleware
router.get('/rules', jwtAuth, requireSpeechSettingsAccess, speechController.getRules);
router.post('/rules', jwtAuth, requireSpeechSettingsAccess, speechController.addRule);
router.put('/rules/:id', jwtAuth, requireSpeechSettingsAccess, speechController.updateRule);
router.delete('/rules/:id', jwtAuth, requireSpeechSettingsAccess, speechController.deleteRule);

export default router;
