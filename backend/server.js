// server.js - Enhanced with Universal Semantic RAG using Gemini Embeddings
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Middleware - CORS MUST come FIRST
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "../frontend")));

// Universal Semantic RAG System - No Question-Specific Logic
class SemanticRAG {
    constructor() {
        this.knowledgeBase = this.loadKnowledgeBase();
        this.chunks = [];
        this.embeddings = [];
        this.isInitialized = false;
        this.embeddingsCachePath = path.join(__dirname, 'embeddings-cache.json');
        console.log("🔧 Initializing Universal Semantic RAG System...");
        this.initializeRAG();
    }
    
    loadKnowledgeBase() {
        try {
            const knowledgeBasePath = path.join(__dirname, 'hr-knowledge.json');
            if (fs.existsSync(knowledgeBasePath)) {
                const data = fs.readFileSync(knowledgeBasePath, 'utf8');
                console.log("✅ HR Knowledge Base loaded successfully");
                return JSON.parse(data);
            } else {
                console.warn("⚠️ hr-knowledge.json not found, using empty knowledge base");
                return { full_content: {} };
            }
        } catch (error) {
            console.error("❌ Failed to load knowledge base:", error);
            return { full_content: {} };
        }
    }
    
    async initializeRAG() {
        try {
            this.chunks = this.extractChunks(this.knowledgeBase.full_content);
            console.log(`📚 Extracted ${this.chunks.length} text chunks`);
            
            if (this.chunks.length === 0) {
                console.warn("⚠️ No chunks extracted from knowledge base");
                this.isInitialized = true;
                return;
            }
            
            const cacheLoaded = await this.loadEmbeddingsCache();
            
            if (!cacheLoaded) {
                await this.generateAllEmbeddings();
                await this.saveEmbeddingsCache();
            }
            
            this.isInitialized = true;
            console.log("✅ Universal Semantic RAG System Ready!");
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
                
                if (cache.chunks.length === this.chunks.length) {
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
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(this.embeddingsCachePath, JSON.stringify(cache));
            console.log("💾 Embeddings cached successfully!");
        } catch (error) {
            console.warn("⚠️ Could not save embeddings cache:", error.message);
        }
    }
    
    /**
     * UNIVERSAL CHUNK EXTRACTION - Works for ANY data structure
     */
    extractChunks(obj, path = '', chunks = [], parentContext = '') {
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            const contextLabel = this.getContextLabel(key, currentPath);
            
            // Handle ALL objects with nested data structures
            if (this.hasNestedStructure(value)) {
                const structuredChunk = this.createStructuredChunk(key, value, currentPath, contextLabel);
                if (structuredChunk) {
                    chunks.push(structuredChunk);
                }
            }
            
            // Extract strings (lowered threshold for better coverage)
            if (typeof value === 'string' && value.length > 15) {
                chunks.push({
                    text: value,
                    path: currentPath,
                    context: contextLabel,
                    parentContext: parentContext
                });
            } 
            // Handle arrays
            else if (Array.isArray(value)) {
                // Create aggregate chunk for arrays with multiple items
                if (value.length > 0) {
                    const arrayText = this.formatArrayAsText(key, value, currentPath);
                    if (arrayText && arrayText.length > 50) {
                        chunks.push({
                            text: arrayText,
                            path: currentPath,
                            context: contextLabel,
                            parentContext: parentContext,
                            isAggregate: true
                        });
                    }
                }
                
                // Also extract individual items
                value.forEach((item, index) => {
                    if (typeof item === 'string' && item.length > 10) {
                        chunks.push({
                            text: item,
                            path: `${currentPath}[${index}]`,
                            context: contextLabel,
                            parentContext: parentContext
                        });
                    } else if (typeof item === 'object' && item !== null) {
                        this.extractChunks(item, `${currentPath}[${index}]`, chunks, contextLabel);
                    }
                });
            } 
            // Recursively handle nested objects
            else if (typeof value === 'object' && value !== null) {
                this.extractChunks(value, currentPath, chunks, contextLabel);
            }
        }
        
        return chunks;
    }
    
    /**
     * UNIVERSAL: Check if object has nested structure worth preserving
     */
    hasNestedStructure(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
        }
        
        // Check if object has multiple properties with complex data
        const keys = Object.keys(value);
        if (keys.length < 2) return false;
        
