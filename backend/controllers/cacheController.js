// controllers/cacheController.js - WITH REAL-TIME PROGRESS STREAMING
import { cacheService } from '../services/cacheService.js';
import { databaseCacheManager, ragSystem } from '../services/ragService.js';

// Store active SSE connections
const progressClients = new Map();

export const getCacheStatus = async (req, res) => {
    const cacheInfo = databaseCacheManager.getCacheInfo();
    const isValid = await databaseCacheManager.isCacheValid();
    const dbStats = await databaseCacheManager.getDatabaseStats();
    const cacheStats = cacheService.getCacheStats();
    const isFresh = cacheService.isCacheFresh();
    
    res.json({
        cache_valid: isValid,
        cache_fresh: isFresh,
        cache_info: cacheInfo,
        cache_stats: cacheStats,
        rag_initialized: ragSystem.isInitialized,
        chunks_count: ragSystem.chunks.length,
        embeddings_count: ragSystem.embeddings.length,
        knowledge_base_files: Object.keys(ragSystem.knowledgeBase).length,
        database_stats: dbStats,
        schema: 'new_relational_v1'
    });
};

export const clearCache = async (req, res) => {
    try {
        // Backup before clearing
        const backupCount = await cacheService.backupCache();
        
        const success = databaseCacheManager.clearCache();
        const cacheCleared = cacheService.clearCache();
        
        res.json({ 
            success: success && cacheCleared,
            backups_created: backupCount,
            message: success ? "Cache cleared successfully" : "Failed to clear cache",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// NEW: SSE endpoint for real-time progress updates
export const cacheProgressStream = (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders(); // Important: flush headers to establish connection
    
    // Generate unique client ID
    const clientId = Date.now() + Math.random();
    
    console.log(`📡 SSE client connected: ${clientId}`);
    
    // Store client connection
    progressClients.set(clientId, res);
    
    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
    
    // Send a heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
        try {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', time: Date.now() })}\n\n`);
            }
        } catch (err) {
            // Connection closed
        }
    }, 30000);
    
    // Handle client disconnect
    req.on('close', () => {
        console.log(`📡 SSE client disconnected: ${clientId}`);
        clearInterval(heartbeatInterval);
        progressClients.delete(clientId);
    });
    
    // Handle errors
    req.on('error', (err) => {
        console.error(`❌ SSE connection error for client ${clientId}:`, err);
        clearInterval(heartbeatInterval);
        progressClients.delete(clientId);
    });
};

// Helper function to broadcast progress to all connected clients
export const broadcastProgress = (data) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    progressClients.forEach((client, clientId) => {
        try {
            // Check if connection is still writable
            if (client.writableEnded) {
                progressClients.delete(clientId);
                return;
            }
            
            client.write(message, (err) => {
                if (err) {
                    console.error(`Failed to send to client ${clientId}:`, err.message);
                    progressClients.delete(clientId);
                }
            });
        } catch (error) {
            console.error(`Error sending to client ${clientId}:`, error.message);
            progressClients.delete(clientId);
        }
    });
};

