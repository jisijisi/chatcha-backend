// backend/utils/chat.routes.js

import express from 'express';
import * as chatController from '../controllers/chatController.js';
import * as ragController from '../controllers/ragController.js';

const router = express.Router();

// AI Interaction
router.post("/ask", ragController.askQuestion);
router.post("/thinking/phrases", ragController.getThinkingPhrases);

// Smart Personal Assistant
router.post("/personal/clear-session", ragController.clearPersonalSession);
router.get("/personal/session-info", ragController.getSessionInfo);

// Chat History Management
router.get("/chats/load", chatController.loadChats);
router.post("/chats/save", chatController.saveChats);
router.delete("/chats/delete", chatController.deleteChat);
router.put("/chats/rename", chatController.renameChat);

export default router;
