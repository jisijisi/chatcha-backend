import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

    get(question, currentKbSignature = null) {
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
                 lowerAnswer.includes("don't have knowledge")) {
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
