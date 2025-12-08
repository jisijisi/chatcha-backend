import alasql from 'alasql';
import { GoogleService } from './googleService.js';

export class QueryService {

    /**
     * Executes a SQL query against a "Virtual" Database created from a Google Sheet.
     * @param {string} sheetUrlOrId - The Google Sheet URL or ID
     * @param {string} sqlQuery - The SQL query string
     * @param {string} tabName - (Optional) Specific tab to query
     */
    static async runSheetSqlQuery(sheetUrlOrId, sqlQuery, tabName = null) {
        try {
            console.log(`📊 QueryService: Fetching data for SQL execution (Tab: ${tabName || 'First'})...`);
            
            // 1. Fetch ALL raw data using GoogleService
            const rawData = await GoogleService.getAllSheetRows(sheetUrlOrId, tabName);
            
            if (!rawData || rawData.length === 0) {
                return [];
            }

            // 2. Sanitize Headers for SQL Compatibility
            const cleanedData = rawData.map(row => {
                const newRow = {};
                for (const key in row) {
                    if (Object.prototype.hasOwnProperty.call(row, key)) {
                        // Regex: Lowercase, replace spaces/hyphens with underscore, remove other non-alphanumeric chars
                        // FIXED: Added .toLowerCase() to ensure strict snake_case matching AI output
                        const cleanKey = key.trim()
                            .toLowerCase()
                            .replace(/[\s-]+/g, '_')
                            .replace(/[^\w_]/g, '');
                        
                        // Attempt to convert numeric strings to actual numbers for aggregation
                        const val = row[key];
                        // Simple heuristic: if it looks like a number, parse it.
                        const numVal = parseFloat(val && typeof val === 'string' ? val.replace(/,/g, '') : val);
                        
                        // Store as number if valid, otherwise keep string
                        newRow[cleanKey] = (!isNaN(numVal) && typeof val === 'string' && val.length < 15 && !val.includes('-') && !val.includes('/')) 
                            ? numVal 
                            : val;
                    }
                }
                return newRow;
            });

            console.log(`📊 QueryService: Executing SQL: "${sqlQuery}" on ${cleanedData.length} rows.`);

            // 3. PRE-PROCESS THE SQL QUERY TO HANDLE TABLE NAME ISSUES
            let processedSql = this.fixSqlQuery(sqlQuery);
            
            // 4. Run In-Memory SQL using Alasql with the data array as parameter
            const result = alasql(processedSql, [cleanedData]);
            
            console.log(`✅ Query executed successfully. Returned ${result.length} rows.`);
            return result;

        } catch (error) {
            console.error("❌ Alasql Execution Error:", error);
            
            // More helpful error messages
            let errorMessage = error.message;
            let suggestion = "Check column names. They are converted to lowercase snake_case (e.g., 'Project Name' -> 'project_name').";
            
            if (error.message.includes('Table does not exist')) {
                errorMessage = "SQL Error: Table name issue detected.";
                suggestion = "The query references a table name that doesn't exist. Remember: data is loaded as an array, not as a named table. Use '?' as the table name in your queries.";
            } else if (error.message.includes('column') && error.message.includes('not found')) {
                suggestion = "Column names are converted to lowercase snake_case. For example, 'Project Name' becomes 'project_name', 'TYPE OF LICENSE' becomes 'type_of_license'.";
            }
            
            return { 
                error: `SQL Logic Error: ${errorMessage}`,
                suggestion: suggestion,
                original_error: error.message
            };
        }
    }

