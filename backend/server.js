// server.js - Enhanced with Multi-Folder & File Universal Semantic RAG and Manual Caching
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// AI Behavior Configuration
const AI_BEHAVIOR = {
  identity: {
    name: "CHA",
    role: "HR Assistant",
    company: "CDO Foodsphere, Inc.",
  },
  responseRules: {
    always: [
      "Be specific and reference actual policies when possible",
      "Provide actionable information",
      "Maintain professional but approachable tone",
      "Use bullet points or numbered lists for complex information",
      "Acknowledge when information isn't available in knowledge base"
    ],
    never: [
      "Don't say 'contact HR' if the information is in the context",
      "Don't make up policies that aren't in the knowledge base",
      "Don't provide personal opinions",
      "Don't give legal advice beyond stated policies"
    ]
  }
};

const PROMPT_TEMPLATES = {
  standard: `You are {name}, {role} at {company}.

CONTEXT FROM KNOWLEDGE BASE:
{context}

USER QUESTION:
{question}

INSTRUCTIONS:
- Answer based strictly on the provided context
- Be specific and reference actual policies, programs, or procedures
- If the context contains the answer, provide complete details
- If context is insufficient, acknowledge the limitation
- Use clear, professional language
- Structure complex information with bullet points or numbered lists
- Do not suggest contacting HR if the information is already in the context

RESPONSE:`,

  followUp: `Based on our previous conversation and the knowledge base context below, continue providing helpful HR assistance:

PREVIOUS CONTEXT:
{history}

CURRENT CONTEXT:
{ragContext}

USER FOLLOW-UP:
{question}

Continue the conversation naturally while maintaining accuracy and professionalism.`
};

// Cache Manager Class
class CacheManager {
    constructor(knowledgeBasePath = 'knowledge-base', cachePath = 'embeddings-cache.json') {
        this.knowledgeBasePath = path.join(__dirname, knowledgeBasePath);
        this.cachePath = path.join(__dirname, cachePath);
        this.cacheInfoPath = path.join(__dirname, 'cache-info.json');
    }

    /**
     * Generate cache signature based on knowledge base files
     */
    generateCacheSignature() {
        try {
            const signature = {
                timestamp: new Date().toISOString(),
                files: {},
                totalSize: 0,
                fileCount: 0
            };

            const scanDirectory = (dir, relativePath = '') => {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                    const stats = fs.statSync(itemPath);
                    
                    if (stats.isDirectory()) {
                        scanDirectory(itemPath, itemRelativePath);
                    } else if (item.endsWith('.json')) {
                        const fileStats = fs.statSync(itemPath);
                        const fileContent = fs.readFileSync(itemPath, 'utf8');
                        const fileHash = this.simpleHash(fileContent);
                        
                        signature.files[itemRelativePath] = {
                            size: fileStats.size,
                            modified: stats.mtime.toISOString(),
                            hash: fileHash
                        };
                        signature.totalSize += fileStats.size;
                        signature.fileCount++;
                    }
                }
            };

            if (fs.existsSync(this.knowledgeBasePath)) {
                scanDirectory(this.knowledgeBasePath);
            }

            signature.signature = this.simpleHash(JSON.stringify(signature.files));
            return signature;
        } catch (error) {
            console.error('Error generating cache signature:', error);
            return null;
        }
    }

    /**
     * Simple hash function for file content
     */
    simpleHash(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    /**
     * Check if cache is valid and up-to-date
     */
    isCacheValid() {
        try {
            if (!fs.existsSync(this.cachePath) || !fs.existsSync(this.cacheInfoPath)) {
                return false;
            }

            const cacheInfo = JSON.parse(fs.readFileSync(this.cacheInfoPath, 'utf8'));
            const currentSignature = this.generateCacheSignature();

            if (!currentSignature || !cacheInfo.signature) {
                return false;
            }

            return currentSignature.signature === cacheInfo.signature;
        } catch (error) {
            console.error('Error checking cache validity:', error);
            return false;
        }
    }

    /**
     * Save cache information
     */
    saveCacheInfo(cacheSignature) {
        try {
            const info = {
                ...cacheSignature,
                cacheGenerated: new Date().toISOString(),
                cacheSize: fs.existsSync(this.cachePath) ? fs.statSync(this.cachePath).size : 0
            };
            
            fs.writeFileSync(this.cacheInfoPath, JSON.stringify(info, null, 2));
            console.log('✅ Cache information saved');
        } catch (error) {
            console.error('Error saving cache info:', error);
        }
    }

    /**
     * Get cache information
     */
    getCacheInfo() {
        try {
            if (fs.existsSync(this.cacheInfoPath)) {
                return JSON.parse(fs.readFileSync(this.cacheInfoPath, 'utf8'));
            }
            return null;
        } catch (error) {
            console.error('Error reading cache info:', error);
            return null;
        }
    }

    /**
     * Delete cache files
     */
    clearCache() {
        try {
            if (fs.existsSync(this.cachePath)) {
                fs.unlinkSync(this.cachePath);
                console.log('✅ Embeddings cache deleted');
            }
            if (fs.existsSync(this.cacheInfoPath)) {
                fs.unlinkSync(this.cacheInfoPath);
                console.log('✅ Cache info deleted');
            }
            return true;
        } catch (error) {
            console.error('Error clearing cache:', error);
            return false;
        }
    }
}

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "../frontend")));

