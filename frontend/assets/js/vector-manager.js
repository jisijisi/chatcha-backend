// vector-manager.js - Enhanced RAG System
export class VectorManager {
  constructor() {
    this.vectors = new Map();
    this.chunkSize = 1000;
    this.overlap = 200;
    this.embeddingCache = new Map();
    this.hrKeywords = this.initializeHRKeywords();
  }

  initializeHRKeywords() {
    return {
      // Comprehensive HR terminology coverage
      'interview': 2.5, 'hiring': 2.5, 'recruitment': 2.5, 'onboard': 2.3, 'offboard': 2.3,
      'policy': 2.2, 'procedure': 2.2, 'guideline': 2.2, 'process': 2.0, 'workflow': 2.0,
      'employee': 1.8, 'staff': 1.8, 'team': 1.8, 'workforce': 1.8, 'personnel': 1.8,
      'performance': 2.0, 'evaluation': 2.0, 'review': 2.0, 'appraisal': 2.0, 'assessment': 1.8,
      'benefit': 1.8, 'reward': 1.8, 'recognition': 1.8, 'compensation': 1.8, 'salary': 1.7,
      'training': 1.7, 'development': 1.7, 'learning': 1.7, 'career': 1.7, 'skill': 1.6,
      'disciplinary': 2.0, 'conduct': 1.8, 'violation': 1.8, 'termination': 2.0, 'warning': 1.8,
      
      // Specific processes and forms
      'internal': 2.3, 'transfer': 2.2, 'promotion': 2.2, 'relocation': 1.8,
      'letter of intent': 2.4, 'loi': 2.4, 'requisition': 2.1, 'prf': 2.1,
      'behavioral': 2.3, 'star': 2.2, 'method': 1.5, 'technique': 1.7,
      'screening': 2.0, 'selection': 2.0, 'approval': 1.8, 'authorization': 1.8,
      
      // CDO Specific
      'cdo': 1.5, 'foodsphere': 1.5, 'corazon': 1.3, 'ong': 1.3,
      
      // Process stages
      'attract': 1.8, 'engage': 1.8, 'develop': 1.8, 'probation': 1.7,
      'orientation': 1.6, 'clearance': 1.7, 'separation': 1.8,
      
      // General HR terms
      'manager': 1.6, 'supervisor': 1.6, 'leader': 1.7, 'department': 1.4,
      'section': 1.4, 'division': 1.4, 'organization': 1.5
    };
  }

  /**
   * Enhanced document chunking with comprehensive HR structure awareness
   */
  chunkDocument(content, chunkSize = this.chunkSize, overlap = this.overlap) {
    // If it's the full HR knowledge base, use structured chunking
    if (content && content.full_content) {
      return this.chunkHRDocument(content.full_content);
    }
    
    // Fallback for generic content
    if (typeof content === 'object') {
      return this.chunkStructuredData(content);
    }
    
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    return this.chunkTextWithOverlap(text, chunkSize, overlap);
  }

  /**
   * Comprehensive HR document chunking
   */
  chunkHRDocument(fullContent) {
    const chunks = [];
    
    console.log('Processing full HR document structure...');
    
    // Process ALL top-level sections systematically
    const processSection = (data, path, sectionName, importance = 'medium') => {
      if (!data) return;
      
      // For large sections, break them down
      if (typeof data === 'object' && data !== null) {
        const jsonString = JSON.stringify(data, null, 2);
        
        if (jsonString.length > 2000) {
          // Large section - break into components
          Object.entries(data).forEach(([key, value]) => {
            if (value && typeof value === 'object') {
              processSection(value, `${path}.${key}`, key, importance);
            } else {
              // Small key-value, include with parent context
              chunks.push(this.createChunk({ [key]: value }, `${path}.${key}`, 'key_value', importance));
            }
          });
        } else {
          // Small enough section, keep together
          chunks.push(this.createChunk(data, path, 'section', importance));
        }
      }
    };
    
    // Process ALL main sections with proper importance weighting
    const mainSections = {
      'document_metadata': { data: fullContent.document_metadata, importance: 'low' },
      'introduction': { data: fullContent.introduction, importance: 'high' },
      'attract_phase': { data: fullContent.attract_phase, importance: 'high' },
      'onboard_phase': { data: fullContent.onboard_phase, importance: 'medium' },
      'engage_phase': { data: fullContent.engage_phase, importance: 'medium' },
      'develop_phase': { data: fullContent.develop_phase, importance: 'medium' },
      'offboard_phase': { data: fullContent.offboard_phase, importance: 'medium' }
    };
    
    Object.entries(mainSections).forEach(([sectionName, sectionInfo]) => {
      if (sectionInfo.data) {
        console.log(`Processing section: ${sectionName}`);
        processSection(sectionInfo.data, sectionName, sectionName, sectionInfo.importance);
      }
    });
    
    console.log(`Created ${chunks.length} comprehensive chunks from HR document`);
    return chunks;
  }

