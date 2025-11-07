// backend/cache-manager.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CacheManager {
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