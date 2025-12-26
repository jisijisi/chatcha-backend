// frontend/assets/js/markdown.js - Integrated with Grid.js and JSON5
import { escapeHtml, convertEmojiPlaceholders } from './utils.js';

export class MarkdownParser {
  constructor() {
    this.markdownCache = new Map();
    this.chartRenderer = null;
    this.highlightObserver = null;
    
    // Memory cache for table data to avoid large HTML attributes
    this.tableDataCache = new Map(); 
  }

  setChartRenderer(renderer) {
    this.chartRenderer = renderer;
  }

  // --- REVISED: Render JSON Tables using JSON5 for Robustness ---
  renderJsonTable(jsonString) {
    let cleanRaw = jsonString.trim();

    // 1. FAST PATH: Try parsing immediately (in case it is valid)
    try {
        if (cleanRaw.startsWith('{') && cleanRaw.endsWith('}')) {
             // Handle single object case by wrapping in array
             const parsedObj = JSON5.parse(cleanRaw);
             return this.generateGridHtml([parsedObj]);
        }
        const data = JSON5.parse(cleanRaw);
        if (Array.isArray(data) && data.length > 0) {
            return this.generateGridHtml(data);
        }
    } catch (ignore) {
        // Fall through to repair logic
    }

    // 2. REPAIR PATH: Fix missing commas and other common LLM syntax errors
    try {
      // Apply our robust repair function
      const repairedJson = this.repairJson(cleanRaw);
      
      // Try parsing again with repaired string
      let data;
      if (repairedJson.startsWith('{')) {
          const parsedObj = JSON5.parse(repairedJson);
          data = [parsedObj];
      } else {
          data = JSON5.parse(repairedJson);
      }
      
      if (Array.isArray(data) && data.length > 0) {
        return this.generateGridHtml(data);
      }
      
      return '';

    } catch (e) {
      console.error("JSON5 Parsing Error after repair", e);
      
      // 3. FALLBACK PATH: Manual extraction
      try {
        return this.extractDataFromMalformedJson(cleanRaw);
      } catch (finalError) {
        return `<div class="table-error">
                  <strong>⚠️ Data Rendering Error</strong><br>
                  The JSON data could not be parsed. Raw data (first 300 chars):
                  <pre class="error-pre">${escapeHtml(jsonString.substring(0, 300))}</pre>
                  <details class="error-details">
                    <summary>Error Details</summary>
                    <pre class="error-message">${escapeHtml(e.message)}</pre>
                  </details>
                </div>`;
      }
    }
  }

  // --- NEW: Robust JSON Repair Function ---
  repairJson(jsonString) {
    let cleaned = jsonString.trim();

    // 1. Wrap in array if it looks like a list of objects but missing brackets
    if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
        // Assume it's a list of objects like {..}, {..}
        cleaned = `[${cleaned}]`;
    }

    // 2. Fix missing commas between objects: } {  ->  }, {
    cleaned = cleaned.replace(/}\s*{/g, '}, {');
    cleaned = cleaned.replace(/}\s*\n\s*{/g, '},\n{');