        // Check if it has arrays or nested objects
        const hasComplexData = keys.some(key => {
            const val = value[key];
            return Array.isArray(val) || (typeof val === 'object' && val !== null);
        });
        
        return hasComplexData;
    }
    
    /**
     * UNIVERSAL: Create comprehensive chunks for ANY structured data
     */
    createStructuredChunk(key, value, path, context) {
        try {
            let formattedText = `${this.formatKeyAsTitle(key)}\n\n`;
            formattedText += this.formatStructuredObject(value, 0);
            
            // Only create chunk if it has substantial content
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
    
    /**
     * UNIVERSAL: Format ANY structured object recursively
     */
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
    
    /**
     * UNIVERSAL: Convert ANY key format to readable title
     */
    formatKeyAsTitle(key) {
        return key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
    }
    
    /**
     * UNIVERSAL: Format ANY array into readable text
     */
    formatArrayAsText(key, array, path) {
        if (array.length === 0) return null;
        
        const title = this.formatKeyAsTitle(key);
        let formattedText = `${title}:\n\n`;
        
        // Simple string arrays
        if (array.every(item => typeof item === 'string')) {
            array.forEach((item, idx) => {
                formattedText += `${idx + 1}. ${item}\n`;
            });
            return formattedText;
        }
        
        // Object arrays - format based on content
        if (array.every(item => typeof item === 'object' && item !== null)) {
            array.forEach((item, idx) => {
                // Find the most important properties to display
                const displayProps = this.getDisplayProperties(item);
                
                if (displayProps.length > 0) {
                    formattedText += `${idx + 1}. `;
                    formattedText += displayProps.map(prop => {
                        const key = Object.keys(prop)[0];
                        const value = prop[key];
                        return `${this.formatKeyAsTitle(key)}: ${value}`;
                    }).join(' | ');
                    formattedText += '\n';
                    
                    // Add additional details
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
        
        // Mixed arrays
        array.forEach((item, idx) => {
            formattedText += `${idx + 1}. ${String(item)}\n`;
        });
        
        return formattedText;
    }
    
    /**
     * UNIVERSAL: Identify important properties in ANY object
     */
    getDisplayProperties(obj) {
        const priorityKeys = [
            'name', 'title', 'stage_name', 'phase', 'step', 
            'label', 'description', 'question', 'action'
        ];
        
        const props = [];
        
        // First, look for priority keys
        for (const key of priorityKeys) {
            if (obj[key] && typeof obj[key] === 'string') {
                props.push({ [key]: obj[key] });
            }
        }
        
        // If no priority keys found, use first 2 string properties
        if (props.length === 0) {
            const stringKeys = Object.keys(obj).filter(k => typeof obj[k] === 'string');
            stringKeys.slice(0, 2).forEach(k => {
                props.push({ [k]: obj[k] });
            });
        }
        
        return props;
    }
    
    /**
     * UNIVERSAL: Generate context labels from path structure
     */
    getContextLabel(key, path) {
        // Extract meaningful context from path
        const pathParts = path.split('.');
        
        // Use the most specific/relevant part of the path
        const relevantParts = pathParts.filter(part => 
            !part.includes('[') && 
            part.length > 0 &&
            !['full_content', 'documents', 'data'].includes(part)
        );
        
        if (relevantParts.length > 0) {
            // Use the last two parts for better context
            const contextParts = relevantParts.slice(-2);
            return contextParts.map(p => this.formatKeyAsTitle(p)).join(' - ');
        }
        
        return this.formatKeyAsTitle(key);
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
    
    /**
     * UNIVERSAL SEARCH - Works for ANY question
     */
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
        
        // Calculate similarity with universal boosting
        const results = this.chunks.map((chunk, index) => {
            let score = this.cosineSimilarity(questionEmbedding, this.embeddings[index]);
            
            // Universal boosting - NO question-specific logic
            if (chunk.isStructured) {
                score *= 1.2; // Structured data is generally more comprehensive
            }
            
            if (chunk.isAggregate) {
                score *= 1.15; // Aggregate chunks have more context
            }
            
            // Generic keyword matching boost
            score *= this.getUniversalBoost(question, chunk);
            
            return { ...chunk, score };
        });
        
        const topResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .filter(r => r.score > 0.2);
        
        console.log(`📊 Found ${topResults.length} relevant chunks`);
        if (topResults.length > 0) {
            console.log(`🎯 Top score: ${topResults[0].score.toFixed(3)}`);
        }
        
        return topResults;
    }
    
    /**
     * UNIVERSAL BOOST - Works for ANY question without hardcoded keywords
     */
    getUniversalBoost(question, chunk) {
        const lowerQuestion = question.toLowerCase();
        const lowerChunkText = chunk.text.toLowerCase();
        const lowerContext = chunk.context.toLowerCase();
        
        let boost = 1.0;
        
        // Extract important words from question (ignore common words)
        const stopWords = ['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 
                          'in', 'with', 'to', 'for', 'of', 'as', 'by', 'what', 'how', 'when',
                          'where', 'who', 'why', 'are', 'do', 'does', 'did', 'can', 'could'];
        
        const questionWords = lowerQuestion
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.includes(w));
        
        // Count matches in text
        const textMatches = questionWords.filter(word => lowerChunkText.includes(word)).length;
        
        // Count matches in context
        const contextMatches = questionWords.filter(word => lowerContext.includes(word)).length;
        
        // Apply proportional boost based on matches
        if (textMatches > 0) {
            boost *= (1 + (textMatches * 0.1)); // 10% boost per matching word
        }
        
        if (contextMatches > 0) {
            boost *= (1 + (contextMatches * 0.15)); // 15% boost per context match
        }
        
        // Cap maximum boost to prevent over-weighting
        return Math.min(boost, 2.0);
    }
    
    /**
     * UNIVERSAL CONTEXT GENERATION
     */
    async getContext(question, topK = 15) {
        const results = await this.search(question, topK);
        
        if (results.length === 0) {
            return "No relevant information found in the knowledge base. Please contact HR for assistance.";
        }
        
        // Group by context for organization
        const grouped = {};
        results.forEach(result => {
            const ctx = result.context || 'General';
            if (!grouped[ctx]) grouped[ctx] = [];
            grouped[ctx].push(result);
        });
        
        // Format with sections
        const contextParts = [];
        for (const [context, chunks] of Object.entries(grouped)) {
            contextParts.push(`### ${context}\n`);
            
            // Prioritize structured and aggregate chunks
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

// Initialize RAG system
const ragSystem = new SemanticRAG();

// Routes
app.get("/", (req, res) => {
    res.json({ 
        status: "✅ ChatJisi backend running",
        rag: ragSystem.isInitialized ? "✅ Universal RAG Active" : "⚠️ Initializing...",
        approach: "Universal semantic search for ANY question",
        chunks: ragSystem.chunks.length,
        endpoints: ["/ask", "/rag/search", "/rag/status"]
    });
});

app.get("/rag/status", (req, res) => {
    res.json({ 
        status: ragSystem.isInitialized ? "ready" : "initializing",
        service: "Universal HR Knowledge RAG",
        embedding_model: "text-embedding-004",
        chunks: ragSystem.chunks.length,
        embeddings: ragSystem.embeddings.length,
        approach: "No hardcoded logic - works for ANY question",
        timestamp: new Date().toISOString()
    });
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
    const { prompt, use_rag = true } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "API key not set" });
    }

    try {
        let finalPrompt = prompt;
        
        if (use_rag && ragSystem.isInitialized) {
            console.log("🔍 Using Universal RAG...");
            const ragContext = await ragSystem.getContext(prompt);
            
            finalPrompt = `You are Jisi, an AI HR Assistant for CDO Foodsphere, Inc.

## CONTEXT FROM KNOWLEDGE BASE:
${ragContext}

## USER QUESTION:
${prompt}

## INSTRUCTIONS:
Answer based ONLY on the context above. If information is missing, say so and suggest contacting HR.

Your response:`;
            
            console.log(`📝 Prompt: ${finalPrompt.length} chars`);
        }

        // FIXED: Correct API endpoint for Gemini 2.0 Flash
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: finalPrompt }] }],
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

        res.json({ 
            answer,
            rag_used: use_rag && ragSystem.isInitialized,
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

app.listen(PORT, () => {
    console.log(`✅ Server on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`🎯 Universal RAG - Works for ANY question!`);
});