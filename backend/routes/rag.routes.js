// backend/utils/rag.routes.js - WITH SSE SUPPORT

import express from 'express';
import * as ragController from '../controllers/ragController.js';
import * as cacheController from '../controllers/cacheController.js';

const router = express.Router();

router.get("/rag/status", ragController.getRagStatus);
router.post("/rag/search", ragController.searchRag);
router.get("/database/stats", ragController.getDatabaseStats);
router.get("/database/documents", ragController.getDatabaseDocuments);

// Debug
router.get("/rag/debug/folders", ragController.debugFolders);
router.get("/rag/debug/files", ragController.debugFiles);
router.get("/rag/debug/chunks", ragController.debugChunks);
router.post("/rag/debug/prompt", ragController.debugPrompt);
router.get("/rag/debug/search-chunks", ragController.debugSearchChunks);

// Cache (Publicly accessible cache status)
router.get("/cache/status", cacheController.getCacheStatus);
router.post("/cache/clear", cacheController.clearCache);
router.post("/cache/regenerate", cacheController.regenerateCache);

// NEW: SSE endpoint for real-time progress
router.get("/cache/progress-stream", cacheController.cacheProgressStream);

export default router;