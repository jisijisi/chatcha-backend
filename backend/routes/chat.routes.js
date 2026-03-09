// backend/utils/chat.routes.js

import express from 'express';
import * as chatController from '../controllers/chatController.js';
import * as ragController from '../controllers/ragController.js';
import { jwtAuth } from '../middleware/jwtAuth.js';

const router = express.Router();

// AI Interaction
router.post("/ask", jwtAuth, ragController.askQuestion);
router.post("/ask-stream", jwtAuth, ragController.askQuestionStream);
router.post("/thinking/phrases", jwtAuth, ragController.getThinkingPhrases);
router.post("/follow-up", jwtAuth, ragController.getFollowUpQuestions);

// Smart Personal Assistant
router.post("/personal/clear-session", jwtAuth, ragController.clearPersonalSession);
router.get("/personal/session-info", jwtAuth, ragController.getSessionInfo);

// Chat History Management
router.get("/chats/load", jwtAuth, chatController.loadChats);
router.get("/chats/:sessionId/messages", jwtAuth, chatController.loadSessionMessages);
router.post("/chats/save", jwtAuth, chatController.saveChats);
router.delete("/chats/delete", jwtAuth, chatController.deleteChat);
router.put("/chats/rename", jwtAuth, chatController.renameChat);

export default router;
