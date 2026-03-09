// backend/controllers/integrationController.js
import { pool } from '../config/database.js';
import { GoogleService } from '../services/googleService.js';
import { DatabaseProfiler } from '../utils/DatabaseProfiler.js';
import fetch from 'node-fetch'; 
import { GoogleGenerativeAI } from "@google/generative-ai";
import mysql from 'mysql2/promise';

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
        else if (source_type === 'database') {
            const { db_config } = req.body;
            if (!db_config || !db_config.host || !db_config.user || !db_config.database) {
                return res.status(400).json({ error: "Database configuration (host, user, database) is required." });
            }

            // Store Config (Encrypted password ideally, but plain for now per task scope)
            config = JSON.stringify(db_config);

            const catId = category_id ? parseInt(category_id) : null;
            const subId = subcategory_id ? parseInt(subcategory_id) : null;

            await pool.query(
                `INSERT INTO live_data_sources 
                 (name, description, source_type, config, category_id, subcategory_id)
                 VALUES (?, ?, 'database', ?, ?, ?)`,
                [name, description, config, catId, subId]
            );
            console.log(`✅ Registered new Database source: ${name}`);
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
        } else if (source_type === 'database') {
            const { db_config } = req.body;
             // Keep existing password if not provided in update
            if (!db_config.password) {
                 // Fetch existing to get password
                 const [rows] = await pool.query("SELECT config FROM live_data_sources WHERE id = ?", [id]);
                 if (rows.length > 0) {
                     const oldConfig = JSON.parse(rows[0].config);
                     db_config.password = oldConfig.password;
                 }
            }
            configString = JSON.stringify(db_config);
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

// 6. LINK DATABASE (Dedicated Handler)
export const linkDatabase = async (req, res) => {
    // This is essentially a wrapper around linkLiveGoogleSheet but specific for clean routing
    req.body.source_type = 'database';
    return linkLiveGoogleSheet(req, res);
};

// 7. TEST DATABASE CONNECTION
export const testDatabaseConnection = async (req, res) => {
    const { type, host, port, database, user, password } = req.body;

    if (!host || !user || !database) {
        return res.status(400).json({ error: "Host, User, and Database are required." });
    }

    if (type !== 'mysql') {
         return res.status(400).json({ error: "Currently only MySQL is supported for direct connection testing. (PostgreSQL driver missing)" });
    }

    let connection;
    try {
        console.log(`🔌 Testing MySQL Connection: ${user}@${host}:${port || 3306}/${database}`);
        connection = await mysql.createConnection({
            host,
            user,
            password,
            database,
            port: port || 3306,
            connectTimeout: 5000 // 5s timeout
        });

        await connection.ping();
        console.log('✅ MySQL Connection Successful!');
        
        res.json({ success: true, message: "Connection successful!" });

    } catch (error) {
        console.error('❌ DB Test Failed:', error.message);
        res.status(400).json({ error: `Connection failed: ${error.message}` });
    } finally {
        if (connection) await connection.end();
    }
};

// 8. ANALYZE DATABASE SCHEMA
export const analyzeDatabase = async (req, res) => {
    const { type, host, port, database, user, password } = req.body;

    if (type !== 'mysql') {
        return res.status(400).json({ error: "Only MySQL analysis is currently supported." });
    }

    let connection;
    try {
        connection = await mysql.createConnection({
            host, user, password, database, port: port || 3306
        });

        // 1. Get Tables
        const [tables] = await connection.execute("SHOW TABLES");
        const tableNames = tables.map(t => Object.values(t)[0]);

        // 2. Build Rich Context using DatabaseProfiler (Smart Sampling)
        console.log(`📊 Profiling Database: ${database} (${tableNames.length} tables)...`);
        
        // This helper fetches metadata AND samples (up to 50 unique values per column)
        // effectively handling large datasets by only looking at distinct samples
        const dbProfile = await DatabaseProfiler.profileDatabase(connection, tableNames);
        
        // Convert profile to text summary for LLM
        const dbContext = DatabaseProfiler.generateLLMSummary(dbProfile);
        
        // 3. Ask Gemini to describe it
        try {
            console.log(`🤖 Analyzing DB Schema...`);
            
            // Fetch active model
            let activeModel = "gemini-flash-latest";
            try {
                const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
                if (settings.length > 0 && settings[0].ai_model) {
                    activeModel = settings[0].ai_model;
                }
            } catch (e) { console.warn("Using default model, DB fetch failed:", e.message); }

            const model = genAI.getGenerativeModel({ model: activeModel });
            
            const prompt = `
            You are a Senior Database Architect. Analyze this MySQL database for an AI Text-to-SQL system.

            **SYSTEM CONTEXT:**
            This database will be used by an AI assistant to answer user questions. The AI needs to know exactly what tables to query and how to join them.

            **DATABASE PROFILE (SAMPLED CONTENT):**
            ${dbContext}

            **YOUR TASK:**
            Write a comprehensive **Database Description** that includes:
            1. **DATABASE OVERVIEW**: What business domain this DB serves (e.g., E-commerce, HR, Logs)
            2. **KEY TABLES**: The most important tables and what they represent
            3. **RELATIONSHIPS**: How tables connect (Foreign Keys, logical links)
            4. **COLUMN ANALYSIS**: Key columns for filtering (status, dates, types)
            5. **SAMPLE QUERIES**: 3-5 example SQL queries for common questions

            **OUTPUT TEMPLATE:**
            ==============================================
            DATABASE: ${database}
            ==============================================
            Overview: [Brief description of the database domain and purpose]

            📊 SCHEMA SUMMARY:
            • Total Tables: ${dbProfile.totalTables}
            • Key Tables: ${dbProfile.analyzedTables.join(', ')}

            🚨 CRITICAL STRUCTURAL NOTES:
            1. [Important note about ID formats, or soft deletes, or composite keys]

            🔍 TABLE DEFINITIONS (SQL COMPATIBLE):

            [Table 1]: [Table Name]
            - **SQL Table:** \`table_name\`
              • Description: [Content description]
              • Key Columns:
                - \`id_col\` (type): Primary Key
                - \`foreign_id\` (type): Links to [Other Table]
                - \`status_col\`: [Categorical values found in sample]
              • 💡 Query Tip: [Advice on how to query this table]

            [Continue for other analyzed tables...]

            🧠 DATA CONTENT INTELLIGENCE:
            • Key Identifiers: [List main ID columns]
            • Date Ranges: [If visible in samples]
            • Main Categories: [If visible in samples]

            💡 SQL QUERY TIPS:
            • Use \`table_name\` (lowercase)
            • Join [Table A] and [Table B] on \`a.id = b.a_id\`
            • Handle NULLs in [Column X]

            🎯 RECOMMENDED QUERIES:
            1. \`SELECT * FROM table WHERE status = 'Active'\` - Find active items
            2. \`SELECT count(*) FROM table\` - Count records
            3. [More complex join query example]

            ❓ SUGGESTED_SAMPLE_QUESTIONS (Natural Language):
            1. [Simple question about specific ID or entity]
            2. [Question about status or filtering]
            3. [Question about counts or aggregations]
            4. [Question about recent activity]
            5. [Complex question involving multiple tables if applicable]
            ==============================================
            `;

            // Use the unified retry method
            const result = await GoogleService.generateContentWithRetry(model, prompt);
            const description = result.response.text();
            
            res.json({ success: true, description });

        } catch (error) {
            console.error('❌ DB Analysis AI Failed:', error);
             res.status(500).json({ error: "Failed to generate AI description: " + error.message });
        }

    } catch (error) {
        console.error('❌ DB Analysis Failed:', error);
        res.status(500).json({ error: "Failed to analyze database schema: " + error.message });
    } finally {
        if (connection) await connection.end();
    }
};