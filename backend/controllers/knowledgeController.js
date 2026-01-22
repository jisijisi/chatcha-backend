// backend/controllers/knowledgeController.js
import { pool } from '../config/database.js';
import { databaseCacheManager } from '../services/ragService.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as xlsx from 'xlsx';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// AI FILE CONVERSION (RAG-OPTIMIZED)
// ==========================================

export const convertFileToJson = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY not found in environment");
      return res.status(500).json({ error: "AI service not configured. Please contact administrator." });
    }

    console.log("📄 Converting file:", req.file.originalname, "Size:", req.file.size, "Type:", req.file.mimetype);

    const originalName = req.file.originalname || '';
    const mimeType = req.file.mimetype;
    const ext = path.extname(originalName).toLowerCase();

    let plainTextContent = null;

    try {
      if (ext === '.docx' || ext === '.doc') {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        plainTextContent = (result && result.value) ? result.value : null;
      } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
        try {
          const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
          const parts = [];
          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            parts.push(`Sheet: ${sheetName}`);
            rows.forEach((row) => {
              parts.push(row.map((c) => (c === undefined || c === null) ? '' : String(c)).join('\t'));
            });
            parts.push('\n');
          });
          plainTextContent = parts.join('\n');
        } catch (e) {
          plainTextContent = null;
        }
      } else if (ext === '.pptx' || ext === '.ppt') {
        try {
          const zip = new AdmZip(req.file.buffer);
          const entries = zip.getEntries();
          const slideTexts = [];
          for (const entry of entries) {
            const name = entry.entryName;
            if (/^ppt\/slides\/slide[0-9]+\.xml$/.test(name)) {
              const xml = entry.getData().toString('utf8');
              // quick extraction of <a:t> nodes
              const re = /<a:t[^>]*>([^<]*)<\/a:t>/g;
              let m;
              const buf = [];
              while ((m = re.exec(xml)) !== null) {
                buf.push(m[1]);
              }
              if (buf.length) slideTexts.push(buf.join(' '));
            }
          }
          plainTextContent = slideTexts.join('\n\n');
        } catch (e) {
          plainTextContent = null;
        }
      }
    } catch (e) {
      console.warn('Failed to pre-extract office content:', e.message || e);
      plainTextContent = null;
    }

    const fileBase64 = req.file.buffer.toString("base64");

    const prompt = `
    Analyze this document and convert it into a structured JSON format optimized for knowledge retrieval.

    CRITICAL: Return ONLY valid JSON with NO markdown, NO code blocks, NO explanations.

    Required JSON Structure:
    {
      "title": "Clear, descriptive document title",
      "content": "Full document content in plain text format. Include ALL details, procedures, steps, and information. Break into clear paragraphs separated by double newlines (\\n\\n). Make this comprehensive and detailed.",
      "metadata": {
        "document_type": "policy|procedure|guide|manual|announcement|form|other",
        "summary": "Brief 2-3 sentence summary of what this document covers",
        "key_topics": ["topic1", "topic2", "topic3"],
        "version": "version number if present, otherwise null",
        "effective_date": "YYYY-MM-DD if present, otherwise null",
        "department": "relevant department if mentioned, otherwise null"
      }
    }

    IMPORTANT FORMATTING RULES:
    1. The "content" field must be PLAIN TEXT, not nested JSON
    2. Use \\n\\n to separate paragraphs in the content
    3. Include ALL information from the document in the content field
    4. For structured data (lists, tables), convert to readable paragraph format
    5. For step-by-step procedures, number them clearly: "Step 1: ...", "Step 2: ..."
    6. Preserve all important details, names, dates, numbers, and policies
    7. Make the content field comprehensive - this is what the AI will search through

    Convert the uploaded document following this exact structure.
    `;

    try {
      // --- 1. FETCH DYNAMIC AI MODEL FROM DB ---
      let activeModel = "gemini-2.0-flash-exp"; // Default fallback
      try {
          const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
          if (settings.length > 0 && settings[0].ai_model) {
              activeModel = settings[0].ai_model;
          }
      } catch (e) { 
          console.warn("Using default model, DB fetch failed:", e.message); 
      }
      
      console.log(`🤖 Using AI Model for Conversion: ${activeModel}`);
      
      const model = genAI.getGenerativeModel({ 
        model: activeModel,
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      let result;
      if (plainTextContent && plainTextContent.trim() !== '') {
        const promptWithContent = `${prompt}\n\n---DOCUMENT_CONTENT_START---\n${plainTextContent}`;
        result = await model.generateContent([promptWithContent]);
      } else {
        result = await model.generateContent([
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64
            }
          },
          prompt
        ]);
      }

      const response = result.response;
      let jsonText = response.text();
      
      if (!jsonText || jsonText.trim() === '') {
        throw new Error("AI returned empty response");
      }

      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Validate JSON
      try {
        const parsedJson = JSON.parse(jsonText);
        console.log("✅ JSON validation successful");
        
        if (!parsedJson.title || !parsedJson.content) {
          throw new Error("Missing required fields: title and content are mandatory");
        }
        
        if (typeof parsedJson.content !== 'string') {
          console.warn("⚠️ Content is not plain text, attempting to convert...");
          parsedJson.content = JSON.stringify(parsedJson.content);
        }
        
        console.log("📊 Document details:");
        console.log("   Title:", parsedJson.title);
        console.log("   Content length:", parsedJson.content.length, "characters");
        
      } catch (parseError) {
        console.error("❌ Invalid JSON returned:", jsonText.substring(0, 200));
        throw new Error("AI returned invalid JSON. Please try again.");
      }

      console.log("✅ File converted successfully");
      res.json({ success: true, json: jsonText });

    } catch (apiError) {
      console.error("❌ Gemini API Error:", apiError);
      let errorMessage = "Conversion failed. " + apiError.message;
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error("❌ Final Conversion Error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to convert file. Please try again."
    });
  }
};

