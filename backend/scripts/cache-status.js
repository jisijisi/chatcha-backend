// backend/scripts/cache-status.js
import { CacheManager } from '../cache-manager.js';

const cacheManager = new CacheManager();
const isValid = cacheManager.isCacheValid();
const info = cacheManager.getCacheInfo();

console.log("📊 Cache Status:");
console.log(`✅ Valid: ${isValid}`);
if (info) {
    console.log(`📅 Generated: ${info.cacheGenerated}`);
    console.log(`📁 Files: ${info.fileCount}`);
    console.log(`💾 Cache Size: ${info.cacheSize} bytes`);
    console.log(`📝 Knowledge Base Size: ${info.totalSize} bytes`);
    console.log(`🔢 Signature: ${info.signature}`);
} else {
    console.log("❌ No cache information found");
}