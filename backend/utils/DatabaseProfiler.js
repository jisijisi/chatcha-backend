
export class DatabaseProfiler {
    /**
     * Efficiently profiles a database by sampling tables
     * @param {Object} connection - MySQL connection object
     * @param {Array<string>} tableNames - List of tables to profile
     * @returns {Object} Structured profile data
     */
    static async profileDatabase(connection, tableNames) {
        const profile = {};
        
        // Prioritize tables based on keywords if there are too many
        const importantKeywords = ['user', 'account', 'order', 'product', 'customer', 'employee', 'transaction', 'log', 'setting', 'config'];
        
        const sortedTables = [...tableNames].sort((a, b) => {
            const aScore = importantKeywords.some(k => a.toLowerCase().includes(k)) ? 1 : 0;
            const bScore = importantKeywords.some(k => b.toLowerCase().includes(k)) ? 1 : 0;
            return bScore - aScore;
        });

        // Limit to top 8 tables for deep analysis to save time/tokens
        // User requested "at least 50 unique datasets", but we must be careful with total token limits for the LLM.
        // We will fetch 50 samples but maybe only show 10-20 to the LLM if the text is too long.
        const tablesToAnalyze = sortedTables.slice(0, 8);

        for (const table of tablesToAnalyze) {
            try {
                profile[table] = await this.profileTable(connection, table);
            } catch (err) {
                console.warn(`⚠️ Failed to profile table ${table}:`, err.message);
                profile[table] = { error: err.message };
            }
        }
        
        // Add minimal schema info for the remaining tables so LLM at least knows they exist
        const remainingTables = sortedTables.slice(8);
        const remainingProfiles = {};
        for (const table of remainingTables) {
             try {
                const [columns] = await connection.execute(`DESCRIBE ${table}`);
                remainingProfiles[table] = {
                    rowCount: 'Unknown (Skipped)',
                    columns: columns.map(c => c.Field) // Just column names
                };
             } catch (e) {}
        }

        return {
            analyzedTables: tablesToAnalyze,
            remainingTables: remainingTables,
            totalTables: tableNames.length,
            profiles: profile,
            remainingProfiles: remainingProfiles
        };
    }

    /**
     * Profiles a single table using efficient SQL queries
     */
    static async profileTable(connection, tableName) {
        // 1. Get Column Structure
        const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
        
        // 2. Get Total Row Count
        const [countResult] = await connection.execute(`SELECT COUNT(*) as total FROM ${tableName}`);
        const totalRows = countResult[0].total;

        const columnProfiles = {};

        // 3. Analyze each column
        for (const col of columns) {
            const colName = col.Field;
            const colType = col.Type;
            
            // Skip binary/blob columns to avoid massive text
            if (colType.includes('blob') || colType.includes('binary')) {
                columnProfiles[colName] = { type: colType, note: "Binary data skipped" };
                continue;
            }

            // Get Sample Values (Distinct to see variety)
            // Limit 50 as requested by user
            let samples = [];
            try {
                const [rows] = await connection.execute(
                    `SELECT DISTINCT ${colName} FROM ${tableName} WHERE ${colName} IS NOT NULL LIMIT 50`
                );
                samples = rows.map(r => r[colName]);
            } catch (e) {
                // Fallback for types that might not support DISTINCT easily (e.g. text/json sometimes)
                try {
                    const [rows] = await connection.execute(
                        `SELECT ${colName} FROM ${tableName} LIMIT 50`
                    );
                    samples = [...new Set(rows.map(r => r[colName]))];
                } catch (e2) {
                    samples = ["Error fetching samples"];
                }
            }

            // Basic stats
            const stats = {
                type: colType,
                isPrimaryKey: col.Key === 'PRI',
                isNullable: col.Null === 'YES',
                sampleCount: samples.length,
                samples: samples.slice(0, 20) // Keep it concise for LLM, but we fetched 50
            };

            // Heuristics for Categorical vs Free Text
            if (samples.length < 50 && totalRows > 50) {
                // Likely categorical if we exhausted distinct values before hitting limit
                stats.category = 'CATEGORICAL';
                stats.uniqueValues = samples; // All values are here
            } else if (colType.includes('int') || colType.includes('decimal') || colType.includes('float')) {
                stats.category = 'NUMERIC';
                // Get Range for numbers
                try {
                    const [range] = await connection.execute(`SELECT MIN(${colName}) as min_val, MAX(${colName}) as max_val FROM ${tableName}`);
                    stats.min = range[0].min_val;
                    stats.max = range[0].max_val;
                } catch (e) {}
            } else if (colType.includes('date') || colType.includes('time') || colType.includes('year')) {
                stats.category = 'TEMPORAL';
                // Get Range for dates
                try {
                    const [range] = await connection.execute(`SELECT MIN(${colName}) as min_val, MAX(${colName}) as max_val FROM ${tableName}`);
                    stats.min = range[0].min_val;
                    stats.max = range[0].max_val;
                } catch (e) {}
            } else {
                stats.category = 'TEXT';
            }

            columnProfiles[colName] = stats;
        }

        return {
            rowCount: totalRows,
            columns: columnProfiles
        };
    }

