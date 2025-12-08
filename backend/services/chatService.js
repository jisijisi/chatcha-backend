// backend/services/chatService.js
import { pool } from '../config/database.js';

export class ChatService {
  static async loadUserChats(userEmail) {
    try {
      // 1. Get Employee
      const [employeeRows] = await pool.execute(
        "SELECT id, name, email FROM employees WHERE email = ? AND is_active = TRUE",
        [userEmail]
      );
      
      if (employeeRows.length === 0) {
        return this.getEmptyState(null);
      }
      
      const employeeId = employeeRows[0].id;
      const employeeName = employeeRows[0].name;

      // 2. Load Titles & Sessions (Parallel)
      const [customTitles, sessions] = await Promise.all([
        this.loadCustomTitles(employeeId),
        this.loadUserSessions(employeeId)
      ]);

      if (sessions.length === 0) {
        return this.getEmptyState(employeeName);
      }

      // 3. OPTIMIZED: Fetch ALL messages for these sessions in ONE query
      const sessionIds = sessions.map(s => s.session_id);
      const allMessages = await this.loadAllSessionMessages(employeeId, sessionIds);

      // 4. Group messages by Session ID in memory
      const { chats, currentConversation, activeChatIndex } = this.processChatsInMemory(
        sessions, 
        allMessages, 
        customTitles
      );

      return {
        chats,
        currentConversation,
        activeChatIndex,
        historyCollapsed: false,
        userName: employeeName || userEmail.split('@')[0]
      };
    } catch (err) {
      console.error('❌ Error loading chat history:', err);
      return this.getEmptyState(null);
    }
  }

  static getEmptyState(userName) {
    return { chats: [], currentConversation: [], activeChatIndex: null, historyCollapsed: false, userName };
  }

  static async loadCustomTitles(employeeId) {
    try {
      const [rows] = await pool.execute("SELECT session_id, title FROM chat_sessions WHERE employee_id = ?", [employeeId]);
      // Convert to Map for O(1) lookup
      return rows.reduce((acc, row) => ({ ...acc, [row.session_id]: row.title }), {});
    } catch (err) { return {}; }
  }

  static async loadUserSessions(employeeId) {
    const [rows] = await pool.execute(`
      SELECT session_id, MAX(message_timestamp) as latest_timestamp
      FROM user_chats WHERE employee_id = ?
      GROUP BY session_id ORDER BY latest_timestamp DESC LIMIT 50
    `, [employeeId]);
    return rows;
  }

  // 🔥 NEW: Batch fetch messages to prevent N+1 problem
  static async loadAllSessionMessages(employeeId, sessionIds) {
    if (sessionIds.length === 0) return [];
    
    // Create placeholders (?, ?, ?)
    const placeholders = sessionIds.map(() => '?').join(',');
    
    const [rows] = await pool.execute(`
      SELECT session_id, user_message, ai_response, message_timestamp, accessed_categories
      FROM user_chats 
      WHERE employee_id = ? AND session_id IN (${placeholders})
      ORDER BY message_timestamp ASC
    `, [employeeId, ...sessionIds]);

    return rows;
  }

  static processChatsInMemory(sessions, allMessages, customTitles) {
    const chats = [];
    let currentConversation = [];
    let activeChatIndex = null;

    // Group messages by session_id
    const messagesBySession = {};
    allMessages.forEach(row => {
      if (!messagesBySession[row.session_id]) messagesBySession[row.session_id] = [];
      
      // Parse JSON safely
      let categories = {};
      if (typeof row.accessed_categories === 'string') {
        try { categories = JSON.parse(row.accessed_categories); } catch(e){}
      } else {
        categories = row.accessed_categories || {};
      }

      messagesBySession[row.session_id].push({
        question: row.user_message,
        answer: row.ai_response,
        timestamp: row.message_timestamp,
        accessed_documents: categories.documents || [],
        accessed_tools: categories.tools || [],
        source_categories: categories || {}
      });
    });

    // Build Chat Objects
    sessions.forEach((session, index) => {
      const conversation = messagesBySession[session.session_id] || [];
      if (conversation.length > 0) {
        const title = customTitles[session.session_id] || this.generateAutoTitle(conversation);
        
        chats.push({
          title,
          conversation,
          timestamp: session.latest_timestamp,
          sessionId: session.session_id
        });

        if (index === 0) {
          currentConversation = conversation;
          activeChatIndex = 0;
        }
      }
    });

    return { chats, currentConversation, activeChatIndex };
  }

