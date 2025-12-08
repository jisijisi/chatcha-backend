// backend/services/toolService.js
import fetch from 'node-fetch';
import { pool } from '../config/database.js';
import { UserGoogleService } from './userGoogleService.js';
import { QueryService } from './queryService.js';

export class ToolService {
    
    static async getAvailableTools(userEmail, categoryFilter = 'ALL') {
        try {
            if (!userEmail) return [];

            // 1. Get Employee & Token Status
            const [users] = await pool.execute("SELECT id, google_tokens FROM employees WHERE email = ?", [userEmail]);
            if (users.length === 0) return [];
            
            const employeeId = users[0].id;
            const tokens = users[0].google_tokens;
            const hasGoogleTokens = Boolean(tokens && (typeof tokens === 'string' ? tokens.length > 10 : Object.keys(tokens).length > 0));

            const functionDeclarations = [];

            // 2. FETCH SYSTEM TOOLS (Efficient Single SQL Query)
            if (categoryFilter === 'ALL' || categoryFilter === 'LIVE_DATA') {
                const query = `
                    SELECT DISTINCT t.*, c.name as category_name, sc.name as subcategory_name
                    FROM live_data_sources t
                    LEFT JOIN knowledge_categories c ON t.category_id = c.id
                    LEFT JOIN knowledge_subcategories sc ON t.subcategory_id = sc.id
                    LEFT JOIN employee_access_permissions p ON p.employee_id = ?
                    WHERE t.is_active = TRUE
                    AND (
                        -- 1. Full Admin Access
                        (p.category_id IS NULL AND p.subcategory_id IS NULL AND p.source_id IS NULL)
                        -- 2. Category Access
                        OR (p.category_id = t.category_id AND p.subcategory_id IS NULL AND p.source_id IS NULL)
                        -- 3. Direct Source Access
                        OR (p.source_id = t.id)
                    )
                `;
                
                const [allowedTools] = await pool.execute(query, [employeeId]);
                
                // Map to Gemini Format
                for (const tool of allowedTools) {
                    const contextPrefix = tool.category_name ? `[${tool.category_name}] ` : "";
                    
                    if (tool.source_type === 'google_sheet') {
                        functionDeclarations.push({
                            name: `query_live_data_${tool.id}`,
                            description: `${contextPrefix}${tool.description}. ACTION: Run SQL query. Use '?' as table name (NOT backticks). Column names are snake_case.`,
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    sql_query: { 
                                        type: "STRING", 
                                        description: "Standard SQL query. Use '?' as table name (e.g., SELECT * FROM ? WHERE status = 'Deployed'). Column names are snake_case (spaces replaced with underscores)." 
                                    },
                                    tab_name: { type: "STRING", description: "Specific tab name if known." }
                                },
                                required: ["sql_query"]
                            }
                        });
                    } else if (tool.source_type === 'external_api') {
                        const config = typeof tool.config === 'string' ? JSON.parse(tool.config) : tool.config;
                        const properties = {};
                        const requiredParams = [];
                        
                        if (config.parameters) {
                            config.parameters.forEach(p => {
                                properties[p.name] = { type: p.type.toUpperCase(), description: p.description };
                                if (p.required) requiredParams.push(p.name);
                            });
                        }

                        functionDeclarations.push({
                            name: `call_external_api_${tool.id}`,
                            description: `${contextPrefix}${tool.description}`,
                            parameters: { type: "OBJECT", properties, required: requiredParams }
                        });
                    }
                }
            }

            // 3. PERSONAL TOOLS
            if ((categoryFilter === 'ALL' || categoryFilter === 'PERSONAL_ACTION') && hasGoogleTokens) {
                functionDeclarations.push(
                    this.getCalendarListDef(),
                    this.getCalendarCreateDef(),
                    this.getCalendarCancelDef(),
                    this.getCalendarUpdateDef(),
                    this.getCalendarSearchDef(),
                    this.getGmailListDef(),
                    this.getGmailSendDef(),
                    this.getGmailReadDef()
                );
            }