    /**
     * Converts the profile object into a text summary for the LLM
     */
    static generateLLMSummary(dbProfile) {
        let summary = `Database Analysis Report\n`;
        summary += `Total Tables: ${dbProfile.totalTables}\n`;
        summary += `Analyzed Tables (Detailed): ${dbProfile.analyzedTables.join(', ')}\n`;
        if (dbProfile.remainingTables && dbProfile.remainingTables.length > 0) {
            summary += `Other Tables (Schema Only): ${dbProfile.remainingTables.join(', ')}\n\n`;
        } else {
             summary += `\n`;
        }

        // 1. Detailed Profiles
        Object.entries(dbProfile.profiles).forEach(([tableName, tableData]) => {
            if (tableData.error) {
                summary += `TABLE: ${tableName} (Error: ${tableData.error})\n\n`;
                return;
            }

            summary += `════════════════════════════════════════\n`;
            summary += `TABLE: "${tableName}" (Rows: ${tableData.rowCount})\n`;
            summary += `════════════════════════════════════════\n`;

            Object.entries(tableData.columns).forEach(([colName, stats]) => {
                summary += `• ${colName} (${stats.type})`;
                if (stats.isPrimaryKey) summary += ` [PK]`;
                if (stats.isNullable) summary += ` [NULL]`;
                
                if (stats.category === 'CATEGORICAL') {
                    summary += `\n  - Values: ${JSON.stringify(stats.uniqueValues)}`;
                } else if (stats.category === 'NUMERIC' || stats.category === 'TEMPORAL') {
                    if (stats.min !== undefined) summary += `\n  - Range: ${stats.min} to ${stats.max}`;
                    summary += `\n  - Samples: ${JSON.stringify(stats.samples.slice(0, 10))}`; // Show more samples
                } else {
                    summary += `\n  - Samples: ${JSON.stringify(stats.samples.slice(0, 10))}`; // Show more samples
                }
                summary += `\n`;
            });
            summary += `\n`;
        });

        // 2. Summary of Remaining Tables
        if (dbProfile.remainingProfiles && Object.keys(dbProfile.remainingProfiles).length > 0) {
            summary += `════════════════════════════════════════\n`;
            summary += `OTHER TABLES SUMMARY (Columns Only)\n`;
            summary += `════════════════════════════════════════\n`;
            Object.entries(dbProfile.remainingProfiles).forEach(([tableName, data]) => {
                summary += `TABLE: "${tableName}"\n`;
                summary += `  Columns: ${data.columns.join(', ')}\n\n`;
            });
        }

        return summary;
    }
}
