// backend/server.js

// 1. LOAD ENV VARS FIRST (Critical for ES Modules)
import "dotenv/config"; 

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import WebSocket from 'ws';
const WebSocketServer = WebSocket.Server;

// Configuration & Utils
import { pool, testDatabaseConnection } from "./config/database.js";
import { corsOptions, corsHeaders } from "./config/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { checkMaintenanceMode } from "./middleware/maintenance.js";
import { ragSystem } from "./services/ragService.js";

// Routes Imports
import authRoutes from "./routes/auth.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import integrationRoutes from "./routes/integration.routes.js";
import ragRoutes from "./routes/rag.routes.js";
import ttsRoutes from "./routes/tts.routes.js";
import sttRoutes from "./routes/stt.routes.js";
import attachFullDuplexWS from "./ws/full_duplex_ws.js";
 
import * as userController from "./controllers/userController.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Attach full-duplex WebSocket endpoint
attachFullDuplexWS(server);

// 1. Security & Parsing
app.disable('x-powered-by');
app.use(corsHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Handle malformed JSON bodies explicitly
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: 'Invalid JSON',
            message: err.message
        });
    }
    next(err);
});
app.use(express.static(path.join(__dirname, "../frontend")));

// 2. Health Check
app.get("/health", async (req, res) => {
    let dbStatus = "disconnected";
    try {
        const conn = await pool.getConnection();
        await conn.ping();
        conn.release();
        dbStatus = "connected";
    } catch (e) {}
    res.json({ 
        status: dbStatus === "connected" ? "healthy" : "degraded", 
        database: dbStatus,
        rag_initialized: ragSystem.isInitialized 
    });
});

app.get("/", (req, res) => {
    res.json({ status: "✅ ChatCHA backend running", version: "v2.0-optimized" });
});

// 3. Maintenance Gate
app.use(checkMaintenanceMode);

// 4. API Routes
app.use(authRoutes);
app.use(chatRoutes);
app.use(adminRoutes);
app.use(integrationRoutes);
app.use(ragRoutes);
app.use("/tts", ttsRoutes);
app.use("/stt", sttRoutes);

// User Profile Routes
app.get("/api/user/profile", userController.getUserProfile);
app.post("/api/user/profile", userController.upsertUserProfile);
app.put("/api/user/profile", userController.updateUserProfile);
app.delete("/api/user/account", userController.deleteAccount);

// 5. Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// 6. Start Server
async function startServer() {
    try {
        const dbConnected = await testDatabaseConnection();
        if (!dbConnected) console.warn('⚠️ No DB connection');
        
        console.log('🚀 Initializing RAG System...');
        await ragSystem.initializeRAG();

        server.listen(PORT, () => {
            console.log(`\n✅ SERVER RUNNING: http://localhost:${PORT}`);
            console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔊 TTS Service: Active`);
        });
    } catch (err) {
        console.error("❌ Startup failed:", err);
        process.exit(1);
    }
}
startServer();
