// controllers/chatController.js - FIXED with chat_sessions sync
import { pool } from '../config/database.js';
import { broadcastDashboardUpdate } from './adminController.js';

export const loadChats = async (req, res) => {
    const userEmail = req.header('X-User-Email') || req.query.email;
    if (!userEmail) {
        return res.status(400).json({ error: "Email header or query missing" });
    }
    try {
        const [employeeRows] = await pool.execute(
            "SELECT id, name, email FROM employees WHERE email = ? AND is_active = TRUE",
            [userEmail]
        );
        if (employeeRows.length === 0) {
            console.log(`ℹ️ Employee not found in NEW database: ${userEmail}`);
            return res.json({
                chats: [],
                currentConversation: [],
                activeChatIndex: null,
                historyCollapsed: false,
                userName: null
            });
        }
        const employeeId = employeeRows[0].id;
        const employeeName = employeeRows[0].name;
        let customTitles = {};
        try {
            const [titleRows] = await pool.execute(
                "SELECT session_id, title FROM chat_sessions WHERE employee_id = ?",
                [employeeId]
            );
            titleRows.forEach(row => {
                customTitles[row.session_id] = row.title;
            });
        } catch (titleErr) {
            console.warn('⚠️ Could not load custom chat titles. The `chat_sessions` table might be missing. Titles will be auto-generated.');
        }
        const [sessionRows] = await pool.execute(`
            SELECT session_id, MAX(message_timestamp) as latest_timestamp
            FROM user_chats 
            WHERE employee_id = ?
            GROUP BY session_id
            ORDER BY latest_timestamp DESC
            LIMIT 50
        `, [employeeId]);
        const chats = [];
        let currentConversation = [];
        let activeChatIndex = null;
        for (let i = 0; i < sessionRows.length; i++) {
            const sessionId = sessionRows[i].session_id;
            const [messageRows] = await pool.execute(`
                SELECT user_message, ai_response, message_timestamp, accessed_categories
                FROM user_chats 
                WHERE employee_id = ? AND session_id = ?
                ORDER BY message_timestamp ASC
            `, [employeeId, sessionId]);
            if (messageRows.length > 0) {
                const conversation = messageRows.map(row => {
                    const categories = row.accessed_categories || {};
                    return {
                        question: row.user_message,
                        answer: row.ai_response,
                        timestamp: row.message_timestamp,
                        accessed_documents: categories.documents || [],
                        accessed_tools: categories.tools || [],
                        source_categories: categories || {}
                    };
                });
                let title;
                if (customTitles[sessionId]) {
                    title = customTitles[sessionId];
                } else {
                    const firstQuestion = conversation[0]?.question || "Unknown";
                    title = firstQuestion.length > 30 
                        ? firstQuestion.substring(0, 30) + "..." 
                        : firstQuestion;
                }
                const chat = {
                    title: title,
                    conversation: conversation,
                    timestamp: sessionRows[i].latest_timestamp,
                    sessionId: sessionId
                };
                chats.push(chat);
                if (i === 0) {
                    currentConversation = conversation;
                    activeChatIndex = 0;
                }
            }
        }
        res.json({
            chats: chats,
            currentConversation: currentConversation,
            activeChatIndex: activeChatIndex,
            historyCollapsed: false,
            userName: employeeName || userEmail.split('@')[0]
        });
    } catch (err) {
        console.error('❌ Error loading chat history from NEW schema:', err);
        res.json({
            chats: [],
            currentConversation: [],
            activeChatIndex: null,
            historyCollapsed: false,
            userName: null
        });
    }
};

