import { pool } from '../config/database.js';

export class Chat {
    static async loadByEmail(email) {
        // Need to join with employees to get ID first or subquery
        const [rows] = await pool.execute(
            `SELECT cs.session_id, cs.title, cs.created_at, cs.updated_at 
             FROM chat_sessions cs
             JOIN employees e ON cs.employee_id = e.id
             WHERE e.email = ?
             ORDER BY cs.updated_at DESC`,
            [email]
        );
        return rows;
    }

    static async deleteAllForUser(userId, conn = pool) {
        await conn.execute('DELETE FROM user_chats WHERE employee_id = ?', [userId]);
        await conn.execute('DELETE FROM chat_sessions WHERE employee_id = ?', [userId]);
    }
}