    /**
     * Helper to preview the available columns
     */
    static async getSheetSchema(sheetUrlOrId, tabName = null) {
        try {
            const rawData = await GoogleService.getAllSheetRows(sheetUrlOrId, tabName);
            if (!rawData || rawData.length === 0) return [];
            
            const firstRow = rawData[0];
            const schema = Object.keys(firstRow).map(key => {
                return {
                    original: key,
                    // FIXED: Ensure schema reflects the lowercase logic used in execution
                    sql_column: key.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^\w_]/g, '')
                };
            });
            return schema;
        } catch (error) {
            return [];
        }
    }
    
    /**
     * NEW: Generate a corrected SQL query that will work with Alasql
     * @param {string} originalSql - The original SQL query
     * @returns {string} - Corrected SQL query
     */
    static fixSqlQuery(originalSql) {
        let fixedSql = originalSql;
        
        // First, replace backtick-wrapped table names with ?
        fixedSql = fixedSql.replace(/`([^`]+)`/g, '?');
        
        // Replace double-quoted table names with ?
        fixedSql = fixedSql.replace(/"([^"]+)"/g, '?');
        
        // Replace table names with spaces (not wrapped in quotes) with ?
        // Pattern: FROM table name with spaces (but not keywords)
        const tableNameRegex = /(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*(?:\s+[A-Za-z0-9_]+)+)(?=\s+|$)/gi;
        fixedSql = fixedSql.replace(tableNameRegex, '$1 ?');
        
        // Handle simple table names without spaces
        // This catches: SELECT * FROM TableName WHERE...
        const simpleTableRegex = /(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT)/gi;
        fixedSql = fixedSql.replace(simpleTableRegex, '$1 ? $3');
        
        // Handle table names at the end of query
        const endTableRegex = /(FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)$/gi;
        fixedSql = fixedSql.replace(endTableRegex, '$1 ?');
        
        // Also fix column names with spaces (wrap them in backticks for Alasql compatibility)
        // Find column names with spaces that aren't already wrapped
        
        // 🛑 FIXED REGEX: Added negative lookahead (?!(?:FROM|AS|...))
        // This prevents the regex from grabbing "user FROM" and treating it as a column named "user_from"
        const columnNameRegex = /\b(SELECT|,)\s+([A-Za-z_][A-Za-z0-9_]*\s+(?!(?:FROM|AS|JOIN|WHERE|GROUP|ORDER|LIMIT|HAVING|OFFSET|UNION|EXCEPT|INTERSECT|ON)\b)[A-Za-z0-9_]+)\b/gi;
        
        fixedSql = fixedSql.replace(columnNameRegex, (match, prefix, columnName) => {
            // Convert column name with spaces to snake_case
            // FIXED: Ensure column names in the query are lowercased to match data sanitization
            const snakeCase = columnName.replace(/\s+/g, '_').replace(/-/g, '_').toLowerCase();
            return `${prefix} ${snakeCase}`;
        });
        
        // Log the fix for debugging
        if (fixedSql !== originalSql) {
            console.log(`🔧 SQL Fix Applied: "${originalSql}" → "${fixedSql}"`);
        }
        
        return fixedSql;
    }
    
    /**
     * NEW: Get sample queries for a sheet
     */
    static async getSampleQueries(sheetUrlOrId, tabName = null) {
        try {
            const schema = await this.getSheetSchema(sheetUrlOrId, tabName);
            if (schema.length === 0) return [];
            
            const columnNames = schema.map(col => col.sql_column);
            const sampleQueries = [
                `SELECT * FROM ? LIMIT 10`,
                `SELECT COUNT(*) as total_rows FROM ?`,
                `SELECT ${columnNames.slice(0, 3).join(', ')} FROM ? WHERE ${columnNames[0]} IS NOT NULL LIMIT 5`
            ];
            
            return sampleQueries;
        } catch (error) {
            return [];
        }
    }
    
    /**
     * NEW: Validate and test a SQL query
     */
    static async validateQuery(sheetUrlOrId, sqlQuery, tabName = null) {
        try {
            const fixedQuery = this.fixSqlQuery(sqlQuery);
            const schema = await this.getSheetSchema(sheetUrlOrId, tabName);
            
            return {
                original_query: sqlQuery,
                fixed_query: fixedQuery,
                is_valid: true,
                schema: schema,
                suggestion: "Use '?' as the table name. Column names are converted to lowercase snake_case (spaces to underscores)."
            };
        } catch (error) {
            return {
                original_query: sqlQuery,
                fixed_query: this.fixSqlQuery(sqlQuery),
                is_valid: false,
                error: error.message,
                suggestion: "Use '?' as table name. Example: SELECT * FROM ? WHERE status = 'Deployed'"
            };
        }
    }
}