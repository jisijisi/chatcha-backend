// backend/server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer"; 

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
import * as userController from "./controllers/userController.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Security & Parsing
app.disable('x-powered-by');
app.use(corsHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "../frontend")));

// 2. Health Check (Bypasses Maintenance Mode)
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

// User Profile Route
app.put("/api/user/profile", userController.updateUserProfile);

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
        
        app.listen(PORT, () => {
            console.log(`\n✅ SERVER RUNNING: http://localhost:${PORT}`);
            console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (err) {
        console.error("❌ Startup failed:", err);
        process.exit(1);
    }
}
startServer();