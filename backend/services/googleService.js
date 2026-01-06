import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch'; // Force usage of node-fetch package to support 'timeout' option
import { DataProfiler } from '../utils/DataProfiler.js'; // Import the new profiler

import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEY_FILE_PATH = path.join(__dirname, '../service-account.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class GoogleService {
    static cache = new Map();
    static CACHE_TTL = 5 * 60 * 1000; 

    static async getAuth() {
        if (!fs.existsSync(KEY_FILE_PATH)) {
            throw new Error('Missing backend/service-account.json file.');
        }
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: SCOPES,
        });
        return auth.getClient();
    }

    static extractSheetId(url) {
        const matches = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        return matches ? matches[1] : url; 
    }

    // --- NEW: Helper for Retry Logic ---
    static async generateContentWithRetry(model, prompt, retries = 3, delay = 2000) {
        // Fallback models to try if the primary model fails with 404/Not Found
        const fallbackModels = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];
        let currentModel = model;

        for (let i = 0; i < retries; i++) {
            try {
                return await currentModel.generateContent(prompt);
            } catch (error) {
                // Check if error is 429 (Too Many Requests) or 503 (Service Unavailable)
                const isRateLimit = error.message.includes('429') || error.status === 429;
                const isServerBusy = error.message.includes('503') || error.status === 503;
                
                // Check for 404 (Model Not Found) - Try fallback models
                const isModelNotFound = error.message.includes('404') || error.status === 404;

                if (isModelNotFound) {
                    console.warn(`⚠️ Model not found. Attempting fallback models...`);
                    for (const fallbackName of fallbackModels) {
                         try {
                             console.log(`🔄 Switching to fallback model: ${fallbackName}`);
                             const fallbackModel = genAI.getGenerativeModel({ model: fallbackName });
                             return await fallbackModel.generateContent(prompt);
                         } catch (fbError) {
                             console.warn(`   Fallback ${fallbackName} failed: ${fbError.message}`);
                         }
                    }
                    // If all fallbacks fail, throw original error
                    throw error;
                }

                if ((isRateLimit || isServerBusy) && i < retries - 1) {
                    console.warn(`⚠️ AI Service Busy (Attempt ${i + 1}/${retries}). Retrying in ${delay/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Double the wait time for next retry
                } else {
                    throw error; // Throw if it's a different error or we ran out of retries
                }
            }
        }
    }

    // Helper: Calculate string similarity (Levenshtein distance)
    static calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 100;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (1 - distance / longer.length) * 100;
    }

    static levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str1.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str2.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str1.length; i++) {
            for (let j = 1; j <= str2.length; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        
        return matrix[str1.length][str2.length];
    }

    // Helper: Check if column contains names
    static isNameColumn(header, values) {
        const headerLower = header.toLowerCase();
        const nameIndicators = ['name', 'user', 'person', 'employee', 'contact', 'assignee', 'owner'];
        
        if (nameIndicators.some(indicator => headerLower.includes(indicator))) {
            return true;
        }
        
        // Check if values look like names
        const validValues = values.filter(v => v && v.trim().length > 0);
        if (validValues.length === 0) return false;
        
        const namePatternCount = validValues.filter(v => {
            const parts = v.split(/\s+/);
            return parts.length >= 2 && parts.every(part => /^[A-Za-z]+$/.test(part) && part.length > 1);
        }).length;
        
        return namePatternCount / validValues.length > 0.3; // 30% of values look like names
    }

    // Helper: Check if column contains dates/times
    static isDateColumn(header, values) {
        const headerLower = header.toLowerCase();
        const dateIndicators = ['date', 'time', 'created', 'updated', 'start', 'end', 'duration', 'deadline', 'timestamp'];
        
        if (dateIndicators.some(indicator => headerLower.includes(indicator))) {
            return true;
        }
        
        // Check if values look like dates/times
        const validValues = values.filter(v => v && v.trim().length > 0);
        if (validValues.length === 0) return false;
        
        const datePatterns = [
            /\d{4}-\d{2}-\d{2}/,
            /\d{2}\/\d{2}\/\d{4}/,
            /\d{1,2}:\d{2}/,
            /\d{1,2}[ap]m/i,
            /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
            /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
            /^\d{1,2}-\d{1,2}-\d{2,4}$/
        ];
        
        const dateCount = validValues.filter(v => {
            return datePatterns.some(pattern => pattern.test(v));
        }).length;
        
        return dateCount / validValues.length > 0.3;
    }

    // Helper: Check if column contains status values
    static isStatusColumn(header, values) {
        const headerLower = header.toLowerCase();
        const statusIndicators = ['status', 'state', 'condition', 'phase', 'stage', 'progress'];
        
        if (statusIndicators.some(indicator => headerLower.includes(indicator))) {
            return true;
        }
        
        // Common status values
        const commonStatuses = ['deployed', 'hold', 'in progress', 'upcoming', 'completed', 
                              'pending', 'cancelled', 'active', 'inactive', 'done', 'failed', 
                              'success', 'error', 'warning', 'info', 'ready', 'processing'];
        
        const validValues = values.filter(v => v && v.trim().length > 0);
        if (validValues.length === 0) return false;
        
        const statusCount = validValues.filter(v => {
            const lower = v.toLowerCase();
            return commonStatuses.some(status => lower.includes(status));
        }).length;
        
        return statusCount / validValues.length > 0.5;
    }

    // Helper: Detect value variations (like "Every 15 mins" vs "Every 15minutes")
    static detectValueVariations(values, header) {
        const variations = [];
        
        // Common patterns to check
        const patterns = [
            { regex: /(\d+)\s*mins?/i, standard: "$1 mins" },
            { regex: /(\d+)\s*hours?/i, standard: "$1 hours" },
            { regex: /every\s+(\d+)\s*(am|pm)/i, standard: "Every $1$2" },
            { regex: /any\s+time/i, standard: "Any Time" },
            { regex: /once\s+(a|per)\s+month/i, standard: "Once a month" },
            { regex: /once\s+(a|per)\s+week/i, standard: "Once a week" },
            { regex: /once\s+(a|per)\s+day/i, standard: "Once a day" },
            { regex: /deployed/i, standard: "Deployed" },
            { regex: /in\s*progress/i, standard: "In Progress" },
            { regex: /upcoming/i, standard: "Upcoming" },
            { regex: /hold/i, standard: "Hold" },
            { regex: /(\d+)\s*-\s*(\d+)\s*mins?/i, standard: "$1-$2 mins" },
            { regex: /(\d+)\s*minutes?/i, standard: "$1 minutes" },
            { regex: /attended/i, standard: "Attended" },
            { regex: /un-attended/i, standard: "Un-Attended" }
        ];
        
        const seen = new Set();
        const valueFrequency = {};
        
        // Count frequency of each value
        values.forEach(value => {
            if (!value) return;
            const lowerValue = value.toLowerCase();
            valueFrequency[lowerValue] = (valueFrequency[lowerValue] || 0) + 1;
        });
        
        // Find most frequent pattern for each group
        Object.keys(valueFrequency).forEach(lowerValue => {
            if (seen.has(lowerValue)) return;
            seen.add(lowerValue);
            
            // Find original value with this lowercase version
            const original = values.find(v => v && v.toLowerCase() === lowerValue);
            if (!original) return;
            
            // Check each pattern
            patterns.forEach(pattern => {
                if (pattern.regex.test(original)) {
                    const standardized = original.replace(pattern.regex, pattern.standard);
                    if (standardized !== original) {
                        // Find if standardized version exists
                        const standardizedLower = standardized.toLowerCase();
                        const hasStandardized = valueFrequency[standardizedLower] > 0;
                        
                        variations.push({
                            original: original,
                            suggested: standardized,
                            pattern: pattern.regex.toString(),
                            frequency: valueFrequency[lowerValue],
                            has_standardized_version: hasStandardized,
                            severity: hasStandardized ? "medium" : "low"
                        });
                    }
                }
            });
        });
        
        // Sort by frequency and severity
        return variations
            .sort((a, b) => {
                if (a.severity !== b.severity) {
                    const severityOrder = { high: 0, medium: 1, low: 2 };
                    return severityOrder[a.severity] - severityOrder[b.severity];
                }
                return b.frequency - a.frequency;
            })
            .slice(0, 10); // Limit to top 10 variations
    }

    // Helper: Detect potential name duplicates (like "Micaella Gutierrez" vs "Micaella Cruz")
    static detectNameDuplicates(values, header) {
        const duplicates = [];
        
        // Check if this looks like a name column
        if (!this.isNameColumn(header, values)) return duplicates;
        
        // Simple similarity check for names
        const names = values.filter(v => v && v.trim().length > 0);
        const processed = new Set();
        
        for (let i = 0; i < names.length; i++) {
            const name1 = names[i];
            if (processed.has(name1)) continue;
            
            const name1Lower = name1.toLowerCase();
            const words1 = name1Lower.split(/\s+/);
            
            for (let j = i + 1; j < names.length; j++) {
                const name2 = names[j];
                if (processed.has(name2)) continue;
                
                const name2Lower = name2.toLowerCase();
                const words2 = name2Lower.split(/\s+/);
                
                // Skip if identical (case-insensitive)
                if (name1Lower === name2Lower) continue;
                
                let similarity = 0;
                let reason = "";
                
                // Rule 1: If first names match but last names differ
                if (words1[0] === words2[0] && words1.length > 1 && words2.length > 1) {
                    similarity = this.calculateSimilarity(name1Lower, name2Lower);
                    if (similarity > 70) {
                        reason = `Same first name "${words1[0]}" with different last names`;
                    }
                }
                
                // Rule 2: Check for abbreviations (J. Dela Cruz vs Juan Dela Cruz)
                if (words1.length === words2.length && words1.length >= 2) {
                    const firstCharMatch = words1[0].charAt(0) === words2[0].charAt(0);
                    const lastNamesMatch = words1.slice(1).join(' ') === words2.slice(1).join(' ');
                    
                    if (firstCharMatch && lastNamesMatch && (words1[0].length === 1 || words2[0].length === 1)) {
                        similarity = 85;
                        reason = "Possible abbreviation variation";
                    }
                }
                
                // Rule 3: Check for middle name vs no middle name
                if (Math.abs(words1.length - words2.length) === 1) {
                    const shorter = words1.length < words2.length ? words1 : words2;
                    const longer = words1.length > words2.length ? words1 : words2;
                    
                    // Check if shorter is subset of longer
                    const isSubset = shorter.every(word => longer.some(lword => lword.includes(word) || word.includes(lword)));
                    if (isSubset) {
                        similarity = 80;
                        reason = "Possible middle name variation";
                    }
                }
                
                // Rule 4: Check for nickname variations
                const commonNicknames = {
                    'michael': ['mike', 'mickey'],
                    'james': ['jim', 'jimmy'],
                    'robert': ['bob', 'rob', 'bobby'],
                    'richard': ['dick', 'rick', 'rich'],
                    'william': ['will', 'bill', 'billy'],
                    'elizabeth': ['liz', 'beth', 'liza'],
                    'catherine': ['cathy', 'cath', 'kate'],
                    'anthony': ['tony'],
                    'daniel': ['dan'],
                    'christopher': ['chris']
                };
                
                if (words1[0] in commonNicknames || words2[0] in commonNicknames) {
                    const nick1 = commonNicknames[words1[0]] || [];
                    const nick2 = commonNicknames[words2[0]] || [];
                    
                    if (nick1.includes(words2[0]) || nick2.includes(words1[0])) {
                        similarity = 90;
                        reason = "Possible nickname variation";
                    }
                }
                
                if (similarity > 70 && reason) {
                    duplicates.push({
                        value: name1,
                        match: name2,
                        similarity: Math.round(similarity),
                        reason: reason
                    });
                    processed.add(name1);
                    processed.add(name2);
                }
            }
        }
        
        return duplicates.slice(0, 5); // Limit to top 5 potential duplicates
    }

    // NEW HELPER METHOD: Enhanced column analysis
    static analyzeColumns(headers, rows) {
        const analysis = {};
        const totalRows = rows.length - 1; // Exclude header
        
        headers.forEach((header, idx) => {
            if (!header || header.trim() === '') {
                analysis[`COLUMN_${idx + 1}`] = {
                    header: `Column ${idx + 1} (Unnamed)`,
                    dataType: 'unknown',
                    totalValues: 0,
                    uniqueCount: 0,
                    emptyCount: totalRows,
                    emptyPercentage: 100,
                    sampleValues: [],
                    warning: 'Column has no header name'
                };
                return;
            }
            
            // Get all values for this column
            const rawValues = rows.slice(1).map(r => r[idx]);
            const values = rawValues.map(v => v ? v.toString().trim() : null);
            const nonEmptyValues = values.filter(v => v !== null && v !== '');
            const emptyValues = values.filter(v => v === null || v === '');
            
            const nonEmptyCount = nonEmptyValues.length;
            const emptyCount = emptyValues.length;
            const emptyPercentage = totalRows > 0 ? Math.round((emptyCount / totalRows) * 100) : 0;
            
            // Get unique values (preserve original case for display)
            const uniqueValues = [...new Set(nonEmptyValues)];
            const uniqueCount = uniqueValues.length;
            
            // Determine data type
            let dataType = 'text';
            let typeConfidence = 'low';
            
            if (nonEmptyCount > 0) {
                // Check if mostly numbers
                const numericValues = nonEmptyValues.filter(v => {
                    // Remove commas and try to parse
                    const cleaned = v.replace(/,/g, '');
                    return !isNaN(cleaned) && cleaned.trim() !== '' && /^-?\d*\.?\d+$/.test(cleaned);
                }).length;
                
                const numericRatio = numericValues / nonEmptyCount;
                
                if (numericRatio > 0.8) {
                    dataType = 'numeric';
                    typeConfidence = 'high';
                } 
                // Check for date/time
                else if (this.isDateColumn(header, nonEmptyValues)) {
                    dataType = 'date/time';
                    typeConfidence = 'medium';
                }
                // Check if categorical (low cardinality)
                else if (uniqueCount <= 20 && uniqueCount > 0) {
                    dataType = 'categorical';
                    typeConfidence = uniqueCount <= 10 ? 'high' : 'medium';
                }
                // Check for boolean-like values
                else if (nonEmptyValues.every(v => ['yes', 'no', 'true', 'false', 'y', 'n', '0', '1'].includes(v.toLowerCase()))) {
                    dataType = 'boolean';
                    typeConfidence = 'high';
                }
            }
            
            // Get intelligent sample values
            let sampleValues = [];
            if (dataType === 'categorical' && uniqueCount <= 20) {
                // For categorical with few values, show all unique values
                sampleValues = uniqueValues.slice(0, 20);
            } else {
                // For other types, get diverse samples
                const sampledIndices = new Set();
                
                // Always include first non-empty value
                const firstIndex = nonEmptyValues.findIndex(v => v !== null);
                if (firstIndex !== -1) sampledIndices.add(firstIndex);
                
                // Include middle value
                const middleIndex = Math.floor(nonEmptyCount / 2);
                if (middleIndex !== firstIndex) sampledIndices.add(middleIndex);
                
                // Include last value
                const lastIndex = nonEmptyCount - 1;
                if (lastIndex !== firstIndex && lastIndex !== middleIndex) sampledIndices.add(lastIndex);
                
                // Try to get values from different quartiles
                const quartileSize = Math.floor(nonEmptyCount / 4);
                for (let q = 1; q <= 3; q++) {
                    const qIndex = q * quartileSize;
                    if (qIndex < nonEmptyCount && !sampledIndices.has(qIndex)) {
                        sampledIndices.add(qIndex);
                    }
                }
                
                // Convert indices to actual values
                const indicesArray = Array.from(sampledIndices).sort((a, b) => a - b);
                sampleValues = indicesArray.map(idx => nonEmptyValues[idx]).filter(v => v !== undefined);
                
                // Ensure we have diverse values (not all the same)
                const uniqueSamples = new Set(sampleValues.map(v => v.toLowerCase()));
                if (uniqueSamples.size < Math.min(3, sampleValues.length)) {
                    // Add some more unique values
                    for (let i = 0; i < nonEmptyCount && uniqueSamples.size < 5; i++) {
                        if (!sampledIndices.has(i)) {
                            const value = nonEmptyValues[i];
                            const lowerValue = value.toLowerCase();
                            if (!uniqueSamples.has(lowerValue)) {
                                uniqueSamples.add(lowerValue);
                                sampleValues.push(value);
                            }
                        }
                    }
                }
                
                sampleValues = sampleValues.slice(0, 8); // Limit to 8 samples
            }
            
            // Detect data inconsistencies
            const variations = this.detectValueVariations(nonEmptyValues, header);
            
            // Detect potential name duplicates
            const potentialDuplicates = this.detectNameDuplicates(nonEmptyValues, header);
            
            // Get value frequency for top values
            const valueFrequency = {};
            nonEmptyValues.forEach(v => {
                const key = v.toLowerCase();
                valueFrequency[key] = (valueFrequency[key] || 0) + 1;
            });
            
            const sortedFrequency = Object.entries(valueFrequency)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            const topValues = sortedFrequency.map(([value, count]) => {
                // Find original case for display
                const original = nonEmptyValues.find(v => v.toLowerCase() === value);
                return `${original || value} (${count}x)`;
            });
            
            // Calculate data quality score
            let qualityScore = 100;
            let qualityIssues = [];
            
            if (emptyPercentage > 50) {
                qualityScore -= 30;
                qualityIssues.push(`High empty rate: ${emptyPercentage}%`);
            }
            
            if (variations.length > 0) {
                const highSeverityVariations = variations.filter(v => v.severity === 'high').length;
                if (highSeverityVariations > 0) {
                    qualityScore -= 20;
                    qualityIssues.push(`Data inconsistencies: ${highSeverityVariations} high-severity variations`);
                }
            }
            
            if (potentialDuplicates.length > 0) {
                qualityScore -= 15;
                qualityIssues.push(`Potential duplicates: ${potentialDuplicates.length} name variations detected`);
            }
            
            if (uniqueCount === 1 && nonEmptyCount > 10) {
                qualityScore -= 10;
                qualityIssues.push('Low diversity: only 1 unique value across many rows');
            }
            
            qualityScore = Math.max(0, qualityScore);
            
            analysis[header] = {
                header: header,
                dataType,
                typeConfidence,
                totalValues: nonEmptyCount,
                uniqueCount,
                uniqueValues: uniqueValues.slice(0, 50), // Limit for display
                emptyCount,
                emptyPercentage,
                sampleValues,
                topValues,
                variations,
                potentialDuplicates,
                qualityScore,
                qualityIssues,
                // Column classification
                isNameColumn: this.isNameColumn(header, nonEmptyValues),
                isDateColumn: this.isDateColumn(header, nonEmptyValues),
                isStatusColumn: this.isStatusColumn(header, nonEmptyValues),
                isNumericColumn: dataType === 'numeric',
                isCategoricalColumn: dataType === 'categorical'
            };
        });
        
        return analysis;
    }

    // =========================================================
    // 🧠 ENHANCED SMART AUTO-GENERATOR (FOR GOOGLE SHEETS)
    // =========================================================
    static async generateAutoDescription(sheetUrl) {
        try {
            console.log("🧠 Enhanced Smart Analysis: Connecting to Sheet...");
            const spreadsheetId = this.extractSheetId(sheetUrl);
            const auth = await this.getAuth();
            const sheets = google.sheets({ version: 'v4', auth });

            // 1. Get Metadata
            const meta = await sheets.spreadsheets.get({ spreadsheetId });
            const sheetTitle = meta.data.properties.title;
            const tabs = meta.data.sheets;

            // 2. Enhanced Context Builder
            let dataContext = `Spreadsheet Name: "${sheetTitle}"\n\n`;
            let allColumnAnalysis = {};
            let overallQualityMetrics = {
                totalRows: 0,
                totalColumns: 0,
                columnsWithIssues: 0,
                overallQualityScore: 100
            };

            for (const tab of tabs) {
                const tabTitle = tab.properties.title;
                
                // Fetch more rows for better sampling (first 100 rows)
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${tabTitle}!A1:Z100`, // Increased to 100 rows
                });

                const rows = response.data.values;
                if (!rows || rows.length < 2) {
                    dataContext += `TAB: "${tabTitle}" - NO DATA OR EMPTY\n\n`;
                    continue;
                }

                const headers = rows[0];
                dataContext += `════════════════════════════════════════\n`;
                dataContext += `TAB: "${tabTitle}"\n`;
                dataContext += `════════════════════════════════════════\n`;
                dataContext += `HEADERS (${headers.length} columns): ${JSON.stringify(headers)}\n`;
                dataContext += `TOTAL ROWS (including header): ${rows.length}\n`;
                dataContext += `DATA ROWS (excluding header): ${rows.length - 1}\n\n`;
                
                // Enhanced column analysis
                const columnAnalysis = this.analyzeColumns(headers, rows);
                allColumnAnalysis[tabTitle] = columnAnalysis;
                
                // Update overall metrics
                overallQualityMetrics.totalRows += (rows.length - 1);
                overallQualityMetrics.totalColumns += headers.length;
                
                dataContext += `📊 COLUMN ANALYSIS:\n`;
                dataContext += `NOTE: The list below covers ALL ${headers.length} columns. You MUST output a definition for EVERY single column listed here. Do not skip any.\n\n`;
                
                // 1. Pre-render a simple Table of Contents for the LLM to copy
                dataContext += `FULL COLUMN LIST (Reference):\n`;
                headers.forEach((h, i) => dataContext += `${i+1}. ${h}\n`);
                dataContext += `\n`;

                // --- CRITICAL FIX: COMPACT MODE FOR LARGE DATASETS ---
                // The AI prompt has a token limit. If we have many columns, we must be concise.
                headers.forEach(header => {
                    const analysis = columnAnalysis[header] || columnAnalysis[Object.keys(columnAnalysis).find(k => k.trim().toLowerCase() === header.trim().toLowerCase())];
                    if (!analysis) return;

                    const hasIssues = (analysis.qualityIssues && analysis.qualityIssues.length > 0) || 
                                    (analysis.variations && analysis.variations.length > 0) ||
                                    (analysis.emptyPercentage > 20);

                    // If column is "boring" (high quality, simple text/number), use compact format
                    // AGGRESSIVE COMPACT: Use a single line for these to save space
                    if (!hasIssues && analysis.dataType !== 'categorical') {
                         dataContext += `• [${header}]: Type=${analysis.dataType}, Empty=${analysis.emptyPercentage}%, Unique=${analysis.uniqueCount}, Sample=${JSON.stringify(analysis.sampleValues.slice(0, 2))}\n`;
                    } else {
                        // Full detailed format for complex/problematic columns
                        dataContext += `\n┌─ "${header}" ──────────────────────────────\n`;
                        dataContext += `│ Data Type: ${analysis.dataType} (${analysis.typeConfidence} confidence)\n`;
                        dataContext += `│ Total Values: ${analysis.totalValues}\n`;
                        dataContext += `│ Unique Values: ${analysis.uniqueCount}\n`;
                        dataContext += `│ Empty Cells: ${analysis.emptyCount} (${analysis.emptyPercentage}%)\n`;
                        dataContext += `│ Quality Score: ${analysis.qualityScore}/100\n`;
                        
                        if (analysis.dataType === 'categorical' && analysis.uniqueCount <= 20) {
                            dataContext += `│ Valid Values: ${JSON.stringify(analysis.uniqueValues)}\n`;
                        } else if (analysis.dataType === 'categorical') {
                            dataContext += `│ Top Values: ${JSON.stringify(analysis.topValues.slice(0, 5))}\n`;
                        }
                        
                        if (analysis.sampleValues.length > 0) {
                            dataContext += `│ Sample Values: ${JSON.stringify(analysis.sampleValues)}\n`;
                        }
                        
                        if (analysis.variations && analysis.variations.length > 0) {
                            overallQualityMetrics.columnsWithIssues++;
                            dataContext += `│ ⚠️ DATA INCONSISTENCIES DETECTED:\n`;
                            analysis.variations.slice(0, 3).forEach(v => {
                                dataContext += `│   • "${v.original}" → Should be: "${v.suggested}"\n`;
                                dataContext += `│     (Frequency: ${v.frequency}x, Severity: ${v.severity})\n`;
                            });
                        }
                        
                        if (analysis.qualityIssues && analysis.qualityIssues.length > 0) {
                            dataContext += `│ 📝 QUALITY ISSUES:\n`;
                            analysis.qualityIssues.forEach(issue => {
                                dataContext += `│   • ${issue}\n`;
                            });
                        }
                        dataContext += `└─────────────────────────────────────────────\n`;
                    }
                });
                
                // Calculate tab quality score
                const tabQualityScores = Object.values(columnAnalysis).map(col => col.qualityScore);
                const avgTabQuality = tabQualityScores.length > 0 
                    ? Math.round(tabQualityScores.reduce((a, b) => a + b, 0) / tabQualityScores.length)
                    : 100;
                
                overallQualityMetrics.overallQualityScore = Math.min(
                    overallQualityMetrics.overallQualityScore,
                    avgTabQuality
                );
                
                dataContext += `\n📈 TAB QUALITY SUMMARY:\n`;
                dataContext += `• Average Column Quality: ${avgTabQuality}/100\n`;
                dataContext += `• Columns with Issues: ${Object.values(columnAnalysis).filter(col => col.qualityIssues.length > 0).length}\n`;
                dataContext += `• Data Types: ${[...new Set(Object.values(columnAnalysis).map(col => col.dataType))].join(', ')}\n\n`;
                dataContext += `════════════════════════════════════════\n\n`;
            }

            // Calculate overall metrics
            if (overallQualityMetrics.totalColumns > 0) {
                overallQualityMetrics.columnsWithIssues = Math.min(
                    overallQualityMetrics.columnsWithIssues,
                    overallQualityMetrics.totalColumns
                );
            }

            // 3. Enhanced Prompt for AI
            const prompt = `
            You are a Data Quality Analyst and Data Architect. Analyze this Google Sheet for a Text-to-SQL system.

            **CRITICAL SQL SYNTAX RULES FOR THIS SYSTEM:**
            1. **TABLE NAME MUST BE '?':** Always use '?' as the table name, NOT the actual sheet/tab name
               - ✅ CORRECT: \`SELECT * FROM ? WHERE status = 'Deployed'\`
               - ❌ WRONG: \`SELECT * FROM \`Project List\` \`
               - ❌ WRONG: \`SELECT * FROM "Project List"\`
               - ❌ WRONG: \`SELECT * FROM Project_List\`

            2. **COLUMN NAMES MUST BE LOWERCASE snake_case:**
               - 🚨 **CRITICAL:** You MUST convert all original column names to **lowercase**.
               - Original: "Project Name" → SQL: \`project_name\`
               - Original: "TYPE OF LICENSE" → SQL: \`type_of_license\`
               - Original: "User" → SQL: \`user\` (no change if no spaces, but MUST be lowercase)
               - Original: "FREQUENCY" → SQL: \`frequency\`
               - Spaces are replaced with underscores, special characters removed, and EVERYTHING converted to lowercase.

            3. **QUERY EXAMPLES WITH CORRECT SYNTAX:**
               - Count rows: \`SELECT COUNT(*) as total FROM ?\`
               - Filter by status: \`SELECT * FROM ? WHERE status = 'Deployed'\`
               - Group by department: \`SELECT department, COUNT(*) as count FROM ? GROUP BY department\`
               - Like search: \`SELECT * FROM ? WHERE frequency LIKE '%Any Time%'\`

            **YOUR TASK:**
            Write a comprehensive **System Instruction** that includes:
            1. **DATASET OVERVIEW**: Brief description of what this data represents
            2. **DATA QUALITY ASSESSMENT**: Overall quality score and key issues found
            3. **CRITICAL DATA ISSUES**: List the most important problems that users need to know
            4. **TAB RECOMMENDATIONS**: Which tab to use for specific types of queries
            5. **COLUMN ANALYSIS**: Detailed breakdown for each important column with specific insights
            6. **SQL QUERY GUIDANCE**: Specific query patterns with CORRECT SYNTAX using '?' and lowercase column names
            7. **DATA CLEANING PRIORITIES**: What should be fixed first for better query results

            **🚨 CRITICAL INSTRUCTION FOR INCONSISTENT DATA (MUST FOLLOW):**
            If your analysis reveals inconsistent values in a column (e.g., "Every 15 mins" vs "Every 15mins" or "Inprogress" vs "In Progress"):
            1. You MUST list this in "CRITICAL DATA ISSUES".
            2. **YOU MUST ADD A SPECIFIC RULE** in the "SQL QUERY TIPS" section telling the system to use specific wildcard patterns (LIKE) for that column.
               - Example Rule: "For 'frequency', do NOT use exact match. Use \`LIKE '%15%min%'\` to catch variations."

            **OVERALL DATA QUALITY METRICS:**
            • Total Rows Analyzed: ${overallQualityMetrics.totalRows}
            • Total Columns: ${overallQualityMetrics.totalColumns}
            • Columns with Issues: ${overallQualityMetrics.columnsWithIssues}
            • Overall Quality Score: ${overallQualityMetrics.overallQualityScore}/100

            **INPUT DATA ANALYSIS:**
            ${dataContext}

            **OUTPUT TEMPLATE:**
            ==============================================
            DATASET: [Dataset Name]
            ==============================================
            Overview: [2-3 sentence description of what this data represents]

            📊 DATA QUALITY ASSESSMENT:
            • Overall Score: [X]/100
            • Critical Issues: [List 3-5 most important issues]
            • Data Reliability: [High/Medium/Low] - [Brief explanation]

            🚨 CRITICAL DATA ISSUES (Users MUST Know):
            1. [Most critical issue with impact on queries]
            2. [Second most critical issue]
            3. [Third critical issue]

            📁 TAB SELECTION GUIDE:
            • For [type of query] → Use tab: "[Tab Name]" because [reason]
            • For [another type of query] → Use tab: "[Tab Name]"

            🔍 COLUMN DEFINITIONS (WITH CORRECT SQL NAMES):

            [Tab 1]: [Tab Name]
            - **SQL Column:** \`column_name_snake_case\` (Original: "Column Name")
              • Description: [What this column contains]
              • Data Type: [Type]
              • Unique Values: [Count]
              • Valid Values: [List if < 20]
              • Empty Cells: [X]% - [Impact on queries]
              • ⚠️ Issues: [Any data quality issues]
              • 💡 Query Tip: [Specific advice for querying this column]

            [Continue for other important columns...]
            
            🧠 DATA CONTENT INTELLIGENCE (AUTO-DETECTED):
            The analysis above (in "Column Definitions") already covers categorical values and unique counts. 
            Ensure this section summarizes:
            • Key Identifiers (ID columns)
            • Date Ranges found in the data
            • Main Categories and their top values

            💡 SQL QUERY TIPS (USE CORRECT SYNTAX):
            • Always use '?' as the table name
            • Column names use lowercase snake_case (e.g., \`frequency\`, not \`Frequency\`)
            
            [INSERT SPECIFIC RULES FOR INCONSISTENT COLUMNS HERE]
            
            • To find deployed projects: \`SELECT * FROM ? WHERE status = 'Deployed'\`
            • To count by department: \`SELECT department, COUNT(*) as count FROM ? GROUP BY department\`
            • For fuzzy matching: \`SELECT * FROM ? WHERE projects LIKE '%automation%'\`
            • Handling NULLs: \`SELECT * FROM ? WHERE virtual_machine IS NOT NULL\`

            ⚠️ COMMON PITFALLS TO AVOID:
            1. Using actual table names instead of '?' - will cause "Table does not exist" error
            2. Using original column names with spaces or uppercase - will cause "Column not found" error
            3. Case sensitivity in LIKE queries - use LOWER() for case-insensitive searches

            🔧 DATA CLEANING PRIORITIES:
            1. [Highest priority fix with expected impact]
            2. [Second priority]
            3. [Third priority]

            🎯 RECOMMENDED QUERIES (WITH CORRECT SYNTAX):
            1. \`SELECT department, COUNT(*) as project_count FROM ? GROUP BY department\` - Count projects per department
            2. \`SELECT * FROM ? WHERE status = 'Deployed' AND frequency LIKE '%Any Time%'\` - Find deployed projects that run anytime
            3. \`SELECT users_name, department, role FROM ? WHERE role = 'Developer'\` - List all developers
            4. \`SELECT projects, user, status FROM ? WHERE status IN ('Deployed', 'In Progress')\` - Show active projects
            5. \`SELECT COUNT(*) as total_projects FROM ? WHERE auto_generation_to_sap = 'Yes'\` - Count SAP-integrated projects
            ==============================================
            `;

            // Fetch active model from database
            let activeModel = "gemini-2.0-flash-exp";
            try {
                const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
                if (settings.length > 0 && settings[0].ai_model) {
                    activeModel = settings[0].ai_model;
                }
            } catch (e) { console.warn("Using default model, DB fetch failed:", e.message); }
            
            console.log(`🤖 Using AI Model for Enhanced Analysis: ${activeModel}`);
            const model = genAI.getGenerativeModel({ model: activeModel });
            
            // --- UPDATED: Use Retry Logic Here ---
            const result = await this.generateContentWithRetry(model, prompt);
            // -------------------------------------

            const description = result.response.text();
            
            console.log("🧠 Enhanced Analysis Complete.");
            return description;

        } catch (error) {
            console.error("Enhanced Auto-Description Error:", error);
            throw new Error("Failed to analyze sheet. Ensure the URL is public or shared with the Service Account.");
        }
    }

    // =========================================================
    // 🧠 NEW: EXTERNAL API ANALYSIS
    // =========================================================
    static async analyzeExternalApi(apiConfig) {
        try {
            console.log("🧠 External API Analysis: Connecting to API...");
            
            const { endpoint, method = 'GET', headers = {}, parameters = [] } = apiConfig;
            
            if (!endpoint) {
                throw new Error("API endpoint is required");
            }
            
            // 1. Make API call to fetch sample data
            let apiResponse;
            let jsonData;
            let statusCode;
            
            try {
                const fetchOptions = {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers
                    },
                    timeout: 60000 // Increased to 60 seconds
                };
                
                // Add query parameters if any
                let url = endpoint;
                if (parameters && parameters.length > 0) {
                    const queryParams = new URLSearchParams();
                    parameters.forEach(param => {
                        if (param.exampleValue) {
                            queryParams.append(param.name, param.exampleValue);
                        }
                    });
                    if (queryParams.toString()) {
                        url += (url.includes('?') ? '&' : '?') + queryParams.toString();
                    }
                }
                
                console.log(`🌐 Making API call to: ${url}`);
                const response = await fetch(url, fetchOptions);
                statusCode = response.status;
                
                if (!response.ok) {
                    throw new Error(`API returned status ${statusCode}: ${response.statusText}`);
                }
                
                const textData = await response.text();
                
                // Try to parse as JSON
                try {
                    jsonData = JSON.parse(textData);
                } catch (parseError) {
                    // If not JSON, use text
                    jsonData = { raw_text: textData.substring(0, 1000) };
                }
                
                apiResponse = {
                    success: true,
                    status: statusCode,
                    data: jsonData
                };
                
            } catch (fetchError) {
                console.warn("⚠️ API call failed:", fetchError.message);
                apiResponse = {
                    success: false,
                    error: fetchError.message,
                    status: statusCode || 'unknown'
                };
                // Use sample data for analysis
                jsonData = {
                    sample_data: "API connection failed. Using placeholder for analysis.",
                    endpoint: endpoint,
                    method: method,
                    parameters: parameters
                };
            }
            
            // 2. Analyze the data structure
            const dataAnalysis = this.analyzeApiDataStructure(jsonData);
            
            // 3. Build analysis context
            let analysisContext = `EXTERNAL API ANALYSIS REPORT\n`;
            analysisContext += `════════════════════════════════════════\n`;
            analysisContext += `API Endpoint: ${endpoint}\n`;
            analysisContext += `HTTP Method: ${method}\n`;
            analysisContext += `Status: ${apiResponse.success ? 'Connected successfully' : 'Connection failed'}\n`;
            analysisContext += `Response Code: ${statusCode || 'N/A'}\n\n`;
            
            if (parameters && parameters.length > 0) {
                analysisContext += `PARAMETERS:\n`;
                parameters.forEach(param => {
                    analysisContext += `- ${param.name}: ${param.description || 'No description'} (${param.type || 'string'})\n`;
                    if (param.required) analysisContext += `  Required: ${param.required}\n`;
                    if (param.exampleValue) analysisContext += `  Example: ${param.exampleValue}\n`;
                });
                analysisContext += `\n`;
            }
            
            analysisContext += `DATA STRUCTURE ANALYSIS:\n`;
            analysisContext += `• Data Type: ${dataAnalysis.dataType}\n`;
            analysisContext += `• Structure: ${dataAnalysis.structure}\n`;
            analysisContext += `• Estimated Fields: ${dataAnalysis.estimatedFieldCount}\n\n`;

            // NEW: DATA CONTENT ANALYSIS (VALUE DISTRIBUTIONS)
            if (Array.isArray(jsonData) && jsonData.length > 0) {
                // Use the standardized DataProfiler
                const profile = DataProfiler.profileData(jsonData);
                const summary = DataProfiler.generateLLMSummary(profile);
                
                analysisContext += summary;
                analysisContext += `\n`;
            }
            
            analysisContext += `SAMPLE DATA (first 2000 chars):\n`;
            const sampleJson = JSON.stringify(jsonData, null, 2);
            analysisContext += sampleJson.substring(0, 2000);
            if (sampleJson.length > 2000) {
                analysisContext += `\n... (truncated, total ${sampleJson.length} chars)`;
            }
            
            // 4. Generate description using AI
            const prompt = `
            You are an API Integration Specialist. Analyze this external API for an AI assistant system.

            **SYSTEM CONTEXT:**
            This API will be available as a "tool" that the AI can call with parameters. Users will ask natural language questions, and the AI will translate them into API calls.

            **API INFORMATION:**
            ${analysisContext}

            **YOUR TASK:**
            Write a comprehensive **Tool Description** that includes:

            1. **API OVERVIEW**: What this API does and what data it provides
            2. **USE CASES**: When should users/customers use this API tool
            3. **PARAMETER GUIDE**: Explanation of each parameter with examples
            4. **RESPONSE STRUCTURE**: What the API returns and how to interpret it
            5. **EXAMPLE QUERIES**: Natural language questions that would trigger this API
            6. **LIMITATIONS & NOTES**: Any restrictions, rate limits, or special considerations

            **IMPORTANT FORMATTING RULES:**
            - Use clear, concise language
            - Include specific examples for parameters
            - Mention if authentication is required
            - Note any rate limits or quotas
            - Explain error scenarios

            **OUTPUT TEMPLATE:**
            ==============================================
            API TOOL: [API Name/Description]
            ==============================================
            Overview: [Brief description of what this API provides]

            🔧 API DETAILS:
            • Endpoint: [URL]
            • Method: [HTTP Method]
            • Authentication: [Required/Not required]
            • Rate Limits: [If known]

            📋 PARAMETERS:
            [Parameter 1 Name] ([type], [required]): [Description]
              Example: [example value] - [what this does]

            [Parameter 2 Name] ([type], [required]): [Description]
              Example: [example value]

            📊 RESPONSE FORMAT:
            The API returns [data format] containing:
            - field_name: [description] (Example: "example_value")
            - field_name_2: [description]
            
            🔍 COLUMN DEFINITIONS (SQL COMPATIBLE):
            Since this API returns a list of objects, we can treat it as a virtual table.
            - **SQL Column:** \`field_name\` (Original: "fieldName")
               • Description: [Description of field]
               • Data Type: [String/Number/Boolean]
               • Example Value: "example"
             
             - **SQL Column:** \`field_name_2\` (Original: "fieldName2")
              • Description: [Description]
              • Data Type: [Type]

            🧠 DATA CONTENT INTELLIGENCE (AUTO-DETECTED):
            • [Insert Categorical Value Lists here if available]
            • [Insert Date Ranges here if available]
            • [Insert Key ID columns here]

            🎯 USE CASES:
            • [Use case 1: When you need to...]
            • [Use case 2: To find information about...]
            • [Use case 3: For getting updates on...]

            💡 EXAMPLE USER QUERIES:
            1. "[Natural language question that would use this API]"
            2. "[Another example question]"
            3. "[Third example question]"

            ⚠️ LIMITATIONS & NOTES:
            • [Note 1: e.g., API may have rate limits]
            • [Note 2: e.g., Certain parameters are required]
            • [Note 3: e.g., Response time may vary]

            🔍 SAMPLE API CALL:
            \`\`\`
            ${method} ${endpoint}${parameters.length > 0 ? '?param1=value1&param2=value2' : ''}
            \`\`\`
            ==============================================
            `;

            // Fetch active model from database
            let activeModel = "gemini-2.0-flash-exp";
            try {
                const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
                if (settings.length > 0 && settings[0].ai_model) {
                    activeModel = settings[0].ai_model;
                }
            } catch (e) { console.warn("Using default model, DB fetch failed:", e.message); }
            
            console.log(`🤖 Using AI Model for API Analysis: ${activeModel}`);
            const model = genAI.getGenerativeModel({ model: activeModel });
            
            // --- UPDATED: Use Retry Logic Here ---
            const result = await this.generateContentWithRetry(model, prompt);
            // -------------------------------------

            const description = result.response.text();
            
            console.log("🧠 External API Analysis Complete.");
            return description;

        } catch (error) {
            console.error("External API Analysis Error:", error);
            throw new Error(`Failed to analyze API: ${error.message}`);
        }
    }

    // Helper: Analyze API data structure
    static analyzeApiDataStructure(data, depth = 0, maxDepth = 3) {
        if (depth > maxDepth) {
            return { dataType: 'deep_object', structure: 'nested_object', estimatedFieldCount: 'many' };
        }
        
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return { dataType: 'array', structure: 'empty_array', estimatedFieldCount: 0 };
            }
            
            // Analyze first item in array
            const firstItem = data[0];
            const itemAnalysis = this.analyzeApiDataStructure(firstItem, depth + 1, maxDepth);
            
            return {
                dataType: 'array',
                structure: `array_of_${itemAnalysis.dataType}s`,
                estimatedFieldCount: data.length,
                itemStructure: itemAnalysis
            };
        }
        
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            const keyTypes = {};
            
            keys.forEach(key => {
                const value = data[key];
                if (Array.isArray(value)) {
                    keyTypes[key] = 'array';
                } else if (typeof value === 'object' && value !== null) {
                    keyTypes[key] = 'object';
                } else if (typeof value === 'number') {
                    keyTypes[key] = 'number';
                } else if (typeof value === 'boolean') {
                    keyTypes[key] = 'boolean';
                } else {
                    keyTypes[key] = 'string';
                }
            });
            
            // Count unique value types
            const typeCounts = {};
            Object.values(keyTypes).forEach(type => {
                typeCounts[type] = (typeCounts[type] || 0) + 1;
            });
            
            return {
                dataType: 'object',
                structure: keys.length <= 5 ? 'simple_object' : 'complex_object',
                estimatedFieldCount: keys.length,
                fieldTypes: typeCounts,
                sampleFields: keys.slice(0, 5)
            };
        }
        
        // Primitive type
        return {
            dataType: typeof data,
            structure: 'primitive',
            estimatedFieldCount: 1
        };
    }

    // =========================================================
    // UNIFIED ANALYSIS METHOD (CALLED FROM INTEGRATION CONTROLLER)
    // =========================================================
    static async analyzeDataSource(url, source_type, api_config = null) {
        try {
            console.log(`🔍 Analyzing data source (Type: ${source_type})...`);
            
            if (source_type === 'google_sheet' || url.includes('docs.google.com/spreadsheets')) {
                return await this.generateAutoDescription(url);
            } 
            else if (source_type === 'external_api') {
                const config = api_config || { endpoint: url };
                return await this.analyzeExternalApi(config);
            }
            else {
                throw new Error(`Unsupported source type: ${source_type}`);
            }
        } catch (error) {
            console.error("Analysis Error:", error);
            throw error;
        }
    }

    // =========================================================
    // SQL FETCHER (Unchanged from original)
    // =========================================================
    static async getAllSheetRows(sheetUrlOrId, tabName = null) {
        try {
            const spreadsheetId = this.extractSheetId(sheetUrlOrId);
            const auth = await this.getAuth();
            const sheets = google.sheets({ version: 'v4', auth });

            let targetRange = "";
            if (tabName) {
                targetRange = tabName;
            } else {
                const meta = await sheets.spreadsheets.get({ spreadsheetId });
                targetRange = meta.data.sheets[0].properties.title;
            }

            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: targetRange,
            });

            const rows = response.data.values;
            if (!rows || rows.length < 2) return [];

            const headers = rows[0].map(h => h.toString().trim());
            const data = rows.slice(1).map(row => {
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index] || null; 
                });
                return obj;
            });

            return data;
        } catch (error) {
            console.error('Google Service (getAllSheetRows) Error:', error.message);
            throw error;
        }
    }

    static async fetchSheetData(sheetUrlOrId) {
        const spreadsheetId = this.extractSheetId(sheetUrlOrId);
        const data = await this.getAllSheetRows(sheetUrlOrId);
        
        const auth = await this.getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const meta = await sheets.spreadsheets.get({ spreadsheetId }); 
        const tabs = meta.data.sheets.map(s => s.properties.title);

        return {
            title: meta.data.properties.title,
            sheetId: spreadsheetId,
            tabs: tabs,
            textSummary: `Preview: ${JSON.stringify(data.slice(0,3))}`,
            row_count: data.length
        };
    }
}