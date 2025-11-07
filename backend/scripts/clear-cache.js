// backend/scripts/clear-cache.js
import { CacheManager } from '../cache-manager.js';

const cacheManager = new CacheManager();
const success = cacheManager.clearCache();

if (success) {
    console.log("✅ Cache cleared successfully");
} else {
    console.log("❌ Failed to clear cache");
    process.exit(1);
}