            if (functionDeclarations.length === 0) return [];
            return [{ function_declarations: functionDeclarations }];

        } catch (error) {
            console.error("❌ Error fetching tools:", error);
            return [];
        }
    }

    // --- Helper Definitions ---
    static getCalendarListDef() {
        return {
            name: "user_calendar_list",
            description: "List upcoming meetings from Google Calendar (PH Time).",
            parameters: {
                type: "OBJECT",
                properties: {
                    count: { type: "NUMBER", description: "Max events (default 10)" },
                    timeMin: { type: "STRING", description: "Start ISO time" },
                    query: { type: "STRING", description: "Filter keywords" }
                }
            }
        };
    }
    static getCalendarCreateDef() { return { name: "user_calendar_create", description: "Schedule meeting.", parameters: { type: "OBJECT", properties: { summary: {type:"STRING"}, startTime: {type:"STRING"}, endTime: {type:"STRING"}, attendees: {type:"ARRAY", items:{type:"STRING"}}, description: {type:"STRING"}, location: {type:"STRING"} }, required: ["summary", "startTime", "endTime"] } }; }
    static getCalendarCancelDef() { return { name: "user_calendar_cancel", description: "Cancel meeting.", parameters: { type: "OBJECT", properties: { eventId: {type:"STRING"}, reason: {type:"STRING"} }, required: ["eventId"] } }; }
    static getCalendarUpdateDef() { return { name: "user_calendar_update", description: "Update meeting.", parameters: { type: "OBJECT", properties: { eventId: {type:"STRING"}, summary: {type:"STRING"}, startTime: {type:"STRING"}, endTime: {type:"STRING"}, attendees: {type:"ARRAY", items:{type:"STRING"}} }, required: ["eventId"] } }; }
    static getCalendarSearchDef() { return { name: "user_calendar_search", description: "Search calendar.", parameters: { type: "OBJECT", properties: { query: {type:"STRING"}, maxResults: {type:"NUMBER"} }, required: ["query"] } }; }
    static getGmailListDef() { return { name: "user_gmail_list", description: "List emails. Use 'label:INBOX' query.", parameters: { type: "OBJECT", properties: { count: {type:"NUMBER"}, query: {type:"STRING"} } } }; }
    static getGmailSendDef() { return { name: "user_gmail_send", description: "Send email.", parameters: { type: "OBJECT", properties: { to: {type:"STRING"}, subject: {type:"STRING"}, body: {type:"STRING"} }, required: ["to", "subject", "body"] } }; }
    static getGmailReadDef() { return { name: "user_gmail_read", description: "Read full email body.", parameters: { type: "OBJECT", properties: { messageId: {type:"STRING"} }, required: ["messageId"] } }; }

    // --- Execution Logic ---
    static async executeTool(functionName, args, userEmail) {
        console.log(`🛠️ ToolService executing: ${functionName} for ${userEmail || 'guest'} with args:`, args);
        
        try {
            if (!userEmail) return { error: "User not authenticated" };

            // ============================================================
            // A. EXTERNAL API TOOLS (With Smart Middleware)
            // ============================================================
            if (functionName.startsWith('call_external_api_')) {
                const toolId = functionName.split('_').pop();
                const [rows] = await pool.execute("SELECT id, name, config FROM live_data_sources WHERE id = ?", [toolId]);
                
                if (rows.length === 0) return { error: "API Tool not found in database." };
                
                const tool = rows[0];
                const config = typeof tool.config === 'string' ? JSON.parse(tool.config) : tool.config;

                let url = config.endpoint;
                const method = config.method || 'GET';
                const headers = config.headers || {};
                
                // 1. URL Parameter Injection (Standard for REST APIs)
                if (config.parameters) {
                    config.parameters.forEach(param => {
                        const val = args[param.name];
                        if (val) {
                            if (url.includes(`{${param.name}}`)) {
                                url = url.replace(`{${param.name}}`, encodeURIComponent(val));
                            } else if (param.in === 'query') {
                                const separator = url.includes('?') ? '&' : '?';
                                url += `${separator}${param.name}=${encodeURIComponent(val)}`;
                            }
                        }
                    });
                }

                try {
                    console.log(`🌐 Fetching external API: ${url}`);
                    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers } });
                    
                    if (!response.ok) {
                        throw new Error(`API responded with ${response.status}: ${response.statusText}`);
                    }

                    let data = await response.json();

                    // 2. MIDDLEWARE FILTERING (Smart Fallback for "Dumb" APIs)
                    // If the API returns a list, filter it here based on arguments provided by AI
                    // handles property mismatches (e.g. machine_id vs machineid)
                    if (Array.isArray(data) && Object.keys(args).length > 0) {
                        console.log(`🧹 Filtering ${data.length} records in middleware based on args:`, args);
                        
                        data = data.filter(item => {
                            let matches = true;
                            
                            for (const [key, value] of Object.entries(args)) {
                                // NORMALIZE KEY: Remove underscores (e.g., "machine_id" -> "machineid")
                                const cleanKey = key.replace(/_/g, '');
                                
                                // FIND VALUE: Check item[key] first, then item[cleanKey] as fallback
                                const itemValue = item[key] !== undefined ? item[key] : item[cleanKey];

                                // SKIP FILTER if the property doesn't exist in the record at all
                                if (itemValue === undefined) continue;

                                // --- MATCHING LOGIC ---

                                // 1. Start Date Filter (Start Date >= Filter Date)
                                if (key === 'start_dt' || key === 'startdt') {
                                    if (new Date(itemValue) < new Date(value)) matches = false;
                                }
                                // 2. End Date Filter (End Date <= Filter Date)
                                else if (key === 'end_dt' || key === 'enddt') {
                                    // Note: If item ends AFTER filter end, exclude it
                                    if (new Date(itemValue) > new Date(value)) matches = false;
                                }
                                // 3. Standard Equality (Soft match for strings/numbers)
                                else {
                                    if (itemValue != value) matches = false;
                                }
                            }
                            return matches;
                        });
                        
                        console.log(`🧹 Result after filtering: ${data.length} records.`);
                    }
                    
                    // 3. Safety Truncation
                    // Don't send more than 50 records to AI to prevent token overflow
                    if (Array.isArray(data) && data.length > 50) {
                        data = data.slice(0, 50);
                        console.warn("⚠️ Truncated result to 50 records for AI context.");
                    }

                    return {
                        tool_output: {
                            source_info: { id: tool.id, title: tool.name, type: 'external_api' },
                            result: data,
                            result_count: Array.isArray(data) ? data.length : 1,
                            system_note: `API executed. Results filtered by system based on your parameters.`
                        }
                    };
                } catch (fetchError) {
                    return { error: `Network request failed: ${fetchError.message}` };
                }
            }

            // ============================================================
            // B. GOOGLE CALENDAR TOOLS
            // ============================================================
            if (functionName === "user_calendar_list") {
                const events = await UserGoogleService.listEvents(userEmail, args.timeMin, args.count);
                return { tool_output: { source: "Google Calendar", events: events, result_count: events.length } };
            }
            if (functionName === "user_calendar_create") {
                const link = await UserGoogleService.createEvent(userEmail, args);
                return { tool_output: { source: "Google Calendar", success: true, event_link: link, message: "Event created." } };
            }
            if (functionName === "user_calendar_cancel") {
                await UserGoogleService.cancelEvent(userEmail, args.eventId, args.reason);
                return { tool_output: { source: "Google Calendar", success: true, message: "Event cancelled." } };
            }
            if (functionName === "user_calendar_update") {
                const res = await UserGoogleService.updateEvent(userEmail, args.eventId, args);
                return { tool_output: { source: "Google Calendar", success: true, event_link: res.link, message: "Event updated." } };
            }
            if (functionName === "user_calendar_search") {
                const events = await UserGoogleService.searchEvents(userEmail, args.query, args.maxResults);
                return { tool_output: { source: "Google Calendar", events: events, result_count: events.length } };
            }

            // ============================================================
            // C. GMAIL TOOLS
            // ============================================================
            if (functionName === "user_gmail_list") {
                const emails = await UserGoogleService.listEmails(userEmail, args.count, args.query);
                return { tool_output: { source: "Google Mail", emails: emails, result_count: emails.length } };
            }
            if (functionName === "user_gmail_read") {
                const content = await UserGoogleService.getEmailContent(userEmail, args.messageId);
                return { tool_output: { source: "Google Mail", email_data: content } };
            }
            if (functionName === "user_gmail_send") {
                const res = await UserGoogleService.sendEmail(userEmail, args.to, args.subject, args.body);
                return { tool_output: { source: "Google Mail", success: true, id: res.id, message: "Email sent." } };
            }

            // ============================================================
            // D. SYSTEM TOOLS (SQL Execution on Sheets)
            // ============================================================
            if (functionName.startsWith('query_live_data_')) {
                const parts = functionName.split('_');
                const toolId = parts[parts.length - 1];

                const [rows] = await pool.execute("SELECT id, name, config FROM live_data_sources WHERE id = ?", [toolId]);
                if (rows.length === 0) return { error: "Tool source not found in database." };

                const tool = rows[0];
                const config = typeof tool.config === 'string' ? JSON.parse(tool.config) : tool.config;
                
                // Fix the SQL Query before execution
                console.log(`🔧 Original SQL: ${args.sql_query}`);
                const fixedSqlQuery = QueryService.fixSqlQuery(args.sql_query);
                console.log(`🔧 Fixed SQL: ${fixedSqlQuery}`);
                
                // Execute on the specific sheet/tab
                const result = await QueryService.runSheetSqlQuery(config.sheet_url, fixedSqlQuery, args.tab_name);
                
                if (result.error) {
                    return { 
                        tool_output: { 
                            error: result.error, 
                            suggestion: result.suggestion,
                            original_query: args.sql_query,
                            fixed_query: fixedSqlQuery
                        } 
                    };
                }
                
                return {
                    tool_output: {
                        source_info: { id: tool.id, title: tool.name, type: 'google_sheet_sql' },
                        query_executed: args.sql_query,
                        fixed_query: fixedSqlQuery,
                        search_results: result,
                        result_count: result.length
                    }
                };
            }

            return { error: "Unknown tool function called" };

        } catch (error) {
            console.error("❌ Tool Execution Failed:", error);
            return { error: `Failed to execute tool: ${error.message}` };
        }
    }
}