// Multi-Folder & File Universal Semantic RAG System
class MultiFolderSemanticRAG {
    constructor() {
        this.knowledgeBase = {};
        this.chunks = [];
        this.embeddings = [];
        this.isInitialized = false;
        this.embeddingsCachePath = path.join(__dirname, 'embeddings-cache.json');
        this.knowledgeBasePath = path.join(__dirname, 'knowledge-base');
        console.log("🔧 Initializing Multi-Folder & File Universal Semantic RAG System...");
    }
    
    /**
     * Recursively load knowledge base from folder structure
     */
    loadKnowledgeBase() {
        try {
            const knowledgeBase = {};
            
            console.log("📁 Checking knowledge-base directory structure...");
            console.log("📁 Root knowledge base path:", this.knowledgeBasePath);
            
            if (!fs.existsSync(this.knowledgeBasePath)) {
                console.warn("⚠️ knowledge-base directory not found, creating it...");
                fs.mkdirSync(this.knowledgeBasePath, { recursive: true });
                return knowledgeBase;
            }
            
            // Recursively load all JSON files from the folder structure
            this.loadFolderRecursively(this.knowledgeBasePath, knowledgeBase, '');
            
            console.log("✅ All knowledge base folders and files loaded successfully");
            console.log("📊 Total categories in knowledge base:", Object.keys(knowledgeBase).length);
            
            return knowledgeBase;
            
        } catch (error) {
            console.error("❌ Failed to load knowledge base:", error);
            return {};
        }
    }
    
    /**
     * Recursive function to load folders and files
     */
    loadFolderRecursively(currentPath, knowledgeBase, relativePath) {
        try {
            const items = fs.readdirSync(currentPath);
            
            for (const item of items) {
                const itemPath = path.join(currentPath, item);
                const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                const stats = fs.statSync(itemPath);
                
                if (stats.isDirectory()) {
                    console.log(`📁 Loading directory: ${itemRelativePath}`);
                    // Recursively load subdirectory
                    this.loadFolderRecursively(itemPath, knowledgeBase, itemRelativePath);
                } else if (item.endsWith('.json')) {
                    this.loadJsonFile(itemPath, itemRelativePath, knowledgeBase);
                }
            }
        } catch (error) {
            console.error(`❌ Error reading directory ${currentPath}:`, error.message);
        }
    }
    
    /**
     * Load individual JSON file with folder context
     */
    loadJsonFile(filePath, relativePath, knowledgeBase) {
        try {
            console.log(`📖 Reading file: ${relativePath}`);
            
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Use the relative path as the key to preserve folder structure
            const fileKey = relativePath.replace(/\.json$/, '');
            knowledgeBase[fileKey] = parsed;
            
            console.log(`✅ Loaded: ${fileKey} with ${Object.keys(parsed).length} top-level keys`);
            
            // Log first few keys to verify content
            const firstKeys = Object.keys(parsed).slice(0, 3);
            if (firstKeys.length > 0) {
                console.log(`   Sample keys: ${firstKeys.join(', ')}`);
            }
            
        } catch (error) {
            console.error(`❌ Error loading ${relativePath}:`, error.message);
        }
    }
    