// ==========================================
// DOCUMENTS MANAGEMENT
// ==========================================

export const getDocuments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const categoryId = req.query.category || '';

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (search) {
      whereClause += ' AND (kd.title LIKE ?)';
      params.push(`%${search}%`);
    }

    if (categoryId) {
      whereClause += ' AND kc.id = ?';
      params.push(categoryId);
    }

    // Get total count
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM knowledge_documents kd
      JOIN knowledge_subcategories ksc ON kd.subcategory_id = ksc.id
      JOIN knowledge_categories kc ON ksc.category_id = kc.id
      ${whereClause}
    `, params);
    
    const total = countResult[0].total;

    // Get paginated documents
    // Using direct injection for limit/offset to avoid MySQL prepared statement issues
    const [documents] = await pool.execute(`
      SELECT 
        kd.id,
        kd.title,
        kd.slug,
        kd.status,
        kd.created_at,
        kd.updated_at,
        kc.name as category_name,
        ksc.name as subcategory_name
      FROM knowledge_documents kd
      JOIN knowledge_subcategories ksc ON kd.subcategory_id = ksc.id
      JOIN knowledge_categories kc ON ksc.category_id = kc.id
      ${whereClause}
      ORDER BY kd.updated_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `, params);

    res.json({ 
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Documents error:', error);
    res.status(500).json({ error: 'Failed to load documents' });
  }
};

export const getDocument = async (req, res) => {
  const documentId = req.params.id;
  try {
    const [documents] = await pool.execute(`
      SELECT 
        kd.id,
        kd.title,
        kd.content,
        kd.slug,
        kd.status,
        kd.created_at,
        kd.updated_at,
        kd.subcategory_id,
        kc.name as category_name,
        ksc.name as subcategory_name
      FROM knowledge_documents kd
      JOIN knowledge_subcategories ksc ON kd.subcategory_id = ksc.id
      JOIN knowledge_categories kc ON ksc.category_id = kc.id
      WHERE kd.id = ?
    `, [documentId]);

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ document: documents[0] });
  } catch (error) {
    console.error('❌ Get document error:', error);
    res.status(500).json({ error: 'Failed to load document details' });
  }
};

export const createDocument = async (req, res) => {
  const { title, subcategory_id, content, status } = req.body;
  try {
    if (!title || !subcategory_id || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide title, subcategory_id, and content.' 
      });
    }
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const [result] = await pool.execute(
      `INSERT INTO knowledge_documents 
       (title, slug, subcategory_id, content, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, slug, subcategory_id, content, status || 'draft'] 
    );
    databaseCacheManager.clearCache();
    res.json({ 
      success: true, 
      id: result.insertId,
      message: 'Document created successfully' 
    });
  } catch (error) {
    console.error('❌ Create document error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
};

export const updateDocument = async (req, res) => {
  const { title, subcategory_id, content, status } = req.body;
  const documentId = req.params.id;
  try {
    if (!title || !subcategory_id || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide title, subcategory_id, and content.' 
      });
    }
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    await pool.execute(
      `UPDATE knowledge_documents 
       SET title = ?, slug = ?, subcategory_id = ?, content = ?, 
           status = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, slug, subcategory_id, content, status, documentId]
    );
    databaseCacheManager.clearCache();
    res.json({ 
      success: true,
      message: 'Document updated successfully' 
    });
  } catch (error) {
    console.error('❌ Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
};

export const deleteDocument = async (req, res) => {
  const documentId = req.params.id;
  try {
    await pool.execute(
      `DELETE FROM knowledge_documents WHERE id = ?`,
      [documentId]
    );
    databaseCacheManager.clearCache();
    res.json({ 
      success: true,
      message: 'Document deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

// ==========================================
// CATEGORIES MANAGEMENT
// ==========================================

export const getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Total count
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total FROM knowledge_categories ${whereClause}
    `, params);
    const total = countResult[0].total;

    // Paginated results
    const [categories] = await pool.execute(`
      SELECT id, name, description FROM knowledge_categories 
      ${whereClause}
      ORDER BY name
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `, params);

    res.json({ 
      categories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({ error: 'Failed to load categories' });
  }
};

export const createCategory = async (req, res) => {
  const { name, description } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  
  try {
    const [result] = await pool.execute(
      `INSERT INTO knowledge_categories (name, description, created_at)
       VALUES (?, ?, NOW())`,
      [name.trim(), (description || '').trim()]
    );
    
    res.json({ 
      success: true, 
      id: result.insertId,
      message: 'Category created successfully' 
    });
    
  } catch (error) {
    console.error('❌ Create category error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Failed to create category' });
  }
};

