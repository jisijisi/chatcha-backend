import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ragSystem } from './ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ResponseCacheService {
    constructor(cacheFile = 'response-cache.json', ttlHours = 24) {
        // Use a hidden .cache directory to prevent file watchers (nodemon/LiveServer) from triggering reloads
        this.cacheDir = path.join(__dirname, '..', '.cache');
        this.cachePath = path.join(this.cacheDir, cacheFile);
        this.ttlHours = ttlHours;
        this.cache = {};
        
        this.ensureCacheDir();
        this.loadCache();
    }

    ensureCacheDir() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
        } catch (error) {
            console.error('❌ Error creating cache directory:', error);
        }
    }

    loadCache() {
        try {
            if (fs.existsSync(this.cachePath)) {
                const data = fs.readFileSync(this.cachePath, 'utf8');
                this.cache = JSON.parse(data);
                console.log(`📦 Response cache loaded: ${Object.keys(this.cache).length} entries`);
                this.cleanupExpired();
            } else {
                this.cache = {};
            }
        } catch (error) {
            console.error('❌ Error loading response cache:', error);
            this.cache = {};
        }
    }

    saveCache() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            console.error('❌ Error saving response cache:', error);
        }
    }

    cleanupExpired() {
        const now = Date.now();
        let changed = false;
        const ttlMs = this.ttlHours * 60 * 60 * 1000;

        for (const key in this.cache) {
            if (now - this.cache[key].timestamp > ttlMs) {
                delete this.cache[key];
                changed = true;
            }
        }

        if (changed) {
            this.saveCache();
            console.log('🧹 Cleaned up expired cache entries');
        }
    }

    normalizeKey(text) {
        if (!text) return '';
        return text.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    get(question, currentKbSignature = null, userPermissions = null) {
        if (!question) return null;
        const key = this.normalizeKey(question);
        const entry = this.cache[key];

        if (entry) {
            // 1. Check Time-to-Live (TTL)
            const now = Date.now();
            const ttlMs = this.ttlHours * 60 * 60 * 1000;
            if (now - entry.timestamp > ttlMs) {
                delete this.cache[key];
                this.saveCache();
                return null;
            }

            // 2. Check Knowledge Base Version (Cache Invalidation on Update)
            // If a current signature is provided, we MUST match it.
            // If the cached entry has no signature (old format) but we have a current one, invalidate it.
            if (currentKbSignature) {
                if (entry.kbSignature !== currentKbSignature) {
                    console.log(`♻️ Cache invalid: KB updated (Old: ${entry.kbSignature?.substring(0,6)}, New: ${currentKbSignature.substring(0,6)})`);
                    delete this.cache[key];
                    this.saveCache();
                    return null;
                }
            }

            // 3. Check User Permissions (Security)
            if (userPermissions && userPermissions !== 'FULL_ACCESS') {
                const accessedDocs = entry.data.accessed_documents || [];
                if (accessedDocs.length > 0) {
                    // Check if user has access to ALL documents used in the response
                    const allDocsAllowed = accessedDocs.every(doc => {
                        const docId = doc.id;
                        // Skip permission check for external sources or non-numeric IDs
                        if (docId === 'ext' || typeof docId !== 'number') return true;
                        
                        // Find metadata for this doc ID in current Knowledge Base
                        let docMetadata = null;
                        if (ragSystem.knowledgeBase) {
                            for (const fileData of Object.values(ragSystem.knowledgeBase)) {
                                if (fileData.id === docId) {
                                    docMetadata = fileData; // { id, categoryId, subcategoryId, sourceId... }
                                    break;
                                }
                            }
                        }
                        
                        if (!docMetadata) {
                            // Document used in cache no longer exists in KB -> Invalidate Cache
                            console.warn(`⚠️ Cached document ID ${docId} not found in current KB. Invalidating cache.`);
                            return false; 
                        }
                        
                        // Construct a mock chunk for permission checking
                        const mockChunk = {
                            categoryId: docMetadata.categoryId,
                            subcategoryId: docMetadata.subcategoryId,
                            sourceId: docMetadata.sourceId
                        };
                        
                        return ragSystem.isDocumentAllowed(mockChunk, userPermissions);
                    });
                    
                    if (!allDocsAllowed) {
                        console.log(`🚫 Cache hit denied: User lacks permission for one or more documents in cached response.`);
                        return null;
                    }
                }
            }

            // 4. RETROACTIVE FIX: Do not serve KNOWLEDGE_BASE responses that have NO documents
            // This handles the case where a user previously got a "No access" response cached,
            // and now has access but is still seeing the cached "No access" message.
            if (entry.data.intent === 'KNOWLEDGE_BASE') {
                const docs = entry.data.accessed_documents || [];
                if (docs.length === 0) {
                    console.log(`🚫 Cache hit denied: KNOWLEDGE_BASE response has 0 documents (likely previous 'No Access' result).`);
                    return null;
                }
                
                // 5. RETROACTIVE FIX (Stronger): Detect "I don't know" / "Missing Knowledge" responses even if they cite sources
                // This covers the case where the bot falls back to "General" docs but still says "I don't see the specific info".
                const answerText = (entry.data.answer || '').toLowerCase();
                if (
                    answerText.includes("i don't see the specific") || 
                    answerText.includes("i'm not seeing the specific") ||
                    answerText.includes("don't have knowledge") ||
                    answerText.includes("checking with hr") ||
                    answerText.includes("check with hr")
                ) {
                    console.log(`🚫 Cache hit denied: Response contains fallback language ("${answerText.substring(0, 30)}..."). Forcing fresh RAG lookup.`);
                    return null;
                }
            }

            console.log(`🚀 Serving cached response for: "${question}"`);
            return entry.data;
        }
        return null;
    }

    set(question, responseData, kbSignature = null) {
        if (!question || !responseData) return;
        
        // Don't cache if response indicates error or missing knowledge
        if (responseData.success === false) return;
        if (typeof responseData.answer === 'string') {
             const lowerAnswer = responseData.answer.toLowerCase();
             if (lowerAnswer.includes("i'm not seeing the specific") || 
                 lowerAnswer.includes("i don't see the specific") ||
                 lowerAnswer.includes("don't have knowledge") ||
                 lowerAnswer.includes("checking with hr") ||
                 lowerAnswer.includes("check with hr")) {
                 console.log(`⚠️ Not caching fallback response: "${lowerAnswer.substring(0, 30)}..."`);
                 return;
             }
        }

        // PREVENTIVE FIX: Don't cache KNOWLEDGE_BASE responses if no documents were accessed.
        // This prevents caching "No access" or "I found info but you can't see it" responses.
        if (responseData.intent === 'KNOWLEDGE_BASE') {
            const docs = responseData.accessed_documents || [];
            if (docs.length === 0) {
                console.log(`⚠️ Not caching KNOWLEDGE_BASE response with 0 documents (Context/Permission issue)`);
                return;
            }
        }

        const key = this.normalizeKey(question);
        this.cache[key] = {
            timestamp: Date.now(),
            kbSignature: kbSignature, // Store the version of the KB used
            data: responseData
        };
        this.saveCache();
        console.log(`💾 Cached response for: "${question}" (Sig: ${kbSignature ? kbSignature.substring(0,6) : 'None'})`);
    }

    clear() {
        this.cache = {};
        if (fs.existsSync(this.cachePath)) {
            fs.unlinkSync(this.cachePath);
        }
        console.log('🧹 Response cache cleared');
    }
}

export const responseCache = new ResponseCacheService();