    /**
     * Enhanced context labeling with folder information
     */
    getContextLabel(key, path, parentContext = '') {
        const pathParts = path.split('.');
        
        // Extract folder information from the path
        const folderInfo = this.extractFolderInfo(path);
        
        const relevantParts = pathParts.filter(part => 
            !part.includes('[') && 
            part.length > 0 &&
            !['full_content', 'documents', 'data'].includes(part)
        );
        
        let contextLabel = '';
        
        // Add folder context if available
        if (folderInfo.category && folderInfo.subcategory) {
            contextLabel = `${this.formatKeyAsTitle(folderInfo.category)} - ${this.formatKeyAsTitle(folderInfo.subcategory)}`;
        } else if (folderInfo.category) {
            contextLabel = this.formatKeyAsTitle(folderInfo.category);
        }
        
        // Add specific context from path
        if (relevantParts.length > 0) {
            const contextParts = relevantParts.slice(-2);
            const specificContext = contextParts.map(p => this.formatKeyAsTitle(p)).join(' - ');
            
            if (contextLabel) {
                contextLabel += ` - ${specificContext}`;
            } else {
                contextLabel = specificContext;
            }
        }
        
        // Fallback to key formatting
        if (!contextLabel) {
            contextLabel = this.formatKeyAsTitle(key);
        }
        
        return contextLabel;
    }
    
    /**
     * Extract folder information from file path
     */
    extractFolderInfo(filePath) {
        const parts = filePath.split('/');
        
        // For structure: hr-knowledge/leaders-playbook/filename
        if (parts.length >= 3) {
            return {
                category: parts[0],
                subcategory: parts[1],
                filename: parts[2]
            };
        }
        // For structure: hr-knowledge/filename
        else if (parts.length === 2) {
            return {
                category: parts[0],
                filename: parts[1]
            };
        }
        // For files in root
        else {
            return {
                filename: parts[0]
            };
        }
    }
    
    /**
     * Enhanced chunk extraction with folder context
     */
    extractChunks(obj, path = '', chunks = [], parentContext = '', isRoot = true) {
        // If this is the root level (file paths), process each file with folder context
        if (isRoot) {
            for (const [filePath, fileContent] of Object.entries(obj)) {
                const folderInfo = this.extractFolderInfo(filePath);
                let fileContext = '';
                
                if (folderInfo.category && folderInfo.subcategory) {
                    fileContext = `${this.formatKeyAsTitle(folderInfo.category)} - ${this.formatKeyAsTitle(folderInfo.subcategory)}`;
                } else if (folderInfo.category) {
                    fileContext = this.formatKeyAsTitle(folderInfo.category);
                } else {
                    fileContext = this.formatKeyAsTitle(filePath);
                }
                
                this.extractChunks(fileContent, filePath, chunks, fileContext, false);
            }
            return chunks;
        }
        
        // Original processing for nested objects
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            const contextLabel = this.getContextLabel(key, currentPath, parentContext);
            
            if (this.hasNestedStructure(value)) {
                const structuredChunk = this.createStructuredChunk(key, value, currentPath, contextLabel);
                if (structuredChunk) {
                    chunks.push(structuredChunk);
                }
            }
            
            if (typeof value === 'string' && value.length > 15) {
                chunks.push({
                    text: value,
                    path: currentPath,
                    context: contextLabel,
                    parentContext: parentContext,
                    source: path
                });
            } 
            else if (Array.isArray(value)) {
                if (value.length > 0) {
                    const arrayText = this.formatArrayAsText(key, value, currentPath);
                    if (arrayText && arrayText.length > 50) {
                        chunks.push({
                            text: arrayText,
                            path: currentPath,
                            context: contextLabel,
                            parentContext: parentContext,
                            isAggregate: true,
                            source: path
                        });
                    }
                }
                
                value.forEach((item, index) => {
                    if (typeof item === 'string' && item.length > 10) {
                        chunks.push({
                            text: item,
                            path: `${currentPath}[${index}]`,
                            context: contextLabel,
                            parentContext: parentContext,
                            source: path
                        });
                    } else if (typeof item === 'object' && item !== null) {
                        this.extractChunks(item, `${currentPath}[${index}]`, chunks, contextLabel, false);
                    }
                });
            } 
            else if (typeof value === 'object' && value !== null) {
                this.extractChunks(value, currentPath, chunks, contextLabel, false);
            }
        }
        