export const updateCategory = async (req, res) => {
  const { name, description } = req.body;
  const categoryId = req.params.id;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  
  try {
    const [result] = await pool.execute(
      `UPDATE knowledge_categories 
       SET name = ?, description = ?
       WHERE id = ?`,
      [name.trim(), (description || '').trim(), categoryId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ 
      success: true,
      message: 'Category updated successfully' 
    });
    
  } catch (error) {
    console.error('❌ Update category error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Failed to update category' });
  }
};

export const deleteCategory = async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const [subcategories] = await pool.execute(
      `SELECT COUNT(*) as count FROM knowledge_subcategories WHERE category_id = ?`,
      [categoryId]
    );
    
    if (subcategories[0].count > 0) {
      return res.status(409).json({ 
        error: `Cannot delete category. It has ${subcategories[0].count} subcategories. Please delete or reassign them first.` 
      });
    }
    
    const [result] = await pool.execute(
      `DELETE FROM knowledge_categories WHERE id = ?`,
      [categoryId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json({ 
      success: true,
      message: 'Category deleted successfully' 
    });
    
  } catch (error) {
    console.error('❌ Delete category error:', error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ 
        error: 'Cannot delete category. It is referenced by other records.' 
      });
    }
    res.status(500).json({ error: 'Failed to delete category' });
  }
};

