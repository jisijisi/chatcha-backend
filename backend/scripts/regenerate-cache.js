// backend/scripts/regenerate-cache.js
import dotenv from 'dotenv';
dotenv.config();

// We need to import our RAG system - we'll do this differently
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the cache manager
import { CacheManager } from '../cache-manager.js';

// We'll create a simple RAG system just for cache generation
class SimpleRAG {
    constructor() {
        this.knowledgeBase = {};
        this.chunks = [];
        this.embeddings = [];
        this.embeddingsCachePath = path.join(__dirname, '../embeddings-cache.json');
        this.knowledgeBasePath = path.join(__dirname, '../knowledge-base');
    }

    // Simplified version of your loadKnowledgeBase
    loadKnowledgeBase() {
        const knowledgeBase = {};
        
        const loadFolderRecursively = (currentPath, relativePath = '') => {
            try {
                const items = fs.readdirSync(currentPath);
                
                for (const item of items) {
                    const itemPath = path.join(currentPath, item);
                    const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                    const stats = fs.statSync(itemPath);
                    
                    if (stats.isDirectory()) {
                        loadFolderRecursively(itemPath, itemRelativePath);
                    } else if (item.endsWith('.json')) {
                        try {
                            const data = fs.readFileSync(itemPath, 'utf8');
                            const parsed = JSON.parse(data);
                            const fileKey = itemRelativePath.replace(/\.json$/, '');
                            knowledgeBase[fileKey] = parsed;
                            console.log(`✅ Loaded: ${fileKey}`);
                        } catch (error) {
                            console.error(`❌ Error loading ${itemRelativePath}:`, error.message);
                        }
                    }
                }
            } catch (error) {
                console.error(`❌ Error reading directory ${currentPath}:`, error.message);
            }
        };

        if (fs.existsSync(this.knowledgeBasePath)) {
            loadFolderRecursively(this.knowledgeBasePath);
        }
        
        return knowledgeBase;
    }

    // Simplified chunk extraction
    extractChunks(obj, path = '', chunks = [], parentContext = '', isRoot = true) {
        if (isRoot) {
            for (const [filePath, fileContent] of Object.entries(obj)) {
                this.extractChunks(fileContent, filePath, chunks, filePath, false);
            }
            return chunks;
        }

        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof value === 'string' && value.length > 15) {
                chunks.push({
                    text: value,
                    path: currentPath,
                    context: key
                });
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'string' && item.length > 10) {
                        chunks.push({
                            text: item,
                            path: `${currentPath}[${index}]`,
                            context: key
                        });
                    }
                });
            } else if (typeof value === 'object' && value !== null) {
                this.extractChunks(value, currentPath, chunks, key, false);
            }
        }
        
        return chunks;
    }

    // Embedding generation
    async getEmbedding(text) {
        try {
            const truncatedText = text.length > 2000 ? text.substring(0, 2000) : text;
            
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: "models/text-embedding-004",
                        content: { parts: [{ text: truncatedText }] }
                    })
                }
            );
            
            if (!response.ok) {
                throw new Error(`Embedding API error: ${response.status}`);
            }
            
            const data = await response.json();
            return data.embedding.values;
        } catch (error) {
            console.error("Error generating embedding:", error.message);
            return new Array(768).fill(0);
        }
    }

    async generateAllEmbeddings() {
        console.log("🔄 Generating embeddings for all chunks...");
        
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY not set in environment");
        }
        
        const batchSize = 3; // Smaller batches for reliability
        for (let i = 0; i < this.chunks.length; i += batchSize) {
            const batch = this.chunks.slice(i, i + batchSize);
            const batchEmbeddings = await Promise.all(
                batch.map(chunk => this.getEmbedding(chunk.text))
            );
            this.embeddings.push(...batchEmbeddings);
            
            const progress = Math.min(i + batchSize, this.chunks.length);
            const percentage = ((progress / this.chunks.length) * 100).toFixed(1);
            console.log(`📊 Progress: ${progress}/${this.chunks.length} (${percentage}%)`);
            
            // Add delay to avoid rate limiting
            if (i + batchSize < this.chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log("✅ All embeddings generated!");
    }

    async saveEmbeddingsCache() {
        try {
            const cache = {
                chunks: this.chunks,
                embeddings: this.embeddings,
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(this.embeddingsCachePath, JSON.stringify(cache));
            console.log("💾 Embeddings cached successfully!");
        } catch (error) {
            console.warn("⚠️ Could not save embeddings cache:", error.message);
            throw error;
        }
    }
}

import fs from 'fs';

async function regenerateCache() {
    console.log("🚀 Starting manual cache regeneration...");
    const startTime = Date.now();
    
    try {
        // Initialize systems
        const ragSystem = new SimpleRAG();
        const cacheManager = new CacheManager();
        
        console.log("📁 Loading knowledge base...");
        ragSystem.knowledgeBase = ragSystem.loadKnowledgeBase();
        
        if (Object.keys(ragSystem.knowledgeBase).length === 0) {
            throw new Error("No knowledge base files found!");
        }
        
        console.log(`✅ Loaded ${Object.keys(ragSystem.knowledgeBase).length} knowledge base files`);
        
        // Extract chunks
        console.log("🔧 Extracting chunks from knowledge base...");
        ragSystem.chunks = ragSystem.extractChunks(ragSystem.knowledgeBase);
        console.log(`📚 Extracted ${ragSystem.chunks.length} text chunks`);
        
        if (ragSystem.chunks.length === 0) {
            throw new Error("No chunks extracted from knowledge base!");
        }
        
        // Generate embeddings
        console.log("🔄 Generating embeddings (this may take a while)...");
        await ragSystem.generateAllEmbeddings();
        
        // Save cache
        console.log("💾 Saving cache...");
        await ragSystem.saveEmbeddingsCache();
        
        // Update cache info
        const signature = cacheManager.generateCacheSignature();
        cacheManager.saveCacheInfo(signature);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log("🎉 Cache regeneration complete!");
        console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
        console.log(`📊 Chunks: ${ragSystem.chunks.length}`);
        console.log(`🔢 Embeddings: ${ragSystem.embeddings.length}`);
        console.log(`📁 Files processed: ${signature.fileCount}`);
        
    } catch (error) {
        console.error("❌ Cache regeneration failed:", error);
        process.exit(1);
    }
}

// Run the regeneration
regenerateCache();