        return chunks;
    }
    
    /**
     * Get folder statistics for debugging
     */
    getFolderStats() {
        const stats = {
            totalFiles: 0,
            categories: {},
            totalChunks: this.chunks.length
        };
        
        for (const filePath of Object.keys(this.knowledgeBase)) {
            stats.totalFiles++;
            const folderInfo = this.extractFolderInfo(filePath);
            
            if (folderInfo.category) {
                if (!stats.categories[folderInfo.category]) {
                    stats.categories[folderInfo.category] = {
                        files: 0,
                        subcategories: {}
                    };
                }
                stats.categories[folderInfo.category].files++;
                
                if (folderInfo.subcategory) {
                    if (!stats.categories[folderInfo.category].subcategories[folderInfo.subcategory]) {
                        stats.categories[folderInfo.category].subcategories[folderInfo.subcategory] = 0;
                    }
                    stats.categories[folderInfo.category].subcategories[folderInfo.subcategory]++;
                }
            }
        }
        
        return stats;
    }
    
    async initializeRAG(cacheManager) {
        try {
            this.knowledgeBase = this.loadKnowledgeBase();
            
            if (Object.keys(this.knowledgeBase).length === 0) {
                console.warn("⚠️ Knowledge base is empty");
                this.isInitialized = true;
                return;
            }
            
            this.chunks = this.extractChunks(this.knowledgeBase);
            console.log(`📚 Extracted ${this.chunks.length} text chunks from all folders and files`);
            
            // Log folder statistics
            const stats = this.getFolderStats();
            console.log("📊 Folder Statistics:", stats);
            
            if (this.chunks.length === 0) {
                console.warn("⚠️ No chunks extracted from knowledge base");
                this.isInitialized = true;
                return;
            }
            
            // Check if cache is valid before loading
            const cacheValid = cacheManager ? cacheManager.isCacheValid() : false;
            
            if (cacheValid) {
                const cacheLoaded = await this.loadEmbeddingsCache();
                if (cacheLoaded) {
                    console.log("✅ Loaded valid cache");
                    this.isInitialized = true;
                    return;
                } else {
                    console.log("🔄 Cache file corrupted, regenerating...");
                }
            } else {
                console.log("🔄 Cache invalid or missing, generating embeddings...");
            }
            
            // Generate new embeddings
            await this.generateAllEmbeddings();
            await this.saveEmbeddingsCache();
            
            // Save cache info if cache manager is available
            if (cacheManager) {
                const signature = cacheManager.generateCacheSignature();
                cacheManager.saveCacheInfo(signature);
            }
            
            this.isInitialized = true;
            console.log("✅ Multi-Folder & File Universal Semantic RAG System Ready!");
        } catch (error) {
            console.error("❌ Failed to initialize RAG:", error);
            this.isInitialized = false;
        }
    }
    
    async loadEmbeddingsCache() {
        try {
            if (fs.existsSync(this.embeddingsCachePath)) {
                console.log("📦 Loading embeddings from cache...");
                const cacheData = fs.readFileSync(this.embeddingsCachePath, 'utf8');
                const cache = JSON.parse(cacheData);
                
                if (cache.chunks && cache.embeddings && cache.chunks.length === this.chunks.length) {
                    this.embeddings = cache.embeddings;
                    console.log("✅ Embeddings loaded from cache!");
                    return true;
                } else {
                    console.log("⚠️ Cache size mismatch, regenerating embeddings");
                    return false;
                }
            }
            return false;
        } catch (error) {
            console.warn("⚠️ Could not load embeddings cache:", error.message);
            return false;
        }
    }
    
    async saveEmbeddingsCache() {
        try {
            const cache = {
                chunks: this.chunks,
                embeddings: this.embeddings,
                timestamp: new Date().toISOString(),
                folderStats: this.getFolderStats()
            };
            fs.writeFileSync(this.embeddingsCachePath, JSON.stringify(cache));
            console.log("💾 Embeddings cached successfully!");
        } catch (error) {
            console.warn("⚠️ Could not save embeddings cache:", error.message);
        }
    }
    
    hasNestedStructure(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
        }
        
        const keys = Object.keys(value);
        if (keys.length < 2) return false;
        
        const hasComplexData = keys.some(key => {
            const val = value[key];
            return Array.isArray(val) || (typeof val === 'object' && val !== null);
        });
        
        return hasComplexData;
    }
    
    createStructuredChunk(key, value, path, context) {
        try {
            let formattedText = `${this.formatKeyAsTitle(key)}\n\n`;
            formattedText += this.formatStructuredObject(value, 0);
            
            if (formattedText.length > 100) {
                return {
                    text: formattedText,
                    path: path,
                    context: context,
                    isStructured: true,
                    structureType: key
                };
            }
            
            return null;
        } catch (error) {
            console.warn(`Failed to create structured chunk for ${key}:`, error);
            return null;
        }
    }
    
    formatStructuredObject(obj, indent = 0) {
        let text = '';
        const indentation = '  '.repeat(indent);
        
        for (const [key, value] of Object.entries(obj)) {
            const label = this.formatKeyAsTitle(key);
            
            if (typeof value === 'string') {
                text += `${indentation}${label}: ${value}\n`;
            } else if (Array.isArray(value)) {
                text += `${indentation}${label}:\n`;
                value.forEach((item, idx) => {
                    if (typeof item === 'string') {
                        text += `${indentation}  ${idx + 1}. ${item}\n`;
                    } else if (typeof item === 'object' && item !== null) {
                        text += `${indentation}  ${idx + 1}.\n`;
                        text += this.formatStructuredObject(item, indent + 2);
                    }
                });
            } else if (typeof value === 'object' && value !== null) {
                text += `${indentation}${label}:\n`;
                text += this.formatStructuredObject(value, indent + 1);
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                text += `${indentation}${label}: ${value}\n`;
            }
        }
        
        return text;
    }
    
    formatKeyAsTitle(key) {
        return key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
    }
    
    formatArrayAsText(key, array, path) {
        if (array.length === 0) return null;
        
        const title = this.formatKeyAsTitle(key);
        let formattedText = `${title}:\n\n`;
        
        if (array.every(item => typeof item === 'string')) {
            array.forEach((item, idx) => {
                formattedText += `${idx + 1}. ${item}\n`;
            });
            return formattedText;
        }
        
        if (array.every(item => typeof item === 'object' && item !== null)) {
            array.forEach((item, idx) => {
                const displayProps = this.getDisplayProperties(item);
                
                if (displayProps.length > 0) {
                    formattedText += `${idx + 1}. `;
                    formattedText += displayProps.map(prop => {
                        const key = Object.keys(prop)[0];
                        const value = prop[key];
                        return `${this.formatKeyAsTitle(key)}: ${value}`;
                    }).join(' | ');
                    formattedText += '\n';
                    
                    const otherProps = Object.keys(item).filter(k => 
                        !displayProps.some(p => Object.keys(p)[0] === k)
                    );
                    
                    otherProps.forEach(k => {
                        const value = item[k];
                        if (typeof value === 'string' && value.length > 0) {
                            formattedText += `   ${this.formatKeyAsTitle(k)}: ${value}\n`;
                        } else if (Array.isArray(value) && value.length > 0) {
                            formattedText += `   ${this.formatKeyAsTitle(k)}: ${value.join(', ')}\n`;
                        }
                    });
                }
            });
            return formattedText;
        }
        
        array.forEach((item, idx) => {
            formattedText += `${idx + 1}. ${String(item)}\n`;
        });
        
        return formattedText;
    }
    
    getDisplayProperties(obj) {
        const priorityKeys = [
            'name', 'title', 'stage_name', 'phase', 'step', 
            'label', 'description', 'question', 'action'
        ];
        
        const props = [];
        
        for (const key of priorityKeys) {
            if (obj[key] && typeof obj[key] === 'string') {
                props.push({ [key]: obj[key] });
            }
        }
        
        if (props.length === 0) {
            const stringKeys = Object.keys(obj).filter(k => typeof obj[k] === 'string');
            stringKeys.slice(0, 2).forEach(k => {
                props.push({ [k]: obj[k] });
            });
        }
        
        return props;
    }
    
    async generateAllEmbeddings() {
        console.log("🔄 Generating embeddings for all chunks...");
        console.log("⏳ This may take a few minutes...");
        
        if (!GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY not set in environment");
        }
        
        const batchSize = 5;
        for (let i = 0; i < this.chunks.length; i += batchSize) {
            const batch = this.chunks.slice(i, i + batchSize);
            const batchEmbeddings = await Promise.all(
                batch.map(chunk => this.getEmbedding(chunk.text))
            );
            this.embeddings.push(...batchEmbeddings);
            
            const progress = Math.min(i + batchSize, this.chunks.length);
            const percentage = ((progress / this.chunks.length) * 100).toFixed(1);
            console.log(`📊 Progress: ${progress}/${this.chunks.length} (${percentage}%)`);
            
            if (i + batchSize < this.chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        console.log("✅ All embeddings generated!");
    }
    
    async getEmbedding(text) {
        try {
            const truncatedText = text.length > 2000 ? text.substring(0, 2000) : text;
            
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
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
    
    cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        if (normA === 0 || normB === 0) return 0;
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    
    async search(question, topK = 15) {
        if (!this.isInitialized) {
            console.warn("⚠️ RAG system not initialized");
            return [];
        }
        
        if (this.chunks.length === 0) {
            console.warn("⚠️ No chunks available");
            return [];
        }
        
        console.log(`🔍 Searching: "${question}"`);
        
        const questionEmbedding = await this.getEmbedding(question);
        
        const results = this.chunks.map((chunk, index) => {
            let score = this.cosineSimilarity(questionEmbedding, this.embeddings[index]);
            
            // Enhanced scoring with folder context
            if (chunk.isStructured) {
                score *= 1.2;
            }
            
            if (chunk.isAggregate) {
                score *= 1.15;
            }
            
            // Boost scores for chunks from relevant folders based on question
            score *= this.getFolderAwareBoost(question, chunk);
            
            return { ...chunk, score };
        });
        
        const topResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .filter(r => r.score > 0.2);
        
        console.log(`📊 Found ${topResults.length} relevant chunks`);
        if (topResults.length > 0) {
            console.log(`🎯 Top score: ${topResults[0].score.toFixed(3)}`);
            console.log(`📁 Top result source: ${topResults[0].source}`);
        }
        
        return topResults;
    }
    
    /**
     * Enhanced boosting that considers folder relevance
     */
    getFolderAwareBoost(question, chunk) {
        const lowerQuestion = question.toLowerCase();
        const lowerChunkText = chunk.text.toLowerCase();
        const lowerContext = chunk.context.toLowerCase();
        
        let boost = 1.0;
        
        const stopWords = ['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 
                          'in', 'with', 'to', 'for', 'of', 'as', 'by', 'what', 'how', 'when',
                          'where', 'who', 'why', 'are', 'do', 'does', 'did', 'can', 'could'];
        
        const questionWords = lowerQuestion
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.includes(w));
        
        const textMatches = questionWords.filter(word => lowerChunkText.includes(word)).length;
        const contextMatches = questionWords.filter(word => lowerContext.includes(word)).length;
        
        if (textMatches > 0) {
            boost *= (1 + (textMatches * 0.1));
        }
        
        if (contextMatches > 0) {
            boost *= (1 + (contextMatches * 0.15));
        }
        
        // Additional boost for folder relevance
        const folderBoost = this.getFolderRelevanceBoost(question, chunk);
        boost *= folderBoost;
        
        return Math.min(boost, 2.5);
    }
    
    /**
     * Boost chunks from relevant folders based on question content
     */
    getFolderRelevanceBoost(question, chunk) {
        const lowerQuestion = question.toLowerCase();
        let boost = 1.0;
        
        // Define folder-keyword mappings
        const folderKeywords = {
            'leaders-playbook': ['leadership', 'manager', 'supervisor', 'team lead', 'management', 'direct report'],
            'code-of-conduct': ['conduct', 'ethics', 'behavior', 'policy', 'rules', 'compliance', 'disciplinary'],
            'hr-knowledge': ['hr', 'human resources', 'policy', 'benefits', 'leave', 'vacation', 'salary', 'payroll']
        };
        
        // Check if chunk source matches relevant folders for the question
        if (chunk.source) {
            for (const [folder, keywords] of Object.entries(folderKeywords)) {
                if (chunk.source.includes(folder)) {
                    const hasRelevantKeywords = keywords.some(keyword => 
                        lowerQuestion.includes(keyword)
                    );
                    if (hasRelevantKeywords) {
                        boost *= 1.2;
                        break;
                    }
                }
            }
        }
        
        return boost;
    }
    
    async getContext(question, topK = 15) {
        const results = await this.search(question, topK);
        
        if (results.length === 0) {
            return "No relevant information found in the knowledge base.";
        }
        
        const grouped = {};
        results.forEach(result => {
            const ctx = result.context || 'General';
            if (!grouped[ctx]) grouped[ctx] = [];
            grouped[ctx].push(result);
        });
        
        const contextParts = [];
        for (const [context, chunks] of Object.entries(grouped)) {
            contextParts.push(`### ${context}\n`);
            
            const structured = chunks.filter(c => c.isStructured || c.isAggregate);
            const regular = chunks.filter(c => !c.isStructured && !c.isAggregate);
            
            [...structured, ...regular].forEach(chunk => {
                contextParts.push(chunk.text + '\n');
            });
        }
        
        const context = contextParts.join('\n');
        console.log(`📄 Context: ${context.length} chars, ${Object.keys(grouped).length} sections`);
        
        return context;
    }
}

// Initialize systems
const ragSystem = new MultiFolderSemanticRAG();
const cacheManager = new CacheManager();

// Initialize RAG system with cache manager
ragSystem.initializeRAG(cacheManager);

// Routes
app.get("/", (req, res) => {
    res.json({ 
        status: "✅ ChatCHA backend running",
        rag: ragSystem.isInitialized ? "✅ Multi-Folder & File Universal RAG Active" : "⚠️ Initializing...",
        approach: "Universal semantic search across multiple knowledge folders and files",
        chunks: ragSystem.chunks.length,
        files: Object.keys(ragSystem.knowledgeBase).length,
        endpoints: [
            "/ask", 
            "/rag/search", 
            "/rag/status",
            "/cache/status",
            "/cache/regenerate",
            "/cache/clear"
        ]
    });
});

app.get("/rag/status", (req, res) => {
    const stats = ragSystem.getFolderStats();
    res.json({ 
        status: ragSystem.isInitialized ? "ready" : "initializing",
        service: "Multi-Folder & File Universal HR Knowledge RAG",
        embedding_model: "text-embedding-004",
        chunks: ragSystem.chunks.length,
        embeddings: ragSystem.embeddings.length,
        knowledge_files: Object.keys(ragSystem.knowledgeBase).length,
        folder_stats: stats,
        approach: "Works for ANY question across multiple folders and files",
        timestamp: new Date().toISOString()
    });
});

// Cache management endpoints
app.get("/cache/status", (req, res) => {
    const cacheInfo = cacheManager.getCacheInfo();
    const isValid = cacheManager.isCacheValid();
    
    res.json({
        cache_valid: isValid,
        cache_info: cacheInfo,
        rag_initialized: ragSystem.isInitialized,
        chunks_count: ragSystem.chunks.length,
        embeddings_count: ragSystem.embeddings.length,
        knowledge_base_files: Object.keys(ragSystem.knowledgeBase).length
    });
});

app.post("/cache/clear", (req, res) => {
    try {
        const success = cacheManager.clearCache();
        res.json({ 
            success,
            message: success ? "Cache cleared successfully" : "Failed to clear cache",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/cache/regenerate", async (req, res) => {
    try {
        console.log("🔄 Manual cache regeneration triggered via API...");
        
        // Clear existing cache
        cacheManager.clearCache();
        
        // Regenerate chunks and embeddings
        ragSystem.chunks = ragSystem.extractChunks(ragSystem.knowledgeBase);
        await ragSystem.generateAllEmbeddings();
        await ragSystem.saveEmbeddingsCache();
        
        // Update cache info
        const signature = cacheManager.generateCacheSignature();
        cacheManager.saveCacheInfo(signature);
        
        res.json({ 
            success: true,
            message: "Cache regenerated successfully",
            chunks: ragSystem.chunks.length,
            embeddings: ragSystem.embeddings.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("❌ Cache regeneration error:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Debug routes
app.get("/rag/debug/folders", (req, res) => {
    const stats = ragSystem.getFolderStats();
    res.json({
        folderStructure: stats,
        knowledgeBaseFiles: Object.keys(ragSystem.knowledgeBase),
        totalChunks: ragSystem.chunks.length
    });
});

app.get("/rag/debug/files", (req, res) => {
    res.json({
        files: Object.keys(ragSystem.knowledgeBase),
        fileCount: Object.keys(ragSystem.knowledgeBase).length,
        chunksCount: ragSystem.chunks.length
    });
});

app.get("/rag/debug/search-chunks", (req, res) => {
    const searchTerm = req.query.q || "recognition";
    const matchingChunks = ragSystem.chunks.filter(chunk => 
        chunk.text.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
    
    res.json({
        searchTerm,
        totalMatches: matchingChunks.length,
        chunks: matchingChunks.map(chunk => ({
            text: chunk.text.substring(0, 200) + '...',
            path: chunk.path,
            context: chunk.context
        }))
    });
});

app.get("/rag/debug/chunks", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const chunks = ragSystem.chunks.slice(0, limit);
    res.json({
        total_chunks: ragSystem.chunks.length,
        sample_chunks: chunks.map(chunk => ({
            text: chunk.text.substring(0, 100) + '...',
            path: chunk.path,
            context: chunk.context
        }))
    });
});

app.post("/rag/debug/prompt", async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: "Question required" });
        }
        
        console.log("🔍 Debug prompt for question:", question);
        const context = await ragSystem.getContext(question, 10);
        
        const finalPrompt = `You are CHA, a helpful and knowledgeable HR Assistant for CDO Foodsphere, Inc.

## CONTEXT FROM KNOWLEDGE BASE:
${context}

## USER QUESTION:
${question}

## INSTRUCTIONS:
Provide a clear, detailed, and helpful answer based on the context above. Be specific and informative.

Your response:`;
        
        res.json({
            question,
            context_length: context.length,
            prompt_length: finalPrompt.length,
            context_preview: context.substring(0, 1000) + '...',
            prompt_preview: finalPrompt.substring(0, 1500) + '...',
            contains_recognition: context.toLowerCase().includes('recognition'),
            contains_rewards: context.toLowerCase().includes('rewards')
        });
        
    } catch (error) {
        console.error("Debug error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/rag/search", async (req, res) => {
    try {
        const { question, top_k = 15 } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: "Question required" });
        }
        
        if (!ragSystem.isInitialized) {
            return res.status(503).json({ 
                error: "RAG initializing",
                context: "Try again in a moment",
                success: false
            });
        }
        
        const context = await ragSystem.getContext(question, top_k);
        const results = await ragSystem.search(question, top_k);
        
        res.json({
            context,
            results_count: results.length,
            max_similarity: results[0]?.score || 0,
            success: true,
            query: question
        });
        
    } catch (error) {
        console.error("❌ RAG error:", error);
        res.status(500).json({ 
            error: "RAG system error",
            success: false
        });
    }
});

app.post("/ask", async (req, res) => {
    const { prompt, use_rag = true, behavior_context } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "API key not set" });
    }

    try {
        let finalPrompt = prompt;
        let ragContext = "";
        
        if (use_rag && ragSystem.isInitialized) {
            console.log("🔍 Using Multi-Folder & File Universal RAG...");
            ragContext = await ragSystem.getContext(prompt);
            
            // Enhanced prompt with behavior context
            const identity = behavior_context?.identity || AI_BEHAVIOR.identity;
            const isFollowUp = behavior_context?.is_follow_up || false;
            
            const template = isFollowUp ? PROMPT_TEMPLATES.followUp : PROMPT_TEMPLATES.standard;
            
            finalPrompt = template
                .replace(/{name}/g, identity.name || 'CHA')
                .replace(/{role}/g, identity.role || 'HR Assistant')
                .replace(/{company}/g, identity.company || 'CDO Foodsphere, Inc.')
                .replace(/{context}/g, ragContext)
                .replace(/{question}/g, prompt)
                .replace(/{ragContext}/g, ragContext)
                .replace(/{history}/g, JSON.stringify(behavior_context?.conversation_history || []));
            
            console.log(`📝 Enhanced prompt length: ${finalPrompt.length} chars`);
            console.log("=== MULTI-FOLDER RAG DEBUG ===");
            console.log("Using template:", isFollowUp ? "followUp" : "standard");
            console.log("Context length:", ragContext.length);
            console.log("=== END DEBUG ===");
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: finalPrompt }] }],
                    generationConfig: {
                        temperature: 0.4,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    }
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(response.status).json({ 
                error: data.error?.message || "API error",
                details: data
            });
        }

        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 
                      "I couldn't generate a response.";

        console.log("=== GEMINI RESPONSE DEBUG ===");
        console.log("Answer length:", answer.length);
        console.log("Answer preview:", answer.substring(0, 200));
        console.log("=== END DEBUG ===");

        res.json({ 
            answer,
            rag_used: use_rag && ragSystem.isInitialized,
            context_provided: ragContext.length > 0,
            success: true
        });
        
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ 
            error: "Failed to connect to API",
            details: error.message,
            success: false
        });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ 
        status: "healthy",
        rag_initialized: ragSystem.isInitialized,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`🎯 Multi-Folder & File Universal RAG Ready!`);
    console.log(`📁 Expected folder structure:`);
    console.log(`   knowledge-base/`);
    console.log(`   ├── hr-knowledge/`);
    console.log(`   │   ├── leaders-playbook/`);
    console.log(`   │   │   └── *.json`);
    console.log(`   │   └── code-of-conduct/`);
    console.log(`   │       └── *.json`);
    console.log(`   └── [other categories]/`);
    console.log(`🔧 Cache Management Endpoints:`);
    console.log(`   GET  /cache/status     - Check cache status`);
    console.log(`   POST /cache/regenerate - Manually regenerate cache`);
    console.log(`   POST /cache/clear      - Clear cache`);
});