export const getCategoryStats = async (req, res) => {
  const categoryId = req.params.id;
  
  try {
    const [categoryData] = await pool.execute(
      `SELECT * FROM knowledge_categories WHERE id = ?`,
      [categoryId]
    );
    
    if (categoryData.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const [subcatCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM knowledge_subcategories WHERE category_id = ?`,
      [categoryId]
    );
    
    const [docCount] = await pool.execute(
      `SELECT COUNT(*) as count 
       FROM knowledge_documents kd
       JOIN knowledge_subcategories ksc ON kd.subcategory_id = ksc.id
       WHERE ksc.category_id = ?`,
      [categoryId]
    );
    
    res.json({
      category: categoryData[0],
      subcategories: subcatCount[0].count,
      documents: docCount[0].count
    });
    
  } catch (error) {
    console.error('❌ Get category stats error:', error);
    res.status(500).json({ error: 'Failed to load category statistics' });
  }
};

// ==========================================
// SUBCATEGORIES MANAGEMENT
// ==========================================

export const getSubcategories = async (req, res) => {
  try {
    const [subcategories] = await pool.execute(
      `SELECT id, name FROM knowledge_subcategories 
       WHERE category_id = ? ORDER BY name`,
      [req.params.categoryId]
    );
    res.json({ subcategories });
  } catch (error) {
    console.error('❌ Subcategories error:', error);
    res.status(500).json({ error: 'Failed to load subcategories' });
  }
};

export const getAllSubcategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const categoryId = req.query.category || '';

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (search) {
      whereClause += ' AND (ksc.name LIKE ? OR ksc.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (categoryId) {
      whereClause += ' AND ksc.category_id = ?';
      params.push(categoryId);
    }

    // Total count
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total 
      FROM knowledge_subcategories ksc
      JOIN knowledge_categories kc ON ksc.category_id = kc.id
      ${whereClause}
    `, params);
    const total = countResult[0].total;

    // Paginated results
    const [subcategories] = await pool.execute(`
      SELECT 
        ksc.id, 
        ksc.name, 
        ksc.description, 
        ksc.category_id,
        kc.name as category_name
      FROM knowledge_subcategories ksc
      JOIN knowledge_categories kc ON ksc.category_id = kc.id
      ${whereClause}
      ORDER BY kc.name, ksc.name
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `, params);

    res.json({ 
      subcategories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Get all subcategories error:', error);
    res.status(500).json({ error: 'Failed to load subcategories' });
  }
};

export const createSubcategory = async (req, res) => {
  const { name, category_id, description } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Subcategory name is required' });
  }
  
  if (!category_id) {
    return res.status(400).json({ error: 'Parent category is required' });
  }
  
  try {
    const [parentCategory] = await pool.execute(
      `SELECT id FROM knowledge_categories WHERE id = ?`,
      [category_id]
    );
    
    if (parentCategory.length === 0) {
      return res.status(404).json({ error: 'Parent category not found' });
    }
    
    const [result] = await pool.execute(
      `INSERT INTO knowledge_subcategories (name, category_id, description, created_at)
       VALUES (?, ?, ?, NOW())`,
      [name.trim(), category_id, (description || '').trim()]
    );
    
    res.json({ 
      success: true, 
      id: result.insertId,
      message: 'Subcategory created successfully' 
    });
    
  } catch (error) {
    console.error('❌ Create subcategory error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Subcategory name already exists in this category' });
    }
    res.status(500).json({ error: 'Failed to create subcategory' });
  }
};

