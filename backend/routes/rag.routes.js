// backend/routes/rag.routes.js
import express from 'express';
import multer from 'multer';
import * as ragController from '../controllers/ragController.js';
import * as cacheController from '../controllers/cacheController.js';
import * as knowledgeController from '../controllers/knowledgeController.js';
import * as adminController from '../controllers/adminController.js';
import { pool } from '../config/database.js';
import { jwtAuth } from '../middleware/jwtAuth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware: Require KB Settings access for write operations
async function requireKbSettingsAccess(req, res, next) {
  try {
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
             WHERE source_type = 'internal_flag' AND name = 'KB_SETTINGS_ACCESS'
           )
           OR (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
         )
       LIMIT 1`,
      [employeeId]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden: KB Settings access not granted' });
    }
    next();
  } catch (error) {
    console.error('KB Settings access middleware error:', error);
    res.status(403).json({ error: 'Forbidden' });
  }
}

// --- RAG & Search ---
router.get("/rag/status", ragController.getRagStatus);
router.post("/rag/search", jwtAuth, ragController.searchRag);
router.get("/database/stats", ragController.getDatabaseStats);
router.get("/database/documents", ragController.getDatabaseDocuments);

// --- Feature Access Checks ---
router.get("/features/kb-settings/access", adminController.checkKbSettingsAccess);
router.get("/features/speech-settings/access", adminController.checkSpeechSettingsAccess);
router.get("/permissions/stream", adminController.permissionsStream);

// --- Knowledge Base Management (User Accessible) ---

// 1. Documents (MOVED HERE from Admin only)
router.get("/knowledge/documents", jwtAuth, knowledgeController.getDocuments);
router.get("/knowledge/documents/:id", jwtAuth, knowledgeController.getDocument);
router.post("/knowledge/documents", jwtAuth, requireKbSettingsAccess, knowledgeController.createDocument);
router.put("/knowledge/documents/:id", jwtAuth, requireKbSettingsAccess, knowledgeController.updateDocument);
router.delete("/knowledge/documents/:id", jwtAuth, requireKbSettingsAccess, knowledgeController.deleteDocument);

// 2. Categories
router.get("/knowledge/categories", jwtAuth, knowledgeController.getCategories);

// 3. Subcategories
router.get("/knowledge/subcategories", jwtAuth, knowledgeController.getAllSubcategories);
router.get("/knowledge/subcategories/:categoryId", jwtAuth, knowledgeController.getSubcategories); // Added specific fetch
router.post("/knowledge/subcategories", jwtAuth, requireKbSettingsAccess, knowledgeController.createSubcategory);
router.put("/knowledge/subcategories/:id", jwtAuth, requireKbSettingsAccess, knowledgeController.updateSubcategory);
router.delete("/knowledge/subcategories/:id", jwtAuth, requireKbSettingsAccess, knowledgeController.deleteSubcategory);

// 4. Tools & Conversion
router.post("/knowledge/convert-file", jwtAuth, requireKbSettingsAccess, upload.single("file"), knowledgeController.convertFileToJson);

// --- Cache Management ---
router.get("/cache/status", jwtAuth, cacheController.getCacheStatus);
router.post("/cache/clear", jwtAuth, cacheController.clearCache);
router.post("/cache/regenerate", jwtAuth, requireKbSettingsAccess, cacheController.regenerateCache);
router.get("/cache/progress-stream", jwtAuth, cacheController.cacheProgressStream);

// --- Debug ---
router.get("/rag/debug/folders", jwtAuth, ragController.debugFolders);
router.get("/rag/debug/files", jwtAuth, ragController.debugFiles);
router.get("/rag/debug/chunks", jwtAuth, ragController.debugChunks);
router.post("/rag/debug/prompt", jwtAuth, ragController.debugPrompt);
router.get("/rag/debug/search-chunks", jwtAuth, ragController.debugSearchChunks);

export default router;
