
import { pool } from '../config/database.js';

export const getNotifications = async (req, res) => {
  try {
    const userId = req.params.userId || req.query.userId;
    
    // If using auth middleware, req.user should be populated.
    // Assuming adminController pattern where user might be passed or derived.
    // For now, let's assume the client sends the userId or it's in the token.
    // If not, we might need to adjust.
    // Based on adminController, it seems session management is manual or token based.
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const [notifications] = await pool.execute(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );

    const [unreadCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );

    res.json({
      notifications,
      unreadCount: unreadCount[0].count
    });
  } catch (error) {
    console.error('❌ Get Notifications Error:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    await pool.execute(
      `UPDATE notifications SET is_read = TRUE WHERE id = ?`,
      [notificationId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Mark As Read Error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    await pool.execute(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = ?`,
      [userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Mark All Read Error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;
    await pool.execute(
      `DELETE FROM notifications WHERE id = ?`,
      [notificationId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete Notification Error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    await pool.execute(
      `DELETE FROM notifications WHERE user_id = ?`,
      [userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete All Notifications Error:', error);
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
};

// Helper for internal use
export const createNotification = async (userId, message, type = 'info') => {
  try {
    await pool.execute(
      `INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)`,
      [userId, message, type]
    );
    return true;
  } catch (error) {
    console.error('❌ Create Notification Error:', error);
    return false;
  }
};

// Helper to notify all admins
export const notifyAdmins = async (message, type = 'warning') => {
  try {
    const [admins] = await pool.execute(
      `SELECT id FROM employees WHERE role = 'admin' AND is_active = TRUE`
    );

    if (admins.length === 0) return false;

    // Use Promise.all for parallel insertion
    const queries = admins.map(admin => 
      pool.execute(
        `INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)`,
        [admin.id, message, type]
      )
    );

    await Promise.all(queries);
    console.log(`📢 Notified ${admins.length} admins: "${message.substring(0, 50)}..."`);
    return true;
  } catch (error) {
    console.error('❌ Notify Admins Error:', error);
    return false;
  }
};
