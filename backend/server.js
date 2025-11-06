// server.js - Enhanced with Server-Side RAG
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

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, "../frontend")));

// RAG System
class SimpleRAG {
    constructor() {
        this.knowledgeBase = this.loadKnowledgeBase();
        this.keywordWeights = this.getKeywordWeights();
        console.log("✅ RAG System Initialized");
    }
    
    loadKnowledgeBase() {
        try {
            // Try to load from the same directory
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
    
    getKeywordWeights() {
        return {
            // High priority HR terms
            'internal hiring': 10,
            'internal hiring process': 12,
            'letter of intent': 10,
            'loi': 9,
            'interview': 8,
            'recruitment': 8,
            'hiring': 8,
            'behavioral interview': 9,
            'star method': 8,
            'stages of hiring': 7,
            'personnel requisition': 7,
            'prf': 7,
            
            // Medium priority
            'process': 6,
            'policy': 6,
            'procedure': 6,
            'guideline': 5,
            'framework': 5,
            'employee': 4,
            'onboard': 4,
            'offboard': 4,
            'performance': 4,
            
            // CDO specific
            'cdo': 3,
            'foodsphere': 3
        };
    }
    
    search(question, topK = 12) {
        const questionLower = question.toLowerCase();
        const results = [];
        
        // Extract key phrases from question
        const questionPhrases = this.extractPhrases(questionLower);
        
        console.log(`🔍 RAG Search: "${question}"`);
        console.log(`📝 Detected phrases:`, questionPhrases);
        
        // Search through knowledge base
        this.searchObject(this.knowledgeBase.full_content, questionPhrases, results, '');
        
        // Sort by score and return top results
        const sortedResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
        
        console.log(`📊 Found ${sortedResults.length} relevant chunks`);
        if (sortedResults.length > 0) {
            console.log(`🎯 Top result score: ${sortedResults[0].score}`);
        }
        
        return sortedResults;
    }
    
    extractPhrases(text) {
        const phrases = new Set();
        const words = text.split(/\s+/);
        
        // Add individual important words
        words.forEach(word => {
            if (word.length > 3) {
                phrases.add(word);
            }
        });
        
        // Add common HR phrases if they appear in the question
        Object.keys(this.keywordWeights).forEach(phrase => {
            if (text.includes(phrase)) {
                phrases.add(phrase);
            }
        });
        
        // Add multi-word combinations from the question
        for (let i = 0; i < words.length - 1; i++) {
            const twoWordPhrase = `${words[i]} ${words[i+1]}`;
            if (twoWordPhrase.length > 6) {
                phrases.add(twoWordPhrase);
            }
        }
        
        return Array.from(phrases);
    }
    
    searchObject(obj, questionPhrases, results, path, depth = 0) {
        if (depth > 8) return; // Prevent infinite recursion
        
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (typeof value === 'object' && value !== null) {
                // Recursively search objects
                this.searchObject(value, questionPhrases, results, currentPath, depth + 1);
                
                // Also consider the object as a whole for important sections
                if (this.isImportantSection(currentPath)) {
                    const objectText = JSON.stringify(value, null, 2);
                    const score = this.calculateScore(objectText, questionPhrases);
                    if (score > 2) { // Higher threshold for whole objects
                        results.push({
                            content: this.formatObjectContent(key, value, currentPath),
                            score: score * 1.5, // Boost for complete sections
                            path: currentPath,
                            type: 'complete_section'
                        });
                    }
                }
            } else if (typeof value === 'string' && value.length > 10) {
                // Search string values
                const score = this.calculateScore(value, questionPhrases);
                if (score > 0) {
                    results.push({
                        content: this.formatContent(key, value, currentPath),
                        score: score,
                        path: currentPath,
                        type: 'text'
                    });
                }
            } else if (Array.isArray(value)) {
                // Search arrays
                this.searchArray(value, questionPhrases, results, currentPath, depth + 1);
            }
        }
    }
    
    searchArray(arr, questionPhrases, results, path, depth) {
        arr.forEach((item, index) => {
            const currentPath = `${path}[${index}]`;
            
            if (typeof item === 'object' && item !== null) {
                this.searchObject(item, questionPhrases, results, currentPath, depth + 1);
            } else if (typeof item === 'string' && item.length > 10) {
                const score = this.calculateScore(item, questionPhrases);
                if (score > 0) {
                    results.push({
                        content: this.formatContent(`item_${index}`, item, currentPath),
                        score: score,
                        path: currentPath,
                        type: 'array_text'
                    });
                }
            }
        });
    }
    
    isImportantSection(path) {
        const importantSections = [
            'attract_phase.processes_and_policies.internal_hiring_process',
            'attract_phase.processes_and_policies.stages_of_hiring_process',
            'attract_phase.learning_series.interviewing_101',
            'attract_phase.framework',
            'introduction.founders_message',
            'introduction.playbook_overview'
        ];
        return importantSections.some(section => path.includes(section));
    }
    
    calculateScore(text, questionPhrases) {
        const textLower = text.toLowerCase();
        let score = 0;
        
        questionPhrases.forEach(phrase => {
            if (textLower.includes(phrase)) {
                // Weight by phrase importance
                const weight = this.keywordWeights[phrase] || 1;
                // Count occurrences with regex for exact matching
                const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const occurrences = (textLower.match(regex) || []).length;
                score += weight * occurrences;
                
                // Bonus for exact phrase matches
                if (phrase.includes(' ') && textLower.includes(phrase)) {
                    score += weight * 2;
                }
            }
        });
        
        return score;
    }
    
    formatObjectContent(key, value, path) {
        const sectionName = path.split('.').pop().replace(/_/g, ' ').toUpperCase();
        return `## ${sectionName}\n${JSON.stringify(value, null, 2)}`;
    }
    
    formatContent(key, value, path) {
        // Truncate long content
        let displayValue = value;
        if (value.length > 500) {
            displayValue = value.substring(0, 500) + '...';
        }
        
        const sectionName = path.split('.').pop().replace(/_/g, ' ');
        return `### ${sectionName}\n${displayValue}`;
    }
    
    getContext(question, topK = 12) {
        const results = this.search(question, topK);
        
        if (results.length === 0) {
            return "No relevant information found in HR knowledge base. Please contact HR for assistance.";
        }
        
        const contextParts = results.map(result => result.content);
        const context = contextParts.join('\n\n');
        
        console.log(`📄 Generated context length: ${context.length} characters`);
        return context;
    }
}

// Initialize RAG system
const ragSystem = new SimpleRAG();

// Root route (health check)
app.get("/", (req, res) => {
    res.json({ 
        status: "✅ ChatJisi backend is running successfully!",
        rag: "✅ RAG System Active",
        endpoints: ["/ask", "/rag/search", "/rag/status"]
    });
});

// RAG Status endpoint
app.get("/rag/status", (req, res) => {
    res.json({ 
        status: "ready",
        service: "HR Knowledge RAG",
        knowledge_base_loaded: !!ragSystem.knowledgeBase.full_content,
        timestamp: new Date().toISOString()
    });
});

// RAG Search endpoint
app.post("/rag/search", async (req, res) => {
    try {
        const { question, top_k = 12 } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: "Question is required" });
        }
        
