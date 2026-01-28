import dotenv from 'dotenv';
dotenv.config(); // Load env vars BEFORE importing database

import { pool } from '../config/database.js';
import { invalidateCache, normalizeForSpeech } from '../utils/speechNormalizer.js';

async function addSiopaoRule() {
    try {
        console.log("🛠️ Checking for 'Siopao' rule...");

        // 1. Check if rule exists
        const [rows] = await pool.execute(
            "SELECT * FROM speech_normalization WHERE pattern = 'Siopao'"
        );

        if (rows.length > 0) {
            console.log("✅ 'Siopao' rule already exists:", rows[0]);
            
            // Force update to ensure it's active and correct
            await pool.execute(
                "UPDATE speech_normalization SET replacement = 'Shoh-pao', is_active = TRUE WHERE pattern = 'Siopao'"
            );
            console.log("🔄 Updated 'Siopao' rule to ensure correctness.");
        } else {
            console.log("⚠️ 'Siopao' rule NOT found. Inserting...");
            await pool.execute(
                "INSERT INTO speech_normalization (pattern, replacement, type, description) VALUES (?, ?, ?, ?)",
                ['Siopao', 'Shoh-pao', 'general', 'Fix for Siopao pronunciation']
            );
            console.log("✅ Inserted 'Siopao' rule.");
        }

        // 2. Invalidate Cache
        invalidateCache();

        // 3. Test Normalization
        console.log("\n🧪 Testing Normalization Logic...");
        const testText = "CDO started selling Siopao with a longanisa filling.";
        
        // Wait a bit for cache refresh (if async)
        await new Promise(r => setTimeout(r, 500));

        const normalized = await normalizeForSpeech(testText);
        
        console.log(`Original:   "${testText}"`);
        console.log(`Normalized: "${normalized}"`);

        if (normalized.includes("Shoh-pao")) {
            console.log("🎉 SUCCESS: Rule is working!");
        } else {
            console.error("❌ FAILURE: Rule was NOT applied.");
        }

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        process.exit();
    }
}

addSiopaoRule();
