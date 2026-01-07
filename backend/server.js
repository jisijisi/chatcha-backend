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

// Warmup endpoint: triggers RAG initialization non-blocking
app.get("/warmup", (req, res) => {
    if (ragSystem.isInitialized) {
        return res.json({ status: 'ready', rag_initialized: true });
    }
    if (ragSystem.initializing) {
        return res.json({ status: 'initializing', rag_initialized: false });
    }

    // Trigger background initialization without blocking the request
    (async () => {
        try {
            console.log('🟡 /warmup requested: starting background RAG init');
            await ragSystem.initializeRAG();
            console.log('🟢 Background RAG init complete');
        } catch (err) {
            console.error('❌ Background RAG init failed:', err);
        }
    })();

    return res.status(202).json({ status: 'warming', rag_initialized: false });
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

        // Start listening immediately so the process responds quickly on cold start.
        server.listen(PORT, () => {
            console.log(`\n✅ SERVER RUNNING: http://localhost:${PORT}`);
            console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔊 TTS Service: Active`);
        });

        // Initialize RAG asynchronously in the background to avoid blocking startup.
        (async () => {
            try {
                console.log('🚀 Initializing RAG System (background)...');
                await ragSystem.initializeRAG();
                console.log('✅ RAG System ready');
            } catch (e) {
                console.error('❌ RAG initialization failed:', e);
            }
        })();
    } catch (err) {
        console.error("❌ Startup failed:", err);
        process.exit(1);
    }
}
startServer();
