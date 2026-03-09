import { GoogleGenerativeAI } from "@google/generative-ai";
import alasql from 'alasql';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';
import { GoogleService } from './googleService.js';
import { ContextManager } from '../utils/ContextManager.js';
import mysql from 'mysql2/promise'; // Added for Database support
import { PromptService } from './promptService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY");

export class SmartDataAnalyst {
    constructor() {
        this.model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        this.data = {}; // Initialize empty, data will be fetched live
        this.sourceNames = {}; // Map datasetName -> real source name
        this.sourceCategories = {}; // Map datasetName -> category name
        
        // Register custom SQL functions for Alasql
        // Note: LEFT is a reserved keyword in Alasql parser, so we use SUBSTR
        alasql.fn.SUBSTR = function(str, start, len) {
            if (!str) return '';
            // SQL SUBSTR is 1-based, JS substring is 0-based
            return str.substring(start - 1, start - 1 + len);
        };
        
        // Custom Length function to override Alasql's default if needed or alias
        alasql.fn.LEN = function(str) {
            return str ? str.length : 0;
        };
        
        // Random function for "Pick a random todo"
        alasql.fn.RANDOM = function() {
            return Math.random();
        };

        // Word Count for "title has exactly 5 words"
        alasql.fn.WORD_COUNT = function(str) {
            if (!str) return 0;
            return str.trim().split(/\s+/).length;
        };

        // ============================================================
        // JSON Functions (MySQL Compatibility for Alasql)
        // ============================================================
        
        // Helper to safely parse JSON
        const safeParse = (data) => {
            if (typeof data === 'object' && data !== null) return data;
            try { return JSON.parse(data); } catch (e) { return null; }
        };

        // Helper to traverse path (e.g. "$.chats[0].title")
        const getByPath = (obj, pathStr) => {
            if (!obj || !pathStr) return null;
            // Remove "$." prefix if present
            const cleanPath = pathStr.replace(/^\$\.?/, '');
            if (!cleanPath) return obj;

            // Split by . or []
            // Matches: "chats", "0" (from [0]), "title"
            const parts = cleanPath.match(/([a-zA-Z0-9_]+)|\[(\d+)\]/g).map(p => p.replace(/[\[\]]/g, ''));
            
            let current = obj;
            for (const part of parts) {
                if (current === null || current === undefined) return null;
                current = current[part];
            }
            return current;
        };

        alasql.fn.JSON_EXTRACT = function(json, path) {
            const obj = safeParse(json);
            return getByPath(obj, path);
        };

        alasql.fn.JSON_UNQUOTE = function(val) {
            if (typeof val === 'string') {
                // Remove surrounding quotes if they exist (MySQL behavior)
                // But typically JSON_EXTRACT returns the raw value in JS, so unquote is often identity.
                // However, if it's a JSON string '"value"', we parse it.
                if (val.startsWith('"') && val.endsWith('"')) {
                    try { return JSON.parse(val); } catch(e) {}
                }
            }
            return val;
        };

        alasql.fn.JSON_CONTAINS = function(target, candidate, path) {
            let obj = safeParse(target);
            if (path) obj = getByPath(obj, path);
            
            if (!obj) return false;

            // Candidate is usually a JSON string in SQL (e.g. '"value"')
            // We need to compare it against the actual value in obj
            let searchVal = candidate;
            try { searchVal = JSON.parse(candidate); } catch(e) {}

            if (Array.isArray(obj)) {
                return obj.includes(searchVal);
            } else if (typeof obj === 'object') {
                // Shallow check for partial object match (simple version)
                // MySQL JSON_CONTAINS(obj, subObj) checks if subObj is contained in obj
                if (typeof searchVal === 'object' && searchVal !== null) {
                    for (const key in searchVal) {
                        if (obj[key] !== searchVal[key]) return false;
                    }
                    return true;
                }
            }
            
            return obj === searchVal;
        };
        
        alasql.fn.JSON_LENGTH = function(json, path) {
             const obj = safeParse(json);
             const target = path ? getByPath(obj, path) : obj;
             if (Array.isArray(target)) return target.length;
             if (typeof target === 'object' && target !== null) return Object.keys(target).length;
             return 0; // Scalars have length 0 or 1 in MySQL? Actually MySQL returns 1 for scalars, but 0 makes sense for empty.
        };
    }

