import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { pool } from '../config/database.js';
import { cacheService } from './cacheService.js';
import * as lancedb from 'vectordb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === DATABASE CACHE MANAGER FOR NEW SCHEMA ===
export class DatabaseCacheManager {
  constructor(pool, cachePath = 'embeddings-cache.json') {
      this.pool = pool;
      // Use .cache directory to match CacheService
      const cacheDir = path.join(__dirname, '..', '.cache');
      this.cachePath = path.join(cacheDir, cachePath);
      this.cacheInfoPath = path.join(cacheDir, 'cache-info.json');
  }

  async generateCacheSignature() {
      try {
          const [result] = await this.pool.execute(`
              SELECT 
                  COUNT(*) as doc_count,
                  SUM(LENGTH(content)) as total_size,
                  MAX(updated_at) as last_updated,
                  MD5(GROUP_CONCAT(CONCAT_WS('|', kd.id, kd.updated_at) ORDER BY kd.id)) as content_hash
              FROM knowledge_documents kd
              WHERE kd.status = 'published'
          `);
          
          const signature = {
              timestamp: new Date().toISOString(),
              doc_count: result[0].doc_count,
              total_size: result[0].total_size,
              last_updated: result[0].last_updated,
              content_hash: result[0].content_hash,
              signature: this.simpleHash(result[0].content_hash)
          };
          
          console.log(`📊 NEW DB Cache: ${result[0].doc_count} documents, ${result[0].total_size} bytes`);
          return signature;
      } catch (error) {
          console.error('❌ Error generating database cache signature:', error);
          return null;
      }
  }

  async loadKnowledgeDocuments() {
      try {
          const [documents] = await this.pool.execute(`
              SELECT 
                  kd.id,
                  kd.title,
                  kd.content,
                  kd.slug,
                  kd.updated_at,
                  kc.id as category_id,
                  ksc.id as subcategory_id,
                  kc.name as category_name,
                  ksc.name as subcategory_name
              FROM knowledge_documents kd
              JOIN knowledge_subcategories ksc ON kd.subcategory_id = ksc.id
              JOIN knowledge_categories kc ON ksc.category_id = kc.id
              WHERE kd.status = 'published'
              ORDER BY kc.name, ksc.name, kd.title
          `);
          
          console.log(`✅ Loaded ${documents.length} documents from NEW database schema`);
          return documents;
      } catch (error) {
          console.error('❌ Error loading knowledge documents from NEW database:', error);
          return [];
      }
  }

  convertToKnowledgeBase(documents) {
      const knowledgeBase = {};
      
      documents.forEach(doc => {
          const fileKey = `${doc.category_name}/${doc.subcategory_name}/${doc.slug}`;
          knowledgeBase[fileKey] = {
            content: doc.content,
            id: doc.id,
            categoryId: doc.category_id,
            subcategoryId: doc.subcategory_id
            // Note: If documents had a source_id column, it should be mapped here.
          };
      });
      
      return knowledgeBase;
  }

  async isCacheValid() {
      try {
          if (!fs.existsSync(this.cachePath) && !fs.existsSync(path.join(__dirname, '..', '.cache', 'lancedb'))) {
               // Check for LanceDB folder as well
              return false;
          }
          if (!fs.existsSync(this.cacheInfoPath)) {
              return false;
          }
          const cacheInfo = JSON.parse(fs.readFileSync(this.cacheInfoPath, 'utf8'));
          const currentSignature = await this.generateCacheSignature();
          if (!currentSignature || !cacheInfo.signature) {
              return false;
          }
          const isValid = currentSignature.signature === cacheInfo.signature;
          console.log(`🔍 NEW DB Cache validity: ${isValid ? 'VALID' : 'INVALID'}`);
          return isValid;
      } catch (error) {
          console.error('❌ Error checking cache validity:', error);
          return false;
      }
  }

