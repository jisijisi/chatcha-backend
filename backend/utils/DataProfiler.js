export class DataProfiler {
    /**
     * Analyzes an array of data objects and returns a comprehensive profile
     * @param {Array<Object>} data - Array of JSON objects (rows)
     * @param {number} sampleLimit - Max unique values to store
     * @returns {Object} Profile of columns and their stats
     */
    static profileData(data, sampleLimit = 50) {
        if (!data || data.length === 0) return {};

        const headers = Object.keys(data[0]);
        const profile = {};

        headers.forEach(header => {
            const values = data.map(row => row[header]);
            profile[header] = this._analyzeColumn(values, sampleLimit);
        });

        return profile;
    }

    /**
     * Internal method to analyze a single column's values
     */
    static _analyzeColumn(values, sampleLimit) {
        const total = values.length;
        const definedValues = values.filter(v => v !== null && v !== undefined && v !== '');
        const emptyCount = total - definedValues.length;
        
        // 1. Unique Value Analysis
        // Convert to string for consistent uniqueness check, but keep original type for type detection
        const uniqueSet = new Set(definedValues.map(v => String(v)));
        const uniqueCount = uniqueSet.size;
        const isCategorical = uniqueCount <= 20 && uniqueCount > 0;

        // 2. Type Detection
        const type = this._detectType(definedValues);

        // 3. Top Values (Frequency Analysis)
        const frequencyMap = {};
        definedValues.forEach(v => {
            const key = String(v);
            frequencyMap[key] = (frequencyMap[key] || 0) + 1;
        });
        
        const sortedValues = Object.entries(frequencyMap)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5) // Top 5
            .map(([val, count]) => ({ value: val, count }));

        // 4. Sample Values (Diverse)
        const samples = Array.from(uniqueSet).slice(0, 5); // Take first 5 unique

        // 5. Min/Max for Numbers/Dates
        let min = null, max = null;
        if (type === 'number') {
            const nums = definedValues.map(Number).filter(n => !isNaN(n));
            if (nums.length > 0) {
                min = Math.min(...nums);
                max = Math.max(...nums);
            }
        } else if (type === 'date') {
            const dates = definedValues.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
            if (dates.length > 0) {
                min = new Date(Math.min(...dates)).toISOString().split('T')[0];
                max = new Date(Math.max(...dates)).toISOString().split('T')[0];
            }
        }

        return {
            type,
            total,
            emptyCount,
            emptyPercentage: ((emptyCount / total) * 100).toFixed(1),
            uniqueCount,
            isCategorical,
            topValues: sortedValues,
            samples,
            min,
            max
        };
    }

    static _detectType(values) {
        if (values.length === 0) return 'string';

        // Check first 100 non-empty values
        const checkSet = values.slice(0, 100);
        
        const isNumber = checkSet.every(v => !isNaN(Number(v)) && v !== '');
        if (isNumber) return 'number';

        const isDate = checkSet.every(v => !isNaN(Date.parse(v)) && String(v).length > 5); // Simple heuristic
        if (isDate) return 'date';

        const isBoolean = checkSet.every(v => {
            const s = String(v).toLowerCase();
            return s === 'true' || s === 'false' || s === '0' || s === '1' || s === 'yes' || s === 'no';
        });
        if (isBoolean) return 'boolean';

        return 'string';
    }

    /**
     * Generates a text summary of the profile for the LLM
     */
    static generateLLMSummary(profile) {
        let summary = `DATA CONTENT ANALYSIS (AUTO-GENERATED):\n`;
        
        Object.entries(profile).forEach(([col, stats]) => {
            summary += `\n• Column: "${col}"\n`;
            summary += `  - Type: ${stats.type.toUpperCase()}\n`;
            summary += `  - Empty: ${stats.emptyPercentage}%\n`;
            
            if (stats.isCategorical) {
                summary += `  - CATEGORICAL (Unique: ${stats.uniqueCount}): ${stats.samples.join(', ')}\n`;
            } else {
                summary += `  - Examples: ${stats.samples.join(', ')}\n`;
            }

            if (stats.min !== null) {
                summary += `  - Range: ${stats.min} to ${stats.max}\n`;
            }

            if (stats.topValues.length > 0 && stats.type !== 'number') {
                 summary += `  - Top Values: ${stats.topValues.map(t => `${t.value} (${t.count})`).join(', ')}\n`;
            }
        });

        return summary;
    }
}