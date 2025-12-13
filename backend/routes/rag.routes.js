// backend/routes/rag.routes.js
import express from 'express';
import multer from 'multer';
import * as ragController from '../controllers/ragController.js';
import * as cacheController from '../controllers/cacheController.js';
import * as knowledgeController from '../controllers/knowledgeController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- RAG & Search ---
router.get("/rag/status", ragController.getRagStatus);
router.post("/rag/search", ragController.searchRag);
router.get("/database/stats", ragController.getDatabaseStats);
router.get("/database/documents", ragController.getDatabaseDocuments);

// --- Knowledge Base Management (User Accessible) ---

// 1. Documents (MOVED HERE from Admin only)
router.get("/knowledge/documents", knowledgeController.getDocuments);
router.get("/knowledge/documents/:id", knowledgeController.getDocument);
router.post("/knowledge/documents", knowledgeController.createDocument);
router.put("/knowledge/documents/:id", knowledgeController.updateDocument);
router.delete("/knowledge/documents/:id", knowledgeController.deleteDocument);

// 2. Categories
router.get("/knowledge/categories", knowledgeController.getCategories);

// 3. Subcategories
router.get("/knowledge/subcategories", knowledgeController.getAllSubcategories);
router.get("/knowledge/subcategories/:categoryId", knowledgeController.getSubcategories); // Added specific fetch
router.post("/knowledge/subcategories", knowledgeController.createSubcategory);
router.put("/knowledge/subcategories/:id", knowledgeController.updateSubcategory);
router.delete("/knowledge/subcategories/:id", knowledgeController.deleteSubcategory);

// 4. Tools & Conversion
router.post("/knowledge/convert-file", upload.single("file"), knowledgeController.convertFileToJson);

// --- Cache Management ---
router.get("/cache/status", cacheController.getCacheStatus);
router.post("/cache/clear", cacheController.clearCache);
router.post("/cache/regenerate", cacheController.regenerateCache);
router.get("/cache/progress-stream", cacheController.cacheProgressStream);

// --- Debug ---
router.get("/rag/debug/folders", ragController.debugFolders);
router.get("/rag/debug/files", ragController.debugFiles);
router.get("/rag/debug/chunks", ragController.debugChunks);
router.post("/rag/debug/prompt", ragController.debugPrompt);
router.get("/rag/debug/search-chunks", ragController.debugSearchChunks);

export default router;