export const regenerateCache = async (req, res) => {
    try {
        console.log('🔄 Admin triggered cache regeneration...');
        
        // Return immediately to client
        res.json({ 
            success: true,
            message: 'Cache regeneration started. Connect to /cache/progress-stream for updates.',
            timestamp: new Date().toISOString()
        });
        
        // Start regeneration in background
        // We don't await this, it runs in the background
        regenerateCacheWithProgress().catch(err => {
            console.error('❌ Cache regeneration error:', err);
            broadcastProgress({
                type: 'error',
                message: err.message || 'Cache regeneration failed',
                error: error.stack
            });
        });
        
    } catch (error) {
        console.error('❌ Cache regeneration error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Actual regeneration with progress broadcasting
async function regenerateCacheWithProgress() {
    try {
        // Stage 1: Starting (5%)
        broadcastProgress({
            type: 'progress',
            stage: 'starting',
            progress: 5,
            message: 'Initializing cache regeneration...'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Stage 2: Clearing (10%)
        broadcastProgress({
            type: 'progress',
            stage: 'clearing',
            progress: 10,
            message: 'Clearing old cache data...'
        });
        
        databaseCacheManager.clearCache();
        cacheService.clearCache();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Stage 3: Loading (15%)
        broadcastProgress({
            type: 'progress',
            stage: 'loading',
            progress: 15,
            message: 'Loading knowledge base documents...'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Stage 4: Processing (20%)
        broadcastProgress({
            type: 'progress',
            stage: 'processing',
            progress: 20,
            message: 'Processing and chunking content...'
        });
        
        // Hook into RAG system to send granular progress
        const originalLog = console.log;
        let lastProgress = 20;
        
        console.log = function(...args) {
            originalLog.apply(console, args);
            
            const message = args.join(' ');
            
            // Parse progress from RAG system logs
            const progressMatch = message.match(/Progress:\s*(\d+)\/(\d+)\s*\((\d+\.?\d*)%\)/);
            if (progressMatch) {
                const current = parseInt(progressMatch[1]);
                const total = parseInt(progressMatch[2]);
                const percentage = parseFloat(progressMatch[3]);
                
                // Map percentage (0-100) to our range (20-90)
                const mappedProgress = 20 + (percentage * 0.7);
                
                // Only send updates every 2% or when stage changes significantly
                if (mappedProgress >= lastProgress + 2 || percentage >= 99) {
                    lastProgress = mappedProgress;
                    
                    broadcastProgress({
                        type: 'progress',
                        stage: 'embedding',
                        progress: Math.min(90, Math.round(mappedProgress)),
                        message: `Generating embeddings... ${current}/${total} chunks`,
                        detail: {
                            current,
                            total,
                            percentage: percentage.toFixed(1)
                        }
                    });
                }
            }
            
            // Also capture completion messages
            if (message.includes('All embeddings generated') || message.includes('✅ RAG system initialized')) {
                broadcastProgress({
                    type: 'progress',
                    stage: 'finalizing',
                    progress: 95,
                    message: 'Finalizing embeddings and saving cache...'
                });
            }
        };
        
        // Actually regenerate
        await ragSystem.regenerateEmbeddings();
        
        // Restore original console.log
        console.log = originalLog;
        
        // Stage 5: Finalizing (95%)
        broadcastProgress({
            type: 'progress',
            stage: 'finalizing',
            progress: 95,
            message: 'Finalizing cache generation...'
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Stage 6: Complete (100%)
        broadcastProgress({
            type: 'progress',
            stage: 'complete',
            progress: 100,
            message: 'Cache regeneration complete!'
        });
        
        // Send completion event with stats
        broadcastProgress({
            type: 'complete',
            success: true,
            data: {
                chunks: ragSystem.chunks.length,
                embeddings: ragSystem.embeddings.length,
                files: Object.keys(ragSystem.knowledgeBase).length
            }
        });
        
        console.log('✅ Cache regenerated successfully with real-time updates');
        
    } catch (error) {
        console.error('❌ Cache regeneration failed:', error);
        
        // Restore original console.log
        console.log = originalLog;
        
        broadcastProgress({
            type: 'error',
            message: error.message || 'Cache regeneration failed',
            error: error.stack
        });
        
        throw error;
    }
}

// New endpoint for cache maintenance
export const maintainCache = async (req, res) => {
    try {
        const { action } = req.body;
        
        let result = {};
        
        switch (action) {
            case 'backup':
                const backupCount = await cacheService.backupCache();
                result = { 
                    success: true, 
                    message: `Created ${backupCount} backup files`,
                    backups: backupCount 
                };
                break;
                
            case 'cleanup':
                const cleanedCount = cacheService.cleanupOldBackups();
                result = { 
                    success: true, 
                    message: `Cleaned up ${cleanedCount} old backup files`,
                    cleaned: cleanedCount 
                };
                break;
                
            case 'stats':
                const stats = cacheService.getCacheStats();
                const isFresh = cacheService.isCacheFresh();
                result = { 
                    success: true, 
                    stats: stats,
                    is_fresh: isFresh 
                };
                break;
                
            default:
                return res.status(400).json({ 
                    error: "Invalid action. Use 'backup', 'cleanup', or 'stats'" 
                });
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ Cache maintenance error:', error);
        res.status(500).json({ error: error.message });
    }
};