export const saveChats = async (req, res) => {
    const userEmail = req.header('X-User-Email') || req.body.email;
    if (!userEmail) {
        return res.status(400).json({ error: "Email header or body missing" });
    }
    try {
        const [employeeRows] = await pool.execute(
            "SELECT id FROM employees WHERE email = ? AND is_active = TRUE",
            [userEmail]
        );
        if (employeeRows.length === 0) {
            console.log(`ℹ️ Employee not found in NEW database for save: ${userEmail}`);
            return res.json({ success: true, message: "Data saved locally (employee not found in NEW DB)" });
        }
        const employeeId = employeeRows[0].id;
        const { chats = [], currentConversation = [], activeChatIndex } = req.body;
        
        if (currentConversation && currentConversation.length > 0) {
            let sessionId;
            let chatTitle;
            
            if (activeChatIndex !== null && activeChatIndex >= 0 && chats[activeChatIndex]) {
                sessionId = chats[activeChatIndex].sessionId || `session-${Date.now()}-${employeeId}`;
                chatTitle = chats[activeChatIndex].title;
                
                // Delete existing messages for this session
                await pool.execute(
                    "DELETE FROM user_chats WHERE employee_id = ? AND session_id = ?",
                    [employeeId, sessionId]
                );
            } else {
                sessionId = `session-${Date.now()}-${employeeId}`;
                // Auto-generate title from first question
                const firstQuestion = currentConversation[0]?.question || "Untitled Chat";
                chatTitle = firstQuestion.length > 30 
                    ? firstQuestion.substring(0, 30) + "..." 
                    : firstQuestion;
            }
            
            // === FIX: Sync to chat_sessions table ===
            try {
                await pool.execute(`
                    INSERT INTO chat_sessions (session_id, employee_id, title, updated_at)
                    VALUES (?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    updated_at = NOW()
                `, [sessionId, employeeId, chatTitle]);
                
                console.log(`✅ Synced session to chat_sessions: ${sessionId} - "${chatTitle}"`);
            } catch (sessionErr) {
                console.error('❌ Failed to sync to chat_sessions:', sessionErr);
                // Continue anyway - the messages will still be saved
            }
            
            // Save all messages
            for (const message of currentConversation) {
                // Store docs and tools with proper handling of object/array formats
                const accessed_categories_json = JSON.stringify({ 
                    documents: message.accessed_documents || [],
                    tools: message.accessed_tools || []
                });
                const messageTimestamp = message.timestamp ? new Date(message.timestamp) : new Date();

                await pool.execute(
                    `INSERT INTO user_chats 
                    (employee_id, session_id, user_message, ai_response, accessed_categories, message_timestamp) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        employeeId,
                        sessionId,
                        message.question || '',
                        message.answer || '',
                        accessed_categories_json,
                        messageTimestamp
                    ]
                );
            }
            
            console.log(`✅ Saved ${currentConversation.length} messages to session ${sessionId}`);
        }
        
        res.json({ 
            success: true, 
            message: "Data saved to NEW database schema",
        });
        try {
            broadcastDashboardUpdate({ event: 'chat_saved' });
        } catch {}
    } catch (err) {
        console.error('❌ Error saving chat history to NEW schema:', err);
        res.json({ 
            success: false, 
            message: "Failed to save to NEW database",
            error: err.message 
        });
    }
};

export const deleteChat = async (req, res) => {
    const userEmail = req.header('X-User-Email') || req.body.email;
    const { sessionId } = req.body;
    if (!userEmail || !sessionId) {
        return res.status(400).json({ error: "Email and sessionId required" });
    }
    try {
        const [employeeRows] = await pool.execute(
            "SELECT id FROM employees WHERE email = ? AND is_active = TRUE",
            [userEmail]
        );
        if (employeeRows.length === 0) {
            return res.status(404).json({ error: "Employee not found" });
        }
        const employeeId = employeeRows[0].id;
        const [result] = await pool.execute(
            "DELETE FROM user_chats WHERE employee_id = ? AND session_id = ?",
            [employeeId, sessionId]
        );
        try {
            await pool.execute(
                "DELETE FROM chat_sessions WHERE employee_id = ? AND session_id = ?",
                [employeeId, sessionId]
            );
        } catch (titleErr) {
            console.warn(`⚠️ Could not delete custom title for session ${sessionId}. Table might be missing.`);
        }
        res.json({ 
            success: true, 
            message: "Chat deleted successfully",
            deletedCount: result.affectedRows
        });
    } catch (err) {
        console.error('❌ Error deleting chat:', err);
        res.status(500).json({ 
            error: "Failed to delete chat",
            details: err.message 
        });
    }
};

export const renameChat = async (req, res) => {
    const userEmail = req.header('X-User-Email') || req.body.email;
    const { sessionId, newTitle } = req.body;
    if (!userEmail || !sessionId || !newTitle) {
        return res.status(400).json({ error: "Email, sessionId, and newTitle required" });
    }
    try {
        const [employeeRows] = await pool.execute(
            "SELECT id FROM employees WHERE email = ? AND is_active = TRUE",
            [userEmail]
        );
        if (employeeRows.length === 0) {
            return res.status(404).json({ error: "Employee not found" });
        }
        const employeeId = employeeRows[0].id;
        const [result] = await pool.execute(`
            INSERT INTO chat_sessions (session_id, employee_id, title, updated_at)
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            updated_at = NOW()
        `, [sessionId, employeeId, newTitle]);
        res.json({ 
            success: true, 
            message: "Chat renamed successfully (persisted)"
        });
    } catch (err) {
        console.error('❌ Error renaming chat:', err);
        if (err.code === 'ER_NO_SUCH_TABLE') {
            console.error('❌ CRITICAL: The `chat_sessions` table does not exist. Please create it to enable rename persistence.');
            return res.status(500).json({
              error: "Failed to rename chat: Server database is missing the `chat_sessions` table.",
              details: err.message
            });
        }
        res.status(500).json({ 
            error: "Failed to rename chat",
            details: err.message 
        });
    }
};