    /**
     * Main entry point for the Smart Data Analyst
     * @param {string} userQuery - The user's question
     * @param {Array} history - Conversation history
     */
    async processQuery(userQuery, history = [], lastBotResponse = null, sessionId = null, userEmail = null, translatedQuery = null) {
        try {
            console.log(`🧠 SmartDataAnalyst processing: "${userQuery}" (Translated: "${translatedQuery}")`);

            // 0. Fetch User Context (for "I", "me", "my" resolution)
            let userContext = null;
            if (userEmail) {
                try {
                    // Fetch comprehensive user details to support various self-reference queries
                    // Using SELECT * to be robust against column name variations (name vs full_name)
                    const [rows] = await pool.execute(
                        "SELECT * FROM employees WHERE email = ? AND is_active = TRUE",
                        [userEmail]
                    );
                    if (rows.length > 0) {
                        userContext = rows[0];
                        // Ensure we have the standard fields expected by the prompt logic
                        userContext.full_name = userContext.full_name || userContext.name || "Unknown";
                        userContext.emp_id = userContext.emp_id || userContext.employee_id || userContext.id;
                        
                        // NOTE: Do not override emp_id with system ID. 
                        // The userContext.emp_id should ideally come from the HR database logic, 
                        // but here we are loading from the main app database.
                        // We will instruct the LLM to verify/lookup the correct ID in the target DB if needed.
                        
                        console.log(`👤 User Context Loaded: ${userContext.full_name} (${userContext.emp_id})`);
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to fetch user context for SmartDataAnalyst:", e.message);
                }
            }

            // 1. Analyze with LLM (Intent, Tool Selection, Ambiguity Check, SQL Generation)
            const analysis = await this._analyzeWithLLM(userQuery, history, lastBotResponse, sessionId, userContext, translatedQuery);

            console.log("Analysis Result:", JSON.stringify(analysis, null, 2));

            // 1.5 Handle Context Restoration
            if (sessionId && analysis.context_action === 'RESTORE' && analysis.restore_index) {
                ContextManager.restoreContext(sessionId, analysis.restore_index);
                console.log(`Context restored from index ${analysis.restore_index}`);
            }

            // 2. Handle Ambiguity / Clarification
            if (analysis.status === 'NEEDS_CLARIFICATION' || analysis.status === 'NEEDS_CONFIRMATION') {
                return {
                    text: analysis.response, // The question to the user
                    status: analysis.status,
                    context: analysis.context
                };
            }

            // 3. Handle Execution
            if (analysis.status === 'EXECUTE_QUERY' && analysis.sql_query) {
                // UPDATE ACTIVE CONTEXT
                if (sessionId) {
                    ContextManager.updateActiveContext(sessionId, {
                        summary: analysis.context_summary || userQuery,
                        dataset: analysis.target_dataset,
                        filters: analysis.sql_query
                    }, analysis.context_action === 'SWITCH');
                }

                let results = await this._executeDataQuery(analysis.sql_query, analysis.target_dataset, userEmail);
                
                // 3.5 Post-Processing (for Top N per Group)
                if (analysis.post_process === 'TOP_N_PER_GROUP' && analysis.post_process_params && results.length > 0) {
                    const { group_by, limit } = analysis.post_process_params;
                    console.log(`Applying Post-Process: TOP_N_PER_GROUP (Group: ${group_by}, Limit: ${limit})`);
                    
                    if (group_by && limit) {
                        const groups = {};
                        const filtered = [];
                        
                        for (const row of results) {
                            const key = row[group_by];
                            if (!groups[key]) groups[key] = 0;
                            
                            if (groups[key] < limit) {
                                filtered.push(row);
                                groups[key]++;
                            }
                        }
                        results = filtered;
                        console.log(`Filtered results from ${results.length + (results.length > 0 ? 0 : 0)} to ${filtered.length}`);
                    }
                }

                // 4. Generate Insight Summary using LLM based on actual results
                const insightSummary = await this._generateInsightSummary(results, userQuery, analysis.sql_query);
                
                // Format the results with the insight
                const formattedResponse = this._formatResponse(results, { ...analysis, response: insightSummary });
                
                return {
                    text: formattedResponse,
                    data: results,
                    status: 'COMPLETED',
                    source: this.sourceNames[analysis.target_dataset] || analysis.target_dataset, // Return the source name
                    category: this.sourceCategories[analysis.target_dataset] // Return category
                };
            }

            // Fallback
            return {
                text: analysis.response || "I analyzed your request but couldn't determine the next step.",
                status: 'UNKNOWN'
            };

        } catch (error) {
            console.error("SmartDataAnalyst Error:", error);
            return {
                text: "I encountered an error while analyzing the data.",
                error: error.message
            };
        }
    }

    /**
     * Generate a professional insight summary based on the data
     */
    async _generateInsightSummary(data, userQuery, sqlQuery = "") {
        if (!data || data.length === 0) {
            try {
                // Generate a helpful "No Results" explanation
                const prompt = `
                The user asked: "${userQuery}"
                I executed this SQL: "${sqlQuery}"
                The result was: 0 records found.
                
                Task: Generate a helpful, professional response explaining that no data was found matching their specific criteria.
                - Mention specifically what filters were applied based on the query (e.g. "I looked for todos that are completed AND have 'incomplete' in the title...").
                - Do NOT mention "SQL" or "query execution". Speak naturally as an assistant.
                - Be concise (1-2 sentences).
                - Example: "I searched for completed todos that contain the word 'incomplete', but found no matching records."
                `;
                
                const result = await this.model.generateContent(prompt);
                return result.response.text().trim();
            } catch (e) {
                return "I searched your data using the criteria provided, but found no matching records.";
            }
        }

        // OPTIMIZATION: Deterministic Summary for Simple Aggregates (Saves LLM Quota)
        // If result is a single row with a single value (e.g. COUNT, SUM, MAX)
        if (data.length === 1 && Object.keys(data[0]).length === 1) {
            const key = Object.keys(data[0])[0];
            const value = data[0][key];
            
            // SKIP Optimization for Probability/Prediction queries to allow LLM to generate rich explanations
            // Check if key contains predictive terms
            const isPredictive = /probability|likelihood|forecast|prediction|rate/.test(key.toLowerCase()) || 
                                 /probability|likelihood|forecast|predict/.test(userQuery.toLowerCase());

            // SKIP Optimization for Self-Reference queries to allow natural "You have..." responses
            const isSelfReference = /\b(i|my|me|myself|mine)\b/i.test(userQuery);

            if (!isPredictive && !isSelfReference) {
                // Check if it looks like a number/count
                if (typeof value === 'number' || !isNaN(Number(value))) {
                    const cleanKey = key.replace(/_/g, ' ').replace(/cnt/g, 'count').replace(/pct/g, 'percentage');
                    return `The ${cleanKey} is **${value}**.`;
                }
            }
        }

        try {
            const columns = Object.keys(data[0]);
            
            // Calculate basic stats to feed to LLM
            // Check if data is an aggregate result (e.g. COUNT(*), MAX(date), SUM(x), PROBABILITY)
            // It is an aggregate if:
            // 1. There is exactly 1 row.
            // 2. AND the key implies aggregation (count, total, max, min, avg) OR the user query implies aggregation ("how many", "latest", "total").
            const aggregateKeywords = ['count', 'total', 'max', 'min', 'avg', 'sum', 'latest', 'earliest', 'probability', 'likelihood', 'rate', 'percent'];
            const isAggregate = data.length === 1 && (
                Object.keys(data[0]).some(k => aggregateKeywords.some(kw => k.toLowerCase().includes(kw))) ||
                userQuery.toLowerCase().includes('count') || 
                userQuery.toLowerCase().includes('how many') ||
                userQuery.toLowerCase().includes('total') ||
                userQuery.toLowerCase().includes('latest') ||
                userQuery.toLowerCase().includes('likely') ||
                userQuery.toLowerCase().includes('probability')
            );
            
            let count;
            let singleValue = null;
            if (isAggregate) {
                // Find the value of the single row (it might be a count OR a date string OR a probability)
                const firstValue = Object.values(data[0])[0];
                count = firstValue; 
                singleValue = firstValue;
            } else {
                count = data.length;
            }

            
            // Find dominant categories (heuristic)
            const stats = {};
            if (!isAggregate) {
                const potentialCategoryCols = columns.filter(c => ['department', 'status', 'plant', 'role', 'type_of_license', 'plant_for_work_cent'].includes(c));
                
                potentialCategoryCols.forEach(col => {
                    const counts = {};
                    data.forEach(row => {
                        const val = row[col];
                        if (val) counts[val] = (counts[val] || 0) + 1;
                    });
                    // Find top value
                    const topVal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                    if (topVal) stats[col] = topVal;
                });
            }

            const prompt = `
            Analyze this dataset summary and generate a professional, 1-2 sentence insight.
            
            USER QUERY: "${userQuery}"
            DATA STATS:
            - Result Type: ${isAggregate ? 'Calculated Metric / Aggregate' : 'List of Records'}
            - Value / Count: ${singleValue !== null ? singleValue : count}
            - Dominant Values: ${JSON.stringify(stats)}
            
            RULES:
            1. **PERSONALIZATION (HIGHEST PRIORITY)**:
               - If the user query implies a self-reference (uses "I", "me", "my", etc.), YOU MUST ADDRESS THEM DIRECTLY.
               - Use "You" instead of passive voice or third-person.
               - Example: "You have 15 remaining vacation leaves." instead of "The remaining vacation leaves is 15."
               - Example: "Your employee ID is 12345." instead of "The employee ID is 12345."
            2. **STRICT LANGUAGE RULE:**
               - **Scenario 1 (Full English):** If the user speaks in full English, you MUST respond in full English.
               - **Scenario 2 (Full Tagalog):** If the user speaks in full Tagalog, you MUST respond in full Tagalog (use correct Tagalog grammar, avoid English terms as much as possible).
                 - **CRITICAL EXCEPTION:** Do NOT translate Proper Nouns (Names of People, Companies, Products, Places). Keep them as they appear in the source.
               - **Scenario 3 (Taglish):** If the user speaks in Taglish, you MUST respond in "Conyo Taglish" (a natural mix of English and Tagalog).
            2. Start with "Here is the result..." or "The value is..." (or "There are ${count}..." if it is a count) - translated if needed.
            3. If the result is a DATE, mention it clearly (e.g., "The latest malfunction occurred on...").
            4. Keep it professional and concise.
            5. Do NOT mention "null" or "undefined".
            6. If count is 1 and it's an aggregate query, just state the value clearly.
            7. **PREDICTIVE/PROBABILISTIC QUESTIONS**:
               - If the user query asks for "likelihood", "probability", "forecast", or "prediction":
               - **State Assumptions**: Start with "Based on historical data..." or "Assuming current trends continue..."
               - **Avoid Certainty**: Use "it is likely that...", "the estimated probability is...", "we project..."
               - **Explain**: If the result is a percentage (e.g. 80%), explain it (e.g. "User 3 has completed 80% of their past tasks, suggesting a high likelihood of completing the next one.")
               - **Constraint Awareness**: If the result implies a limitation (e.g. 0% completion), mention it constructively.
            
            EXAMPLE:
            "There are 13 machine malfunctions recorded on September 1, 2025."
            `;

            const result = await this.model.generateContent(prompt);
            return result.response.text().trim();

        } catch (e) {
            // Graceful degradation for Rate Limits (429) or Service Errors
            if (e.message.includes('429') || e.message.includes('Quota')) {
                console.warn("⚠️ Insight generation skipped due to rate limit (Quota Exceeded). Using default summary.");
            } else {
                console.warn("⚠️ Failed to generate insight summary:", e.message);
            }
            return `Here are the results found:`;
        }
    }

    /**
     * Fetch tool descriptions from DB
     */
    async _getToolDescriptions() {
        try {
            const [rows] = await pool.execute("SELECT name, description FROM live_data_sources WHERE is_active = TRUE");
            if (rows.length > 0) {
                // Combine all descriptions into a single context block
                return rows.map(r => `
==============================================
DATASET: ${r.name}
==============================================
${r.description}
`).join('\n\n');
            }
        } catch (e) {
            console.warn("⚠️ Failed to fetch live data config from DB:", e.message);
        }
        return ""; // Return empty string if DB fails or empty
    }

    /**
     * Uses Gemini to analyze the request against the Live Data Config
     */
    async _analyzeWithLLM(query, history, lastBotResponse, sessionId, userContext = null, translatedQuery = null) {
        const historyText = history.map(h => `User: ${h.question}\nBot: ${h.answer}`).join('\n');
        
        const toolDescription = await this._getToolDescriptions();
        const contextInfo = sessionId ? ContextManager.getFormattedContext(sessionId) : "";

        // Format User Context for the LLM
        let userContextString = "CURRENT USER DETAILS: Unknown (Guest/No Email)";
        if (userContext) {
            userContextString = `
CURRENT USER DETAILS (Use this for "I", "me", "my" queries):
- Full Name: "${userContext.full_name}"
- Employee ID: "${userContext.emp_id}" (Crucial for linking with benefit/leave tables)
- Department: "${userContext.department || 'N/A'}"
- Position: "${userContext.position || 'N/A'}"
- Plant/Location: "${userContext.plant || userContext.location || 'N/A'}"
- Email: "${userContext.email}"
- Role: "${userContext.role || 'user'}"
`;
        }

        // MERGED INTENT: If the last bot response was a clarification question, prepend it to the user query
        // This forces the LLM to see "Did you mean X?" + "Yes" as a single thought unit.
        let mergedQuery = query;
        if (lastBotResponse && (lastBotResponse.includes('?') || lastBotResponse.includes('clarify') || lastBotResponse.includes('referring to'))) {
            mergedQuery = `[Context: Bot asked "${lastBotResponse}"] User Answered: "${query}"`;
        }

        let promptTemplate = await PromptService.getPrompt('SMART_DATA_ANALYST');
        const prompt = promptTemplate
            .replace('{tool_description}', toolDescription)
            .replace('{user_context_string}', userContextString)
            .replace('{context_info}', contextInfo)
            .replace('{merged_query}', mergedQuery)
            .replace('{translated_query}', translatedQuery || mergedQuery)
            .replace('{history_text}', historyText)
            .replace(/{user_role}/g, userContext?.role || 'user')
            .replace(/{user_full_name}/g, userContext?.full_name || '')
            .replace(/{user_emp_id}/g, userContext?.emp_id || '');

        const result = await this.model.generateContent(prompt);
        const text = result.response.text();
        
        // Clean JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Failed to parse LLM JSON response");
        
        return JSON.parse(jsonMatch[0]);
    }

    /**
     * Executes the SQL using Alasql, fetching live data if needed
     */
    async _executeDataQuery(sql, datasetName, userEmail) {
        try {
            console.log(`Executing SQL on ${datasetName}: ${sql}`);

            // 1. Identify ALL tables needed (Primary dataset + Joined tables)
            // Regex to capture table names after FROM and JOIN
            const tableRegex = /\b(FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi;
            const tablesToFetch = new Set();
            
            // Always add the primary target dataset
            tablesToFetch.add(datasetName);

            let match;
            while ((match = tableRegex.exec(sql)) !== null) {
                // match[2] is the table name
                // Ignore '?' if used as placeholder
                if (match[2] !== '?') {
                    tablesToFetch.add(match[2]);
                }
            }

            console.log(`Tables identified for fetching: ${Array.from(tablesToFetch).join(', ')}`);

            // 2. Fetch all required tables
            for (const tableName of tablesToFetch) {
                if (!this.data[tableName]) {
                    console.log(`Table '${tableName}' not in memory. Fetching live data...`);
                    try {
                        const result = await this._fetchLiveData(tableName, userEmail);
                        
                        if (result && result.data && Array.isArray(result.data)) {
                            this.data[tableName] = result.data;
                            this.sourceNames[tableName] = result.sourceName || tableName;
                            this.sourceCategories[tableName] = result.categoryName;
                            console.log(`✅ Loaded '${tableName}' (${result.data.length} rows)`);
                        } else if (Array.isArray(result) && result.length > 0) {
                             this.data[tableName] = result;
                             this.sourceNames[tableName] = tableName;
                             console.log(`✅ Loaded '${tableName}' (${result.length} rows)`);
                        } else {
                            console.warn(`⚠️ Could not fetch data for table '${tableName}'. Query might fail if this table is required.`);
                        }
                    } catch (err) {
                        console.warn(`❌ Error fetching table '${tableName}':`, err.message);
                    }
                }
            }

            // 3. Prepare Alasql Database
            // Alasql operates better with a proper DB context for JOINs
            // We'll create a temporary alasql database and populate it
            const dbId = `db_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            alasql(`CREATE DATABASE ${dbId}`);
            alasql(`USE ${dbId}`);

            try {
                // Populate tables in the temp DB
                for (const tableName of tablesToFetch) {
                    if (this.data[tableName]) {
                        // Sanitize table name for Alasql (wrap in brackets if it contains spaces or special chars)
                        const safeTableName = tableName.match(/^[a-zA-Z0-9_]+$/) ? tableName : `[${tableName}]`;
                        
                        alasql(`CREATE TABLE ${safeTableName}`);
                        // Correct way to inject data into Alasql table in a specific DB
                        // Note: For brackets, we access the table via the raw string key in the tables object
                        alasql.databases[dbId].tables[tableName].data = this.data[tableName];
                    }
                }

                // 4. Execute Query
                // We don't need to replace table names with '?' anymore because we have a real DB context
                // But we still need to handle the case where the LLM used '?' for the primary dataset
                let executableSql = sql;
                if (executableSql.includes('?')) {
                     // Replace '?' with the datasetName
                     const safeDatasetName = datasetName.match(/^[a-zA-Z0-9_]+$/) ? datasetName : `[${datasetName}]`;
                     executableSql = executableSql.replace(/\?/g, safeDatasetName);
                }

                console.log(`Executing Alasql in ${dbId}: ${executableSql}`);
                const res = alasql(executableSql);
                
                // Cleanup
                alasql(`DROP DATABASE ${dbId}`);
                
                return res;

            } catch (alasqlError) {
                alasql(`DROP DATABASE ${dbId}`); // Ensure cleanup
                console.error("Alasql Execution Error:", alasqlError);
                throw alasqlError;
            }

        } catch (e) {
            console.error("Data execution failed:", e);
            return [];
        }
    }

    /**
     * Fetches live data from registered sources (Google Sheets, etc.)
     */
    async _fetchLiveData(datasetName, userEmail) {
        try {
            // Get all active sources
            if (!userEmail) return null;
            const [users] = await pool.execute("SELECT id FROM employees WHERE email = ? AND is_active = TRUE", [userEmail]);
            if (users.length === 0) return null;
            const employeeId = users[0].id;
            
            // JOIN with knowledge_categories to get the category name
            const [sources] = await pool.execute(`
                SELECT lds.*, kc.name as category_name 
                FROM live_data_sources lds 
                LEFT JOIN knowledge_categories kc ON lds.category_id = kc.id 
                WHERE lds.is_active = TRUE
            `);
            
            for (const source of sources) {
                // Parse config
                let config = source.config;
                if (typeof config === 'string') {
                    try { config = JSON.parse(config); } catch (e) {}
                }

                // Handle Google Sheets
                if (source.source_type === 'google_sheet' && config.sheet_id) {
                    try {
                        let targetTab = datasetName;
                        
                        // Fallback: If requested name matches the source name, use default tab
                        if (datasetName.toLowerCase().trim() === source.name.toLowerCase().trim()) {
                            console.log(`Request matches source name '${source.name}'. Fetching default tab.`);
                            targetTab = null;
                        }

                        // INTELLIGENT TAB RESOLUTION
                        // 1. Extract potential tab names from description using common patterns
                        // Patterns: [Tab 1]: Name, Tab: Name, "Name" tab, etc.
                        const rawDescription = source.description || '';
                        const tabMatches = rawDescription.matchAll(/\[Tab \d+\]:\s*([^\n\r]+)|Tab:\s*([^\n\r]+)/g);
                        const validTabs = [];
                        for (const match of tabMatches) {
                            const tabName = (match[1] || match[2]).trim();
                            validTabs.push(tabName);
                        }

                        // 2. Fuzzy match requested datasetName against valid tabs
                        let bestMatch = null;
                        if (validTabs.length > 0) {
                            const req = datasetName.toLowerCase().trim();
                            bestMatch = validTabs.find(tab => tab.toLowerCase().trim() === req);
                            
                            // If no exact case-insensitive match, try partial
                            if (!bestMatch) {
                                bestMatch = validTabs.find(tab => tab.toLowerCase().includes(req) || req.includes(tab.toLowerCase()));
                            }
                        }

                        if (bestMatch) {
                            console.log(`🎯 Resolved tab '${datasetName}' to '${bestMatch}' based on description.`);
                            targetTab = bestMatch;
                        } else {
                            // Fallback: Check if description mentions the name explicitly even if not in [Tab] format
                            const lowerDesc = rawDescription.toLowerCase();
                            const lowerReq = datasetName.toLowerCase();
                            if (lowerDesc.includes(`sheet: ${lowerReq}`) || lowerDesc.includes(`tab: ${lowerReq}`)) {
                                 targetTab = datasetName; // Trust the LLM's extraction if explicitly mentioned
                            }
                        }

                        const [permRows] = await pool.execute(
                            `SELECT 1 FROM employee_access_permissions 
                             WHERE employee_id = ? 
                               AND (
                                 (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
                                 OR (source_id = ?)
                               )
                             LIMIT 1`,
                            [employeeId, source.id]
                        );
                        if (permRows.length === 0) continue;
                        console.log(`Attempting to fetch '${targetTab || 'Default Tab'}' from source: ${source.name}`);
                        
                        // Try to fetch the specific tab (datasetName)
                        const rows = await GoogleService.getAllSheetRows(config.sheet_id, targetTab);
                        
                        if (rows && rows.length > 0) {
                            console.log(`✅ Successfully fetched ${rows.length} rows from ${source.name}`);
                            
                            // Normalize columns to snake_case and clean values
                            const normalizedData = rows.map(row => {
                                const newRow = {};
                                for (const key in row) {
                                    const cleanKey = key.trim().toLowerCase()
                                        .replace(/[\s-]+/g, '_')
                                        .replace(/[^\w_]/g, '')
                                        .replace(/\./g, '');
                                    
                                    // CLEAN DATE VALUES
                                    // If column is timestamp/date, try to normalize it for SQL date functions
                                    if (cleanKey.includes('date') || cleanKey.includes('timestamp') || cleanKey.includes('created')) {
                                        const dateVal = row[key];
                                        if (dateVal) {
                                            // Try to parse and standardize to YYYY-MM-DD HH:mm:ss for consistent SQL querying
                                            const parsed = Date.parse(dateVal);
                                            if (!isNaN(parsed)) {
                                                const d = new Date(parsed);
                                                // Format as YYYY-MM-DD HH:mm:ss (Local/ISO-like but consistent)
                                                // using sv-SE locale gives YYYY-MM-DD
                                                const datePart = d.toLocaleDateString('sv-SE');
                                                const timePart = d.toLocaleTimeString('sv-SE', { hour12: false });
                                                newRow[cleanKey] = `${datePart} ${timePart}`;
                                            } else {
                                                newRow[cleanKey] = dateVal; // Keep original if parsing fails
                                            }
                                        } else {
                                            newRow[cleanKey] = null;
                                        }
                                    } else {
                                        newRow[cleanKey] = row[key];
                                    }
                                }
                                return newRow;
                            });
                            return { 
                                data: normalizedData, 
                                sourceName: source.name,
                                categoryName: source.category_name 
                            };
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch from ${source.name}:`, err.message);
                        // Continue to next source
                    }
                }

                // Handle External API
                if (source.source_type === 'external_api') {
                    try {
                        // FUZZY MATCHING: Check if the source name is "similar" to the requested dataset
                        // This handles cases where LLM says "To-Do List Information" but the source is "Todos"
                        const sourceName = source.name.toLowerCase().trim();
                        const requestedName = datasetName.toLowerCase().trim();

                        // 1. Exact Match
                        const isExactMatch = sourceName === requestedName;

                        // 2. Partial Match (Bidirectional)
                        const isPartialMatch = sourceName.includes(requestedName) || requestedName.includes(sourceName);
                        
                        // 3. Token-Based Match (Jaccard-ish)
                        // Split both into words and check if there's significant overlap
                        // e.g. "JSONPlaceholder Todos API" vs "JSONPlaceholder API" -> "JSONPlaceholder" and "API" match
                        const sourceTokens = sourceName.split(/[\s-_]+/);
                        const reqTokens = requestedName.split(/[\s-_]+/);
                        // Filter out common stop words to avoid false positives on "api", "data", "list"
                        const stopWords = ['api', 'data', 'list', 'tool', 'information', 'system'];
                        const commonTokens = sourceTokens.filter(token => 
                            reqTokens.includes(token) && 
                            token.length > 2 && 
                            !stopWords.includes(token)
                        ); 
                        const isTokenMatch = commonTokens.length >= 1; // At least one significant UNIQUE word matches (e.g. "Todos" or "Machine")

                        // IMPROVED: Check description for external APIs too
                        const description = (source.description || '').toLowerCase();
                        const isDescriptionMatch = description.includes(requestedName) || description.includes(`api: ${requestedName}`);

                        // Accept if exact match OR if one contains the other (e.g. "Todos" vs "To-Do List")
                        const [permRows] = await pool.execute(
                            `SELECT 1 FROM employee_access_permissions 
                             WHERE employee_id = ? 
                               AND (
                                 (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
                                 OR (source_id = ?)
                               )
                             LIMIT 1`,
                            [employeeId, source.id]
                        );
                        if (permRows.length === 0) continue;
                        if (isExactMatch || (isPartialMatch && sourceName.length > 3) || isTokenMatch || isDescriptionMatch) {
                            console.log(`Attempting to fetch API from source: ${source.name} (Match: ${requestedName})`);
                            
                            const response = await fetch(config.endpoint, {
                                method: config.method || 'GET',
                                headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
                                timeout: 60000 // 60s timeout for backend fetching
                            });

                            if (!response.ok) throw new Error(`API Status: ${response.status}`);
                            
                            const data = await response.json();
                            
                            if (Array.isArray(data) && data.length > 0) {
                                console.log(`✅ Successfully fetched ${data.length} rows from ${source.name}`);
                                
                                // Normalize columns
                                const normalizedData = data.map(row => {
                                    const newRow = {};
                                    for (const key in row) {
                                        let val = row[key];
                                        // Simple handling for nested objects (stringify) to prevent [object Object]
                                        if (typeof val === 'object' && val !== null) {
                                            val = JSON.stringify(val);
                                        }

                                        // Improved Snake Case Logic:
                                        // 1. Convert CamelCase to snake_case (e.g. userId -> user_id)
                                        // 2. Convert spaces/dashes to underscores
                                        const cleanKey = key.trim()
                                            .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // camelCase -> snake_case
                                            .toLowerCase()
                                            .replace(/[\s-]+/g, '_')
                                            .replace(/[^\w_]/g, '')
                                            .replace(/\./g, '');
                                        
                                        newRow[cleanKey] = val;
                                    }
                                    return newRow;
                                });
                                return { 
                                    data: normalizedData, 
                                    sourceName: source.name,
                                    categoryName: source.category_name
                                };
                            }
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch from ${source.name}:`, err.message);
                    }
                }

                // Handle Database (MySQL)
                if (source.source_type === 'database') {
                     try {
                        const sourceName = source.name.toLowerCase().trim();
                        const requestedName = datasetName.toLowerCase().trim();
                        
                        // Check if requested name matches the source name OR the configured database name
                        let dbName = '';
                        try {
                             const dbConfig = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
                             dbName = (dbConfig.database || '').toLowerCase().trim();
                        } catch(e) {}

                        // Define isDbMatch here so it's available
                        const isDbMatch = sourceName.includes(requestedName) || requestedName.includes(sourceName) || (dbName && requestedName.includes(dbName));

                        // Check if the requested dataset is actually a TABLE in this DB
                        // IMPROVED: Check description first (as requested by user)
                        // This avoids blind connection attempts if the description already lists the table.
                        const description = (source.description || '').toLowerCase();
                        const isTableInDescription = description.includes(`table: ${requestedName}`) || 
                                                     description.includes(`table: "${requestedName}"`) ||
                                                     description.includes(`table: \`${requestedName}\``) ||
                                                     description.includes(`sql table: \`${requestedName}\``) ||
                                                     description.includes(`[${requestedName}]`);

                        // If the LLM explicitly asks for a table name (e.g. "access_permissions"), we might not match the DB name.
                        // So we should try to connect if the requested name looks like a table name (alphanumeric underscore).
                        const looksLikeTable = /^[a-z0-9_]+$/.test(requestedName);

                        if (isDbMatch || isTableInDescription || looksLikeTable) {
                            const [permRows] = await pool.execute(
                                `SELECT 1 FROM employee_access_permissions 
                                 WHERE employee_id = ? 
                                   AND (
                                     (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
                                     OR (source_id = ?)
                                   )
                                 LIMIT 1`,
                                [employeeId, source.id]
                            );
                            if (permRows.length === 0) continue;

                            let config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
                            if (config.db_config) config = config.db_config;

                            if (config.type === 'mysql') {
                                const connection = await mysql.createConnection({
                                    host: config.host,
                                    user: config.user,
                                    password: config.password,
                                    database: config.database,
                                    port: config.port || 3306,
                                    connectTimeout: 5000
                                });

                                // Check if the requested dataset is actually a TABLE in this DB
                                const [tables] = await connection.execute("SHOW TABLES");
                                const allTables = tables.map(t => Object.values(t)[0].toLowerCase());

                                let targetTable = '';
                                if (allTables.includes(requestedName)) {
                                    targetTable = requestedName;
                                } else if (isDbMatch) {
                                    // If we matched the DB name but not a table, pick the first table or 'users'
                                    targetTable = allTables[0];
                                }

                                if (targetTable) {
                                    console.log(`✅ Found table '${targetTable}' in DB '${source.name}' matching request '${datasetName}'`);
                                    console.log(`Fetching up to 1000 rows from table '${targetTable}' for in-memory analysis...`);
                                    
                                    // Fetch data (with limit for safety)
                                    const [rows] = await connection.execute(`SELECT * FROM ${targetTable} LIMIT 1000`);
                                    await connection.end();

                                    if (rows.length > 0) {
                                        return { 
                                            data: rows, 
                                            sourceName: source.name,
                                            categoryName: source.category_name 
                                        };
                                    }
                                } else {
                                    await connection.end();
                                }
                            }
                        }
                     } catch (err) {
                         console.warn(`Failed to fetch from DB ${source.name}:`, err.message);
                     }
                }
            }
            
            return null;
        } catch (e) {
            console.error("Error fetching live data:", e);
            return null;
        }
    }

    /**
     * Formats the output data into a readable string/table
     */
    _formatResponse(data, analysis) {
        if (!data || data.length === 0) {
             return analysis.response || "No results found matching your criteria.";
        }

        // Filter out empty rows (where all values are null/undefined/empty)
        const validData = data.filter(row => Object.values(row).some(val => val !== null && val !== undefined && val !== ''));

        if (validData.length === 0) return "No results found matching your criteria.";

        // Use the generated insight summary
        const summary = analysis.response || `Here are the ${validData.length} results found:`;

        // SKIP TABLE for Single Value Results (if they are simple scalars)
        // If we have 1 row and 1 column, the summary (generated by LLM) usually contains the answer.
        // Showing a table | PROBABILITY | 55 | is redundant and ugly.
        if (validData.length === 1 && Object.keys(validData[0]).length === 1) {
             // Just return the summary, as it should contain the value.
             return summary;
        }
        
        // Convert to markdown table
        const columns = Object.keys(validData[0]);
        const header = "| " + columns.map(c => c.toUpperCase()).join(' | ') + " |";
        const separator = "| " + columns.map(() => "---").join(' | ') + " |";
        
        const rows = validData.map(row => {
                    return "| " + columns.map(c => {
                        const val = row[c];
                        // Escape pipes in content to avoid breaking Markdown table structure
                        // Replace | with \| to tell frontend parser to ignore it
                        return (val === null || val === undefined) ? '' : String(val).replace(/\|/g, '\\|');
                    }).join(' | ') + " |";
                }).join('\n');
        
        return `${summary}\n\n${header}\n${separator}\n${rows}`;
    }
}
