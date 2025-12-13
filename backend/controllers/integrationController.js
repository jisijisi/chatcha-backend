// backend/controllers/integrationController.js
import { pool } from '../config/database.js';
import { GoogleService } from '../services/googleService.js';
import fetch from 'node-fetch'; 
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini for API analysis
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. REGISTER A LIVE DATA SOURCE
export const linkLiveGoogleSheet = async (req, res) => {
    const { 
        url, 
        name, 
        description, 
        category_id, 
        subcategory_id,
        source_type = 'google_sheet', // Default to sheet if not provided
        api_config // Required if source_type is 'external_api'
    } = req.body;

    // Validation for basics
    if (!name || !description) {
        return res.status(400).json({ error: "Name and AI Description are required." });
    }

    try {
        console.log(`🔗 Registering Live Source: ${name} (Type: ${source_type})`);
        let config = "";

        // --- BRANCH A: GOOGLE SHEET ---
        if (source_type === 'google_sheet') {
            if (!url) {
                return res.status(400).json({ error: "URL is required for Google Sheets." });
            }

            // 1. Test Connection & Get Metadata
            const sheetData = await GoogleService.fetchSheetData(url);
            
            const sheetId = sheetData.sheetId;

            // 2. Create Configuration JSON
            config = JSON.stringify({
                sheet_id: sheetId,
                sheet_url: url,
                available_tabs: sheetData.tabs
            });

            // Upsert Logic for Sheets based on Sheet ID (prevent duplicates)
            const catId = category_id ? parseInt(category_id) : null;
            const subId = subcategory_id ? parseInt(subcategory_id) : null;

            const [existing] = await pool.query(
                "SELECT id FROM live_data_sources WHERE JSON_EXTRACT(config, '$.sheet_id') = ?", 
                [sheetId]
            );

            if (existing.length > 0) {
                await pool.query(
                    `UPDATE live_data_sources 
                     SET name = ?, description = ?, config = ?, category_id = ?, subcategory_id = ?, is_active = TRUE, updated_at = NOW(), source_type = 'google_sheet'
                     WHERE id = ?`,
                    [name, description, config, catId, subId, existing[0].id]
                );
                console.log(`✅ Updated Sheet source: ${name}`);
            } else {
                await pool.query(
                    `INSERT INTO live_data_sources 
                     (name, description, source_type, config, category_id, subcategory_id)
                     VALUES (?, ?, 'google_sheet', ?, ?, ?)`,
                    [name, description, config, catId, subId]
                );
                console.log(`✅ Registered new Sheet source: ${name}`);
            }
        } 
        
        // --- BRANCH B: EXTERNAL API ---
        else if (source_type === 'external_api') {
            if (!url && (!api_config || !api_config.endpoint)) {
                return res.status(400).json({ error: "Endpoint URL is required for External APIs." });
            }
            if (!api_config) {
                 return res.status(400).json({ error: "Configuration object (api_config) required for External APIs." });
            }

            // Construct API Config object to store in DB
            const apiConfigObj = {
                endpoint: url || api_config.endpoint,
                method: api_config.method || 'GET',
                headers: api_config.headers || {},
                parameters: api_config.parameters || [] 
            };

            config = JSON.stringify(apiConfigObj);

            // Simple Insert for APIs 
            const catId = category_id ? parseInt(category_id) : null;
            const subId = subcategory_id ? parseInt(subcategory_id) : null;

            await pool.query(
                `INSERT INTO live_data_sources 
                 (name, description, source_type, config, category_id, subcategory_id)
                 VALUES (?, ?, 'external_api', ?, ?, ?)`,
                [name, description, config, catId, subId]
            );
            console.log(`✅ Registered new API source: ${name}`);
        }
        else {
             return res.status(400).json({ error: "Invalid source_type provided." });
        }

        res.json({ 
            success: true, 
            message: `Successfully linked "${name}".` 
        });

    } catch (error) {
        console.error('Integration Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// 2. UPDATE A LIVE DATA SOURCE (PUT)
export const updateLiveDataSource = async (req, res) => {
    const { id } = req.params;
    const { 
        name, 
        description, 
        url, 
        category_id, 
        source_type,
        api_config 
    } = req.body;

    if (!id) return res.status(400).json({ error: "ID is required" });

    try {
        console.log(`📝 Updating Source ID ${id}: ${name}`);
        
        let configString = null;

        // Regenerate config if necessary
        if (source_type === 'google_sheet') {
            // Re-validate sheet to ensure tabs/structure is current
            const sheetData = await GoogleService.fetchSheetData(url);
            configString = JSON.stringify({
                sheet_id: sheetData.sheetId,
                sheet_url: url,
                available_tabs: sheetData.tabs
            });
        } else if (source_type === 'external_api') {
            const apiConfigObj = {
                endpoint: url,
                method: api_config.method || 'GET',
                headers: api_config.headers || {},
                parameters: api_config.parameters || [] 
            };
            configString = JSON.stringify(apiConfigObj);
        }

        // Build Update Query
        const params = [name, description, category_id || null];
        let sql = `UPDATE live_data_sources SET name = ?, description = ?, category_id = ?, updated_at = NOW()`;

        if (configString) {
            sql += `, config = ?`;
            params.push(configString);
        }

        sql += ` WHERE id = ?`;
        params.push(id);

        await pool.query(sql, params);

        res.json({ success: true, message: "Source updated successfully." });

    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// 3. LIST ALL SOURCES
export const getLiveDataSources = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                lds.id, lds.name, lds.description, lds.source_type, lds.config, lds.updated_at, lds.is_active,
                lds.category_id, lds.subcategory_id,
                kc.name as category_name,
                ksc.name as subcategory_name
            FROM live_data_sources lds
            LEFT JOIN knowledge_categories kc ON lds.category_id = kc.id
            LEFT JOIN knowledge_subcategories ksc ON lds.subcategory_id = ksc.id
            ORDER BY lds.created_at DESC
        `);
        res.json({ sources: rows });
    } catch (error) {
        console.error('Fetch Error:', error);
        res.status(500).json({ error: "Failed to load data sources" });
    }
};

// 4. DELETE SOURCE
export const deleteLiveDataSource = async (req, res) => {
    try {
        await pool.query("DELETE FROM live_data_sources WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "Source disconnected" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete source" });
    }
};

// 5. ANALYZE SOURCE (Sheet OR API) - FIXED VERSION
export const analyzeGoogleSheet = async (req, res) => {
    const { url, source_type, method, headers, api_config } = req.body;
    
    if (!url && !api_config?.endpoint) {
        return res.status(400).json({ 
            error: "URL or API endpoint is required",
            details: "For Google Sheets: provide 'url'. For External APIs: provide 'url' or 'api_config.endpoint'"
        });
    }

    try {
        console.log(`🔍 Analyzing data source...`);
        console.log(`   Type: ${source_type || 'auto-detect'}`);
        console.log(`   URL: ${url}`);
        console.log(`   API Config:`, api_config);
        
        let description = "";

        // Determine source type if not specified
        let detectedType = source_type;
        if (!detectedType) {
            if (url && url.includes('docs.google.com/spreadsheets')) {
                detectedType = 'google_sheet';
            } else {
                detectedType = 'external_api';
            }
        }

        console.log(`   Detected Type: ${detectedType}`);

        // Use the unified analysis method from GoogleService
        if (detectedType === 'google_sheet') {
            description = await GoogleService.generateAutoDescription(url);
        } 
        else if (detectedType === 'external_api') {
            // Build API config object
            const apiConfig = {
                endpoint: url || api_config?.endpoint,
                method: method || api_config?.method || 'GET',
                headers: headers || api_config?.headers || {},
                parameters: api_config?.parameters || []
            };
            
            console.log(`🌐 Analyzing API with config:`, apiConfig);
            description = await GoogleService.analyzeExternalApi(apiConfig);
        }
        else {
            return res.status(400).json({ 
                error: "Unsupported source type",
                supported_types: ["google_sheet", "external_api"]
            });
        }

        res.json({ 
            success: true, 
            description,
            source_type: detectedType,
            analyzed_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Analyze Error:', error);

        // --- NEW: Better 429/503 Handling ---
        const isQuotaError = error.message.includes('429') || error.message.includes('Too Many Requests');
        const status = isQuotaError ? 429 : 500;
        const message = isQuotaError 
            ? "AI Service is busy (Quota Limit). Please wait a moment and try again." 
            : error.message;

        res.status(status).json({ 
            error: `Failed to analyze ${source_type || 'data source'}`,
            details: message,
            suggestion: source_type === 'external_api' 
                ? "Check if the API endpoint is accessible and doesn't require special authentication." 
                : "Ensure the Google Sheet is publicly accessible or shared with the service account."
        });
    }
};