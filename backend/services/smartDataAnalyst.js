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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY");

export class SmartDataAnalyst {
    constructor() {
        this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
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
    async processQuery(userQuery, history = [], lastBotResponse = null, sessionId = null, userEmail = null) {
        try {
            console.log(`🧠 SmartDataAnalyst processing: "${userQuery}"`);

            // 1. Analyze with LLM (Intent, Tool Selection, Ambiguity Check, SQL Generation)
            const analysis = await this._analyzeWithLLM(userQuery, history, lastBotResponse, sessionId);

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

            if (!isPredictive) {
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
            1. Start with "Here is the result..." or "The value is..." (or "There are ${count}..." if it is a count).
            2. If the result is a DATE, mention it clearly (e.g., "The latest malfunction occurred on...").
            3. Keep it professional and concise.
            4. Do NOT mention "null" or "undefined".
            5. If count is 1 and it's an aggregate query, just state the value clearly.
            6. **PREDICTIVE/PROBABILISTIC QUESTIONS**:
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
    async _analyzeWithLLM(query, history, lastBotResponse, sessionId) {
        const historyText = history.map(h => `User: ${h.question}\nBot: ${h.answer}`).join('\n');
        
        const toolDescription = await this._getToolDescriptions();
        const contextInfo = sessionId ? ContextManager.getFormattedContext(sessionId) : "";

        // MERGED INTENT: If the last bot response was a clarification question, prepend it to the user query
        // This forces the LLM to see "Did you mean X?" + "Yes" as a single thought unit.
        let mergedQuery = query;
        if (lastBotResponse && (lastBotResponse.includes('?') || lastBotResponse.includes('clarify') || lastBotResponse.includes('referring to'))) {
            mergedQuery = `[Context: Bot asked "${lastBotResponse}"] User Answered: "${query}"`;
        }

        const prompt = `
        You are a Smart Data Analyst for Live Data Tools.
        
        CONTEXT:
        ${toolDescription}
        
        SESSION CONTEXT (Active & Archived):
        ${contextInfo}
        
        USER QUERY: "${mergedQuery}"
        
        HISTORY:
        ${historyText}
        
        TASK:
        1. Identify the relevant dataset from the CONTEXT above.
        2. Check the "CRITICAL DATA ISSUES" and "DATA QUALITY ASSESSMENT" for that dataset.
        3. Identify necessary columns based on the "COLUMN DEFINITIONS".
        4. **CRITICAL STEP**: Check for Ambiguity.
           - **Universal Ambiguity Rule**: If the user's search term (e.g. a Name, ID, or Category) matches MULTIPLE entries in the "Valid Values" list or "Data Content Intelligence" section, you MUST ask for clarification.
           - Example: If user searches for "Micaella", and the data has ["Micaella Gutierrez", "Micaella Cruz"], you MUST ask: "There are multiple matches for 'Micaella': Micaella Gutierrez and Micaella Cruz. Which one are you referring to?"
           - If the user asks for a column with known issues (e.g., 'frequency' has "Every 15 mins" vs "Every 15mins"), and the user hasn't specified how to handle it, you MUST ask for clarification.
           - Example: If user asks "run every 15 minutes", you see the issue in metadata. You must ask: "It seems like the frequency column has inconsistent values... Would you like specific or all?"
           - If the user *already* clarified (in history) or the query is explicit ("give me all", "exact match"), then proceed.
           - **CLARIFICATION HANDLING**: Check the HISTORY. If the previous Bot message was a clarification question (e.g. "Did you mean X or Y?"), and the current User message answers it (e.g. "I meant X" or "X"), DO NOT ask again. Proceed immediately with the user's choice.
           - **AMBIGUITY RELEVANCE CHECK**: Only trigger an ambiguity check if the known issue DIRECTLY affects the user's current search term.
             - Example: If the issue is "Frequency has 15 mins vs 15mins", but the user asks for "Any Time", DO NOT ask for clarification. Proceed with the query for "Any Time".
             - Example: If the user searches for "Micaella" and there are duplicates, DO ask.
           - **UNIVERSAL QUERY HANDLING**: If the user explicitly asks for "all", "both", "regardless of surname", or "everything", you MUST execute a query that includes ALL matching variations.
             - Example: "Give me all projects for Micaella regardless of surname" -> SELECT * FROM ? WHERE user LIKE '%Micaella%'
           - **SMART CONTEXT AWARENESS**:
             - If the user provides a follow-up like "How about [new condition]" or "What if [condition]", treat it as a modification of the previous query but apply the new intent.
             - Example: User: "Show projects for Micaella" -> Bot: "Which one?" -> User: "How about all of them regardless of surname" -> ACTION: Execute universal query.
           - **TRUST USER INPUT**: If the user provides a specific name, value, or ID in response to a clarification question, USE THAT EXACT VALUE in your query, even if it is not listed in the "Valid Values" or sample data.
             - Example: Bot: "Did you mean X or Y?" -> User: "Z" -> ACTION: Execute query WHERE col = 'Z'.
        5. **CONTEXTUAL FILTERING (VERY IMPORTANT)**:
           - Look at the HISTORY to understand what the user is asking for.
           - If the user says "give me all of them" after a question about "Deployed RPA Projects running every 15 mins", you MUST maintain the original filters (Status='Deployed' AND Frequency LIKE '15%min').
           - Do NOT just "SELECT * FROM ?" unless the user explicitly asks for EVERYTHING in the database.
           - If the user wants "all variations" of 15 minutes, it implies they still want the other filters (e.g., "Deployed") from the original question.
        6. **DATE HANDLING**:
           - Use the "SQL QUERY TIPS" from the dataset context to handle dates correctly.
           - If querying "Equipment Maintenance" or similar datasets with missing start dates, check 'notification_date' or 'created_on' as well using OR condition.
           - Convert natural language dates (e.g., "September 1, 2025") to format used in DB (e.g., '9/1/2025' or LIKE '9/1/2025%').

        7. **PREDICTIVE ANALYTICS & FORECASTING**:
           - **Rule**: True prediction isn't possible for static datasets (like JSONPlaceholder), but you MUST test reasoning skills: assumptions, trend inference, and probability estimation.
           - **Completion Probability**:
             - "Likelihood of completion" -> Calculate the percentage of completed items.
             - SQL: \`SELECT (SUM(CASE WHEN completed = TRUE THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as probability FROM ?\`
             - If specific user: \`SELECT (SUM(CASE WHEN completed = TRUE THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as probability FROM ? WHERE user_id = ...\`
           - **User Behavior Forecasting**:
             - "Which user is most likely to complete next?" -> Find user with highest completion rate.
             - SQL: \`SELECT user_id, (SUM(CASE WHEN completed = TRUE THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as completion_rate FROM ? GROUP BY user_id ORDER BY completion_rate DESC LIMIT 1\`
           - **Risk/Confidence**:
             - "Highest risk of leaving incomplete" -> Find user with lowest completion rate (or highest incomplete count).
             - SQL: \`SELECT user_id, (SUM(CASE WHEN completed = FALSE THEN 1 ELSE 0 END)) as incomplete_count FROM ? GROUP BY user_id ORDER BY incomplete_count DESC LIMIT 1\`
           - **GUARDRAILS (CRITICAL)**:
             - **Time-Based Predictions**: If the user asks "When will X be completed?" or "Forecast completion date", check if the dataset has timestamps (e.g., 'created_at', 'due_date').
             - If NO timestamps exist (like in JSONPlaceholder Todos), you MUST **REFUSE** the prediction.
             - Set status="NEEDS_CLARIFICATION" and response="This dataset has no timestamps, so time-based predictions are not possible."

        OUTPUT FORMAT (JSON):
        {
            "status": "EXECUTE_QUERY" | "NEEDS_CLARIFICATION" | "NEEDS_CONFIRMATION",
            "target_dataset": "The exact Tab Name from 'TAB SELECTION GUIDE' or 'COLUMN DEFINITIONS' (e.g. 'Sheet1', 'Project List')",
            "context_action": "KEEP" | "SWITCH" | "RESTORE",
            "context_summary": "Short summary of this query intent (e.g. 'Projects by Micaella Cruz')",
            "restore_index": number (Only if context_action is RESTORE),
            "response": "A conversational summary of the action. If executing a query, briefly describe what the data represents (e.g., 'Here are the 5 deployed projects...').",
            "sql_query": "SELECT ... FROM ? WHERE ... (Only if status is EXECUTE_QUERY)",
            "post_process": "TOP_N_PER_GROUP" (Optional: Set this ONLY if user asks for 'First N per Group'),
            "post_process_params": { "group_by": "column_name", "limit": N } (Required if post_process is TOP_N_PER_GROUP),
            "context": { "issue_detected": "frequency_inconsistency" }
        }
        
        CONTEXT RULES:
        1. **SWITCH**: If the user changes the topic (e.g. from "Projects" to "Machine Status") or starts a completely new unrelated search, set context_action="SWITCH".
        2. **RESTORE**: If the user says "go back to previous", "what about the earlier one", or explicitly references an item in "ARCHIVED CONTEXTS", set context_action="RESTORE" and restore_index=<number>.
        3. **KEEP**: If the user is refining the current query (e.g. "filter by deployed", "show me those"), set context_action="KEEP".
        
        SQL RULES:
        - Table name is always '?'
        - Use correct snake_case column names from the definitions.
        - **BOOLEAN VALUES**: Use \`TRUE\` and \`FALSE\` (not 1/0) for boolean columns (e.g. completed = TRUE).
        - Use LIKE for fuzzy matches as recommended in tips.
        - **ALWAYS** apply filters from the conversation context (e.g., status='Deployed') unless the user explicitly removes them.
        - If query result might be large and no aggregation is used, add 'LIMIT 100'.
        - **ADVANCED FUNCTIONS**:
          - Random: \`ORDER BY RANDOM()\`
          - Word Count: \`WORD_COUNT(column)\` (e.g. WHERE WORD_COUNT(title) = 5)
          - Length: \`LEN(column)\`
          - **MIN/MAX LENGTH**:
             - "Shortest title" -> \`ORDER BY LEN(title) ASC LIMIT 1\` (Do NOT use nested SELECT MIN(LEN...))
             - "Longest title" -> \`ORDER BY LEN(title) DESC LIMIT 1\`
          - **REVERSE ORDERING**:
             - If user asks for "reverse order", check the natural order (usually ID or Date).
             - "Reverse order by ID" -> \`ORDER BY id DESC\`
             - "Reverse alphabetical" -> \`ORDER BY title DESC\`
        - **MAPPING RULES**:
          - "Created on" / "Date Created" -> Use column 'created_on' or 'created_at'.
          - "Malfunction Date" / "Broken on" -> Use column 'malfunction_start'.
          - If ambiguous date query (e.g. "on Sept 1"), check BOTH 'malfunction_start' AND 'created_on' with OR.
          - **COLUMN NAMES**: The system automatically converts all columns to snake_case.
            - "userId" -> "user_id"
            - "Task Name" -> "task_name"
            - "completed" -> "completed"
          - ALWAYS query using snake_case names.
          - **IMPORTANT**: If a column is BOOLEAN (true/false), always use \`= TRUE\` or \`= FALSE\`. Do not use 1/0.
          - **NO CASTING**: Do NOT use \`CAST(... AS ...)\`. JavaScript/Alasql handles types automatically.
          - **PERCENTAGE**: Use \`(SUM(CASE WHEN condition THEN 1 ELSE 0 END) * 100 / COUNT(*))\`
          - **ROW LIMITING (TOP N PER GROUP)**:
            - Alasql does NOT support \`ROW_NUMBER()\`.
            - If user asks for "first N per group":
              1. Write a normal SQL query ordered by the group and secondary column (e.g. \`ORDER BY user_id, id ASC\`).
              2. Do NOT use LIMIT in SQL.
              3. Set \`"post_process": "TOP_N_PER_GROUP"\` in the JSON output.
              4. Set \`"post_process_params": { "group_by": "user_id", "limit": N }\`.
          - **DUPLICATE WORDS**:
             - Use a Javascript UDF if possible, or simple regex.
             - Query: \`SELECT * FROM ? WHERE title REGEXP '(\\b\\w+\\b)(?=.*\\b\\1\\b)'\`
             - Do NOT try to use complex string length math (LENGTH - REPLACE) as it is error prone in this engine.
        - **DATE AGGREGATION**:
          - When grouping by date, convert the column first: \`SELECT SUBSTR(timestamp, 1, 10) as msg_date, COUNT(*) ... GROUP BY SUBSTR(timestamp, 1, 10)\`
          - **CRITICAL**: Do NOT use \`LEFT()\`, it is a reserved keyword. Use \`SUBSTR(col, 1, 10)\`.
          - **CRITICAL**: Do NOT use the alias (e.g. 'msg_date') in the GROUP BY clause. You MUST repeat the full expression (e.g. 'SUBSTR(timestamp, 1, 10)').
          - Do NOT group by the raw timestamp string directly if it contains time.
          - Use \`ORDER BY msg_date DESC\` to sort correctly.
        `;

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
            
            // 1. Check In-Memory Data (JSON / Cache)
            if (!this.data[datasetName]) {
                console.log(`Dataset '${datasetName}' not in memory. Fetching live data...`);
                const result = await this._fetchLiveData(datasetName, userEmail);
                
                // Handle both object return (new) and array return (old/fallback)
                if (result && result.data && Array.isArray(result.data)) {
                    this.data[datasetName] = result.data;
                    this.sourceNames[datasetName] = result.sourceName || datasetName;
                    this.sourceCategories[datasetName] = result.categoryName;
                } else if (Array.isArray(result) && result.length > 0) {
                    this.data[datasetName] = result;
                    this.sourceNames[datasetName] = datasetName; // Fallback
                } else {
                     throw new Error(`Dataset '${datasetName}' could not be fetched from any live source.`);
                }
            }

            // 2. Execute Query on In-Memory Data
            // Alasql uses '?' as a placeholder for the data array
            try {
                // IMPORTANT: Alasql treats '?' as a bind parameter. 
                // However, the LLM generates "FROM user_chats" or "FROM ?"
                // If the LLM generates a real table name (like "FROM user_chats"), Alasql will look for a global table which doesn't exist.
                // We must force the query to use the in-memory array by replacing the table name with '?' and binding the data.
                
                // 1. Identify the table name used in the SQL
                // Regex to find "FROM table_name" or "JOIN table_name"
                // We want to replace "FROM user_chats" with "FROM ?"
                
                let executableSql = sql;
                
                // If the SQL uses the dataset name explicitly (e.g. "FROM user_chats"), replace it with "?"
                // Alasql needs "?" to bind the JS array
                const tableNameRegex = new RegExp(`\\bFROM\\s+${datasetName}\\b`, 'i');
                if (tableNameRegex.test(sql)) {
                    executableSql = sql.replace(tableNameRegex, 'FROM ?');
                } else if (!sql.includes('?')) {
                     // If no ? and no matching table name, it might be using an alias or something else.
                     // But usually LLM follows instruction to use '?' or the table name.
                     // If it used a different name, we might be in trouble, but let's try to inject ? if FROM is present
                     executableSql = sql.replace(/\bFROM\s+\w+\b/i, 'FROM ?');
                }

                console.log(`Rewritten SQL for Alasql: ${executableSql}`);
                const res = alasql(executableSql, [this.data[datasetName]]);
                return res;

            } catch (alasqlError) {
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

                        // IMPROVED: Check description for Sheet Tab references
                        const description = (source.description || '').toLowerCase();
                        if (description.includes(`sheet: ${datasetName}`) || description.includes(`tab: ${datasetName}`)) {
                             console.log(`Request matches description in '${source.name}'. Fetching tab '${datasetName}'.`);
                             // If the description explicitly mentions this tab name, trust it.
                             targetTab = datasetName;
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
