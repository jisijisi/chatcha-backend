// backend/utils/admin.routes.js

import express from 'express';
import * as adminController from '../controllers/adminController.js';
import * as knowledgeController from '../controllers/knowledgeController.js';
import * as cacheController from '../controllers/cacheController.js';
import { adminAuthMiddleware } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public Admin Login
router.post("/admin/login", adminController.adminLogin);

// Protected Admin Routes
router.use('/admin', adminAuthMiddleware);

// Dashboard Stats
router.get("/admin/dashboard-stats", adminController.getDashboardStats);
router.get("/admin/dashboard-charts", adminController.getDashboardCharts);
router.get("/admin/dashboard-activity", adminController.getDashboardActivity);
router.get("/admin/dashboard-employees", adminController.getDashboardEmployees);
router.get("/admin/dashboard-knowledge-usage", adminController.getKnowledgeUsage);

// Filtered Stats
router.get("/admin/dashboard-stats-filtered", adminController.getDashboardStatsFiltered);
router.get("/admin/dashboard-charts-filtered", adminController.getDashboardChartsFiltered);
router.get("/admin/dashboard-activity-filtered", adminController.getDashboardActivityFiltered);

// Knowledge Base
router.get("/admin/documents", knowledgeController.getDocuments);
router.get("/admin/documents/:id", knowledgeController.getDocument);
router.post("/admin/documents", knowledgeController.createDocument);
router.put("/admin/documents/:id", knowledgeController.updateDocument);
router.delete("/admin/documents/:id", knowledgeController.deleteDocument);
router.post("/admin/documents/bulk-status", knowledgeController.bulkUpdateStatus);
router.post("/admin/documents/bulk-delete", knowledgeController.bulkDeleteDocuments);
router.post("/admin/convert-file", upload.single("file"), knowledgeController.convertFileToJson);

// Categories
router.get("/admin/categories", knowledgeController.getCategories);
router.post("/admin/categories", knowledgeController.createCategory);
router.put("/admin/categories/:id", knowledgeController.updateCategory);
router.delete("/admin/categories/:id", knowledgeController.deleteCategory);
router.get("/admin/categories/:id/stats", knowledgeController.getCategoryStats);

// Subcategories
router.get("/admin/subcategories/:categoryId", knowledgeController.getSubcategories);
router.get("/admin/all-subcategories", knowledgeController.getAllSubcategories);
router.post("/admin/subcategories", knowledgeController.createSubcategory);
router.put("/admin/subcategories/:id", knowledgeController.updateSubcategory);
router.delete("/admin/subcategories/:id", knowledgeController.deleteSubcategory);
router.get("/admin/subcategories/:id/stats", knowledgeController.getSubcategoryStats);

// Users
router.get("/admin/users", adminController.getUsers);
router.post("/admin/users", adminController.createUser);
router.post("/admin/users/bulk", upload.single("file"), adminController.bulkCreateUsers);
router.put("/admin/users/:id", adminController.updateUser);
router.delete("/admin/users/:id", adminController.deleteUser);

// Permissions
router.get("/admin/permissions/:userId", adminController.getUserPermissions);
router.post("/admin/permissions/:userId", adminController.updateUserPermissions);
router.post("/admin/permissions/bulk", adminController.bulkUpdatePermissions);

// Chat Management
router.get("/admin/chats", adminController.getChats);
router.get("/admin/chats/analytics", adminController.getChatAnalytics);
router.get("/admin/chats/export", adminController.exportChatHistory);
router.get("/admin/chats/:sessionId", adminController.getChatDetails);
router.delete("/admin/chats/:sessionId", adminController.deleteChat);

// Settings & Cache
router.get("/admin/settings", adminController.getSettings);
router.put("/admin/settings", adminController.updateSettings);
router.get("/admin/system/health", adminController.getSystemHealth);
router.post("/admin/cache/clear", adminController.clearCache);
router.post("/admin/cache/regenerate", adminController.regenerateCache);

export default router;