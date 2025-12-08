// services/cacheService.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CacheService {
  constructor(cachePath = 'embeddings-cache.json', cacheInfoPath = 'cache-info.json') {
    this.cachePath = path.join(__dirname, '..', cachePath);
    this.cacheInfoPath = path.join(__dirname, '..', cacheInfoPath);
  }

  // Save embeddings cache
  async saveEmbeddingsCache(embeddings, chunks, source = 'new_database_schema') {
    try {
      const cache = {
        embeddings: embeddings,
        timestamp: new Date().toISOString(),
        chunks_count: chunks.length,
        source: source
      };
      
      this.ensureDirectoryExists(this.cachePath);
      fs.writeFileSync(this.cachePath, JSON.stringify(cache, null, 2));
      console.log("💾 Embeddings cached successfully!");
      return true;
    } catch (error) {
      console.warn("⚠️ Could not save embeddings cache:", error.message);
      return false;
    }
  }

  // Load embeddings cache
  async loadEmbeddingsCache(expectedChunksCount = 0) {
    try {
      if (fs.existsSync(this.cachePath)) {
        console.log("📦 Loading embeddings from cache...");
        const cacheData = fs.readFileSync(this.cachePath, 'utf8');
        const cache = JSON.parse(cacheData);
        
        if (cache.embeddings && cache.embeddings.length === expectedChunksCount) {
          console.log(`✅ Embeddings loaded from cache! (${cache.embeddings.length} embeddings)`);
          return cache.embeddings;
        } else {
          console.warn(`⚠️ Cache mismatch: expected=${expectedChunksCount}, actual=${cache.embeddings?.length || 0}`);
          return null;
        }
      }
      console.log("📦 No embeddings cache found");
      return null;
    } catch (error) {
      console.warn("⚠️ Could not load embeddings cache:", error.message);
      return null;
    }
  }

  // Save cache information
  async saveCacheInfo(cacheSignature, cacheSize = 0, schema = 'new_relational_v1') {
    try {
      if (!cacheSignature) return false;

      const info = {
        ...cacheSignature,
        cacheGenerated: new Date().toISOString(),
        cacheSize: cacheSize,
        schema: schema
      };
      
      this.ensureDirectoryExists(this.cacheInfoPath);
      fs.writeFileSync(this.cacheInfoPath, JSON.stringify(info, null, 2));
      console.log('✅ Cache information saved');
      return true;
    } catch (error) {
      console.error('❌ Error saving cache info:', error);
      return false;
    }
  }

  // Load cache information
  getCacheInfo() {
    try {
      if (fs.existsSync(this.cacheInfoPath)) {
        return JSON.parse(fs.readFileSync(this.cacheInfoPath, 'utf8'));
      }
      return null;
    } catch (error) {
      console.error('❌ Error reading cache info:', error);
      return null;
    }
  }

  // Clear all cache files
  clearCache() {
    try {
      let clearedFiles = 0;
      
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
        console.log('✅ Embeddings cache deleted');
        clearedFiles++;
      }
      
      if (fs.existsSync(this.cacheInfoPath)) {
        fs.unlinkSync(this.cacheInfoPath);
        console.log('✅ Cache info deleted');
        clearedFiles++;
      }
      
      return clearedFiles > 0;
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      return false;
    }
  }

  // Get cache statistics
  getCacheStats() {
    try {
      const stats = {
        embeddingsCache: {
          exists: fs.existsSync(this.cachePath),
          size: 0,
          timestamp: null
        },
        cacheInfo: {
          exists: fs.existsSync(this.cacheInfoPath),
          size: 0,
          timestamp: null
        }
      };

      if (stats.embeddingsCache.exists) {
        const embStats = fs.statSync(this.cachePath);
        stats.embeddingsCache.size = embStats.size;
        stats.embeddingsCache.timestamp = embStats.mtime;
      }

      if (stats.cacheInfo.exists) {
        const infoStats = fs.statSync(this.cacheInfoPath);
        stats.cacheInfo.size = infoStats.size;
        stats.cacheInfo.timestamp = infoStats.mtime;
      }

      return stats;
    } catch (error) {
      console.error('❌ Error getting cache stats:', error);
      return null;
    }
  }

  // Check if cache is fresh (within time threshold)
  isCacheFresh(maxAgeHours = 24) {
    try {
      if (!fs.existsSync(this.cacheInfoPath)) {
        return false;
      }

      const cacheInfo = this.getCacheInfo();
      if (!cacheInfo || !cacheInfo.cacheGenerated) {
        return false;
      }

      const cacheTime = new Date(cacheInfo.cacheGenerated);
      const now = new Date();
      const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);

      return hoursDiff <= maxAgeHours;
    } catch (error) {
      console.error('❌ Error checking cache freshness:', error);
      return false;
    }
  }

  // Utility function to ensure directory exists
  ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Backup current cache
  async backupCache(backupSuffix = 'backup') {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${backupSuffix}_${timestamp}`;
      
      let backedUpFiles = 0;

      if (fs.existsSync(this.cachePath)) {
        const backupPath = this.cachePath.replace('.json', `_${backupName}.json`);
        fs.copyFileSync(this.cachePath, backupPath);
        console.log(`📦 Embeddings cache backed up to: ${path.basename(backupPath)}`);
        backedUpFiles++;
      }

      if (fs.existsSync(this.cacheInfoPath)) {
        const backupInfoPath = this.cacheInfoPath.replace('.json', `_${backupName}.json`);
        fs.copyFileSync(this.cacheInfoPath, backupInfoPath);
        console.log(`📦 Cache info backed up to: ${path.basename(backupInfoPath)}`);
        backedUpFiles++;
      }

      return backedUpFiles;
    } catch (error) {
      console.error('❌ Error backing up cache:', error);
      return 0;
    }
  }

  // Clean up old backup files
  cleanupOldBackups(maxBackups = 5) {
    try {
      const cacheDir = path.dirname(this.cachePath);
      const files = fs.readdirSync(cacheDir);
      
      const backupFiles = files.filter(file => 
        file.includes('_backup_') && (file.endsWith('.json'))
      ).map(file => ({
        name: file,
        path: path.join(cacheDir, file),
        time: fs.statSync(path.join(cacheDir, file)).mtime.getTime()
      })).sort((a, b) => b.time - a.time); // Sort by time, newest first

      if (backupFiles.length > maxBackups) {
        const filesToDelete = backupFiles.slice(maxBackups);
        filesToDelete.forEach(backup => {
          fs.unlinkSync(backup.path);
          console.log(`🧹 Deleted old backup: ${backup.name}`);
        });
        return filesToDelete.length;
      }
      
      return 0;
    } catch (error) {
      console.error('❌ Error cleaning up old backups:', error);
      return 0;
    }
  }
}

// Export a singleton instance
export const cacheService = new CacheService();