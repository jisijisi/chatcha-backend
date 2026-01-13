
import { pool } from '../config/database.js';

export const getUserProfile = async (req, res) => {
  const email = req.query.email || req.header('X-User-Email');
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, department, position, is_active FROM employees WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.json({ exists: false, user: null });
    }
    
    // Check for missing critical fields
    const user = rows[0];
    const isIncomplete = !user.name || (!user.department && !user.position);
    
    return res.json({ exists: true, user, isIncomplete });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

export const upsertUserProfile = async (req, res) => {
  const { email, name, department = null, position = null, activate = true } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and Name are required' });
  }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.execute('SELECT id FROM employees WHERE email = ?', [email]);
      if (existing.length === 0) {
        // Create New User
        // Default to NULL department/position to trigger Onboarding Modal if not provided
        // Use 'External' / 'Guest' as fallbacks only if explicitly desired, but here we want the modal.
        // However, if the request comes from Admin Panel (manual creation), they might provide dept.
        
        const safeDept = department; // Can be null
        const safePos = position;    // Can be null

        const [result] = await conn.execute(
          `INSERT INTO employees (name, email, department, position, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [name, email, safeDept, safePos, activate ? 1 : 0]
        );
        
        const newUserId = result.insertId;
        
        // Default Permissions: EXTERNAL
        // We do NOT grant full access by default anymore. 
        // User must validate Employee ID to get full access.
        const [categories] = await conn.execute(
            `SELECT id FROM knowledge_categories 
             WHERE LOWER(name) LIKE 'company-general%' 
                OR LOWER(name) LIKE 'company general%'
                OR LOWER(name) LIKE 'wikipedia%' 
                OR LOWER(name) LIKE 'wikepedia%'`
        );
        if (categories.length > 0) {
            const values = categories.map(cat => [newUserId, cat.id, null, null, 'read', null]);
            const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = values.flat();
            await conn.execute(
                `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by)
                 VALUES ${placeholders}`,
                flatValues
            );
        }
      } else {
        await conn.execute(
          `UPDATE employees 
             SET name = ?, department = COALESCE(?, department), position = COALESCE(?, position), is_active = ?, updated_at = NOW()
           WHERE email = ?`,
          [name, department, position, activate ? 1 : 0, email]
        );
      }
      await conn.commit();
      res.json({ success: true, message: "Profile updated" });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('❌ Upsert profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
};

export const updateUserProfile = async (req, res) => {
  const { email, name } = req.body;
  const hasDepartment = Object.prototype.hasOwnProperty.call(req.body, 'department');
  const hasPosition = Object.prototype.hasOwnProperty.call(req.body, 'position');
  const department = req.body.department;
  const position = req.body.position;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and Name are required' });
  }
  try {
    const [rows] = await pool.execute(
      `SELECT department, position FROM employees WHERE email = ?`,
      [email]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const current = rows[0];
    const newDepartment = hasDepartment ? department : current.department;
    const newPosition = hasPosition ? position : current.position;

    const [result] = await pool.execute(
      `UPDATE employees SET name = ?, department = ?, position = ?, updated_at = NOW() WHERE email = ?`,
      [name, newDepartment, newPosition, email]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found or no changes made' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const email = req.body?.email || req.header('X-User-Email');
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email required' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [users] = await conn.execute(
        'SELECT id FROM employees WHERE email = ? AND is_active = TRUE',
        [email]
      );
      if (users.length === 0) {
        await conn.rollback();
        return res.status(404).json({ success: false, error: 'Active user not found' });
      }
      const employeeId = users[0].id;
      await conn.execute(
        'DELETE FROM employee_access_permissions WHERE employee_id = ?',
        [employeeId]
      );
      await conn.execute(
        'DELETE FROM user_chats WHERE employee_id = ?',
        [employeeId]
      );
      await conn.execute(
        'DELETE FROM chat_sessions WHERE employee_id = ?',
        [employeeId]
      );
      await conn.execute(
        'DELETE FROM employees WHERE id = ?',
        [employeeId]
      );
      await conn.commit();
      res.json({ success: true, message: 'Account deleted' });
    } catch (e) {
      await conn.rollback();
      console.error('❌ Delete account error:', e);
      res.status(500).json({ success: false, error: 'Failed to delete account' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('❌ Delete account fatal error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
};
