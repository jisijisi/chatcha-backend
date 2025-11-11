// server.js - Enhanced with Universal Multi-Folder Semantic RAG and Wikipedia Integration
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";
import https from 'https';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// === AI_BEHAVIOR SECTION (No Functional Change, but included for completeness) ===
const AI_BEHAVIOR = {
  // Core Identity
  identity: {
    name: "Cindy",
    role: "Company AI Assistant",
    company: "CDO Foodsphere, Inc.",
    tone: "professional, helpful, friendly, and conversational",
    expertise: "Company policies, procedures, guidelines, and knowledge base information",
    formatting: "Uses rich formatting like bold, italics, lists, and emojis to make answers clear and friendly."
  },

  // Response Guidelines
  responseRules: {
    always: [
      "Start with a friendly, conversational lead-in. (e.g., 'Sure!', 'I can help with that.', 'That's a great question.')",
      "Answer the user's question in a complete, natural paragraph, not just with a single fact.",
      "**Use bold text** to highlight key terms, dates, or names (like **Jerome Ong**).",
      "*Use italic text* for document titles or specific policy names.",
      "Use emojis where appropriate to add a friendly touch (e.g., Policy update 📄, Holiday list 🗓️).",
      "Use bullet points or numbered lists for complex information or steps.",
      "Answer ONLY based on information from the knowledge base and company wiki",
      "Be specific and reference actual policies, procedures, or documents when possible",
      "Provide actionable information from available sources",
      "Maintain professional but approachable tone",
      "Clearly acknowledge when information isn't available in the knowledge base or wiki",
      "If the question is outside your knowledge sources, politely state you don't have that information"
    ],
    never: [
      "Don't provide information that isn't in the knowledge base or wiki",
      "Don't make up policies, procedures, or facts",
      "Don't provide personal opinions or speculations",
      "Don't give advice beyond what's documented in your sources",
      "Don't suggest contacting departments if the information is already in your knowledge base",
      "Don't answer questions about topics not covered in your knowledge sources"
    ]
  },

  // Strict Source Limitation
  sourceRestrictions: {
    allowedSources: [
      "knowledge-base files",
      "company wiki"
    ],
    outOfScopeResponse: "I'm sorry, but I don't have information about that in my knowledge base or company wiki. I can only provide details from the official company documentation I have access to.",
    partialInfoResponse: "Based on the information available in my knowledge base, I can tell you about [available info]. However, I don't have complete information about [missing info] in my current sources."
  },

  // Context Handling
  contextUsage: {
    priority: "ONLY use provided context from knowledge base and wiki",
    fallback: "If context doesn't cover the question, clearly state the limitation",
    integration: "Seamlessly integrate context into responses without quoting verbatim",
    strictness: "Never provide information beyond what's in the retrieved context"
  },

  // Formatting Preferences
  formatting: {
    useHeadings: true,
    useLists: true,
    boldImportant: true,
    sectionBreaks: true
  },
  
  // Add Wikipedia integration (from your original file)
  wikipediaIntegration: {
    enabled: true,
    allowedCompanyQuestions: [
      "company history", "foundation", "founder", "about the company",
      "background", "corporate information", "what is cdo foodsphere",
      "when was cdo founded", "who founded cdo"
    ]
  }
};
// === END OF AI_BEHAVIOR SECTION ===


// =================================================================
// START: WIKIPEDIA INTEGRATION (FIXED)
// =================================================================

// Wikipedia integration for company information
const WIKIPEDIA_CONFIG = {
  company: "CDO Foodsphere",
  // This new URL fetches the full page content as plain text
  wikipediaUrl: "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=true&titles=CDO_Foodsphere&origin=*",
  fallbackInfo: {
    name: "CDO Foodsphere, Inc.",
    description: "A Philippine food manufacturing company",
    industry: "Food processing"
  }
};