    // 3. CRITICAL FIX: Insert missing commas between properties
    // Looks for: end of value (quote/digit/bool) -> whitespace -> start of key (quote)
    // We strictly look for "key": pattern to avoid false positives
    cleaned = cleaned.replace(/((?:["\]}])|(?:\d+)|(?:true|false|null))\s*\n*\s*(?="[^"]+"\s*:)/g, '$1,');

    // 4. Ensure proper array structure if it starts with [
    if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
        cleaned += ']';
    }

    return cleaned;
  }

  // Helper to generate the Grid HTML and cache data
  generateGridHtml(data) {
      // Filter out placeholder/junk rows from JSON data
      const cleanData = data.filter(row => {
          if (!row || typeof row !== 'object') return true;
          const values = Object.values(row);
          // If row has no values, it's weird, but keep it? No, probably junk.
          if (values.length === 0) return false;
          
          const isPlaceholder = values.every(val => {
              if (val === null || val === undefined) return true;
              const str = String(val).trim();
              return str === '' || 
                     str === '...' || 
                     str === '…' || 
                     /^[.\-\s]+$/.test(str);
          });
          return !isPlaceholder;
      });

      if (cleanData.length === 0) return '';

      const tableId = `grid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      this.tableDataCache.set(tableId, cleanData);
      return `<div id="${tableId}" class="grid-table-placeholder"></div>`;
  }

  // --- Extract data from malformed JSON as last resort ---
  extractDataFromMalformedJson(jsonString) {
    console.log("Attempting to extract data from malformed JSON...");
    
    // Extract anything that looks like an object
    const objectMatches = jsonString.match(/\{[\s\S]*?\}/g);
    
    if (!objectMatches || objectMatches.length === 0) {
      throw new Error("No objects found in JSON");
    }
    
    const extractedObjects = [];
    
    for (const match of objectMatches) {
      try {
        // Run the repair function on the individual object snippet
        const repairedMatch = this.repairJson(match);
        const obj = JSON5.parse(repairedMatch);
        extractedObjects.push(obj);
      } catch (e) {
        console.warn("Could not parse extracted object snippet:", match.substring(0, 50));
      }
    }
    
    if (extractedObjects.length === 0) {
      throw new Error("Could not extract any valid objects");
    }
    
    return this.generateGridHtml(extractedObjects);
  }

  // --- Lifecycle hook to mount Grid.js ---
  renderGrids(element) {
    if (!element || typeof gridjs === 'undefined') return;

    const placeholders = element.querySelectorAll('.grid-table-placeholder');
    placeholders.forEach(placeholder => {
      if (placeholder.dataset.rendered === 'true') return;
      
      const tableId = placeholder.id;
      const data = this.tableDataCache.get(tableId);
      
      try {
        if (data && data.length > 0) {
          const headers = Object.keys(data[0]);
          const columns = headers.map(h => ({
            name: h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            id: h
          }));

          new gridjs.Grid({
            columns: columns,
            data: data,
            pagination: { enabled: true, limit: 5 },
            search: true,
            sort: true,
            resizable: true,
            style: { 
              table: { 'white-space': 'nowrap' },
              container: { 'margin': '20px 0', 'font-size': '0.9rem', 'max-width': '100%', 'overflow': 'hidden' }
            }
          }).render(placeholder);
          
          placeholder.dataset.rendered = 'true';
        } else {
             console.warn(`No data found for table ID: ${tableId}`);
        }
      } catch (e) {
        console.error("Grid.js Render Error:", e);
        placeholder.innerHTML = `<div class="chart-error">Error loading data grid</div>`;
      }
    });
  }

  parseMarkdown(text) {
    if (!text) return '';
    
    // 0. Extract Color Spans
    const colorSpans = [];
    text = text.replace(/<span style="color:\s*([^"]+)">([\s\S]*?)<\/span>/g, (match, color, content) => {
      const placeholder = `@@COLORSPAN${colorSpans.length}@@`;
      colorSpans.push({ color, content });
      return placeholder;
    });

    // 1. Convert emoji placeholders
    text = convertEmojiPlaceholders(text);
    
    // 2. Protect inline code
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
      const placeholder = `@@INLINECODE${inlineCodes.length}@@`;
      inlineCodes.push(code);
      return placeholder;
    });
    
    // 3. Escape HTML
    let html = escapeHtml(text);

    // --- EXTRACT JSON TABLES (Priority) ---
    const jsonTables = [];
    html = html.replace(/```json_table\n?([\s\S]*?)```/g, (match, json) => {
      const placeholder = `@@JSONTABLE${jsonTables.length}@@`;
      jsonTables.push(this.renderJsonTable(json.trim()));
      return placeholder;
    });
    
    // 4. Extract Charts
    const chartTags = [];
    html = html.replace(/```chartjs\n?([\s\S]*?)```/g, (match, json) => {
      const placeholder = `@@CHART${chartTags.length}@@`;
      chartTags.push({
        type: 'chartjs',
        json: json.trim(),
        placeholder: placeholder
      });
      return placeholder;
    });
    
    // 5. Extract Tables (Legacy Fallback)
    const tables = [];
    html = this.extractTables(html, tables);
    
    // 6. Extract Code Blocks
    const codeBlocks = [];
    html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, language, code) => {
      if (language === 'chartjs' || language === 'json_table') return match;
      const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
      const lang = language || 'plaintext';
      codeBlocks.push({
        html: `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
      });
      return placeholder;
    });
    
    // 7. Standard Markdown Processing (Headers, Lists, etc.)
    let lines = html.split('\n');
    let processedLines = [];
    let inList = false;
    let listType = null;
    let listItems = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmedLine = line.trim();
      
      if (trimmedLine === '' && !inList) { 
        processedLines.push(''); 
        continue; 
      }
      
      if (trimmedLine.match(/^#{1,4} /)) {
        if (inList) { processedLines.push(this.wrapList(listItems, listType)); listItems = []; inList = false; }
        const level = trimmedLine.match(/^#+/)[0].length;
        processedLines.push(`<h${level}>${trimmedLine.replace(/^#+\s+/, '')}</h${level}>`);
        continue;
      }
      
      if (trimmedLine.match(/^[-*+]\s+/)) {
        if (!inList || listType !== 'ul') {
          if (inList) { processedLines.push(this.wrapList(listItems, listType)); listItems = []; }
          inList = true; listType = 'ul';
        }
        listItems.push(trimmedLine.replace(/^[-*+]\s+/, ''));
        continue;
      }
      
      if (trimmedLine.match(/^(---|\*\*\*|___)$/)) {
        if (inList) { processedLines.push(this.wrapList(listItems, listType)); listItems = []; inList = false; }
        processedLines.push('<hr>');
        continue;
      }
      
      if (trimmedLine.match(/^&gt;\s/)) {
        if (inList) { processedLines.push(this.wrapList(listItems, listType)); listItems = []; inList = false; }
        processedLines.push(`<blockquote>${trimmedLine.replace(/^&gt;\s+/, '')}</blockquote>`);
      } else {
        if (inList) { processedLines.push(this.wrapList(listItems, listType)); listItems = []; inList = false; }
        processedLines.push(line);
      }
    }
    
    if (inList) { processedLines.push(this.wrapList(listItems, listType)); }
    
    html = processedLines.join('\n');
    
    // 8. Basic Formatting
    const applyBasicFormatting = (str) => {
      str = str.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      str = str.replace(/__(.+?)__/g, '<strong>$1</strong>');
      str = str.replace(/\*(.+?)\*/g, '<em>$1</em>');
      str = str.replace(/_(.+?)_/g, '<em>$1</em>');
      return str;
    };

    html = applyBasicFormatting(html);
    
    // 9. Paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.match(/^<(pre|ul|ol|h[1-4]|blockquote|hr|table|div)/) || 
          para.match(/^@@(TABLE|JSONTABLE|CHART|CODEBLOCK)\d+@@$/)) {
        return para;
      }
      return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    
    // 10. Restore components
    jsonTables.forEach((table, i) => html = html.replace(new RegExp(`@@JSONTABLE${i}@@`, 'g'), table));
    tables.forEach((table, i) => html = html.replace(new RegExp(`@@TABLE${i}@@`, 'g'), table));
    codeBlocks.forEach((block, i) => html = html.replace(new RegExp(`@@CODEBLOCK${i}@@`, 'g'), block.html));
    
    chartTags.forEach((chart, i) => {
      if (this.chartRenderer) {
        const chartElement = this.chartRenderer.renderChartFromJSON(chart.json, `chart-${Date.now()}-${i}`);
        html = html.replace(new RegExp(chart.placeholder, 'g'), chartElement.outerHTML);
      } else {
        html = html.replace(new RegExp(chart.placeholder, 'g'), `<pre><code class="language-json">${escapeHtml(chart.json)}</code></pre>`);
      }
    });
    
    inlineCodes.forEach((code, i) => {
      html = html.replace(new RegExp(`@@INLINECODE${i}@@`, 'g'), `<code>${escapeHtml(code)}</code>`);
    });

    // 11. Restore Color Spans
    colorSpans.forEach((span, i) => {
        let safeContent = escapeHtml(span.content);
        safeContent = applyBasicFormatting(safeContent);
        const restoredSpan = `<span style="color: ${span.color}">${safeContent}</span>`;
        html = html.replace(new RegExp(`@@COLORSPAN${i}@@`, 'g'), restoredSpan);
    });

    return html;
  }

  // --- REVISED: ROBUST TABLE EXTRACTION ---
  extractTables(html, tables) {
    const lines = html.split('\n');
    let i = 0;
    const resultLines = [];
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes('|') || (line.includes('@@COLORSPAN') && lines[i+1]?.includes('|'))) {
        const tableLines = [line];
        let j = i + 1;
        let blankLineCount = 0;
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          if (nextLine === '') {
            blankLineCount++;
            if (blankLineCount > 1) break; 
            j++;
            continue; 
          }
          const hasPipes = nextLine.includes('|');
          const isSeparator = nextLine.match(/^[-:\s|]+$/);
          const hasPlaceholder = nextLine.includes('@@COLORSPAN');
          if (hasPipes || isSeparator || hasPlaceholder) {
            blankLineCount = 0; 
            tableLines.push(nextLine);
            j++;
          } else {
            break;
          }
        }
        const repairedLines = this.repairTableStructure(tableLines);
        if (repairedLines.length >= 3 && this.validateTableStructure(repairedLines)) {
          const tableHtml = this.parseTable(repairedLines);
          if (tableHtml) {
            const placeholder = `@@TABLE${tables.length}@@`;
            tables.push(tableHtml);
            resultLines.push(placeholder);
            i = j; 
            continue;
          }
        }
      }
      resultLines.push(lines[i]);
      i++;
    }
    return resultLines.join('\n');
  }

  repairTableStructure(lines) {
    if (lines.length < 1) return lines;
    const header = lines[0];
    const secondLine = lines[1]; 
    const hasSeparator = secondLine && secondLine.match(/^[-:\s|]+$/) && secondLine.includes('-');
    if (!hasSeparator) {
      const cleanHeader = header.replace(/@@COLORSPAN\d+@@/g, 'SPAN');
      const pipeCount = (cleanHeader.match(/\|/g) || []).length;
      if (pipeCount > 0) {
        const newSeparator = cleanHeader.replace(/[^|]+/g, '---');
        return [header, newSeparator, ...lines.slice(1)];
      }
    }
    return lines;
  }

  validateTableStructure(tableLines) {
    if (tableLines.length < 2) return false;
    const hasSeparator = tableLines.some(line => {
      const stripped = line.replace(/\|/g, '').trim();
      return stripped.match(/^[-:\s]+$/) && stripped.includes('-');
    });
    return hasSeparator;
  }

  parseTable(lines) {
    const cleanedLines = lines.map(line => line.trim()).filter(line => line.length > 0);
    let rows = cleanedLines.map(line => {
      let cleanLine = line;
      if (!cleanLine.startsWith('|')) cleanLine = '|' + cleanLine;
      if (!cleanLine.endsWith('|')) cleanLine = cleanLine + '|';
      if (cleanLine.startsWith('|')) cleanLine = cleanLine.substring(1);
      if (cleanLine.endsWith('|')) cleanLine = cleanLine.substring(0, cleanLine.length - 1);
      const protectedLine = cleanLine.replace(/\\\|/g, '@@ESCAPED_PIPE@@');
      return protectedLine.split('|').map(cell => {
        return cell.trim().replace(/@@ESCAPED_PIPE@@/g, '|') || '—';
      });
    });

    let headers = rows[0];
    let dataRows = [];
    let separatorIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const rowStr = rows[i].join('');
      if (rowStr.replace(/[:\s]/g, '').match(/^-+$/)) {
        separatorIndex = i;
        break;
      }
    }
    if (separatorIndex === -1) {
        dataRows = rows.slice(1);
    } else {
        dataRows = rows.slice(separatorIndex + 1);
    }

    // Filter out placeholder/junk rows (e.g., "...", "---", empty rows)
    dataRows = dataRows.filter(row => {
        const isPlaceholder = row.every(cell => {
            const c = cell.trim();
            // Check for empty/default, ellipsis, or only dashes/dots
            return c === '—' || 
                   c === '...' || 
                   c === '…' || 
                   /^[.\-\s]+$/.test(c);
        });
        return !isPlaceholder;
    });

    if (dataRows.length === 0) return null;

    let html = '<div class="table-wrapper"><table class="data-table">';
    html += '<thead><tr>';
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead>';
    html += '<tbody>';
    dataRows.forEach(row => {
      while (row.length < headers.length) row.push('—');
      html += '<tr>';
      row.slice(0, headers.length).forEach(cell => html += `<td>${cell}</td>`);
      html += '</tr>';
    });
    html += '</tbody>';
    html += '</table></div>';
    return html;
  }

  wrapList(items, type) {
    if (items.length === 0) return '';
    return `<${type}>${items.map(i => `<li>${i}</li>`).join('')}</${type}>`;
  }

  applySyntaxHighlighting(element) {
    if (!element) return;
    if (typeof hljs !== 'undefined') {
      element.querySelectorAll('pre code').forEach(block => {
        if (!block.classList.contains('hljs')) {
          hljs.highlightElement(block);
        }
      });
    }
    this.renderCharts(element);
    this.renderGrids(element);
  }

  renderCharts(element) {
    if (!this.chartRenderer || !element) return;
    const chartContainers = element.querySelectorAll('.chart-container');
    chartContainers.forEach(container => {
      const canvas = container.querySelector('canvas.data-chart');
      if (canvas && !canvas.dataset.rendered) {
        canvas.dataset.rendered = 'true';
      }
    });
  }

  initLazySyntaxHighlighting() {
    if (!this.highlightObserver && 'IntersectionObserver' in window) {
      this.highlightObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const content = entry.target.querySelector('.message-content');
            if (content && !entry.target.dataset.highlighted) {
              this.applySyntaxHighlighting(content);
              entry.target.dataset.highlighted = 'true';
              this.highlightObserver.unobserve(entry.target);
            }
          }
        });
      }, { rootMargin: '100px', threshold: 0.1 });
    }
  }
}