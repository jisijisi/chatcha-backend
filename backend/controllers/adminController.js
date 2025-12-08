// controllers/adminController.js
import { pool } from '../config/database.js';
import { databaseCacheManager, ragSystem } from '../services/ragService.js';
import * as xlsx from 'xlsx'; 
import os from 'os';

// ==========================================
// AUTHENTICATION
// ==========================================

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const [adminRows] = await pool.execute(
      `SELECT id, name, email, department, position 
       FROM employees 
       WHERE email = ? AND is_active = TRUE`,
      [email]
    );
    
    if (adminRows.length === 0) {
      console.warn(`Admin login failed: No active user for ${email}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials or user inactive' 
      });
    }
    
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (password !== ADMIN_PASSWORD) {
      console.warn(`Admin login failed: Invalid password for ${email}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    const admin = adminRows[0];
    const token = `admin_token_${Date.now()}_${admin.id}`;
    
    console.log(`✅ Admin user logged in: ${admin.email} (ID: ${admin.id})`);
    
    res.json({
      success: true,
      session: {
        email: admin.email,
        name: admin.name,
        role: 'admin',
        token: token,
        loginTime: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
};

// ==========================================
// DASHBOARD
// ==========================================

export const getDashboardStats = async (req, res) => {
  try {
    const [messagesToday] = await pool.execute(
      `SELECT COUNT(*) as count FROM user_chats WHERE message_timestamp >= DATE(NOW())`
    );
    const [activeUsersToday] = await pool.execute(
      `SELECT COUNT(DISTINCT employee_id) as count FROM user_chats WHERE message_timestamp >= DATE(NOW())`
    );
    const [newSessionsToday] = await pool.execute(`
      SELECT COUNT(session_id) as count FROM (
        SELECT session_id, DATE(MIN(message_timestamp)) as start_date 
        FROM user_chats 
        GROUP BY session_id
      ) as sessions 
      WHERE start_date = DATE(NOW())
    `);
    const [draftsPendingReview] = await pool.execute(
      `SELECT COUNT(*) as count FROM knowledge_documents WHERE status = 'draft'`
    );
    res.json({
      messagesToday: messagesToday[0].count,
      activeUsersToday: activeUsersToday[0].count,
      newSessionsToday: newSessionsToday[0].count,
      draftsPendingReview: draftsPendingReview[0].count
    });
  } catch (error) {
    console.error('❌ Dashboard Stats Error:', error);
    res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
};

export const getDashboardCharts = async (req, res) => {
  try {
    const [messagesLast7Days] = await pool.execute(`
      SELECT DATE(message_timestamp) as day, COUNT(*) as count 
      FROM user_chats 
      WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
      GROUP BY day 
      ORDER BY day ASC;
    `);
    const [documentStatus] = await pool.execute(`
      SELECT status, COUNT(*) as count 
      FROM knowledge_documents 
      GROUP BY status;
    `);
    res.json({
      messagesLast7Days,
      documentStatus
    });
  } catch (error) {
    console.error('❌ Dashboard Charts Error:', error);
    res.status(500).json({ error: 'Failed to load chart data' });
  }
};

export const getDashboardActivity = async (req, res) => {
  try {
    const [recentActivity] = await pool.execute(`
      SELECT 
        e.email,
        uc.user_message,
        uc.message_timestamp
      FROM user_chats uc
      LEFT JOIN employees e ON uc.employee_id = e.id
      ORDER BY uc.message_timestamp DESC
      LIMIT 10
    `);
    const formattedActivity = recentActivity.map(item => ({
      ...item,
      email: item.email || 'Unknown User'
    }));
    const [mostActiveUsers] = await pool.execute(`
      SELECT 
        e.name, 
        e.email, 
        COUNT(*) as message_count 
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id 
      WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
      GROUP BY e.id, e.name, e.email
      ORDER BY message_count DESC 
      LIMIT 5;
    `);
    res.json({
      recentActivity: formattedActivity,
      mostActiveUsers
    });
  } catch (error) {
    console.error('❌ Dashboard Activity Error:', error);
    res.status(500).json({ error: 'Failed to load activity tables' });
  }
};

export const getDashboardEmployees = async (req, res) => {
  try {
    const [totalEmployees] = await pool.execute(
      `SELECT COUNT(*) as count FROM employees WHERE is_active = TRUE`
    );
    res.json({
      totalEmployees: totalEmployees[0].count
    });
  } catch (error) {
    console.error('❌ Dashboard Employees Error:', error);
    res.status(500).json({ error: 'Failed to load employee count' });
  }
};

export const getKnowledgeUsage = async (req, res) => {
  try {
    const { timeframe = 'overall' } = req.query;
    
    let dateFilter = '';
    
    switch(timeframe) {
      case 'daily':
        dateFilter = 'WHERE uc.message_timestamp >= DATE(NOW())';
        break;
      case 'monthly':
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        break;
      case 'yearly':
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
        break;
      case 'overall':
      default:
        dateFilter = 'WHERE 1=1';
    }
    
    console.log(`📊 [Knowledge Usage] Loading for timeframe: ${timeframe}`);
    
    // STEP 1: Get all chat messages with their accessed_categories
    const [chatMessages] = await pool.execute(`
      SELECT 
        uc.id,
        uc.accessed_categories,
        uc.message_timestamp
      FROM user_chats uc
      ${dateFilter}
        AND uc.accessed_categories IS NOT NULL 
        AND uc.accessed_categories != '{}'
        AND uc.accessed_categories != 'null'
        AND JSON_LENGTH(uc.accessed_categories) > 0
    `);

    console.log(`📊 [Knowledge Usage] Found ${chatMessages.length} messages with source tracking`);

    // Handle empty data case
    if (chatMessages.length === 0) {
      console.log('ℹ️ [Knowledge Usage] No messages found for this timeframe');
      return res.json({
        categoryUsage: [],
        subcategoryUsage: [],
        topDocuments: [],
        timeframe
      });
    }

    // STEP 2: Parse JSON and count document access
    const documentAccessCount = {};
    const documentDetails = {}; // Store document info: {id: {name, category}}

    chatMessages.forEach(msg => {
      try {
        const categories = typeof msg.accessed_categories === 'string' 
          ? JSON.parse(msg.accessed_categories) 
          : msg.accessed_categories;
        
        // Extract documents array
        if (categories.documents && Array.isArray(categories.documents)) {
          categories.documents.forEach(doc => {
            if (doc && typeof doc === 'object' && doc.id) {
              const docId = doc.id;
              
              // Count access
              documentAccessCount[docId] = (documentAccessCount[docId] || 0) + 1;
              
              // Store document details
              if (!documentDetails[docId]) {
                documentDetails[docId] = {
                  name: doc.name || `Document ${docId}`,
                  category: doc.category || 'General'
                };
              }
            }
          });
        }
      } catch (e) {
        console.warn('⚠️ [Knowledge Usage] Failed to parse accessed_categories:', e.message);
      }
    });

    const uniqueDocIds = Object.keys(documentAccessCount);
    console.log(`📄 [Knowledge Usage] Unique document IDs: [${uniqueDocIds.join(', ')}]`);
    console.log(`📊 [Knowledge Usage] Access counts:`, documentAccessCount);

    // Handle case where no documents were accessed
    if (uniqueDocIds.length === 0) {
      console.log('ℹ️ [Knowledge Usage] No documents accessed in this timeframe');
      return res.json({
        categoryUsage: [],
        subcategoryUsage: [],
        topDocuments: [],
        timeframe
      });
    }

    // STEP 3: Build category and subcategory aggregations
    const categoryMap = {};
    const subcategoryMap = {};
    const topDocs = [];

    uniqueDocIds.forEach(docId => {
      const docInfo = documentDetails[docId];
      const accessCount = documentAccessCount[docId];
      
      if (docInfo) {
        const category = docInfo.category;
        const subcategory = `${category} - ${docInfo.name}`;
        
        // Aggregate by category
        categoryMap[category] = (categoryMap[category] || 0) + accessCount;
        
        // Aggregate by subcategory (document level)
        subcategoryMap[subcategory] = (subcategoryMap[subcategory] || 0) + accessCount;
        
        // Add to top documents list
        topDocs.push({
          document_title: docInfo.name,
          category: category,
          access_count: accessCount
        });
      }
    });

    // STEP 4: Format output for charts
    const categoryUsage = Object.entries(categoryMap)
      .map(([name, count]) => ({ 
        category_name: name, 
        access_count: count 
      }))
      .sort((a, b) => b.access_count - a.access_count)
      .slice(0, 10);

    const subcategoryUsage = Object.entries(subcategoryMap)
      .map(([name, count]) => ({ 
        subcategory_name: name, 
        access_count: count 
      }))
      .sort((a, b) => b.access_count - a.access_count)
      .slice(0, 10);

    const topDocuments = topDocs
      .sort((a, b) => b.access_count - a.access_count)
      .slice(0, 5);

    console.log('✅ [Knowledge Usage] Category Usage:', categoryUsage);
    console.log('✅ [Knowledge Usage] Subcategory Usage:', subcategoryUsage);
    console.log('✅ [Knowledge Usage] Top Documents:', topDocuments);

    res.json({
      categoryUsage,
      subcategoryUsage,
      topDocuments,
      timeframe
    });
    
  } catch (error) {
    console.error('❌ [Knowledge Usage] Error:', error);
    console.error('❌ [Knowledge Usage] Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to load knowledge usage data',
      details: error.message 
    });
  }
};

export const getDashboardStatsFiltered = async (req, res) => {
  try {
    const { timeframe = 'overall' } = req.query;
    
    let dateFilter = '';
    switch(timeframe) {
      case 'daily':
        dateFilter = 'WHERE message_timestamp >= DATE(NOW())';
        break;
      case 'monthly':
        dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        break;
      case 'yearly':
        dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
        break;
      case 'overall':
      default:
        dateFilter = '';
    }
    
    const [messages] = await pool.execute(
      `SELECT COUNT(*) as count FROM user_chats ${dateFilter}`
    );
    
    const [activeUsers] = await pool.execute(
      `SELECT COUNT(DISTINCT employee_id) as count FROM user_chats ${dateFilter}`
    );

    const [newSessions] = await pool.execute(`
      SELECT COUNT(session_id) as count FROM (
        SELECT session_id, DATE(MIN(message_timestamp)) as start_date 
        FROM user_chats 
        GROUP BY session_id
      ) as sessions 
      ${timeframe === 'overall' ? '' : `WHERE start_date >= ${
        timeframe === 'daily' ? 'DATE(NOW())' : 
        timeframe === 'monthly' ? 'DATE_SUB(CURDATE(), INTERVAL 1 MONTH)' :
        'DATE_SUB(CURDATE(), INTERVAL 1 YEAR)'
      }`}
    `);

    const [draftsPendingReview] = await pool.execute(
      `SELECT COUNT(*) as count FROM knowledge_documents WHERE status = 'draft'`
    );
    
    res.json({
      messages: messages[0].count,
      activeUsers: activeUsers[0].count,
      newSessions: newSessions[0].count,
      draftsPendingReview: draftsPendingReview[0].count,
      timeframe
    });
    
  } catch (error) {
    console.error('❌ Dashboard Stats Filtered Error:', error);
    res.status(500).json({ error: 'Failed to load filtered statistics' });
  }
};

export const getDashboardChartsFiltered = async (req, res) => {
  try {
    const { timeframe = 'overall' } = req.query;
    
    let sqlQuery = '';
    
    if (timeframe === 'daily') {
      sqlQuery = `
        WITH RECURSIVE hours AS (
          SELECT 0 AS hour_num
          UNION ALL
          SELECT hour_num + 1
          FROM hours
          WHERE hour_num < 23
        )
        SELECT 
          CASE 
            WHEN hours.hour_num = 0 THEN '12:00 AM'
            WHEN hours.hour_num < 12 THEN CONCAT(hours.hour_num, ':00 AM')
            WHEN hours.hour_num = 12 THEN '12:00 PM'
            ELSE CONCAT(hours.hour_num - 12, ':00 PM')
          END as label,
          hours.hour_num as sort_key,
          COALESCE(COUNT(uc.id), 0) as count
        FROM hours
        LEFT JOIN user_chats uc ON 
          HOUR(uc.message_timestamp) = hours.hour_num
          AND DATE(uc.message_timestamp) = CURDATE()
        GROUP BY hours.hour_num, label
        ORDER BY hours.hour_num ASC
      `;
    } else {
      let dateFilter = '';
      switch(timeframe) {
        case 'monthly':
          dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
          break;
        case 'yearly':
          dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
          break;
        case 'overall':
        default:
          dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      }

      sqlQuery = `
        SELECT DATE(message_timestamp) as day, COUNT(*) as count 
        FROM user_chats 
        ${dateFilter}
        GROUP BY day 
        ORDER BY day ASC
      `;
    }
    
    const [messagesOverTime] = await pool.execute(sqlQuery);

    res.json({
      messagesOverTime,
      timeframe
    });

  } catch (error) {
    console.error('❌ Dashboard Charts Filtered Error:', error);
    res.status(500).json({ error: 'Failed to load chart data' });
  }
};

export const getDashboardActivityFiltered = async (req, res) => {
  try {
    const { timeframe = 'overall' } = req.query;
    
    let dateFilter = '';
    switch(timeframe) {
      case 'daily':
        dateFilter = 'WHERE uc.message_timestamp >= DATE(NOW())';
        break;
      case 'monthly':
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        break;
      case 'yearly':
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
        break;
      case 'overall':
      default:
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    }
    
    const [recentActivity] = await pool.execute(`
      SELECT 
        e.email,
        uc.user_message,
        uc.message_timestamp
      FROM user_chats uc
      LEFT JOIN employees e ON uc.employee_id = e.id
      ${dateFilter}
      ORDER BY uc.message_timestamp DESC
      LIMIT 10
    `);
    
    const formattedActivity = recentActivity.map(item => ({
      ...item,
      email: item.email || 'Unknown User'
    }));

    const mostActiveUsersFilter = timeframe === 'overall' ? 
      'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)' :
      `WHERE uc.message_timestamp >= ${
        timeframe === 'daily' ? 'DATE(NOW())' : 
        timeframe === 'monthly' ? 'DATE_SUB(CURDATE(), INTERVAL 1 MONTH)' :
        'DATE_SUB(CURDATE(), INTERVAL 1 YEAR)'
      }`;

    const [mostActiveUsers] = await pool.execute(`
      SELECT 
        e.name, 
        e.email, 
        COUNT(*) as message_count 
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id 
      ${mostActiveUsersFilter}
      GROUP BY e.id, e.name, e.email
      ORDER BY message_count DESC 
      LIMIT 5;
    `);

    res.json({
      recentActivity: formattedActivity,
      mostActiveUsers,
      timeframe
    });
    
  } catch (error) {
    console.error('❌ Dashboard Activity Filtered Error:', error);
    res.status(500).json({ error: 'Failed to load activity tables' });
  }
};

// ==========================================
// USER MANAGEMENT
// ==========================================

export const getUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT 
        e.id,
        e.name,
        e.email,
        e.department,
        e.position,
        e.is_active,
        e.created_at,
        COUNT(uc.id) as total_messages,
        MAX(uc.message_timestamp) as last_active
      FROM employees e
      LEFT JOIN user_chats uc ON e.id = uc.employee_id
      GROUP BY e.id, e.name, e.email, e.department, e.position, e.is_active, e.created_at
      ORDER BY total_messages DESC, e.created_at DESC
    `);
    res.json({ users });
  } catch (error) {
    console.error('❌ Users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
};

export const createUser = async (req, res) => {
  const { name, email, department, position } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and Email are required' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO employees (name, email, department, position, is_active, created_at)
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [name, email, department || null, position || null]
    );
    res.json({ 
      success: true, 
      id: result.insertId,
      message: 'User created successfully' 
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('❌ Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const bulkCreateUsers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let addedCount = 0;
    let errorCount = 0;
    let duplicates = 0;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      for (const row of rawData) {
        const user = {};
        Object.keys(row).forEach(key => {
            user[key.toLowerCase().trim()] = row[key];
        });

        if (!user.name || !user.email) {
          errorCount++;
          continue;
        }

        const name = user.name;
        const email = user.email;
        const department = user.department || null;
        const position = user.position || null;

        try {
           const [existing] = await connection.execute(
             'SELECT id FROM employees WHERE email = ?', [email]
           );

           if (existing.length > 0) {
             await connection.execute(
                `UPDATE employees SET name = ?, department = ?, position = ?, is_active = TRUE WHERE id = ?`,
                [name, department, position, existing[0].id]
             );
             duplicates++;
           } else {
             await connection.execute(
               `INSERT INTO employees (name, email, department, position, is_active, created_at)
                VALUES (?, ?, ?, ?, TRUE, NOW())`,
               [name, email, department, position]
             );
             addedCount++;
           }
        } catch (err) {
          console.error(`Error importing user ${email}:`, err.message);
          errorCount++;
        }
      }

      await connection.commit();
      res.json({ 
        success: true, 
        message: `Import complete: ${addedCount} added, ${duplicates} updated, ${errorCount} failed.`,
        stats: { added: addedCount, updated: duplicates, failed: errorCount }
      });

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('❌ Bulk create user error:', error);
    res.status(500).json({ error: 'Failed to process bulk upload' });
  }
};

export const updateUser = async (req, res) => {
  const { name, email, department, position, is_active } = req.body;
  const userId = req.params.id;
  
  try {
    await pool.execute(
      `UPDATE employees 
       SET name = ?, email = ?, department = ?, position = ?, is_active = ?
       WHERE id = ?`,
      [name, email, department, position, is_active, userId]
    );
    res.json({ 
      success: true,
      message: 'User updated successfully' 
    });
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const deleteUser = async (req, res) => {
  const userId = req.params.id;
  try {
    await pool.execute(
      `UPDATE employees SET is_active = FALSE WHERE id = ?`,
      [userId]
    );
    res.json({ 
      success: true,
      message: 'User deactivated successfully' 
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ==========================================
// ACCESS PERMISSIONS
// ==========================================

export const getUserPermissions = async (req, res) => {
  const userId = req.params.userId;
  try {
    const [user] = await pool.execute(
      'SELECT id, name, email, department, position FROM employees WHERE id = ?', 
      [userId]
    );
    
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const [permissions] = await pool.execute(
      'SELECT category_id, subcategory_id, source_id FROM employee_access_permissions WHERE employee_id = ?',
      [userId]
    );

    const [categories] = await pool.execute('SELECT id, name FROM knowledge_categories ORDER BY name');
    const [subcategories] = await pool.execute('SELECT id, category_id, name FROM knowledge_subcategories ORDER BY name');

    res.json({
      user: user[0],
      permissions,
      structure: {
        categories,
        subcategories
      }
    });
  } catch (error) {
    console.error('❌ Get Permissions Error:', error);
    res.status(500).json({ error: 'Failed to load permissions' });
  }
};

export const updateUserPermissions = async (req, res) => {
  const userId = req.params.userId;
  const { permissions, grantedBy } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      'DELETE FROM employee_access_permissions WHERE employee_id = ?', 
      [userId]
    );

    if (permissions && permissions.length > 0) {
      const values = permissions.map(p => [
        userId, 
        p.category_id || null, 
        p.subcategory_id || null,
        p.source_id || null,
        'read', 
        grantedBy || null 
      ]);

      const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();

      await connection.execute(
        `INSERT INTO employee_access_permissions 
         (employee_id, category_id, subcategory_id, source_id, access_level, granted_by) 
         VALUES ${placeholders}`,
        flatValues
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Permissions updated successfully' });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Update Permissions Error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  } finally {
    connection.release();
  }
};

export const bulkUpdatePermissions = async (req, res) => {
  const { userIds, permissions } = req.body;

  // Enhanced validation
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    console.error('❌ Bulk permissions: Invalid or empty userIds', { userIds });
    return res.status(400).json({ 
      success: false,
      error: 'Invalid request: userIds must be a non-empty array' 
    });
  }

  if (!permissions || !Array.isArray(permissions)) {
    console.error('❌ Bulk permissions: Invalid permissions array', { permissions });
    return res.status(400).json({ 
      success: false,
      error: 'Invalid request: permissions must be an array' 
    });
  }

  console.log('📥 Bulk permissions request received:');
  console.log('  User IDs:', userIds);
  console.log('  Permissions:', JSON.stringify(permissions, null, 2));

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    console.log('🔄 Transaction started');

    // === FIX FOR ISSUE 2: Remove Full Access rows for these users first ===
    // If we are adding specific permissions, we don't want the user to retain "Full Access" (all NULLs).
    // This allows admins to "restrict" users who previously had full access by selecting them and granting specific rights.
    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      console.log(`🧹 Cleaning up 'Full Access' rows for ${userIds.length} users before adding specific permissions...`);
      
      await connection.execute(
        `DELETE FROM employee_access_permissions 
         WHERE employee_id IN (${placeholders}) 
         AND category_id IS NULL 
         AND subcategory_id IS NULL 
         AND source_id IS NULL`,
        userIds
      );
    }
    // ====================================================================

    const values = [];
    const grantedBy = null; // You can set this to admin user ID if needed
    
    // Build values array for bulk insert
    userIds.forEach(userId => {
      permissions.forEach(p => {
        values.push([
          userId, 
          p.category_id || null, 
          p.subcategory_id || null,
          p.source_id || null,
          'read', 
          grantedBy
        ]);
      });
    });

    console.log(`📦 Generated ${values.length} permission entries to insert`);

    if (values.length > 0) {
      const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();

      const [result] = await connection.execute(
        `INSERT IGNORE INTO employee_access_permissions 
         (employee_id, category_id, subcategory_id, source_id, access_level, granted_by) 
         VALUES ${placeholders}`,
        flatValues
      );

      console.log('✅ Bulk insert result:', {
        affectedRows: result.affectedRows,
        insertId: result.insertId
      });
    }

    await connection.commit();
    console.log('✅ Transaction committed successfully');

    res.json({ 
      success: true, 
      message: `Successfully updated permissions for ${userIds.length} users`,
      stats: {
        usersAffected: userIds.length,
        permissionsAdded: permissions.length
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Bulk Update Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update bulk permissions',
      details: error.message 
    });
  } finally {
    connection.release();
    console.log('🔓 Database connection released');
  }
};

// ==========================================
// CHAT HISTORY & ANALYTICS
// ==========================================

export const getChats = async (req, res) => {
  try {
    const { search, department } = req.query;

    let sql = `
      SELECT 
        e.name as user_name,
        e.email as user_email,
        e.department,
        COALESCE(cs.title, CONCAT('Unsynced Chat (', DATE_FORMAT(MAX(uc.message_timestamp), '%b %d'), ')')) as session_title,
        uc.session_id,
        COUNT(uc.id) as message_count,
        MAX(uc.message_timestamp) as last_activity
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id
      LEFT JOIN chat_sessions cs ON uc.session_id = cs.session_id
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      sql += ` AND (e.name LIKE ? OR e.email LIKE ? OR cs.title LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (department) {
      sql += ` AND e.department = ?`;
      params.push(department);
    }

    sql += `
      GROUP BY e.id, e.name, e.email, e.department, uc.session_id, cs.title
      ORDER BY last_activity DESC
      LIMIT 200
    `;
    
    const [chats] = await pool.execute(sql, params);
    res.json({ chats });
  } catch (error) {
    console.error('❌ Chats error:', error);
    res.status(500).json({ error: 'Failed to load chats' });
  }
};

export const getChatDetails = async (req, res) => {
  try {
    const [messages] = await pool.execute(
      `SELECT 
        user_message,
        ai_response,
        message_timestamp
      FROM user_chats
      WHERE session_id = ?
      ORDER BY message_timestamp ASC`,
      [req.params.sessionId]
    );
    
    const [sessionInfo] = await pool.execute(
      `SELECT e.name, e.email, COALESCE(cs.title, 'Unsynced Session') as title
       FROM employees e 
       JOIN user_chats uc ON e.id = uc.employee_id
       LEFT JOIN chat_sessions cs ON uc.session_id = cs.session_id
       WHERE uc.session_id = ?
       LIMIT 1`,
      [req.params.sessionId]
    );
    
    res.json({ 
      messages,
      session: sessionInfo[0] || { name: 'Unknown', title: 'Chat Session' }
    });
  } catch (error) {
    console.error('❌ Chat details error:', error);
    res.status(500).json({ error: 'Failed to load chat details' });
  }
};

export const deleteChat = async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM user_chats WHERE session_id = ?`,
      [req.params.sessionId]
    );
    await pool.execute(
      `DELETE FROM chat_sessions WHERE session_id = ?`,
      [req.params.sessionId]
    );
    res.json({ 
      success: true,
      message: 'Chat deleted successfully from all tables' 
    });
  } catch (error) {
    console.error('❌ Delete chat error:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
};

export const getChatAnalytics = async (req, res) => {
  try {
    const [hourlyActivity] = await pool.execute(`
      SELECT HOUR(message_timestamp) as hour_of_day, COUNT(*) as count 
      FROM user_chats 
      GROUP BY hour_of_day 
      ORDER BY hour_of_day
    `);

    const [avgMessages] = await pool.execute(`
      SELECT AVG(msg_count) as avg_msgs 
      FROM (
        SELECT COUNT(*) as msg_count 
        FROM user_chats 
        GROUP BY session_id
      ) as counts
    `);

    const [totals] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_messages
      FROM user_chats
    `);

    const [sessionsByEmployee] = await pool.execute(`
      SELECT e.name, COUNT(DISTINCT uc.session_id) as session_count
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id
      GROUP BY e.id, e.name
      ORDER BY session_count DESC
      LIMIT 10
    `);

    res.json({
      hourlyActivity,
      avgMessagesPerSession: parseFloat(avgMessages[0]?.avg_msgs || 0).toFixed(1),
      totalSessions: totals[0].total_sessions,
      totalMessages: totals[0].total_messages,
      sessionsByEmployee
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
};

export const exportChatHistory = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        e.name as employee_name,
        e.email,
        e.department,
        uc.session_id,
        COALESCE(cs.title, 'Unsynced Chat') as chat_title,
        uc.user_message,
        uc.ai_response,
        uc.message_timestamp
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id
      LEFT JOIN chat_sessions cs ON uc.session_id = cs.session_id
      ORDER BY uc.message_timestamp DESC
    `);
    res.json({ data: rows });
  } catch (error) {
    console.error('❌ Export error:', error);
    res.status(500).json({ error: 'Failed to export chats' });
  }
};

// ==========================================
// SETTINGS & CACHE
// ==========================================

export const getSettings = async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM system_settings WHERE id = 1");
    
    let settings;

    if (rows.length === 0) {
      await pool.execute(`
        INSERT INTO system_settings (id, system_name) VALUES (1, 'ChatCDO')
      `);
      settings = {
        systemName: 'ChatCDO',
        aiModel: 'gemini-2.0-flash-exp',
        maxContext: 20,
        enableWebSearch: true,
        maintenanceMode: false,
        lastUpdated: new Date().toISOString()
      };
    } else {
      const row = rows[0];
      settings = {
        systemName: row.system_name,
        aiModel: row.ai_model,
        maxContext: row.max_context,
        enableWebSearch: Boolean(row.enable_web_search),
        maintenanceMode: Boolean(row.maintenance_mode),
        lastUpdated: row.updated_at
      };
    }

    res.json(settings);
  } catch (error) {
    console.error('❌ Settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
};

export const updateSettings = async (req, res) => {
  const { systemName, aiModel, maxContext, enableWebSearch, maintenanceMode } = req.body;

  try {
    await pool.execute(`
      UPDATE system_settings 
      SET system_name = ?, 
          ai_model = ?, 
          max_context = ?, 
          enable_web_search = ?, 
          maintenance_mode = ?
      WHERE id = 1
    `, [
      systemName, 
      aiModel, 
      maxContext, 
      enableWebSearch, 
      maintenanceMode
    ]);
    
    res.json({ 
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('❌ Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

export const regenerateCache = async (req, res) => {
  try {
    console.log('🔄 Admin triggered cache regeneration...');
    databaseCacheManager.clearCache();
    await ragSystem.regenerateEmbeddings();
    res.json({ 
      success: true,
      message: 'Cache regenerated successfully',
      chunks: ragSystem.chunks.length,
      embeddings: ragSystem.embeddings.length
    });
  } catch (error) {
    console.error('❌ Cache regeneration error:', error);
    res.status(500).json({ error: 'Failed to regenerate cache' });
  }
};

export const clearCache = async (req, res) => {
  try {
    console.log('🗑️ Admin triggered cache clear...');
    databaseCacheManager.clearCache();
    ragSystem.chunks = [];
    ragSystem.embeddings = [];
    
    res.json({ 
      success: true,
      message: 'System cache cleared successfully. RAG system is now empty.'
    });
  } catch (error) {
    console.error('❌ Cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
};

export const getSystemHealth = async (req, res) => {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const dbLatency = Date.now() - start;

    const used = process.memoryUsage();
    const memoryUsage = {
      rss: `${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024 * 100) / 100} MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`,
    };
    
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);

    res.json({
      status: 'healthy',
      database: {
        status: 'connected',
        latency: `${dbLatency}ms`
      },
      system: {
        memory: memoryUsage,
        uptime: `${uptimeHours}h ${uptimeMinutes}m`,
        platform: process.platform,
        nodeVersion: process.version
      },
      rag: {
        initialized: ragSystem.isInitialized,
        chunks: ragSystem.chunks.length
      },
      timestamp: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
    });

  } catch (error) {
    console.error('❌ Health Check Error:', error);
    res.status(500).json({ 
      status: 'degraded', 
      error: error.message,
      timestamp: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
    });
  }
};

// ==========================================
// SMART ASSISTANT ADMIN ROUTES (NEW)
// ==========================================

export const getSmartAssistantSessions = async (req, res) => {
    try {
        // Since we're using in-memory storage for sessions in SmartPersonalAssistant,
        // we can't query them from the database. For now, return a placeholder.
        // In production, you'd want to store sessions in Redis or database.
        
        console.log('📊 Admin accessing Smart Assistant sessions');
        
        // This is a placeholder - in production, you would:
        // 1. Store sessions in Redis/database
        // 2. Query active sessions
        // 3. Include session metadata
        
        res.json({
            success: true,
            sessions: [],
            totalActive: 0,
            message: "Smart Assistant sessions are stored in memory. Implement Redis/database storage for production.",
            note: "In production, sessions should be stored in Redis with TTL for better scalability."
        });
    } catch (error) {
        console.error('❌ Get Smart Assistant Sessions Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load Smart Assistant sessions',
            details: error.message 
        });
    }
};

export const getSmartAssistantAnalytics = async (req, res) => {
    try {
        console.log('📈 Admin accessing Smart Assistant analytics');
        
        // Get basic usage statistics from tool_usage_logs if table exists
        let toolStats = [];
        let sessionStats = [];
        
        try {
            // Check if tool_usage_logs table exists
            const [tableExists] = await pool.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tool_usage_logs'"
            );
            
            if (tableExists.length > 0) {
                // Get tool usage statistics
                const [toolResults] = await pool.execute(`
                    SELECT 
                        function_name,
                        COUNT(*) as usage_count,
                        AVG(execution_time_ms) as avg_execution_time,
                        SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) as success_count,
                        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as error_count
                    FROM tool_usage_logs
                    WHERE executed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY function_name
                    ORDER BY usage_count DESC
                `);
                toolStats = toolResults;
                
                // Get session statistics (simplified)
                const [sessionResults] = await pool.execute(`
                    SELECT 
                        DATE(executed_at) as date,
                        COUNT(DISTINCT user_email) as unique_users,
                        COUNT(*) as total_tool_calls
                    FROM tool_usage_logs
                    WHERE executed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(executed_at)
                    ORDER BY date DESC
                `);
                sessionStats = sessionResults;
            }
        } catch (dbError) {
            console.warn('⚠️ Tool usage logs table may not exist:', dbError.message);
        }
        
        res.json({
            success: true,
            analytics: {
                timeRange: '7 days',
                toolUsage: toolStats,
                sessionActivity: sessionStats,
                mostUsedTools: toolStats.slice(0, 5).map(tool => ({
                    name: tool.function_name,
                    usageCount: tool.usage_count,
                    successRate: tool.success_count > 0 ? 
                        Math.round((tool.success_count / tool.usage_count) * 100) : 0
                })),
                totalToolCalls: toolStats.reduce((sum, tool) => sum + tool.usage_count, 0),
                averageSuccessRate: toolStats.length > 0 ? 
                    Math.round(toolStats.reduce((sum, tool) => {
                        const rate = tool.success_count > 0 ? 
                            (tool.success_count / tool.usage_count) * 100 : 0;
                        return sum + rate;
                    }, 0) / toolStats.length) : 0
            },
            message: "Smart Assistant analytics loaded successfully",
            note: "Enable tool usage logging in ToolService for detailed analytics."
        });
    } catch (error) {
        console.error('❌ Get Smart Assistant Analytics Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load Smart Assistant analytics',
            details: error.message 
        });
    }
};

export const clearAllSmartAssistantSessions = async (req, res) => {
    try {
        console.log('🗑️ Admin clearing all Smart Assistant sessions');
        
        // Note: This would clear in-memory sessions. In production, you'd clear Redis/database.
        // For now, we can't clear in-memory sessions from another module.
        // You would need to implement a shared session clearing mechanism.
        
        // Placeholder response
        res.json({
            success: true,
            message: "Smart Assistant session clearing endpoint reached.",
            note: "In production, implement Redis/database session clearing with proper admin controls.",
            action: "In-memory sessions would be cleared (if implemented with shared state)."
        });
    } catch (error) {
        console.error('❌ Clear Smart Assistant Sessions Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to clear Smart Assistant sessions',
            details: error.message 
        });
    }
};