  async saveCacheInfo() {
      try {
          const cacheSignature = await this.generateCacheSignature();
          if (!cacheSignature) return;

          const cacheSize = fs.existsSync(this.cachePath) ? fs.statSync(this.cachePath).size : 0;
          await cacheService.saveCacheInfo(cacheSignature, cacheSize, 'new_relational_v1');
          
      } catch (error) {
          console.error('❌ Error saving cache info:', error);
      }
  }

  getCacheInfo() {
      return cacheService.getCacheInfo();
  }

  clearCache() {
      try {
          let clearedFiles = 0;
          
          if (fs.existsSync(this.cachePath)) {
              fs.unlinkSync(this.cachePath);
              console.log('✅ Embeddings cache deleted');
              clearedFiles++;
          }
          
          if (fs.existsSync(this.cacheInfoPath)) {
              fs.unlinkSync(this.cacheInfoPath);
              console.log('✅ Cache info deleted');
              clearedFiles++;
          }
          
          cacheService.clearCache();
          
          return clearedFiles > 0;
      } catch (error) {
          console.error('❌ Error clearing cache:', error);
          return false;
      }
  }

  simpleHash(content) {
      if (!content) return 'empty';
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
          const char = content.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
      }
      return hash.toString(36);
  }

  async getDatabaseStats() {
      try {
          const [categoryStats] = await this.pool.execute(`
              SELECT 
                  kc.name as category,
                  COUNT(kd.id) as document_count,
                  SUM(LENGTH(kd.content)) as total_size
              FROM knowledge_categories kc
              LEFT JOIN knowledge_subcategories ksc ON kc.id = ksc.category_id
              LEFT JOIN knowledge_documents kd ON ksc.id = kd.subcategory_id AND kd.status = 'published'
              GROUP BY kc.id, kc.name
              ORDER BY kc.name
          `);
          const [totalStats] = await this.pool.execute(`
              SELECT 
                  COUNT(*) as total_documents,
                  SUM(LENGTH(content)) as total_content_size
              FROM knowledge_documents 
              WHERE status = 'published'
          `);
          return {
              categories: categoryStats,
              totals: totalStats[0]
          };
      } catch (error) {
          console.error('❌ Error getting NEW database stats:', error);
          return null;
      }
  }
}

// === MULTI-FOLDER SEMANTIC RAG WITH LANCEDB ===
export class MultiFolderSemanticRAG {
  constructor() {
      this.knowledgeBase = {};
      this.chunks = []; // Kept for stats/debugging, but not used for search
      this.isInitialized = false;
      this.initializing = false;
      
      // LanceDB Setup
      const cacheDir = path.join(__dirname, '..', '.cache');
      if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
      }
      this.dbPath = path.join(cacheDir, 'lancedb');
      this.tableName = 'knowledge_vectors';
      this.db = null;
      this.table = null;