  createChunk(data, path, type, importance = 'medium') {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    
    // Extract keywords from the content for better search
    const keywords = this.extractKeywordsFromContent(content);
    
    return {
      id: `chunk_${path.replace(/[\.\[\]]/g, '_')}_${Date.now()}`,
      content: content,
      metadata: {
        type: type,
        section: path.split('.')[0],
        path: path,
        importance: importance,
        keywords: keywords,
        length: content.length
      }
    };
  }

  extractKeywordsFromContent(content) {
    const text = content.toLowerCase();
    const keywords = [];
    
    // HR-specific phrase patterns
    const hrPhrases = [
      'internal hiring process', 'letter of intent', 'personnel requisition form',
      'behavioral based interview', 'star method', 'interview levels',
      'hiring process', 'recruitment process', 'onboarding process',
      'performance management', 'employee experience', 'probationary period',
      'exit interview', 'employee clearance', 'code of conduct',
      'learning series', 'interviewing 101', 'behavioral sample questions',
      'stages of hiring', 'interview matrix', 'faqs'
    ];
    
    hrPhrases.forEach(phrase => {
      if (text.includes(phrase)) {
        keywords.push(phrase);
      }
    });
    
    return keywords;
  }

  chunkStructuredData(data, path = '') {
    const chunks = [];
    
    const processObject = (obj, currentPath) => {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        
        if (typeof value === 'object' && value !== null) {
          // For objects and arrays, check if they should be kept together
          const jsonString = JSON.stringify(value, null, 2);
          
          if (jsonString.length <= this.chunkSize) {
            // Keep small objects together
            chunks.push({
              id: `obj_${newPath.replace(/[\.\[\]]/g, '_')}`,
              content: JSON.stringify({ [key]: value }, null, 2),
              metadata: {
                source: 'hr_knowledge',
                path: newPath,
                type: 'complete_object',
                length: jsonString.length
              }
            });
          } else {
            // Large object, process recursively
            processObject(value, newPath);
          }
        } else {
          // Primitive values, include with context
          chunks.push({
            id: `val_${newPath.replace(/[\.\[\]]/g, '_')}`,
            content: JSON.stringify({ [key]: value }, null, 2),
            metadata: {
              source: 'hr_knowledge',
              path: newPath,
              type: 'key_value',
              length: JSON.stringify(value).length
            }
          });
        }
      }
    };
    
    processObject(data, path);
    
