import { pool } from '../config/database.js';

let normalizationCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Loads normalization rules from the database.
 * Falls back to defaults if DB fails or is empty.
 */
async function loadRules() {
  // Return cached rules if valid
  if (normalizationCache && (Date.now() - lastCacheUpdate < CACHE_TTL)) {
    return normalizationCache;
  }

  console.log("🔄 [Speech Normalizer] Loading rules from DB/Cache...");

  // Keep reference to old cache in case of failure
  const previousCache = normalizationCache;

  // Fallback defaults (System-level pronunciations)
  // NOTE: Full list moved to database (speech_normalization table).
  const defaults = [];

  let mergedRules = [...defaults];
  let dbSuccess = false;

  try {
    // Check if table exists first (Lazy Init protection)
    const [rows] = await pool.execute(
      "SELECT pattern, replacement FROM speech_normalization WHERE is_active = TRUE"
    );
    
    if (rows.length > 0) {
        console.log(`🎤 Speech Normalizer: Loaded ${rows.length} custom rules from DB.`);
        const ruleMap = new Map();
        
        // 1. Load defaults
        defaults.forEach(d => ruleMap.set(d.pattern, d.replacement));
        
        // 2. Override/Add DB rules
        rows.forEach(r => ruleMap.set(r.pattern, r.replacement));
        
        // 3. Convert back to array
        mergedRules = Array.from(ruleMap.entries()).map(([pattern, replacement]) => ({ pattern, replacement }));
        dbSuccess = true;
    } else {
        console.log(`🎤 Speech Normalizer: DB connected but no active rules found.`);
        dbSuccess = true; // Query succeeded, just empty
    }
  } catch (err) {
    console.warn("⚠️ Speech Normalization: DB load failed.", err.message);
    
    // If DB fails and we have previous cache, keep using it!
    if (previousCache) {
        console.log("⚠️ Keeping previous cache due to DB failure.");
        // Don't update lastCacheUpdate so we retry next time
        return previousCache;
    }
  }

  // Sort by length DESC to ensure specific phrases are replaced before general words
  mergedRules.sort((a, b) => b.pattern.length - a.pattern.length);
  
  console.log(`🎤 [Speech Normalizer] Active Rules: ${mergedRules.length}`);
  if (mergedRules.length > 0) {
      console.log(`🎤 [Speech Normalizer] Sample Rule: ${mergedRules[0].pattern} -> ${mergedRules[0].replacement}`);
  }

  const newCache = mergedRules.map(d => {
    let finalReplacement = d.replacement;

    // 🧠 SMART IPA DETECTION
    // If the replacement contains IPA-specific characters (non-standard Latin), 
    // AND is not already wrapped in XML/SSML tags, 
    // Automatically wrap it in the proper SSML tag format.
    const ipaRegex = /[ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟɠɡɢɣɤɥɦɧħʜɪɨʝɭɮɯɰɱɲɳɴɵɶɸɹɺɻɽɾʀʁʂʃʄtɕtʃʈʉʊʋʌʍʎʏʑʐʒʔʡʕʢʘǀǃǂǁˈˌː]/;
    
    // Check if it looks like IPA and is NOT already a tag
    // We now include a simpler check: if it has common IPA chars OR if it's the specific "Canumay" replacement
    if (!finalReplacement.trim().startsWith('<') && (ipaRegex.test(finalReplacement) || d.pattern === 'Canumay')) {
        console.log(`🎤 [Speech Normalizer] Auto-wrapping IPA for: ${d.pattern}`);
        // REMOVED <speak> wrapper to prevent pausing mid-sentence
        finalReplacement = `<phoneme alphabet="ipa" ph="${finalReplacement}">${d.pattern}</phoneme>`;
    }

    return {
        // Use Unicode Property Escapes for robust boundaries (handles _siopao_, *siopao*, etc.)
        pattern: new RegExp(`(?<!\\p{L}|\\p{N})${escapeRegExp(d.pattern)}(?!\\p{L}|\\p{N})`, 'gui'),
        replacement: finalReplacement
    };
  });
  
  normalizationCache = newCache;
  
  // Only update timestamp if DB load was successful
  if (dbSuccess) {
      lastCacheUpdate = Date.now();
  } else {
      // If we are here, it means DB failed AND we didn't have previous cache.
      // We set a short TTL (e.g. 10s) to retry soon instead of waiting 5 mins.
      lastCacheUpdate = Date.now() - CACHE_TTL + 10000; 
  }
  
  return normalizationCache;
}

// Helper to escape regex special chars
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes text for better TTS pronunciation.
 * Now supports async loading of rules from DB.
 * 
 * NOTE: For performance in synchronous contexts (like simple string processing),
 * this function might check the cache. If cache is empty, it triggers a background refresh
 * and uses defaults temporarily.
 */
export async function normalizeForSpeech(text) {
  if (!text || typeof text !== 'string') return text;

  // DEBUG: Check if we are receiving the target word
  if (text.toLowerCase().includes('siopao')) {
      console.log(`🎤 [Speech Normalizer] DEBUG: Found 'siopao' in input text: "${text.substring(0, 50)}..."`);
  }

  let rules = normalizationCache;
  
  // If no cache, wait for load
  if (!rules) {
    rules = await loadRules();
  } else {
    // If cache expired, trigger refresh in background but use current
    if (Date.now() - lastCacheUpdate > CACHE_TTL) {
      loadRules().catch(e => console.error("Background rule refresh failed", e));
    }
  }

  let normalized = text;
  let hasReplacement = false;
  
  for (const { pattern, replacement } of rules) {
    if (pattern.test(normalized)) {
        // Reset lastIndex because we are using global flag 'g' and test() advances it
        pattern.lastIndex = 0; 
        const before = normalized;
        normalized = normalized.replace(pattern, replacement);
        
        if (before !== normalized) {
            console.log(`🎤 [Speech Normalizer] Matched Rule: "${pattern.source}" -> "${replacement}"`);
            hasReplacement = true;
        }
    }
  }

  if (hasReplacement) {
      console.log(`🎤 [Speech Normalizer] Original: "${text.substring(0, 50)}..."`);
      console.log(`🎤 [Speech Normalizer] Result:   "${normalized.substring(0, 50)}..."`);
      // Log the full result if it contains SSML tags, for debugging
      if (normalized.includes('<speak>')) {
          console.log(`🎤 [Speech Normalizer] FULL SSML RESULT: ${normalized}`);
      }
  }

  return normalized;
}

// Export a method to force refresh cache (called by Admin Controller)
export function invalidateCache() {
  normalizationCache = null;
  lastCacheUpdate = 0;
  console.log("🔄 Speech Normalization Cache Invalidated");
}