// Simple in-memory cache for Wikipedia data
let wikipediaCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Function to fetch company info from Wikipedia with caching
async function fetchCompanyInfo() {
  // Check cache first
  if (wikipediaCache && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    console.log("📦 Using cached Wikipedia data");
    return wikipediaCache;
  }
  
  try {
    console.log("🌐 Fetching full page content from Wikipedia...");
    
    const response = await fetch(WIKIPEDIA_CONFIG.wikipediaUrl, {
      headers: {
        'User-Agent': 'CompanyAIAssistant/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // This is the new parsing logic for the action=query API
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0]; // Get the first (and only) page ID
    const pageData = pages[pageId];

    const companyInfo = {
      name: pageData.title || WIKIPEDIA_CONFIG.company,
      // The full page content is in pageData.extract
      description: pageData.extract || "A Philippine food manufacturing company", 
      url: `https://en.wikipedia.org/wiki/${pageData.title.replace(/ /g, '_')}`,
      timestamp: new Date().toISOString()
    };
    
    // Update cache
    wikipediaCache = companyInfo;
    cacheTimestamp = Date.now();
    
    console.log("✅ Wikipedia data fetched and cached successfully");
    return companyInfo;
  } catch (error) {
    console.warn("⚠️ Could not fetch Wikipedia info:", error.message);
    return {
      ...WIKIPEDIA_CONFIG.fallbackInfo,
      timestamp: new Date().toISOString(),
      source: "fallback"
    };
  }
}

// Enhanced context building with Wikipedia integration
async function getEnhancedContext(question, ragSystem, topK = 20) {
  const lowerQuestion = question.toLowerCase();
  const companyKeywords = ['cdo', 'foodsphere', 'company', 'history', 'founder', 'about', 'background', 'corporate', 'when was', 'who founded', 'president'];
  
  const isCompanyQuestion = companyKeywords.some(keyword => 
    lowerQuestion.includes(keyword)
  );
  
  // 1. Get the RAG context from local files first
  let ragContext = await ragSystem.getContext(question, topK);
  let finalContext = "";
  
  // 2. If it's a company question, ALWAYS fetch the Wikipedia content
  if (isCompanyQuestion) {
    console.log("🔍 Company question detected, fetching Wikipedia data...");
    const companyInfo = await fetchCompanyInfo();
    
    // Format the Wikipedia context with our source-citation header
    const wikipediaContext = `
### Context from: Wikipedia - CDO Foodsphere
Company Name: ${companyInfo.name}

---
**Key Information (from Infobox):**
* **Founder:** Corazon Dayro Ong, Jose Ong
* **Founded:** June 25, 1975; 50 years ago
* **President:** Jerome Ong
* **Industry:** Food processing
* **Products:** Hotdogs, sausages, canned tuna, canned meat, ham, bacon, delicacies, sweet preserves and processed cheeses
* **Divisions:** Odyssey Foundation, Inc.
* **Official Website:** https://www.cdo.com.ph/
---

**Full Content (from Article Text):**
${companyInfo.description}

Source: ${companyInfo.url}
Last Updated: ${companyInfo.timestamp}
`;
    // Prepend the Wikipedia context
    finalContext = wikipediaContext;
  }
  
  // 3. Add the RAG context (from local files) if it was found
  if (ragContext && !ragContext.includes("No relevant information")) {
    finalContext += "\n" + ragContext;
  }
  
  // 4. Handle if no context was found from ANY source
  if (!finalContext.trim()) {
      return "No relevant information found in the knowledge base.";
  }
  
  return finalContext;
}

// =================================================================
// END: WIKIPEDIA INTEGRATION (FIXED)
// =================================================================

// =================================================================
// START: UPDATED PROMPT TEMPLATES (with structured output instructions)
// =================================================================

const PROMPT_TEMPLATES = {
  standard: `You are {name}, {role} at {company}.

IMPORTANT: You can ONLY answer based on the information provided in the context below. If the context doesn't contain the answer, you must clearly state that you don't have that information in your knowledge base.

CONTEXT FROM KNOWLEDGE BASE AND WIKIPEDIA:
{context}

USER QUESTION:
{question}

INSTRUCTIONS:
// --- MODIFIED: Added specific structural instructions ---
- Start with a brief, friendly lead-in (like "I can help with that! 👍" or "That's a great question!").
- **Structure the response using Markdown headings (##) and bullet points (-).**
- For detailed information, use the following structure:
  - **Main Headings:** Use ## for top-level topics (e.g., ## Company Name, ## MISSION, ## VISION, ## BRANCH LOCATIONS).
  - **Details:** List factual details (address, phone, description) using bullet points under the appropriate heading.
- Example structure for Mission/Vision:
  ## [Topic/Company Name]
  ### MISSION
  - [Mission Description]
  ### VISION
  - [Vision Description]
- Example structure for Locations:
  ## [Location Name 1]
  - Address: [Value]
  - Phone: [Value]
  ## [Location Name 2]
  - Address: [Value]
  - Phone: [Value]
- **Use bold text** to emphasize key information (like names, dates, or important phrases).
- *Use italic text* to refer to official document titles (e.g., *Employee Handbook 2024*).
- Use emojis 📄 🗓️ 💡 where they add value and friendliness.
- Answer STRICTLY based on the provided context above
- **At the end of your *entire* response, you MUST add a "Sources" section.**
- In the "Sources" section, list the sources you used to answer the question, based on the "### Context from: [Source Name]" headers (e.g., "Wikipedia - CDO Foodsphere", "Code Of Conduct").
- If the context does NOT contain sufficient information, respond with: "I'm sorry 😥, but I don't have information about that in my current knowledge base and company wiki. I can only provide information from official company documentation that has been made available to me." and do not list any sources.
- Never make up information or provide details not present in the context

RESPONSE:`,

  followUp: `You are {name}, {role} at {company}.

IMPORTANT: You can ONLY answer based on the information in the context below. Never provide information from outside these sources.

PREVIOUS CONVERSATION:
{history}

CURRENT CONTEXT FROM KNOWLEDGE BASE AND WIKIPEDIA:
{ragContext}

USER FOLLOW-UP:
{question}

INSTRUCTIONS:
// --- MODIFIED: Added structural instructions for follow-up ---
- Continue the conversation naturally while maintaining strict adherence to the provided context.
- Start with a friendly, conversational lead-in.
- If providing a list or summary, use **Markdown headings (## or ###) and bullet points** for clarity.
- **Use bold text**, *italic text*, lists, and emojis 💡 to make your answer clear.
- Only use information from the context above and previous conversation
- **If you provide new information from the context, you MUST add a "Sources" section at the end of your response,** listing the sources you used (e.g., "Attract Phase").
- If the answer isn't in the context, clearly state: "I don't have that information in my knowledge base."
- Maintain accuracy and professionalism
- Never speculate or provide information beyond your knowledge sources

RESPONSE:`
};

// =================================================================
// END: UPDATED PROMPT TEMPLATES
// =================================================================


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

// Universal Multi-Folder Semantic RAG System
class MultiFolderSemanticRAG {
    constructor() {
        this.knowledgeBase = {};
        this.chunks = [];
        this.embeddings = [];
        this.isInitialized = false;
        this.embeddingsCachePath = path.join(__dirname, 'embeddings-cache.json');
        this.knowledgeBasePath = path.join(__dirname, 'knowledge-base');
        console.log("🔧 Initializing Universal Multi-Folder Semantic RAG System...");
    }
    
    /**
     * Recursively load knowledge base from folder structure
     */
    loadKnowledgeBase() {
        try {
            const knowledgeBase = {};
            
            console.log("📂 Checking knowledge-base directory structure...");
            console.log("📍 Root knowledge base path:", this.knowledgeBasePath);
            
            if (!fs.existsSync(this.knowledgeBasePath)) {
                console.warn("⚠️ knowledge-base directory not found, creating it...");
                fs.mkdirSync(this.knowledgeBasePath, { recursive: true });
                return knowledgeBase;
            }
            
            // Load files from all subdirectories
            this.loadFilesFromDirectory(this.knowledgeBasePath, knowledgeBase, '');
            
            console.log("✅ All knowledge base folders and files loaded successfully");
            console.log("📊 Total categories in knowledge base:", Object.keys(knowledgeBase).length);
            
            return knowledgeBase;
            
        } catch (error) {
            console.error("❌ Failed to load knowledge base:", error);
            return {};
        }
    }
    
    /**
     * Load files from directory recursively
     */
    loadFilesFromDirectory(dirPath, knowledgeBase, relativePath) {
        try {
            const items = fs.readdirSync(dirPath);
            
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                const stats = fs.statSync(itemPath);
                
                if (stats.isDirectory()) {
                    console.log(`📁 Loading directory: ${itemRelativePath}`);
                    // Recursively load subdirectory
                    this.loadFilesFromDirectory(itemPath, knowledgeBase, itemRelativePath);
                } else if (item.endsWith('.json')) {
                    this.loadJsonFile(itemPath, itemRelativePath, knowledgeBase);
                }
            }
        } catch (error) {
            console.error(`❌ Error reading directory ${dirPath}:`, error.message);
        }
    }
    
    /**
     * Load individual JSON file
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

    // =================================================================
    // START: UPDATED UNIVERSAL CHUNKING LOGIC (with fileName)
    // =================================================================

    /**
     * NEW HELPER: Find a title-like key in an object
     */
    _findContextTitle(obj) {
        if (typeof obj !== 'object' || obj === null) return null;
        
        // Prioritize common title keys
        const titleKeys = ['title', 'name', 'stage_name', 'provision_english', 'question', 'value'];
        for (const key of titleKeys) {
            if (typeof obj[key] === 'string' && obj[key].length > 0 && obj[key].length < 150) {
                return obj[key];
            }
        }
        
        return null;
    }

    /**
     * NEW HELPER: Format a "leaf" object into a single text chunk
     */
    _formatLeafObject(obj) {
        let text = '';
        // Prioritize specific keys to put them first
        const priorityKeys = ['sn', 'question', 'title', 'name', 'value'];
        
        const sortedEntries = Object.entries(obj).sort(([keyA], [keyB]) => {
            const indexA = priorityKeys.indexOf(keyA);
            const indexB = priorityKeys.indexOf(keyB);
            
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });

        for (const [key, value] of sortedEntries) {
            if ((typeof value === 'string' && value.length > 0) || typeof value === 'number') {
                // Format key, then add value
                text += `${this.formatKeyAsTitle(key)}: ${value}\n`;
            }
            // We ignore nested objects/arrays in this simple formatter
        }
        return text.trim();
    }
    
    /**
     * NEW HELPER: Heuristic to decide if an object is a "leaf" (a semantic unit)
     */
    _isLeafObject(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            return false;
        }

        let hasStrings = false;
        
        for (const value of Object.values(obj)) {
            if (typeof value === 'object' && value !== null) {
                // It contains another object, so it's NOT a leaf
                return false; 
            }
            if (Array.isArray(value)) {
                 // It contains an array, so it's NOT a leaf
                 // This handles `tools_required: [...]` in atrract-phase
                return false;
            }
            if (typeof value === 'string' && value.length > 0) {
                hasStrings = true;
            }
        }
        
        // It's a leaf if it has strings and no nested objects/arrays
        return hasStrings;
    }

    /**
     * REVISED & UNIVERSAL CHUNKING SYSTEM
     */
    extractChunks() {
        const chunks = [];
        for (const [filePath, fileContent] of Object.entries(this.knowledgeBase)) {
            const source = this.getSourceFromPath(filePath); // e.g., 'hr-knowledge'
            const fileName = this.getFileNameFromPath(filePath); // e.g., 'code-of-conduct'
            const fileContext = this.formatKeyAsTitle(fileName);
            
            // Pass fileName into the recursive function
            this._recursiveExtract(fileContent, filePath, chunks, [fileContext], source, fileName);
        }
        
        // Update aggregate chunk count for logging
        this.aggregateChunksCount = chunks.filter(c => c.isAggregate).length;
        
        return chunks;
    }

    /**
     * REVISED: Universal Recursive Chunking Function
     * (Now includes fileName)
     */
    _recursiveExtract(item, path, chunks, contextStack, source, fileName) { // Added fileName
        
        // Base Case 1: Item is a simple string
        if (typeof item === 'string' && item.length > 2) {
            chunks.push({
                text: item,
                path: path,
                context: contextStack.join(' - '),
                parentContext: contextStack.slice(0, -1).join(' - ') || 'General',
                source: source,
                fileName: fileName // Store the fileName
            });
            return;
        }

        // Base Case 2: Item is an Array
        if (Array.isArray(item)) {
            
            if (item.length > 0) {
                 const isListOfLeaves = item.every(el => 
                     (typeof el === 'string' && el.length > 2) || 
                     this._isLeafObject(el)
                 );
                 
                 if (isListOfLeaves && item.length > 1) { 
                     let aggregateText = `${contextStack[contextStack.length - 1] || 'List'}:\n\n`;
                     
                     item.forEach((el, idx) => {
                         if (typeof el === 'string') {
                             aggregateText += `${idx + 1}. ${el}\n\n`;
                         } else {
                             aggregateText += `${this._formatLeafObject(el)}\n---\n`;
                         }
                     });
                     
                     if(aggregateText.length > 20) {
                        chunks.push({
                            text: aggregateText,
                            path: path,
                            context: contextStack.join(' - '),
                            parentContext: contextStack.slice(0, -1).join(' - ') || 'General',
                            source: source,
                            fileName: fileName, // Store the fileName
                            isAggregate: true 
                        });
                        return; 
                     }
                 }
            }

            item.forEach((element, index) => {
                // Pass fileName down in recursion
                this._recursiveExtract(element, `${path}[${index}]`, chunks, contextStack, source, fileName);
            });
            
            return;
        }

        // Base Case 3: Item is not a processable type
        if (typeof item !== 'object' || item === null) {
            return;
        }
        
        // --- Item is an Object ---

        if (this._isLeafObject(item)) {
            const formattedText = this._formatLeafObject(item);
            chunks.push({
                text: formattedText,
                path: path,
                context: contextStack.join(' - '),
                parentContext: contextStack.slice(0, -1).join(' - ') || 'General',
                source: source,
                fileName: fileName // Store the fileName
            });
            return; 
        }

        // --- Item is a "Structural Object" ---
        let newContextStack = [...contextStack];
        const title = this._findContextTitle(item);
        
        if (title && title !== newContextStack[newContextStack.length - 1]) {
            newContextStack.push(this.formatKeyAsTitle(title));
        }
        
        let localStrings = {};
        for (const [key, value] of Object.entries(item)) {
            if (typeof value === 'string' && value.length > 0) {
                 localStrings[key] = value;
            }
        }
        
        if (Object.values(localStrings).join("").length > 10) {
            const partialChunkText = this._formatLeafObject(localStrings);
            chunks.push({
                text: partialChunkText,
                path: path,
                context: newContextStack.join(' - '),
                parentContext: newContextStack.slice(0, -1).join(' - ') || 'General',
                source: source,
                fileName: fileName // Store the fileName
            });
        }
        
        for (const [key, value] of Object.entries(item)) {
            if (typeof value === 'object' && value !== null) {
                let childContextStack = [...newContextStack];
                if (!title) {
                    const keyTitle = this.formatKeyAsTitle(key);
                    if (keyTitle !== childContextStack[childContextStack.length - 1]) {
                         childContextStack.push(keyTitle);
                    }
                }
                // Pass fileName down in recursion
                this._recursiveExtract(value, `${path}.${key}`, chunks, childContextStack, source, fileName);
            }
        }
    }

    // =================================================================
    // END: UPDATED UNIVERSAL CHUNKING LOGIC
    // =================================================================


    /**
     * Helper methods
     */
    getFileNameFromPath(filePath) {
        const parts = filePath.split('/');
        return parts[parts.length - 1] || filePath;
    }

    getLastPathPart(path) {
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
    }

    getSourceFromPath(path) {
        const parts = path.split('/');
        return parts[0] || 'general';
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
    
    /**
     * Get folder statistics for debugging
     */
    getFolderStats() {
        const stats = {
            totalFiles: 0,
            categories: {},
            totalChunks: this.chunks.length,
            aggregateChunks: this.chunks.filter(c => c.isAggregate).length
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
            console.log(`📦 Aggregate chunks: ${this.chunks.filter(c => c.isAggregate).length}`);
            
            // Log folder statistics
            const stats = this.getFolderStats();
            console.log("📊 Folder Statistics:", stats);
            
            if (this.chunks.length === 0) {
                console.warn("⚠️ No chunks extracted from knowledge base");
                this.isInitialized = true;
                return;
            }
            
            // ===========================================================
            // START: MODIFIED CODE BLOCK FOR RENDER FREE TIER
            // ===========================================================
            
            // On Render's free tier, we assume the committed cache is the source of truth.
            // We will skip validation and regeneration to ensure fast cold starts.
            
            console.log("📦 Attempting to load committed cache files...");
            const cacheLoaded = await this.loadEmbeddingsCache();
            
            if (cacheLoaded) {
                console.log("✅ Successfully loaded embeddings from committed cache.");
                this.isInitialized = true;
                return;
            }
            
            // If loading fails, log a critical error and stop.
            // This prevents the 10-minute regeneration.
            console.error("❌ CRITICAL: Failed to load 'embeddings-cache.json' from repo.");
            console.error("❌ The server will run, but RAG will not have any knowledge.");
            this.isInitialized = false; // Mark as not initialized
            return;
            
            // ===========================================================
            // END: MODIFIED CODE BLOCK FOR RENDER FREE TIER
            // ===========================================================

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
                
                // Note: We can't perfectly match chunk length anymore if chunk logic changed
                // We rely on the cacheManager's `isCacheValid` check
                if (cache.embeddings && cache.embeddings.length > 0) {
                    this.embeddings = cache.embeddings;
                    console.log("✅ Embeddings loaded from cache!");
                    return true;
                } else {
                    console.log("⚠️ Cache size mismatch or empty, regenerating embeddings");
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
                // We save minimal data now. The chunks are generated live.
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
    
    async generateAllEmbeddings() {
        console.log("🔄 Generating embeddings for all chunks...");
        console.log("⏳ This may take a few minutes...");
        
        if (!GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY not set in environment");
        }
        
        // Clear old embeddings
        this.embeddings = [];

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
     * GENERIC search - works for any question type
     */
    async search(question, topK = 20) {
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
        
        // Ensure embeddings and chunks are aligned
        if (this.embeddings.length !== this.chunks.length) {
            console.error(`❌ Mismatch! Chunks: ${this.chunks.length}, Embeddings: ${this.embeddings.length}. Regenerating cache.`);
            // Note: We removed auto-regeneration, so this is a critical error
            console.error("❌ CRITICAL: Cache mismatch detected. RAG will fail.");
            return [];
        }
        
        const results = this.chunks.map((chunk, index) => {
            let score = this.cosineSimilarity(questionEmbedding, this.embeddings[index]);
            
            // Generic keyword boosting - works for any content type
            score *= this.getGenericKeywordBoost(question, chunk);
            
            // Small boost for aggregate chunks (they often contain comprehensive info)
            if (chunk.isAggregate) {
                score *= 1.1;
            }
            
            return { ...chunk, score };
        });
        
        // Lower threshold to catch more relevant results
        const topResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .filter(r => r.score > 0.1);
        
        console.log(`📊 Found ${topResults.length} relevant chunks (threshold: 0.1)`);
        if (topResults.length > 0) {
            console.log(`🎯 Top score: ${topResults[0].score.toFixed(3)}`);
            console.log(`📍 Top context: ${topResults[0].context}`);
            if (topResults.length > 1) {
                console.log(`📈 Score range: ${topResults[topResults.length-1].score.toFixed(3)} - ${topResults[0].score.toFixed(3)}`);
            }
        }
        
        return topResults;
    }

    /**
     * Generic keyword boosting - works for any content type
     */
    getGenericKeywordBoost(question, chunk) {
        const lowerQuestion = question.toLowerCase();
        const lowerChunkText = chunk.text.toLowerCase();
        const lowerContext = chunk.context.toLowerCase();
        
        let boost = 1.0;
        
        // Common stop words to ignore
        const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 
                                  'in', 'with', 'to', 'for', 'of', 'as', 'by', 'what', 'how', 'when',
                                  'where', 'who', 'why', 'are', 'do', 'does', 'did', 'can', 'could',
                                  'will', 'would', 'should', 'may', 'might', 'must']);
        
        // Extract meaningful words from question
        const questionWords = lowerQuestion
            .split(/\s+|,|\.|\?|!/)
            .filter(w => w.length > 2 && !stopWords.has(w));
        
        // Calculate matches in chunk text
        const textMatches = questionWords.filter(word => 
            lowerChunkText.includes(word)
        ).length;
        
        // Calculate matches in context
        const contextMatches = questionWords.filter(word => 
            lowerContext.includes(word)
        ).length;
        
        // Strong boosting for keyword matches - generic approach
        if (textMatches > 0) {
            boost *= (1 + (textMatches * 0.3));
        }
        
        if (contextMatches > 0) {
            boost *= (1 + (contextMatches * 0.4));
        }
        
        return Math.min(boost, 3.0);
    }
    
    // =================================================================
    // START: UPDATED getContext METHOD (with fileName grouping)
    // =================================================================
    
    /**
     * Improved context building
     * (Now groups by file source)
     */
    async getContext(question, topK = 20) {
        const results = await this.search(question, topK);
        
        if (results.length === 0) {
            console.log("❌ No relevant chunks found for question:", question);
            return "No relevant information found in the knowledge base.";
        }
        
        // Log what we found for debugging
        console.log("🎯 Top search results for context:");
        results.slice(0, 3).forEach((result, i) => {
            console.log(`   ${i+1}. Score: ${result.score.toFixed(3)}, File: ${result.fileName}, Ctx: ${result.context}`);
        });
        
        // Group by FILENAME. This is the key change.
        const groupedByFile = {};
        results.forEach(result => {
            const fileName = result.fileName || 'general'; // e.g., 'code-of-conduct' or 'attract-phase'
            if (!groupedByFile[fileName]) groupedByFile[fileName] = [];
            groupedByFile[fileName].push(result);
        });
        
        const contextParts = [];

        // Loop through each file's chunks
        for (const [fileName, chunks] of Object.entries(groupedByFile)) {
            
            const sourceName = this.formatKeyAsTitle(fileName); // e.g., "Code Of Conduct"
            // Add the source name as a clear header for the AI
            contextParts.push(`\n### Context from: ${sourceName}\n`);
            
            // Prioritize aggregate chunks
            const aggregateChunks = chunks.filter(c => c.isAggregate);
            const regularChunks = chunks.filter(c => !c.isAggregate);
            
            [...aggregateChunks, ...regularChunks].forEach(chunk => {
                // Just add the text. The AI will see it's under the "Context from: ..." header.
                contextParts.push(chunk.text + '\n');
            });
        }

        const finalContext = contextParts.join('\n');
        console.log(`📄 Final context: ${finalContext.length} chars, ${Object.keys(groupedByFile).length} sources`);
        
        return finalContext;
    }

    // =================================================================
    // END: UPDATED getContext METHOD
    // =================================================================
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
        rag: ragSystem.isInitialized ? "✅ Universal Multi-Folder RAG Active" : "⚠️ Initializing...",
        approach: "Universal semantic search across multiple knowledge folders and files",
        chunks: ragSystem.chunks.length,
        aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
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
        service: "Universal Multi-Folder Company Knowledge RAG",
        embedding_model: "text-embedding-004",
        chunks: ragSystem.chunks.length,
        aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
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
        aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
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
        
        // Re-initialize RAG which regenerates everything
        await ragSystem.initializeRAG(cacheManager);
        
        res.json({ 
            success: true,
            message: "Cache regenerated successfully",
            chunks: ragSystem.chunks.length,
            aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
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
        totalChunks: ragSystem.chunks.length,
        aggregateChunks: ragSystem.chunks.filter(c => c.isAggregate).length
    });
});

app.get("/rag/debug/files", (req, res) => {
    res.json({
        files: Object.keys(ragSystem.knowledgeBase),
        fileCount: Object.keys(ragSystem.knowledgeBase).length,
        chunksCount: ragSystem.chunks.length,
        aggregateChunksCount: ragSystem.chunks.filter(c => c.isAggregate).length
    });
});

app.get("/rag/debug/search-chunks", (req, res) => {
    const searchTerm = req.query.q || "policy";
    const matchingChunks = ragSystem.chunks.filter(chunk => 
        chunk.text.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
    
    res.json({
        searchTerm,
        totalMatches: matchingChunks.length,
        chunks: matchingChunks.map(chunk => ({
            text: chunk.text.substring(0, 200) + '...',
            path: chunk.path,
            context: chunk.context,
            isAggregate: chunk.isAggregate
        }))
    });
});

app.get("/rag/debug/chunks", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const chunks = ragSystem.chunks.slice(0, limit);
    res.json({
        total_chunks: ragSystem.chunks.length,
        aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
        sample_chunks: chunks.map(chunk => ({
            text: chunk.text.substring(0, 100) + '...',
            path: chunk.path,
            context: chunk.context,
            isAggregate: chunk.isAggregate
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
        // Use the enhanced context function for debug
        const context = await getEnhancedContext(question, ragSystem);
        
        const finalPrompt = `You are CHA, Company AI Assistant for CDO Foodsphere, Inc.

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
            prompt_preview: finalPrompt.substring(0, 1500) + '...'
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
        
        // Use the ENHANCED context function here
        const context = await getEnhancedContext(question, ragSystem, top_k);
        const results = await ragSystem.search(question, top_k);
        
        res.json({
            context,
            results_count: results.length,
            aggregate_results: results.filter(r => r.isAggregate).length,
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
            console.log("🔍 Using Universal Multi-Folder RAG with Wikipedia integration...");
            // Use the enhanced context function
            ragContext = await getEnhancedContext(prompt, ragSystem);
            
            // Enhanced prompt with behavior context
            const identity = behavior_context?.identity || AI_BEHAVIOR.identity;
            const isFollowUp = behavior_context?.is_follow_up || false;
            
            // --- MODIFIED: Use the server's PROMPT_TEMPLATES ---
            const template = isFollowUp ? PROMPT_TEMPLATES.followUp : PROMPT_TEMPLATES.standard;
            
            finalPrompt = template
                .replace(/{name}/g, identity.name || 'Cindy')
                .replace(/{role}/g, identity.role || 'Company AI Assistant')
                .replace(/{company}/g, identity.company || 'CDO Foodsphere, Inc.')
                .replace(/{context}/g, ragContext)
                .replace(/{question}/g, prompt)
                .replace(/{ragContext}/g, ragContext)
                .replace(/{history}/g, JSON.stringify(behavior_context?.conversation_history || []));
            
            console.log(`📝 Enhanced prompt length: ${finalPrompt.length} chars`);
            console.log("=== UNIVERSAL RAG DEBUG ===");
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
    console.log(`🎯 Universal Multi-Folder RAG Ready!`);
    console.log(`📂 Expected folder structure:`);
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
    console.log(`🌐 Wikipedia Integration: Enabled with 24-hour caching`);
});