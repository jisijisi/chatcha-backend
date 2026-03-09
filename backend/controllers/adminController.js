// controllers/adminController.js
import { pool } from '../config/database.js';
import { databaseCacheManager, ragSystem } from '../services/ragService.js';
import { PromptService } from '../services/promptService.js';
import * as xlsx from 'xlsx'; 
import os from 'os';
import jwt from 'jsonwebtoken';

// NOTE: If using Node.js < 18, uncomment the line below:
// import fetch from 'node-fetch'; 

const permissionClients = new Map();
const dashboardClients = new Set();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod_12345';

export const dashboardStream = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
  dashboardClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(`data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`); } catch {}
  }, 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    dashboardClients.delete(res);
  });
};

export const broadcastDashboardUpdate = (payload = {}) => {
  const msg = `data: ${JSON.stringify({ type: 'dashboard_update', ts: Date.now(), ...payload })}\n\n`;
  dashboardClients.forEach(client => {
    try { client.write(msg); } catch {}
  });
};

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
    
    // Generate JWT Token
    const token = jwt.sign(
        { 
            id: admin.id, 
            email: admin.email, 
            name: admin.name,
            role: 'admin',
            type: 'employee'
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
    );
    
    console.log(`✅ Admin user logged in: ${admin.email} (ID: ${admin.id})`);
    
    res.json({
      success: true,
      session: {
        id: admin.id,
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
      `SELECT COUNT(DISTINCT id) as count FROM (
        SELECT employee_id as id FROM user_chats WHERE message_timestamp >= DATE(NOW())
        UNION
        SELECT id FROM employees WHERE updated_at >= DATE(NOW())
      ) as active`
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
    const { timeframe = 'overall', year, month } = req.query;
    const yearInt = parseInt(year, 10);
    const monthInt = parseInt(month, 10);
    
    let dateFilter = '';
    let params = [];
    
    switch(timeframe) {
      case 'daily':
        dateFilter = 'WHERE uc.message_timestamp >= DATE(NOW())';
        break;
      case 'monthly':
        if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
          const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
          dateFilter = 'WHERE uc.message_timestamp >= ? AND uc.message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)';
          params = [startDate, startDate];
        } else {
          dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        }
        break;
      case 'yearly':
        if (Number.isInteger(yearInt)) {
          dateFilter = 'WHERE YEAR(uc.message_timestamp) = ?';
          params = [yearInt];
        } else {
          dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
        }
        break;
      case 'overall':
      default:
        dateFilter = 'WHERE 1=1';
    }
    
    console.log(`📊 [Knowledge Usage] Loading for timeframe: ${timeframe}`);
    
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
    `, params);

    console.log(`📊 [Knowledge Usage] Found ${chatMessages.length} messages with source tracking`);

    if (chatMessages.length === 0) {
      console.log('ℹ️ [Knowledge Usage] No messages found for this timeframe');
      return res.json({
        categoryUsage: [],
        subcategoryUsage: [],
        topDocuments: [],
        timeframe
      });
    }

    const documentAccessCount = {};
    const documentDetails = {}; 

    chatMessages.forEach(msg => {
      try {
        const categories = typeof msg.accessed_categories === 'string' 
          ? JSON.parse(msg.accessed_categories) 
          : msg.accessed_categories;
        
        if (categories.documents && Array.isArray(categories.documents)) {
          categories.documents.forEach(doc => {
            if (doc && typeof doc === 'object' && doc.id) {
              const docId = doc.id;
              documentAccessCount[docId] = (documentAccessCount[docId] || 0) + 1;
              if (!documentDetails[docId]) {
                documentDetails[docId] = {
                  name: doc.name || `Document ${docId}`,
                  category: doc.category || 'General'
                };
              }
            }
          });
        }

        if (categories.tools && Array.isArray(categories.tools)) {
          categories.tools.forEach(tool => {
            if (tool && tool.source_name) {
               const docId = `tool-${tool.source_name}`; 
               documentAccessCount[docId] = (documentAccessCount[docId] || 0) + 1;
               if (!documentDetails[docId]) {
                 documentDetails[docId] = {
                   name: tool.source_name, 
                   category: tool.source_category || 'Live Data'
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

    if (uniqueDocIds.length === 0) {
      console.log('ℹ️ [Knowledge Usage] No documents accessed in this timeframe');
      return res.json({
        categoryUsage: [],
        subcategoryUsage: [],
        topDocuments: [],
        timeframe
      });
    }

    const categoryMap = {};
    const subcategoryMap = {};
    const topDocs = [];

    uniqueDocIds.forEach(docId => {
      const docInfo = documentDetails[docId];
      const accessCount = documentAccessCount[docId];
      
      if (docInfo) {
        let category = docInfo.category || 'Uncategorized';
        if (category && typeof category === 'string') {
            category = category.trim();
            category = category.replace(/[-_]/g, ' ');
            category = category.split(' ')
                .filter(word => word.length > 0)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        }

        const subcategory = `${category} - ${docInfo.name}`;
        categoryMap[category] = (categoryMap[category] || 0) + accessCount;
        subcategoryMap[subcategory] = (subcategoryMap[subcategory] || 0) + accessCount;
        
        topDocs.push({
          document_title: docInfo.name,
          category: category,
          access_count: accessCount
        });
      }
    });

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

    res.json({
      categoryUsage,
      subcategoryUsage,
      topDocuments,
      timeframe
    });
    
  } catch (error) {
    console.error('❌ [Knowledge Usage] Error:', error);
    res.status(500).json({ 
      error: 'Failed to load knowledge usage data',
      details: error.message 
    });
  }
};

export const getDashboardStatsFiltered = async (req, res) => {
  try {
    const { timeframe = 'overall', year, month } = req.query;
    
    const yearInt = parseInt(year, 10);
    const monthInt = parseInt(month, 10);
    
    let dateFilter = '';
    let params = [];
    if (timeframe === 'daily') {
      dateFilter = 'WHERE message_timestamp >= DATE(NOW())';
    } else if (timeframe === 'monthly') {
      if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
        const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
        dateFilter = 'WHERE message_timestamp >= ? AND message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)';
        params = [startDate, startDate];
      } else {
        dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
      }
    } else if (timeframe === 'yearly') {
      if (Number.isInteger(yearInt)) {
        dateFilter = 'WHERE YEAR(message_timestamp) = ?';
        params = [yearInt];
      } else {
        dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
      }
    } else {
      dateFilter = '';
    }
    
    const [messages] = await pool.execute(
      `SELECT COUNT(*) as count FROM user_chats ${dateFilter}`,
      params
    );
    
    // Include both chatters AND users who logged in (updated_at)
    const activeDateFilter = dateFilter.replace(/message_timestamp/g, 'updated_at');
    const activeParams = [...params, ...params];

    const [activeUsers] = await pool.execute(
      `SELECT COUNT(DISTINCT id) as count FROM (
        SELECT employee_id as id FROM user_chats ${dateFilter}
        UNION
        SELECT id FROM employees ${activeDateFilter}
      ) as active`,
      activeParams
    );

    let sessionsWhere = '';
    let sessionsParams = [];
    if (timeframe === 'overall') {
      sessionsWhere = '';
    } else if (timeframe === 'daily') {
      sessionsWhere = 'WHERE start_date >= DATE(NOW())';
    } else if (timeframe === 'monthly') {
      if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
        const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
        sessionsWhere = 'WHERE start_date >= ? AND start_date < DATE_ADD(?, INTERVAL 1 MONTH)';
        sessionsParams = [startDate, startDate];
      } else {
        sessionsWhere = 'WHERE start_date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
      }
    } else if (timeframe === 'yearly') {
      if (Number.isInteger(yearInt)) {
        sessionsWhere = 'WHERE YEAR(start_date) = ?';
        sessionsParams = [yearInt];
      } else {
        sessionsWhere = 'WHERE start_date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
      }
    }

    const [newSessions] = await pool.execute(
      `
      SELECT COUNT(session_id) as count FROM (
        SELECT session_id, DATE(MIN(message_timestamp)) as start_date 
        FROM user_chats 
        GROUP BY session_id
      ) as sessions 
      ${sessionsWhere}
      `,
      sessionsParams
    );

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
    const { timeframe = 'overall', year, month } = req.query;
    const yearInt = parseInt(year, 10);
    const monthInt = parseInt(month, 10);
    
    let sqlQuery = '';
    let params = [];
    
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
      if (timeframe === 'monthly') {
        if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
          const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
          dateFilter = 'WHERE message_timestamp >= ? AND message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)';
          params = [startDate, startDate];
        } else {
          dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
        }
      } else if (timeframe === 'yearly') {
        if (Number.isInteger(yearInt)) {
          dateFilter = 'WHERE YEAR(message_timestamp) = ?';
          params = [yearInt];
        } else {
          dateFilter = 'WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
        }
      } else {
        // Overall: No filter (All time)
        dateFilter = '';
      }

      sqlQuery = `
        SELECT DATE(message_timestamp) as day, COUNT(*) as count 
        FROM user_chats 
        ${dateFilter}
        GROUP BY day 
        ORDER BY day ASC
      `;
    }
    
    const [messagesOverTime] = await pool.execute(sqlQuery, params);
    
    let activeQuery = '';
    let activeParams = [];
    if (timeframe === 'daily') {
      activeQuery = `
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
          COALESCE(COUNT(DISTINCT uc.employee_id), 0) as count
        FROM hours
        LEFT JOIN user_chats uc ON 
          HOUR(uc.message_timestamp) = hours.hour_num
          AND DATE(uc.message_timestamp) = CURDATE()
        GROUP BY hours.hour_num, label
        ORDER BY hours.hour_num ASC
      `;
    } else {
      if (timeframe === 'monthly') {
        if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
          const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
          activeQuery = `
            SELECT DATE(message_timestamp) as day, COUNT(DISTINCT employee_id) as count 
            FROM user_chats 
            WHERE message_timestamp >= ? AND message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)
            GROUP BY day 
            ORDER BY day ASC
          `;
          activeParams = [startDate, startDate];
        } else {
          activeQuery = `
            SELECT DATE(message_timestamp) as day, COUNT(DISTINCT employee_id) as count 
            FROM user_chats 
            WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
            GROUP BY day 
            ORDER BY day ASC
          `;
        }
      } else if (timeframe === 'yearly') {
        if (Number.isInteger(yearInt)) {
          activeQuery = `
            SELECT DATE(message_timestamp) as day, COUNT(DISTINCT employee_id) as count 
            FROM user_chats 
            WHERE YEAR(message_timestamp) = ?
            GROUP BY day 
            ORDER BY day ASC
          `;
          activeParams = [yearInt];
        } else {
          activeQuery = `
            SELECT DATE(message_timestamp) as day, COUNT(DISTINCT employee_id) as count 
            FROM user_chats 
            WHERE message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            GROUP BY day 
            ORDER BY day ASC
          `;
        }
      } else {
        // Overall: No filter (All time)
        activeQuery = `
          SELECT DATE(message_timestamp) as day, COUNT(DISTINCT employee_id) as count 
          FROM user_chats 
          GROUP BY day 
          ORDER BY day ASC
        `;
      }
    }
    
    const [activeUsersOverTime] = await pool.execute(activeQuery, activeParams);

    res.json({
      messagesOverTime,
      activeUsersOverTime,
      timeframe
    });

  } catch (error) {
    console.error('❌ Dashboard Charts Filtered Error:', error);
    res.status(500).json({ error: 'Failed to load chart data' });
  }
};

export const getDashboardDepartmentUsageFiltered = async (req, res) => {
  try {
    const { timeframe = 'overall', year, month } = req.query;
    const yearInt = parseInt(year, 10);
    const monthInt = parseInt(month, 10);
    
    let whereClause = '';
    let params = [];
    if (timeframe === 'daily') {
      whereClause = 'WHERE uc.message_timestamp >= DATE(NOW())';
    } else if (timeframe === 'monthly') {
      if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
        const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
        whereClause = 'WHERE uc.message_timestamp >= ? AND uc.message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)';
        params = [startDate, startDate];
      } else {
        whereClause = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
      }
    } else if (timeframe === 'yearly') {
      if (Number.isInteger(yearInt)) {
        whereClause = 'WHERE YEAR(uc.message_timestamp) = ?';
        params = [yearInt];
      } else {
        whereClause = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
      }
    } else {
      // Overall: No filter (All time)
      whereClause = '';
    }
    
    const [rows] = await pool.execute(
      `
      SELECT 
        COALESCE(e.department, 'Unknown') as department,
        COUNT(*) as count
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id
      ${whereClause}
      GROUP BY department
      ORDER BY count DESC
      `,
      params
    );
    
    res.json({ departmentUsage: rows, timeframe });
  } catch (error) {
    console.error('❌ Dashboard Department Usage Error:', error);
    res.status(500).json({ error: 'Failed to load department usage data' });
  }
};

export const getDashboardActivityFiltered = async (req, res) => {
  try {
    const { timeframe = 'overall', year, month } = req.query;
    const yearInt = parseInt(year, 10);
    const monthInt = parseInt(month, 10);
    
    let dateFilter = '';
    let params = [];
    if (timeframe === 'daily') {
      dateFilter = 'WHERE uc.message_timestamp >= DATE(NOW())';
    } else if (timeframe === 'monthly') {
      if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
        const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
        dateFilter = 'WHERE uc.message_timestamp >= ? AND uc.message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)';
        params = [startDate, startDate];
      } else {
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
      }
    } else if (timeframe === 'yearly') {
      if (Number.isInteger(yearInt)) {
        dateFilter = 'WHERE YEAR(uc.message_timestamp) = ?';
        params = [yearInt];
      } else {
        dateFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
      }
    } else {
      // Overall: No filter (All time)
      dateFilter = '';
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
    `, params);
    
    const formattedActivity = recentActivity.map(item => ({
      ...item,
      email: item.email || 'Unknown User'
    }));

    let mostActiveUsersFilter = '';
    let mostParams = [];
    if (timeframe === 'overall') {
      // Overall: No filter (All time)
      mostActiveUsersFilter = '';
    } else if (timeframe === 'daily') {
      mostActiveUsersFilter = 'WHERE uc.message_timestamp >= DATE(NOW())';
    } else if (timeframe === 'monthly') {
      if (Number.isInteger(yearInt) && Number.isInteger(monthInt) && monthInt >= 1 && monthInt <= 12) {
        const startDate = `${yearInt}-${String(monthInt).padStart(2, '0')}-01`;
        mostActiveUsersFilter = 'WHERE uc.message_timestamp >= ? AND uc.message_timestamp < DATE_ADD(?, INTERVAL 1 MONTH)';
        mostParams = [startDate, startDate];
      } else {
        mostActiveUsersFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
      }
    } else if (timeframe === 'yearly') {
      if (Number.isInteger(yearInt)) {
        mostActiveUsersFilter = 'WHERE YEAR(uc.message_timestamp) = ?';
        mostParams = [yearInt];
      } else {
        mostActiveUsersFilter = 'WHERE uc.message_timestamp >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
      }
    }

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
    `, mostParams);

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

export const getDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT department FROM employees WHERE department IS NOT NULL AND department != '' ORDER BY department");
    const departments = rows.map(r => r.department);
    res.json({ departments });
  } catch (error) {
    console.error('❌ Get Departments Error:', error);
    res.status(500).json({ error: 'Failed to load departments' });
  }
};

export const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const department = req.query.department || '';

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (search) {
      whereClause += ' AND (e.name LIKE ? OR e.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (department) {
      whereClause += ' AND e.department = ?';
      params.push(department);
    }

    // Get total count for pagination
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM employees e ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated users - using pool.query to avoid prepared statement type strictness with LIMIT
    const [users] = await pool.query(`
      SELECT 
        e.id,
        e.name,
        e.email,
        e.department,
        e.position,
        e.role,
        e.is_active,
        e.created_at,
        (SELECT COUNT(*) FROM user_chats uc WHERE uc.employee_id = e.id) as total_messages,
        (SELECT MAX(message_timestamp) FROM user_chats uc WHERE uc.employee_id = e.id) as last_active
      FROM employees e
      ${whereClause}
      ORDER BY total_messages DESC, e.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `, params);
    
    console.log(`👥 Admin loaded ${users.length} users (Page ${page} of ${Math.ceil(total/limit)})`);
    
    res.json({ 
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
};

export const createUser = async (req, res) => {
  const { name, email, department, position, user_type } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and Email are required' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO employees (name, email, department, position, is_active, created_at)
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [name, email, department || null, position || null]
    );
    
    const userId = result.insertId;
    
    // Determine User Type:
    // 1. Explicit user_type from request
    // 2. Check if 'department' contains 'external' (case-insensitive)
    // 3. Default to 'Employee'
    let type = user_type;
    if (!type && department && department.toLowerCase().includes('external')) {
        type = 'External';
    }
    if (!type) {
        type = 'Employee';
    }

    console.log(`👤 Creating user ${email} with type: ${type} (Dept: ${department}, ReqType: ${user_type})`);

    const grantedBy = req.adminUser ? req.adminUser.id : null;

    if (type === 'Employee') {
        // Employee Access: All Knowledge Base Categories (excluding Live Data Tools & KB Settings)
        // We explicitly assign all categories instead of using the wildcard (NULL, NULL, NULL)
        // to prevent accidental access to Live Data Tools or KB Settings which require specific source_ids
        const [allCategories] = await connection.execute('SELECT id FROM knowledge_categories');
        
        if (allCategories.length > 0) {
            const values = allCategories.map(cat => [userId, cat.id, null, null, 'read', grantedBy]);
            const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = values.flat();

            await connection.execute(
                `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by)
                 VALUES ${placeholders}`,
                flatValues
            );
        } else {
             console.warn('⚠️ No knowledge categories found for Employee user! User will have NO access.');
        }

    } else if (type === 'External') {
        // Restricted Access: Knowledge Base -> company general and wikipedia only
        // Find category IDs (handling "wikepedia" typo by checking for both)
        const [categories] = await connection.execute(
            `SELECT id, name FROM knowledge_categories 
             WHERE LOWER(name) LIKE 'company-general%' 
                OR LOWER(name) LIKE 'company general%' 
                OR LOWER(name) LIKE 'wikipedia%' 
                OR LOWER(name) LIKE 'wikepedia%'`
        );
        
        console.log(`🔍 External user categories found: ${categories.length}`, categories.map(c => c.name));

        if (categories.length > 0) {
            const values = categories.map(cat => [userId, cat.id, null, null, 'read', grantedBy]);
            const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = values.flat();

            await connection.execute(
                `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by)
                 VALUES ${placeholders}`,
                flatValues
            );
        } else {
             console.warn('⚠️ No categories found for External user! User will have NO access.');
        }
    }

    await connection.commit();

    res.json({ 
      success: true, 
      id: userId,
      message: 'User created successfully' 
    });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('❌ Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  } finally {
    connection.release();
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
  const { name, email, department, position, role, is_active } = req.body;
  const userId = req.params.id;
  
  try {
    await pool.execute(
      `UPDATE employees 
       SET name = ?, email = ?, department = ?, position = ?, role = ?, is_active = ?
       WHERE id = ?`,
      [name, email, department, position, role, is_active, userId]
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
      'SELECT category_id, subcategory_id, source_id, access_level FROM employee_access_permissions WHERE employee_id = ?',
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

    async function getKbAccessSourceId(conn) {
      const [rows] = await conn.execute(
        `SELECT id FROM live_data_sources 
         WHERE source_type = 'internal_flag' AND name = 'KB_SETTINGS_ACCESS' 
         LIMIT 1`
      );
      if (rows.length > 0) return rows[0].id;
      const [result] = await conn.execute(
        `INSERT INTO live_data_sources 
         (name, description, source_type, config, is_active, category_id, subcategory_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'KB_SETTINGS_ACCESS',
          'Internal flag: KB settings access',
          'internal_flag',
          '{}',
          1,
          null,
          null
        ]
      );
      return result.insertId;
    }

    if (permissions && permissions.length > 0) {
      const kbSourceId = await getKbAccessSourceId(connection);
      const values = permissions.map(p => [
        userId, 
        (p.category_id ?? null), 
        (p.subcategory_id ?? null),
        (p.source_id === 0 ? kbSourceId : (p.source_id ?? null)),
        (p.access_level ?? 'read'), 
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
    try {
      const clients = permissionClients.get(Number(userId));
      if (clients && clients.size > 0) {
        const payload = JSON.stringify({ type: 'permissions_updated', employee_id: Number(userId), ts: Date.now() });
        clients.forEach(res => { res.write(`data: ${payload}\n\n`); });
      }
    } catch {}
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

    const values = [];
    const grantedBy = null; // You can set this to admin user ID if needed
    
    // Helper to get KB source ID if needed
    async function getKbAccessSourceId(conn) {
        const [rows] = await conn.execute(
            `SELECT id FROM live_data_sources 
             WHERE source_type = 'internal_flag' AND name = 'KB_SETTINGS_ACCESS' 
             LIMIT 1`
        );
        if (rows.length > 0) return rows[0].id;
        const [result] = await conn.execute(
            `INSERT INTO live_data_sources 
             (name, description, source_type, config, is_active, category_id, subcategory_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
            'KB_SETTINGS_ACCESS',
            'Internal flag: KB settings access',
            'internal_flag',
            '{}',
            1,
            null,
            null
            ]
        );
        return result.insertId;
    }
    
    const kbSourceId = await getKbAccessSourceId(connection);
    
    // Build values array for bulk insert
    userIds.forEach(userId => {
      permissions.forEach(p => {
        values.push([
          userId, 
          (p.category_id ?? null), 
          (p.subcategory_id ?? null),
          (p.source_id === 0 ? kbSourceId : (p.source_id ?? null)),
          (p.access_level ?? 'read'), 
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
    try {
      userIds.forEach(uid => {
        const clients = permissionClients.get(Number(uid));
        if (clients && clients.size > 0) {
          const payload = JSON.stringify({ type: 'permissions_updated', employee_id: Number(uid), ts: Date.now() });
          clients.forEach(res => { res.write(`data: ${payload}\n\n`); });
        }
      });
    } catch {}
  }
};

// ==========================================
// FEATURE ACCESS CHECKS
// ==========================================

export const checkKbSettingsAccess = async (req, res) => {
  try {
    const userEmail = req.header('X-User-Email');
    if (!userEmail) {
      return res.json({ allowed: false });
    }
    const [employees] = await pool.execute(
      'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
      [userEmail]
    );
    if (employees.length === 0) {
      return res.json({ allowed: false });
    }
    const employeeId = employees[0].id;
    const [rows] = await pool.execute(
      `SELECT 1 
       FROM employee_access_permissions 
       WHERE employee_id = ? 
         AND (
           -- Explicit KB Settings flag
           source_id IN (
             SELECT id FROM live_data_sources 
             WHERE source_type = 'internal_flag' AND name = 'KB_SETTINGS_ACCESS'
           )
           -- OR Full Access permission (all NULLs)
           OR (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
         )
       LIMIT 1`,
      [employeeId]
    );
    res.json({ allowed: rows.length > 0 });
  } catch (error) {
    console.error('❌ KB Settings Access check error:', error);
    res.json({ allowed: false });
  }
};

export const checkSpeechSettingsAccess = async (req, res) => {
  try {
    const userEmail = req.header('X-User-Email');
    if (!userEmail) {
      return res.json({ allowed: false });
    }
    const [employees] = await pool.execute(
      'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
      [userEmail]
    );
    if (employees.length === 0) {
      return res.json({ allowed: false });
    }
    const employeeId = employees[0].id;
    const [rows] = await pool.execute(
      `SELECT 1 
       FROM employee_access_permissions 
       WHERE employee_id = ? 
         AND (
           -- Explicit Speech Settings flag
           source_id IN (
             SELECT id FROM live_data_sources 
             WHERE source_type = 'internal_flag' AND name = 'SPEECH_SETTINGS_ACCESS'
           )
           -- OR Full Access permission (all NULLs)
           OR (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
         )
       LIMIT 1`,
      [employeeId]
    );
    res.json({ allowed: rows.length > 0 });
  } catch (error) {
    console.error('❌ Speech Settings Access check error:', error);
    res.json({ allowed: false });
  }
};

export const permissionsStream = async (req, res) => {
  try {
    let userEmail = req.header('X-User-Email');
    if (!userEmail) userEmail = req.query.email;
    if (!userEmail) {
      res.status(401).end();
      return;
    }
    const [employees] = await pool.execute(
      'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
      [userEmail]
    );
    if (employees.length === 0) {
      res.status(401).end();
      return;
    }
    const employeeId = Number(employees[0].id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const msg = JSON.stringify({ type: 'connected', employee_id: employeeId, ts: Date.now() });
    res.write(`data: ${msg}\n\n`);
    const set = permissionClients.get(employeeId) || new Set();
    set.add(res);
    permissionClients.set(employeeId, set);
    const heartbeat = setInterval(() => {
      try { res.write(`data: ${JSON.stringify({ type: 'heartbeat', ts: Date.now() })}\n\n`); } catch {}
    }, 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      const s = permissionClients.get(employeeId);
      if (s) {
        s.delete(res);
        if (s.size === 0) permissionClients.delete(employeeId);
      }
    });
  } catch {
    res.status(500).end();
  }
};

// ==========================================
// CHAT HISTORY & ANALYTICS
// ==========================================

export const getChats = async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Base conditions
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ` AND (e.name LIKE ? OR e.email LIKE ? OR cs.title LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (department) {
      whereClause += ` AND e.department = ?`;
      params.push(department);
    }

    // 1. Get total count
    const countSql = `
      SELECT COUNT(DISTINCT uc.session_id) as total
      FROM user_chats uc
      JOIN employees e ON uc.employee_id = e.id
      LEFT JOIN chat_sessions cs ON uc.session_id = cs.session_id
      ${whereClause}
    `;
    
    const [countResult] = await pool.execute(countSql, params);
    const totalRecords = countResult[0].total;

    // 2. Get paginated data
    // Note: Injecting limit/offset directly to avoid MySQL prepared statement issues with LIMIT ?
    const dataSql = `
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
      ${whereClause}
      GROUP BY e.id, e.name, e.email, e.department, uc.session_id, cs.title
      ORDER BY last_activity DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;

    // Use original params (without limit/offset)
    const [chats] = await pool.execute(dataSql, params);
    
    res.json({ 
      chats,
      pagination: {
        total: totalRecords,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalRecords / limit)
      }
    });
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
        aiModel: 'gemini-flash-latest',
        audioModel: 'gemini-2.5-flash-tts', // Default
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
        // Handle case where column might not exist yet or is null
        audioModel: row.audio_model || 'gemini-2.5-flash-tts', 
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
  const { systemName, aiModel, audioModel, maxContext, enableWebSearch, maintenanceMode } = req.body;

  try {
    // Updates both ai_model and audio_model
    await pool.execute(`
      UPDATE system_settings 
      SET system_name = ?, 
          ai_model = ?, 
          audio_model = ?,
          max_context = ?, 
          enable_web_search = ?, 
          maintenance_mode = ?
      WHERE id = 1
    `, [
      systemName, 
      aiModel, 
      audioModel || 'gemini-2.5-flash-tts', // Fallback
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
// DYNAMIC MODEL LIST (UPDATED)
// ==========================================

export const getAvailableGeminiModels = async (req, res) => {
  // FALLBACK LISTS (Used if API fails)
  const fallbackText = [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Offline)' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Offline)' },
    { id: 'gemini-flash-latest', label: 'Gemini Flash (Offline)' }
  ];
  const fallbackAudio = [
    { id: 'gemini-flash-latest', label: 'Gemini Flash (Stable)' },
    { id: 'gemini-2.5-flash-tts', label: 'Gemini 2.5 Flash TTS (Offline)' }
  ];

  try {
    const apiKey = process.env.GEMINI_API_KEY; 
    
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not found in environment variables.');
      return res.json({ 
        textModels: fallbackText,
        audioModels: fallbackAudio
      });
    }

    // Safety check for fetch availability
    if (!globalThis.fetch) {
        console.error('❌ Node.js version missing native fetch. Using fallback list.');
        return res.json({ textModels: fallbackText, audioModels: fallbackAudio });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
      throw new Error(`Google API Error: ${response.statusText}`);
    }

    const data = await response.json();

    // Sorting Helper: Natural Sort (descending)
    const sortModels = (a, b) => {
      return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
    };

    // 1. Process Text Models
    const textModels = data.models
      .filter(m => {
        const id = m.name.toLowerCase();
        return id.includes('gemini') && 
               m.supportedGenerationMethods.includes('generateContent') &&
               !id.includes('tts') && 
               !id.includes('audio') &&
               !id.includes('imagen') &&
               !id.includes('veo');
      })
      .map(m => {
        const id = m.name.replace('models/', '');
        let label = m.displayName || id;
        if (id.includes('flash')) label += ' (Fast)';
        if (id.includes('pro')) label += ' (Reasoning)';
        return { id, label };
      })
      .sort(sortModels);

    // 2. Process Audio/TTS Models
    const audioModels = data.models
      .filter(m => {
        const id = m.name.toLowerCase();
        return id.includes('gemini') && (id.includes('tts') || id.includes('audio'));
      })
      .map(m => {
        const id = m.name.replace('models/', '');
        let label = m.displayName || id;
        if (id.includes('native')) label += ' (Live API)';
        return { id, label };
      })
      .sort(sortModels);

    res.json({ textModels, audioModels });

  } catch (error) {
    console.error('❌ Failed to fetch Gemini models:', error.message);
    res.json({ 
        textModels: fallbackText,
        audioModels: fallbackAudio
    });
  }
};

export const testAIModel = async (req, res) => {
  const { modelId, type, prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!modelId) {
    return res.status(400).json({ success: false, error: 'Model ID is required' });
  }

  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured' });
  }

  try {
    let cleanModelId = modelId.trim();
    if (cleanModelId.startsWith('models/')) {
      cleanModelId = cleanModelId.replace('models/', '');
    }

    console.log(`🧪 Testing AI model: ${cleanModelId} (${type || 'text'}) with prompt: "${prompt || 'default'}"`);
    
    // Function to try a specific API version
    const attemptTest = async (version) => {
      return await fetch(
        `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(cleanModelId)}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ 
              role: "user", 
              parts: [{ text: prompt || "Hello, this is a connection test. Please reply with exactly 'OK'." }] 
            }],
            generationConfig: { 
              maxOutputTokens: 1024,
              temperature: 0.7 
            }
          })
        }
      );
    };

    // Try v1beta first, then fallback to v1 if 404
    let response = await attemptTest('v1beta');
    let data = await response.json();

    if (!response.ok && response.status === 404) {
      console.log(`⚠️ v1beta failed for ${cleanModelId}, trying v1...`);
      const v1Response = await attemptTest('v1');
      const v1Data = await v1Response.json();
      
      // Update response and data regardless of success, 
      // but prioritize success if it happens
      if (v1Response.ok || v1Response.status !== 404) {
        response = v1Response;
        data = v1Data;
      }
    }

    if (!response.ok) {
      console.error('❌ Model test failed:', data);
      
      // Extract the most helpful error message
      let errorMessage = 'Model test failed';
      if (data.error) {
        if (typeof data.error === 'object') {
          errorMessage = data.error.message || JSON.stringify(data.error);
        } else {
          errorMessage = data.error;
        }
      }
      
      return res.status(response.status).json({ 
        success: false, 
        error: errorMessage,
        details: data
      });
    }

    console.log(`✅ Model test successful: ${cleanModelId}`);
    res.json({ 
      success: true, 
      message: 'Connection successful!',
      response: data.candidates?.[0]?.content?.parts?.[0]?.text
    });

  } catch (error) {
    console.error('❌ Model test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during model test',
      details: error.message
    });
  }
};

// ==========================================
// SMART ASSISTANT ADMIN ROUTES (NEW)
// ==========================================

export const getSmartAssistantSessions = async (req, res) => {
    try {
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

// ==========================================
// AI PROMPTS MANAGEMENT
// ==========================================

export const getPrompts = async (req, res) => {
  try {
    const prompts = await PromptService.getAllPrompts();
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('❌ Get Prompts Error:', error);
    res.status(500).json({ error: 'Failed to load prompts' });
  }
};

export const updatePrompt = async (req, res) => {
  const { type } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    await PromptService.updatePrompt(type, content);
    res.json({ success: true, message: 'Prompt updated successfully' });
  } catch (error) {
    console.error(`❌ Update Prompt Error (${type}):`, error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
};

export const resetPrompt = async (req, res) => {
  const { type } = req.params;
  try {
    await PromptService.resetPrompt(type);
    res.json({ success: true, message: 'Prompt reset to default' });
  } catch (error) {
    console.error(`❌ Reset Prompt Error (${type}):`, error);
    res.status(500).json({ error: error.message });
  }
};