        console.log(`🎯 RAG Search Request: "${question}"`);
        
        const context = ragSystem.getContext(question, top_k);
        const results = ragSystem.search(question, top_k);
        
        const response = {
            context: context,
            results_count: results.length,
            max_similarity: results[0]?.score || 0,
            success: true,
            query: question
        };
        
        console.log(`✅ RAG Search Complete: ${results.length} results found`);
        res.json(response);
        
    } catch (error) {
        console.error("❌ RAG search error:", error);
        res.status(500).json({ 
            error: "Internal server error in RAG system",
            context: "HR knowledge base currently unavailable. Please contact HR directly for assistance.",
            success: false
        });
    }
});

// Enhanced POST /ask route with RAG integration
app.post("/ask", async (req, res) => {
    const { prompt, use_rag = true } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Gemini API key not set in environment" });
    }

    try {
        let finalPrompt = prompt;
        
        // Use RAG to enhance the prompt if enabled
        if (use_rag) {
            console.log("🔍 Using RAG to enhance prompt...");
            const ragContext = await ragSystem.getContext(prompt);
            
            // Create enhanced prompt with RAG context
            finalPrompt = `You are Jisi, a professional AI HR and Recruitment Assistant for CDO Foodsphere, Inc.

## CONTEXT FROM HR KNOWLEDGE BASE:
${ragContext}

## USER QUESTION:
${prompt}

## INSTRUCTIONS:
Based EXCLUSIVELY on the context provided above, provide a comprehensive and accurate answer to the user's question. If the information is not in the context, clearly state that and suggest contacting HR.

Provide your response:`;
            
            console.log(`📝 Enhanced prompt length: ${finalPrompt.length} characters`);
        }

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": GEMINI_API_KEY,
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: finalPrompt }] }],
                }),
            }
        );

        const data = await response.json();
        console.log("🤖 Gemini API Response Received");

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || "API error" });
        }

        const answer =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "I'm sorry, I couldn't generate a response.";

        res.json({ 
            answer,
            rag_used: use_rag,
            success: true
        });
        
    } catch (error) {
        console.error("❌ Error communicating with Gemini:", error);
        res.status(500).json({ 
            error: "Failed to connect to Gemini API",
            success: false
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Visit http://localhost:${PORT}`);
    console.log(`🔍 RAG Endpoint: http://localhost:${PORT}/rag/search`);
    console.log(`📊 Status Endpoint: http://localhost:${PORT}/rag/status`);
});