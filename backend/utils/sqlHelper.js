// backend/utils/sqlHelper.js
export class SQLHelper {
    
    /**
     * Generate SQL query with proper syntax for Google Sheets data
     * @param {Object} options - Query options
     * @returns {string} - Generated SQL query
     */
    static generateQuery(options) {
        const {
            select = ['*'],
            where = [],
            groupBy = null,
            orderBy = null,
            limit = null,
            having = null
        } = options;
        
        let sql = `SELECT ${Array.isArray(select) ? select.join(', ') : select} FROM ?`;
        
        // Add WHERE clause
        if (where.length > 0) {
            sql += ` WHERE ${where.join(' AND ')}`;
        }
        
        // Add GROUP BY clause
        if (groupBy) {
            sql += ` GROUP BY ${groupBy}`;
        }
        
        // Add HAVING clause
        if (having) {
            sql += ` HAVING ${having}`;
        }
        
        // Add ORDER BY clause
        if (orderBy) {
            sql += ` ORDER BY ${orderBy}`;
        }
        
        // Add LIMIT clause
        if (limit) {
            sql += ` LIMIT ${limit}`;
        }
        
        return sql;
    }
    
    /**
     * Sanitize column name for SQL
     * @param {string} columnName - Original column name
     * @returns {string} - Sanitized column name
     */
    static sanitizeColumnName(columnName) {
        if (!columnName) return '';
        
        return columnName
            .trim()
            .replace(/[\s-]+/g, '_')
            .replace(/[^\w_]/g, '');
    }
    
    /**
     * Convert array of column names to sanitized versions
     * @param {string[]} columnNames - Array of column names
     * @returns {string[]} - Array of sanitized column names
     */
    static sanitizeColumnNames(columnNames) {
        return columnNames.map(name => this.sanitizeColumnName(name));
    }
    
    /**
     * Build WHERE condition for LIKE query
     * @param {string} column - Column name
     * @param {string} value - Value to search for
     * @param {boolean} exact - Whether to use exact match
     * @returns {string} - WHERE condition
     */
    static buildLikeCondition(column, value, exact = false) {
        const sanitizedColumn = this.sanitizeColumnName(column);
        if (exact) {
            return `${sanitizedColumn} = '${value.replace(/'/g, "''")}'`;
        } else {
            return `${sanitizedColumn} LIKE '%${value.replace(/'/g, "''")}%'`;
        }
    }
    
    /**
     * Build WHERE condition for IN query
     * @param {string} column - Column name
     * @param {string[]} values - Array of values
     * @returns {string} - WHERE condition
     */
    static buildInCondition(column, values) {
        const sanitizedColumn = this.sanitizeColumnName(column);
        const quotedValues = values.map(v => `'${v.replace(/'/g, "''")}'`);
        return `${sanitizedColumn} IN (${quotedValues.join(', ')})`;
    }
    
    /**
     * Get sample queries for a dataset
     * @param {string[]} columns - Array of column names
     * @returns {Object} - Sample queries
     */
    static getSampleQueries(columns) {
        const sanitizedColumns = this.sanitizeColumnNames(columns);
        
        return {
            selectAll: `SELECT * FROM ? LIMIT 10`,
            countRows: `SELECT COUNT(*) as total_rows FROM ?`,
            basicFilter: `SELECT ${sanitizedColumns.slice(0, 3).join(', ')} FROM ? WHERE ${sanitizedColumns[0]} IS NOT NULL LIMIT 5`,
            groupBy: `SELECT ${sanitizedColumns[1]}, COUNT(*) as count FROM ? GROUP BY ${sanitizedColumns[1]}`,
            orderBy: `SELECT ${sanitizedColumns.slice(0, 2).join(', ')} FROM ? ORDER BY ${sanitizedColumns[0]} DESC LIMIT 10`
        };
    }
}