    // If we have too many small chunks, group them
    return this.optimizeChunkSize(chunks);
  }

  chunkTextWithOverlap(text, chunkSize, overlap) {
    const chunks = [];
    
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.substring(i, Math.min(i + chunkSize, text.length));
      const cleanChunk = this.cleanChunkBoundaries(chunk, i, text);
      
      chunks.push({
        id: `chunk_${i}`,
        content: cleanChunk.content,
        start: i,
        end: i + cleanChunk.content.length,
        metadata: {
          source: 'hr_knowledge',
          length: cleanChunk.content.length,
          position: i,
          hasCompleteStructures: cleanChunk.hasCompleteStructures
        }
      });
      
      if (i + chunkSize >= text.length) break;
      i = cleanChunk.newPosition || i;
    }
    
    return chunks;
  }

  cleanChunkBoundaries(chunk, position, fullText) {
    let content = chunk;
    let hasCompleteStructures = true;
    let newPosition = null;

    // Check for unclosed JSON structures
    const openBraces = (chunk.match(/{/g) || []).length;
    const closeBraces = (chunk.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      const nextBrace = fullText.indexOf('}', position + chunk.length);
      if (nextBrace !== -1) {
        content = fullText.substring(position, nextBrace + 1);
        newPosition = nextBrace;
      } else {
        hasCompleteStructures = false;
      }
    }
    
    // Check for unclosed arrays
    const openBrackets = (chunk.match(/\[/g) || []).length;
    const closeBrackets = (chunk.match(/\]/g) || []).length;
    
    if (openBrackets > closeBrackets) {
      const nextBracket = fullText.indexOf(']', position + chunk.length);
      if (nextBracket !== -1) {
        content = fullText.substring(position, nextBracket + 1);
        newPosition = nextBracket;
      } else {
        hasCompleteStructures = false;
      }
    }

    return { content, hasCompleteStructures, newPosition };
  }

  optimizeChunkSize(chunks) {
    const optimized = [];
    let currentGroup = [];
    let currentSize = 0;

    for (const chunk of chunks) {
      if (currentSize + chunk.content.length <= this.chunkSize && 
          this.areChunksRelated(currentGroup, chunk)) {
        currentGroup.push(chunk);
        currentSize += chunk.content.length;
      } else {
        if (currentGroup.length > 0) {
          optimized.push(this.mergeChunks(currentGroup));
        }
        currentGroup = [chunk];
        currentSize = chunk.content.length;
      }
    }

    if (currentGroup.length > 0) {
      optimized.push(this.mergeChunks(currentGroup));
    }

    return optimized;
  }

  areChunksRelated(existingChunks, newChunk) {
    if (existingChunks.length === 0) return true;
    
    const existingPath = existingChunks[0].metadata.path?.split('.')[0];
    const newPath = newChunk.metadata.path?.split('.')[0];
    
    return existingPath === newPath;
  }

  mergeChunks(chunks) {
    const mergedContent = chunks.map(chunk => chunk.content).join('\n\n');
    const firstChunk = chunks[0];
    
    return {
      id: `merged_${firstChunk.id}`,
      content: mergedContent,
      metadata: {
        ...firstChunk.metadata,
        type: 'merged_chunks',
        merged_count: chunks.length,
        source_paths: chunks.map(c => c.metadata.path).filter(Boolean)
      }
    };
  }

  /**
   * Enhanced semantic embedding generation with phrase recognition
   */
  async generateEmbedding(text) {
    const cacheKey = text.substring(0, 200);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    const processedText = this.preprocessText(text);
    const embedding = this.createSemanticEmbedding(processedText);
    
    this.embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  preprocessText(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:()\-]/g, '')
      .trim();
  }

  createSemanticEmbedding(text) {
    const words = text.split(/\s+/).filter(word => word.length > 2);
    const embedding = new Array(300).fill(0);
    
    // Enhanced weighting with phrase recognition
    words.forEach(word => {
      const weight = this.getEnhancedTermWeight(word, text);
      const hash = this.stringToHash(word);
      
      for (let i = 0; i < 5; i++) {
        const index = (hash + i * 17) % embedding.length;
        embedding[index] += weight;
      }
    });
    
    // Boost for HR phrases
    this.boostHRPhrases(embedding, text);
    
    return this.normalizeVector(embedding);
  }

  getEnhancedTermWeight(word, fullText) {
    // Base weight from config
    let weight = this.getTermWeight(word);
    
    // Boost for context - if word appears in important phrases
    const importantContexts = {
      'process': ['process', 'procedure', 'workflow', 'pipeline'],
      'hiring': ['hire', 'recruit', 'interview', 'candidate', 'applicant'],
      'internal': ['internal', 'transfer', 'promotion', 'existing employee']
    };
    
    Object.entries(importantContexts).forEach(([context, contextWords]) => {
      if (contextWords.includes(word)) {
        // Check if this word appears in a relevant context in the full text
        const contextPattern = new RegExp(`\\b(${contextWords.join('|')})\\b`, 'gi');
        const contextMatches = fullText.match(contextPattern);
        if (contextMatches && contextMatches.length > 1) {
          weight *= 1.3; // Boost for contextual relevance
        }
      }
    });
    
    return weight;
  }

  boostHRPhrases(embedding, text) {
    const hrPhrases = {
      'internal hiring': 2.5,
      'letter of intent': 2.4,
      'behavioral interview': 2.3,
      'star method': 2.3,
      'hiring process': 2.2,
      'recruitment process': 2.2,
      'interview levels': 2.1,
      'personnel requisition': 2.1
    };
    
    Object.entries(hrPhrases).forEach(([phrase, boost]) => {
      if (text.toLowerCase().includes(phrase)) {
        const phraseHash = this.stringToHash(phrase);
        for (let i = 0; i < 3; i++) {
          const index = (phraseHash + i * 23) % embedding.length;
          embedding[index] += boost * 0.1;
        }
      }
    });
  }

  getTermWeight(word) {
    // Check for exact matches
    if (this.hrKeywords[word]) {
      return this.hrKeywords[word];
    }
    
    // Check for partial matches (e.g., "interviewing" -> "interview")
    for (const [keyword, weight] of Object.entries(this.hrKeywords)) {
      if (word.includes(keyword) || keyword.includes(word)) {
        return weight * 0.8; // Slightly reduced weight for partial matches
      }
    }
    
    return 1.0;
  }

  stringToHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Enhanced hybrid search with context awareness
   */
  async hybridSearch(query, topK = 10) {
    if (this.vectors.size === 0) {
      console.log('No vectors available for search');
      return [];
    }
    
    // Analyze query type for better context
    const queryAnalysis = this.analyzeQuery(query);
    
    // Vector search with query analysis
    const vectorResults = await this.searchWithContext(query, topK * 2, queryAnalysis);
    
    // Enhanced keyword search
    const keywordResults = this.enhancedKeywordSearch(query, topK, queryAnalysis);
    
    // Smart combination with context awareness
    const combinedResults = this.combineWithContextAwareness(vectorResults, keywordResults, queryAnalysis);
    
    return combinedResults.slice(0, topK);
  }

  analyzeQuery(query) {
    const lowerQuery = query.toLowerCase();
    const analysis = {
      type: 'general',
      keyTerms: [],
      isProcessQuery: false,
      isPolicyQuery: false,
      isHiringQuery: false
    };
    
    // Detect query types
    if (lowerQuery.includes('process') || lowerQuery.includes('how to') || lowerQuery.includes('steps')) {
      analysis.isProcessQuery = true;
      analysis.type = 'process';
    }
    
    if (lowerQuery.includes('policy') || lowerQuery.includes('procedure') || lowerQuery.includes('guideline')) {
      analysis.isPolicyQuery = true;
      analysis.type = 'policy';
    }
    
    if (lowerQuery.includes('hire') || lowerQuery.includes('recruit') || lowerQuery.includes('interview')) {
      analysis.isHiringQuery = true;
      analysis.type = 'hiring';
    }
    
    // Extract key terms
    const terms = lowerQuery.split(/\s+/).filter(term => term.length > 3);
    analysis.keyTerms = terms;
    
    return analysis;
  }

  async searchWithContext(query, topK, queryAnalysis) {
    const queryEmbedding = await this.generateEmbedding(query);
    const results = [];

    for (const [chunkId, vector] of this.vectors.entries()) {
      const similarity = this.cosineSimilarity(queryEmbedding, vector.embedding);
      
      if (similarity >= 0.05) { // Lower threshold to catch more relevant content
        let boostedSimilarity = similarity;
        
        // Contextual boosting based on query type
        if (queryAnalysis.isProcessQuery && this.isProcessChunk(vector)) {
          boostedSimilarity *= 1.4;
        }
        
        if (queryAnalysis.isPolicyQuery && this.isPolicyChunk(vector)) {
          boostedSimilarity *= 1.3;
        }
        
        if (queryAnalysis.isHiringQuery && this.isHiringChunk(vector)) {
          boostedSimilarity *= 1.4;
        }
        
        // Keyword match boosting
        const keywordMatch = this.calculateKeywordMatch(vector, queryAnalysis.keyTerms);
        boostedSimilarity *= (1 + keywordMatch * 0.2);
        
        const completenessScore = this.calculateCompletenessScore(vector.content);
        const importanceBoost = this.getImportanceBoost(vector.metadata);
        
        results.push({
          chunkId,
          content: vector.content,
          similarity: boostedSimilarity * (1 + completenessScore * 0.2 + importanceBoost),
          metadata: vector.metadata,
          source: 'vector_search',
          completenessScore
        });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  isProcessChunk(vector) {
    const content = vector.content.toLowerCase();
    return content.includes('process') || content.includes('step') || 
           content.includes('stage') || content.includes('procedure');
  }

  isPolicyChunk(vector) {
    const content = vector.content.toLowerCase();
    return content.includes('policy') || content.includes('guideline') || 
           content.includes('rule') || content.includes('regulation');
  }

  isHiringChunk(vector) {
    const content = vector.content.toLowerCase();
    return content.includes('hire') || content.includes('recruit') || 
           content.includes('interview') || content.includes('candidate');
  }

  calculateKeywordMatch(vector, keyTerms) {
    if (!keyTerms.length) return 0;
    
    const content = vector.content.toLowerCase();
    let matches = 0;
    
    keyTerms.forEach(term => {
      if (content.includes(term)) {
        matches++;
      }
    });
    
    return matches / keyTerms.length;
  }

  enhancedKeywordSearch(query, topK, queryAnalysis) {
    const results = [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
    
    if (queryTerms.length === 0) return [];

    for (const [chunkId, vector] of this.vectors.entries()) {
      const content = vector.content.toLowerCase();
      let score = 0;
      
      // Exact phrase matching
      queryTerms.forEach(term => {
        const exactMatches = (content.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
        score += exactMatches * this.getTermWeight(term);
      });
      
      // Phrase matching for multi-word queries
      if (queryTerms.length > 1) {
        const phrase = queryTerms.join(' ');
        if (content.includes(phrase)) {
          score += 10; // Significant boost for exact phrase matches
        }
      }
      
      // Contextual boosting for keyword search too
      if (queryAnalysis.isProcessQuery && this.isProcessChunk(vector)) {
        score *= 1.3;
      }
      
      if (score > 0) {
        results.push({
          ...vector,
          similarity: score / Math.max(1, queryTerms.length),
          source: 'keyword'
        });
      }
    }
    
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  combineWithContextAwareness(vectorResults, keywordResults, queryAnalysis) {
    const allResults = [...vectorResults, ...keywordResults];
    const seenContent = new Set();
    const uniqueResults = [];
    
    // Deduplicate and boost results that appear in both searches
    allResults.forEach(result => {
      const contentKey = result.content.substring(0, 200);
      if (!seenContent.has(contentKey)) {
        seenContent.add(contentKey);
        
        // Boost score if result appears in both searches
        const isInBoth = vectorResults.some(v => v.content.substring(0, 200) === contentKey) && 
                        keywordResults.some(k => k.content.substring(0, 200) === contentKey);
        
        if (isInBoth) {
          result.similarity *= 1.4;
        }
        
        // Additional boost for high-importance chunks and query context
        result.similarity *= (1 + this.getImportanceBoost(result.metadata));
        
        // Context-specific boosting
        if (queryAnalysis.isProcessQuery && this.isProcessChunk(result)) {
          result.similarity *= 1.2;
        }
        
        uniqueResults.push(result);
      }
    });
    
    return uniqueResults.sort((a, b) => b.similarity - a.similarity);
  }

  getImportanceBoost(metadata) {
    if (!metadata) return 0;
    
    if (metadata.importance === 'high') return 0.3;
    if (metadata.importance === 'medium') return 0.15;
    return 0;
  }

  calculateCompletenessScore(content) {
    let score = 0.5;
    
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    if (openBraces === closeBraces && openBraces > 0) {
      score += 0.3;
    }
    
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    if (openBrackets === closeBrackets && openBrackets > 0) {
      score += 0.2;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Index the knowledge base with caching support
   */
  async indexKnowledgeBase(hrKnowledgeBase) {
    console.log('Indexing knowledge base with enhanced RAG...');
    
    if (!hrKnowledgeBase || !hrKnowledgeBase.full_content) {
      console.warn('No valid knowledge base to index');
      return 0;
    }
    
    // Try to load cached vectors first
    const cachedVectors = this.loadCachedVectors();
    if (cachedVectors && cachedVectors.size > 0) {
      this.vectors = cachedVectors;
      console.log(`Loaded ${this.vectors.size} cached vectors`);
      return this.vectors.size;
    }
    
    // Create new chunks
    const chunks = this.chunkDocument(hrKnowledgeBase);
    console.log(`Created ${chunks.length} comprehensive chunks`);
    
    // Generate embeddings for each chunk
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.content);
      this.vectors.set(chunk.id, {
        ...chunk,
        embedding
      });
    }
    
    // Cache the vectors
    this.saveCachedVectors();
    
    console.log('Enhanced RAG indexing complete');
    return chunks.length;
  }

  loadCachedVectors() {
    try {
      const cached = localStorage.getItem('hr_vectors_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        return new Map(parsed);
      }
    } catch (e) {
      console.warn('Could not load cached vectors:', e);
    }
    return null;
  }

  saveCachedVectors() {
    try {
      const serialized = JSON.stringify(Array.from(this.vectors.entries()));
      localStorage.setItem('hr_vectors_cache', serialized);
      console.log('Vectors cached successfully');
    } catch (e) {
      console.warn('Could not cache vectors:', e);
    }
  }

  clearCache() {
    this.vectors.clear();
    this.embeddingCache.clear();
    try {
      localStorage.removeItem('hr_vectors_cache');
      console.log('Vector cache cleared');
    } catch (e) {
      console.warn('Could not clear vector cache:', e);
    }
  }

  /**
   * Get relevant context with enhanced search
   */
  async getRelevantContext(question, topK = 10) {
    console.log(`Enhanced RAG search for: "${question}"`);
    
    const results = await this.hybridSearch(question, topK);
    
    if (results.length === 0) {
      console.log('No relevant context found via enhanced search');
      return this.getFallbackContext();
    }

    // Log search results for debugging
    console.log(`Found ${results.length} relevant chunks:`);
    results.forEach((result, index) => {
      const type = result.metadata.type || 'unknown';
      const section = result.metadata.section || 'general';
      const source = result.source || 'unknown';
      console.log(`  ${index + 1}. ${type} (${section}) - ${source} - Score: ${result.similarity.toFixed(3)}`);
    });

    return this.combineContextResults(results);
  }

  combineContextResults(results) {
    const contentMap = new Map();
    const contentSet = new Set();

    // Group by section and type to maintain context coherence
    results.forEach(result => {
      const section = result.metadata.section || 'general';
      const type = result.metadata.type || 'content';
      const groupKey = `${section}_${type}`;
      
      if (!contentMap.has(groupKey)) {
        contentMap.set(groupKey, []);
      }
      contentMap.get(groupKey).push(result);
    });

    // Combine content from each group, prioritizing high-similarity results
    const combinedParts = [];
    
    for (const [group, groupResults] of contentMap.entries()) {
      // Sort by similarity within group
      const sortedResults = groupResults.sort((a, b) => b.similarity - a.similarity);
      
      // Add unique content from this group
      sortedResults.forEach(result => {
        if (!contentSet.has(result.content)) {
          combinedParts.push(result.content);
          contentSet.add(result.content);
        }
      });
    }
    
    return combinedParts.join('\n\n');
  }

  getFallbackContext() {
    return `CDO Foodsphere HR Knowledge Base - General Information Available:
- Employee lifecycle phases: Attract, Onboard, Engage, Develop, Offboard
- HR policies and procedures
- Interviewing techniques and guidelines
- Forms and tools for HR processes
- Behavioral-based interviewing methods
- STAR method for assessments
- Internal hiring processes and transfers

Please contact HR for specific questions not covered in the available context.`;
  }
}