      this.progressCallback = null;
      console.log("🔧 Initializing RAG with LanceDB...");
  }

  // Progress callback methods
  setProgressCallback(callback) {
      this.progressCallback = callback;
  }

  clearProgressCallback() {
      this.progressCallback = null;
  }

  _reportProgress(stage, progress, message, detail = null) {
      if (this.progressCallback) {
          try {
              this.progressCallback({
                  stage,
                  progress: Math.round(progress),
                  message,
                  detail
              });
          } catch (error) {
              console.error('❌ Error in progress callback:', error);
          }
      }
  }

  async loadKnowledgeBaseFromDatabase() {
      try {
          console.log("📂 Loading knowledge base from NEW database schema...");
          this._reportProgress('loading', 10, 'Loading knowledge base documents...');
          
          const documents = await databaseCacheManager.loadKnowledgeDocuments();
          if (documents.length === 0) {
              console.warn("⚠️ No published documents found in NEW database");
              return { 'database-fallback': { 'message': 'NEW Database knowledge base is empty' } };
          }
          
          this.knowledgeBase = databaseCacheManager.convertToKnowledgeBase(documents);
          console.log("✅ NEW Database knowledge base loaded successfully");
          console.log("📊 Total categories in knowledge base:", Object.keys(this.knowledgeBase).length);
          
          this._reportProgress('loading', 30, `Loaded ${documents.length} documents`);
          return this.knowledgeBase;
      } catch (error) {
          console.error("❌ Failed to load knowledge base from NEW database:", error);
          return { 'error-fallback': { 'message': 'NEW Database loading failed' } };
      }
  }

  async initializeRAG() {
      if (this.isInitialized) {
          console.log('ℹ️ RAG already initialized - skipping');
          return;
      }
      if (this.initializing) {
          console.log('ℹ️ RAG initialization already in progress - skipping duplicate call');
          return;
      }
      this.initializing = true;
      try {
          console.log("🔄 Initializing RAG system from LanceDB...");
          
          // Connect to LanceDB
          this.db = await lancedb.connect(this.dbPath);
          
          // Check cache validity
          const cacheValid = await databaseCacheManager.isCacheValid();
          const tableNames = await this.db.tableNames();
          const tableExists = tableNames.includes(this.tableName);

          const isProduction = process.env.NODE_ENV === 'production';

          if (tableExists && cacheValid) {
              console.log("✅ LanceDB table exists and cache is valid. Opening table...");
              this.table = await this.db.openTable(this.tableName);
              
              // Load knowledge base for metadata/stats (chunks are in DB, but we keep KB for folder structure)
              this.knowledgeBase = await this.loadKnowledgeBaseFromDatabase();
              
              // Optional: Load chunks into memory for debug/stats if needed. 
              // For performance, we might want to avoid this on large datasets, 
              // but for compatibility with current controller logic, we'll try to load a preview or count.
              // For now, we will NOT load all chunks into memory to prove Phase 2 optimization.
              // We will set this.chunks to a proxy or just empty if not needed by search.
              // BUT, the current controller uses `ragSystem.chunks` for stats.
              // We'll populate it from the DB to maintain compatibility for now.
              // OPTIMIZATION: Do NOT load chunks into memory to prevent OOM on small instances (Render Free Tier)
              // This reduces memory usage significantly. Stats will show 0 chunks until regeneration, but search works.
              console.log("skipping chunk load to save memory");
              this.chunks = [];
              
              /* 
              console.log("📚 Loading chunks from LanceDB for cache...");
              // Use filter with a condition that is always true to scan table (quoting column name to preserve case)
              const allRows = await this.table.filter('"documentId" >= 0').limit(100000).execute();
              this.chunks = allRows.map(r => ({
                  text: r.text,
                  path: r.path,
                  context: r.context,
                  parentContext: r.parentContext,
                  source: r.source,
                  fileName: r.fileName,
                  isAggregate: r.isAggregate,
                  documentId: r.documentId,
                  categoryId: r.categoryId,
                  subcategoryId: r.subcategoryId,
                  sourceId: r.sourceId
              }));
              console.log(`✅ RAG system initialized with ${this.chunks.length} vectors from LanceDB`);
              */
              
              console.log(`✅ RAG system initialized (Chunks remain on disk)`);
              this.isInitialized = true;
          } else {
              console.log("🔄 Cache invalid or table missing. Regenerating embeddings...");
              await this.regenerateEmbeddings();
          }
          
          this._reportProgress('complete', 100, 'RAG system initialized');
      } catch (error) {
          console.error("❌ RAG initialization failed:", error);
          this.isInitialized = true; // Set true to avoid loops, but it's degraded
      } finally {
          this.initializing = false;
      }
  }

  async regenerateEmbeddings() {
      try {
          console.log("🔄 Generating embeddings for LanceDB...");
          this._reportProgress('starting', 5, 'Starting embedding generation...');
          
          if (!process.env.GEMINI_API_KEY) {
              throw new Error("GEMINI_API_KEY not set in environment");
          }
          
          this.knowledgeBase = await this.loadKnowledgeBaseFromDatabase();
          if (Object.keys(this.knowledgeBase).length === 0) {
              console.warn("⚠️ Database is empty, nothing to embed.");
              this.chunks = [];
              return;
          }

          this._reportProgress('processing', 25, 'Extracting text chunks...');
          this.chunks = this.extractChunks(this.knowledgeBase);
          console.log(`📚 Extracted ${this.chunks.length} fresh text chunks.`);

          this._reportProgress('embedding', 30, 'Starting embedding generation...');
          
          // Prepare for LanceDB
          const records = [];
          const batchSize = 5;
          const totalChunks = this.chunks.length;
          
          for (let i = 0; i < this.chunks.length; i += batchSize) {
              const batch = this.chunks.slice(i, i + batchSize);
              const batchEmbeddings = await Promise.all(
                  batch.map(chunk => this.getEmbedding(chunk.text))
              );
              
              // Filter out failed embeddings (all zeros)
              const validIndices = batchEmbeddings.map((emb, idx) => emb.some(v => v !== 0) ? idx : -1).filter(i => i !== -1);
              
              // Combine chunk data with vector
              validIndices.forEach((validIdx) => {
                  const chunk = batch[validIdx];
                  records.push({
                      vector: batchEmbeddings[validIdx],
                      text: chunk.text,
                      path: chunk.path,
                      context: chunk.context,
                      parentContext: chunk.parentContext,
                      source: chunk.source,
                      fileName: chunk.fileName,
                      isAggregate: chunk.isAggregate || false,
                      documentId: chunk.documentId || 0,
                      categoryId: chunk.categoryId || 0,
                      subcategoryId: chunk.subcategoryId || 0,
                      sourceId: chunk.sourceId || 0
                  });
              });
              
              const progress = Math.min(i + batchSize, this.chunks.length);
              const percentage = ((progress / this.chunks.length) * 100).toFixed(1);
              
              this._reportProgress(
                  'embedding', 
                  30 + ((progress / totalChunks) * 65), 
                  `Generating embeddings... ${progress}/${this.chunks.length} chunks`,
                  { current: progress, total: totalChunks, percentage }
              );
              
              if (i + batchSize < this.chunks.length) {
                  await new Promise(resolve => setTimeout(resolve, 200));
              }
          }
          
          console.log("✅ All embeddings generated. Saving to LanceDB...");
          this._reportProgress('finalizing', 95, 'Saving to vector database...');
          
          // Create or Overwrite Table
          if (this.table) {
               // If table object exists, we might need to drop or just overwrite via db
          }
          this.table = await this.db.createTable(this.tableName, records, { writeMode: lancedb.WriteMode.Overwrite });
          
          await databaseCacheManager.saveCacheInfo();
          
          this.isInitialized = true;
          console.log("✅ RAG system initialized with LanceDB");
          this._reportProgress('complete', 100, 'Embeddings generated successfully!');
          
      } catch (error) {
          console.error("❌ Failed to regenerate embeddings:", error);
          this._reportProgress('error', 0, `Failed: ${error.message}`);
          this.isInitialized = true;
      }
  }
  
  extractChunks() {
      const chunks = [];
      for (const [filePath, fileData] of Object.entries(this.knowledgeBase)) {
          const source = this.getSourceFromPath(filePath);
          const fileName = this.getFileNameFromPath(filePath);
          const fileContext = this.formatKeyAsTitle(fileName);
          const documentId = fileData.id;
          const categoryId = fileData.categoryId;
          const subcategoryId = fileData.subcategoryId;
          const sourceId = fileData.sourceId || null;
          const fileContent = fileData.content;
          
          this._recursiveExtract(fileContent, filePath, chunks, [fileContext], source, fileName, documentId, categoryId, subcategoryId, sourceId);
      }
      return chunks;
  }
  
  _recursiveExtract(item, path, chunks, contextStack, source, fileName, documentId, categoryId, subcategoryId, sourceId) { 
      if (typeof item === 'string' && item.length > 2) {
          chunks.push({
              text: item,
              path: path,
              context: contextStack.join(' - '),
              parentContext: contextStack.slice(0, -1).join(' - ') || 'General',
              source: source,
              fileName: fileName,
              documentId: documentId,
              categoryId: categoryId,
              subcategoryId: subcategoryId,
              sourceId: sourceId 
          });
          return;
      }
      if (Array.isArray(item)) {
          if (item.length > 0) {
               const isListOfLeaves = item.every(el => 
                   (typeof el === 'string' && el.length > 2) || 
                   this._isLeafObject(el)
               );
               if (isListOfLeaves && item.length > 1) { 
                   let aggregateText = `${contextStack[contextStack.length - 1] || 'List'}:\n\n`;
                   item.forEach((el, idx) => {
                       if (typeof el === 'string') {
                           aggregateText += `${idx + 1}. ${el}\n\n`;
                       } else {
                           aggregateText += `${this._formatLeafObject(el)}\n---\n`;
                       }
                   });
                   if(aggregateText.length > 20) {
                      chunks.push({
                          text: aggregateText,
                          path: path,
                          context: contextStack.join(' - '),
                          parentContext: contextStack.slice(0, -1).join(' - ') || 'General',
                          source: source,
                          fileName: fileName,
                          isAggregate: true,
                          documentId: documentId,
                          categoryId: categoryId,
                          subcategoryId: subcategoryId,
                          sourceId: sourceId
                      });
                      return; 
                   }
               }
          }
          item.forEach((element, index) => {
              this._recursiveExtract(element, `${path}[${index}]`, chunks, contextStack, source, fileName, documentId, categoryId, subcategoryId, sourceId);
          });
          return;
      }
      if (typeof item !== 'object' || item === null) {
          return;
      }
      if (this._isLeafObject(item)) {
          const formattedText = this._formatLeafObject(item);
          chunks.push({
              text: formattedText,
              path: path,
              context: contextStack.join(' - '),
              parentContext: contextStack.slice(0, -1).join(' - ') || 'General',
              source: source,
              fileName: fileName,
              documentId: documentId,
              categoryId: categoryId,
              subcategoryId: subcategoryId,
              sourceId: sourceId
          });
          return; 
      }
      let newContextStack = [...contextStack];
      const title = this._findContextTitle(item);
      if (title && title !== newContextStack[newContextStack.length - 1]) {
          newContextStack.push(this.formatKeyAsTitle(title));
      }
      let localStrings = {};
      for (const [key, value] of Object.entries(item)) {
          if (typeof value === 'string' && value.length > 0) {
               localStrings[key] = value;
          }
      }
      if (Object.values(localStrings).join("").length > 10) {
          const partialChunkText = this._formatLeafObject(localStrings);
          chunks.push({
              text: partialChunkText,
              path: path,
              context: newContextStack.join(' - '),
              parentContext: newContextStack.slice(0, -1).join(' - ') || 'General',
              source: source,
              fileName: fileName,
              documentId: documentId,
              categoryId: categoryId,
              subcategoryId: subcategoryId,
              sourceId: sourceId
          });
      }
      for (const [key, value] of Object.entries(item)) {
          if (typeof value === 'object' && value !== null) {
              let childContextStack = [...newContextStack];
              if (!title) {
                  const keyTitle = this.formatKeyAsTitle(key);
                  if (keyTitle !== childContextStack[childContextStack.length - 1]) {
                       childContextStack.push(keyTitle);
                  }
              }
              this._recursiveExtract(value, `${path}.${key}`, chunks, childContextStack, source, fileName, documentId, categoryId, subcategoryId, sourceId);
          }
      }
  }

  _findContextTitle(obj) {
      if (typeof obj !== 'object' || obj === null) return null;
      const titleKeys = ['title', 'name', 'stage_name', 'provision_english', 'question', 'value'];
      for (const key of titleKeys) {
          if (typeof obj[key] === 'string' && obj[key].length > 0 && obj[key].length < 150) {
              return obj[key];
          }
      }
      return null;
  }

  _formatLeafObject(obj) {
      let text = '';
      const priorityKeys = ['sn', 'question', 'title', 'name', 'value'];
      const sortedEntries = Object.entries(obj).sort(([keyA], [keyB]) => {
          const indexA = priorityKeys.indexOf(keyA);
          const indexB = priorityKeys.indexOf(keyB);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
      });
      for (const [key, value] of sortedEntries) {
          if ((typeof value === 'string' && value.length > 0) || typeof value === 'number') {
              text += `${this.formatKeyAsTitle(key)}: ${value}\n`;
          }
      }
      return text.trim();
  }

  _isLeafObject(obj) {
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
          return false;
      }
      let hasStrings = false;
      for (const value of Object.values(obj)) {
          if (typeof value === 'object' && value !== null) {
              return false; 
          }
          if (Array.isArray(value)) {
              return false;
          }
          if (typeof value === 'string' && value.length > 0) {
              hasStrings = true;
          }
      }
      return hasStrings;
  }

  getFileNameFromPath(filePath) {
      const parts = filePath.split('/');
      return parts[parts.length - 1] || filePath;
  }

  getSourceFromPath(path) {
      const parts = path.split('/');
      return parts[0] || 'general';
  }

  formatKeyAsTitle(key) {
      return key
          .replace(/_/g, ' ')
          .replace(/-/g, ' ') 
          .replace(/([^ ])([A-Z])/g, '$1 $2')
          .split(' ')
          .filter(word => word.length > 0)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim();
  }

  async getEmbedding(text) {
      try {
          const truncatedText = text.length > 2000 ? text.substring(0, 2000) : text;
          const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
              {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      model: "models/gemini-embedding-001",
                      content: { parts: [{ text: truncatedText }] },
                      outputDimensionality: 768
                  })
              }
          );
          if (!response.ok) {
              throw new Error(`Embedding API error: ${response.status}`);
          }
          const data = await response.json();
          return data.embedding.values;
      } catch (error) {
          console.error("Error generating embedding:", error.message);
          return new Array(768).fill(0);
      }
  }

  // --- REPLACED: search now uses LanceDB ---
  async search(question, topK = 100) {
      if (!this.isInitialized || !this.table) {
          console.warn("⚠️ RAG system not initialized or table missing");
          return [];
      }
      
      console.log(`🔍 Searching with LanceDB: "${question}"`);
      const questionEmbedding = await this.getEmbedding(question);
      
      try {
          // LanceDB search
          // fetch plenty of candidates (e.g. 100) to allow for permission filtering
          // limit is applied AFTER scoring
          const results = await this.table.search(questionEmbedding)
              .limit(topK * 5) // Fetch 5x requested to ensure we have enough after permissions
              .execute();
          
          console.log(`📊 Found ${results.length} matches from LanceDB`);
          
          // Map to format expected by rest of the system
          // LanceDB result has _distance. We want score (similarity).
          // Assuming normalized embeddings and L2 distance (default): 
          // Cosine Sim = 1 - (Distance^2 / 2) ? Or just use 1 - distance if metric is cosine.
          // LanceDB default metric is 'l2'.
          // Let's assume 1 / (1 + distance) or similar for score if we want 0-1.
          // Or just use (1 - distance) as a rough proxy for now.
          // Actually, let's normalize the output score.
          
          return results.map(r => ({
              text: r.text,
              path: r.path,
              context: r.context,
              parentContext: r.parentContext,
              source: r.source,
              fileName: r.fileName,
              isAggregate: r.isAggregate,
              documentId: r.documentId,
              categoryId: r.categoryId,
              subcategoryId: r.subcategoryId,
              sourceId: r.sourceId,
              score: 2 - (r._distance || 0) // Approximation for L2 distance (lower is better, so we inverse)
          })).filter(r => r.score > 0.1) // Keep threshold
             .sort((a, b) => b.score - a.score); // Re-sort by score descending
          
      } catch (error) {
          console.error("❌ LanceDB Search Error:", error);
          return [];
      }
  }

  // --- FIXED: Permission Filtering Methods ---
  filterByPermissions(results, userPermissions) {
      if (userPermissions === null) {
          console.log("🔒 No user permissions (null) - denying all access");
          return [];
      }
      
      if (userPermissions === 'FULL_ACCESS') {
          return results;
      }
      
      if (Array.isArray(userPermissions) && userPermissions.length === 0) {
          console.log("🔒 User has empty permissions array - denying all access");
          return [];
      }

      const hasFullAccess = userPermissions.some(p => 
        p.category_id === null && p.subcategory_id === null && p.source_id === null
      );
      
      if (hasFullAccess) {
          return results;
      }

      const filtered = results.filter(chunk => {
          return this.isDocumentAllowed(chunk, userPermissions);
      });

      console.log(`🔒 Filtered ${results.length} results → ${filtered.length} accessible results`);
      return filtered;
  }

  isDocumentAllowed(chunk, userPermissions) {
      if (userPermissions === 'FULL_ACCESS') return true;
      if (Array.isArray(userPermissions)) {
          if (userPermissions.some(p => p.category_id === null && p.subcategory_id === null && p.source_id === null)) {
              return true;
          }
          const chunkCategoryId = chunk.categoryId;
          const chunkSubcategoryId = chunk.subcategoryId;
          const chunkSourceId = chunk.sourceId;

          return userPermissions.some(perm => {
              if (perm.source_id) return chunkSourceId === perm.source_id;
              if (perm.subcategory_id) return chunkSubcategoryId === perm.subcategory_id;
              if (perm.category_id && !perm.subcategory_id && !perm.source_id) {
                  return chunkCategoryId === perm.category_id;
              }
              return false;
          });
      }
      return false;
  }
  
  async getContext(question, topK = 20, userPermissions = null) {
    // 1. Get ALL candidates from LanceDB (already fetched more than topK in search)
    const results = await this.search(question, topK);
    
    if (results.length === 0) {
        return {
          contextString: "No relevant information found in the knowledge base.",
          documentIds: [],
          sourceMap: {},
          categoryMap: {},
          isMissingKnowledge: true,
          isAccessDenied: false
        };
    }
    
    // 2. Apply Permission Filtering
    let filteredResults = results;
    
    if (userPermissions !== null) {
        if (userPermissions === null || (Array.isArray(userPermissions) && userPermissions.length === 0)) {
            const restrictedDocs = [...new Set(results.map(r => r.fileName))];
            return {
                contextString: `[SYSTEM: NO_ACCESS] No accessible information found. Restricted: ${restrictedDocs.join(', ')}.`,
                documentIds: [],
                sourceMap: {},
                categoryMap: {},
                isMissingKnowledge: false,
                isAccessDenied: true
            };
        }
        
        if (userPermissions !== 'FULL_ACCESS') {
            filteredResults = this.filterByPermissions(results, userPermissions);
        }
        
        if (filteredResults.length === 0) {
            const restrictedDocs = [...new Set(results.map(r => r.fileName))];
            return {
                contextString: `[SYSTEM: NO_ACCESS] Information exists but is restricted. Restricted: ${restrictedDocs.join(', ')}.`,
                documentIds: [],
                sourceMap: {},
                categoryMap: {},
                isMissingKnowledge: false,
                isAccessDenied: true
            };
        }
    }
    
    // 3. Slice to final Top K
    const finalResults = filteredResults.slice(0, topK);

    const allUniqueDocIds = [...new Set(finalResults.map(r => r.documentId).filter(id => id > 0))];
    console.log(`🆔 Found ${allUniqueDocIds.length} unique document IDs (top ${topK})`);
    
    const groupedByFile = {};
    finalResults.forEach(result => {
        const fileName = result.fileName || 'general';
        if (!groupedByFile[fileName]) groupedByFile[fileName] = [];
        groupedByFile[fileName].push(result);
    });
    
    const contextParts = [];
    const sourceMap = {};
    const categoryMap = {};
    
    for (const [fileName, chunks] of Object.entries(groupedByFile)) {
        const sourceName = this.formatKeyAsTitle(fileName);
        const pathParts = chunks[0]?.path?.split('/') || [];
        const categoryName = pathParts[0] || 'General';
        let formattedCategory = (categoryName.includes(' ') || categoryName === 'General') 
            ? categoryName 
            : this.formatKeyAsTitle(categoryName);

        contextParts.push(`\n### Context from: ${sourceName}\n`);
        contextParts.push(`**Category:** ${formattedCategory}\n\n`);
        
        if (chunks.length > 0 && chunks[0].documentId > 0) {
            sourceMap[sourceName] = chunks[0].documentId;
            categoryMap[sourceName] = formattedCategory;
        }
        
        const aggregateChunks = chunks.filter(c => c.isAggregate);
        const regularChunks = chunks.filter(c => !c.isAggregate);
        [...aggregateChunks, ...regularChunks].forEach(chunk => {
            contextParts.push(chunk.text + '\n');
        });
    }
    
    const finalContext = contextParts.join('\n');
    return { 
      contextString: finalContext,
      documentIds: allUniqueDocIds,
      sourceMap: sourceMap,
      categoryMap: categoryMap,
      isMissingKnowledge: false,
      isAccessDenied: false
    };
  }
  
  getFolderStats() {
      const stats = {
          totalFiles: Object.keys(this.knowledgeBase).length,
          categories: {},
          totalChunks: this.chunks.length,
          aggregateChunks: this.chunks.filter(c => c.isAggregate).length
      };
      for (const filePath of Object.keys(this.knowledgeBase)) {
          const folderInfo = this.extractFolderInfo(filePath);
          if (folderInfo.category) {
              if (!stats.categories[folderInfo.category]) {
                  stats.categories[folderInfo.category] = {
                      files: 0,
                      subcategories: {}
                  };
              }
              stats.categories[folderInfo.category].files++;
              if (folderInfo.subcategory) {
                  if (!stats.categories[folderInfo.category].subcategories[folderInfo.subcategory]) {
                      stats.categories[folderInfo.category].subcategories[folderInfo.subcategory] = 0;
                  }
                  stats.categories[folderInfo.category].subcategories[folderInfo.subcategory]++;
              }
          }
      }
      return stats;
  }

  extractFolderInfo(filePath) {
      const parts = filePath.split('/');
      if (parts.length >= 3) {
          return {
              category: parts[0],
              subcategory: parts[1],
              filename: parts[2]
          };
      }
      else if (parts.length === 2) {
          return {
              category: parts[0],
              filename: parts[1]
          };
      }
      else {
          return {
              filename: parts[0]
          };
      }
  }
}

// Initialize services
export const databaseCacheManager = new DatabaseCacheManager(pool);
export const ragSystem = new MultiFolderSemanticRAG();

// Helper function to get user permissions from database
export async function getUserPermissions(userEmail) {
    if (!userEmail) {
        console.log("⚠️ No user email provided - GUEST USER MODE");
        return null;
    }

    try {
        const [employee] = await pool.execute(
            'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
            [userEmail]
        );
        
        if (employee.length === 0) {
            console.log(`⚠️ No active employee found for ${userEmail} - treating as GUEST`);
            return null;
        }
        
        const employeeId = employee[0].id;
        
        const [permissions] = await pool.execute(`
            SELECT 
                category_id, 
                subcategory_id, 
                source_id,
                (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL) as has_full_access
            FROM employee_access_permissions 
            WHERE employee_id = ?
        `, [employeeId]);
        
        const hasFullAccess = permissions.some(p => p.has_full_access);
        
        if (hasFullAccess) {
            return 'FULL_ACCESS';
        }
        
        if (permissions.length === 0) {
            return []; 
        }
        
        return permissions;
        
    } catch (error) {
        console.error('❌ Error loading user permissions:', error);
        return null;
    }
}