  static generateAutoTitle(conversation) {
    const firstQ = conversation[0]?.question || "New Chat";
    return firstQ.length > 30 ? firstQ.substring(0, 30) + "..." : firstQ;
  }

  static async saveUserChats(userEmail, chatData) {
    try {
        const [emp] = await pool.execute("SELECT id FROM employees WHERE email = ?", [userEmail]);
        if (emp.length === 0) return { success: true, message: "No employee record found" };
        
        const employeeId = emp[0].id;
        const { chats, currentConversation, activeChatIndex } = chatData;

        if (currentConversation?.length > 0 && activeChatIndex !== null && chats[activeChatIndex]) {
            const sessionId = chats[activeChatIndex].sessionId || `session-${Date.now()}-${employeeId}`;
            const title = chats[activeChatIndex].title || "New Chat";
            
            // Transaction for safety
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                
                // 1. Delete old messages for this session (Overwrite strategy)
                await connection.execute("DELETE FROM user_chats WHERE employee_id = ? AND session_id = ?", [employeeId, sessionId]);
                
                // 2. Batch Insert Messages
                const values = [];
                const placeholders = [];
                
                for (const msg of currentConversation) {
                    placeholders.push(`(?, ?, ?, ?, ?, ?)`);
                    values.push(
                        employeeId, 
                        sessionId, 
                        msg.question || '', 
                        msg.answer || '', 
                        JSON.stringify({ documents: msg.accessed_documents || [], tools: msg.accessed_tools || [] }), 
                        msg.timestamp ? new Date(msg.timestamp) : new Date()
                    );
                }

                if (values.length > 0) {
                    const sql = `INSERT INTO user_chats (employee_id, session_id, user_message, ai_response, accessed_categories, message_timestamp) VALUES ${placeholders.join(',')}`;
                    await connection.execute(sql, values);
                }

                // 3. Upsert Session Title
                await connection.execute(`
                    INSERT INTO chat_sessions (session_id, employee_id, title) VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE title = VALUES(title)
                `, [sessionId, employeeId, title]);

                await connection.commit();
            } catch (err) {
                await connection.rollback();
                throw err;
            } finally {
                connection.release();
            }
        }
        return { success: true };
    } catch (err) {
        console.error('❌ Save Error:', err);
        return { success: false, error: err.message };
    }
  }

  static async deleteChat(userEmail, sessionId) {
    try {
        const [emp] = await pool.execute("SELECT id FROM employees WHERE email = ?", [userEmail]);
        if (emp.length === 0) return { error: "User not found" };
        const employeeId = emp[0].id;

        await pool.execute("DELETE FROM user_chats WHERE employee_id = ? AND session_id = ?", [employeeId, sessionId]);
        await pool.execute("DELETE FROM chat_sessions WHERE employee_id = ? AND session_id = ?", [employeeId, sessionId]);
        
        return { success: true };
    } catch (err) { return { error: err.message }; }
  }

  static async renameChat(userEmail, sessionId, newTitle) {
    try {
        const [emp] = await pool.execute("SELECT id FROM employees WHERE email = ?", [userEmail]);
        if (emp.length === 0) return { error: "User not found" };

        await pool.execute(`
            INSERT INTO chat_sessions (session_id, employee_id, title) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE title = VALUES(title)
        `, [sessionId, emp[0].id, newTitle]);

        return { success: true };
    } catch (err) { return { error: err.message }; }
  }
}