export const updateSubcategory = async (req, res) => {
  const { name, category_id, description } = req.body;
  const subcategoryId = req.params.id;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Subcategory name is required' });
  }
  
  if (!category_id) {
    return res.status(400).json({ error: 'Parent category is required' });
  }
  
  try {
    const [parentCategory] = await pool.execute(
      `SELECT id FROM knowledge_categories WHERE id = ?`,
      [category_id]
    );
    
    if (parentCategory.length === 0) {
      return res.status(404).json({ error: 'Parent category not found' });
    }
    
    const [result] = await pool.execute(
      `UPDATE knowledge_subcategories 
       SET name = ?, category_id = ?, description = ?
       WHERE id = ?`,
      [name.trim(), category_id, (description || '').trim(), subcategoryId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    res.json({ 
      success: true,
      message: 'Subcategory updated successfully' 
    });
    
  } catch (error) {
    console.error('❌ Update subcategory error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Subcategory name already exists in this category' });
    }
    res.status(500).json({ error: 'Failed to update subcategory' });
  }
};

export const deleteSubcategory = async (req, res) => {
  const subcategoryId = req.params.id;
  
  try {
    const [documents] = await pool.execute(
      `SELECT COUNT(*) as count FROM knowledge_documents WHERE subcategory_id = ?`,
      [subcategoryId]
    );
    
    if (documents[0].count > 0) {
      return res.status(409).json({ 
        error: `Cannot delete subcategory. It has ${documents[0].count} documents. Please delete or reassign them first.` 
      });
    }
    
    const [result] = await pool.execute(
      `DELETE FROM knowledge_subcategories WHERE id = ?`,
      [subcategoryId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    res.json({ 
      success: true,
      message: 'Subcategory deleted successfully' 
    });
    
  } catch (error) {
    console.error('❌ Delete subcategory error:', error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ 
        error: 'Cannot delete subcategory. It is referenced by other records.' 
      });
    }
    res.status(500).json({ error: 'Failed to delete subcategory' });
  }
};

export const getSubcategoryStats = async (req, res) => {
  const subcategoryId = req.params.id;
  
  try {
    const [subcategoryData] = await pool.execute(
      `SELECT ksc.*, kc.name as category_name
       FROM knowledge_subcategories ksc
       JOIN knowledge_categories kc ON ksc.category_id = kc.id
       WHERE ksc.id = ?`,
      [subcategoryId]
    );
    
    if (subcategoryData.length === 0) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    const [docCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM knowledge_documents WHERE subcategory_id = ?`,
      [subcategoryId]
    );
    
    res.json({
      subcategory: subcategoryData[0],
      documents: docCount[0].count
    });
    
  } catch (error) {
    console.error('❌ Get subcategory stats error:', error);
    res.status(500).json({ error: 'Failed to load subcategory statistics' });
  }
};

// ==========================================
// BULK OPERATIONS
// ==========================================

export const bulkUpdateStatus = async (req, res) => {
  const { document_ids, status } = req.body;
  
  if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
    return res.status(400).json({ error: 'Document IDs array is required' });
  }
  
  if (!status || !['draft', 'published', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Valid status is required (draft, published, or archived)' });
  }
  
  try {
    const placeholders = document_ids.map(() => '?').join(',');
    const [result] = await pool.execute(
      `UPDATE knowledge_documents 
       SET status = ?, updated_at = NOW()
       WHERE id IN (${placeholders})`,
      [status, ...document_ids]
    );
    
    databaseCacheManager.clearCache();
    
    res.json({ 
      success: true,
      updated: result.affectedRows,
      message: `${result.affectedRows} documents updated to ${status}` 
    });
    
  } catch (error) {
    console.error('❌ Bulk status update error:', error);
    res.status(500).json({ error: 'Failed to update document statuses' });
  }
};

export const bulkDeleteDocuments = async (req, res) => {
  const { document_ids } = req.body;
  
  if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
    return res.status(400).json({ error: 'Document IDs array is required' });
  }
  
  try {
    const placeholders = document_ids.map(() => '?').join(',');
    const [result] = await pool.execute(
      `DELETE FROM knowledge_documents WHERE id IN (${placeholders})`,
      document_ids
    );
    
    databaseCacheManager.clearCache();
    
    res.json({ 
      success: true,
      deleted: result.affectedRows,
      message: `${result.affectedRows} documents deleted` 
    });
    
  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete documents' });
  }
};
