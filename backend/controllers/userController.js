
import { pool } from '../config/database.js';
import { User } from '../models/User.js';
import { Permission } from '../models/Permission.js';
import { Chat } from '../models/Chat.js';

export const getUserProfile = async (req, res) => {
  const email = req.query.email || req.header('X-User-Email');
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return res.json({ exists: false, user: null });
    }
    
    // Check for missing critical fields
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
      const existing = await User.findByEmail(email, conn);
      
      if (!existing) {
        // Create New User
        const safeDept = department; // Can be null
        const safePos = position;    // Can be null

        const newUserId = await User.create({
            name,
            email,
            department: safeDept,
            position: safePos,
            is_active: activate ? 1 : 0
        }, conn);
        
        // Default Permissions: EXTERNAL
        await Permission.grantDefaultExternal(newUserId, conn);
      } else {
        await User.updateProfile(email, {
            name,
            department: department || existing.department,
            position: position || existing.position,
            is_active: activate ? 1 : 0
        }, conn);
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
    const current = await User.findByEmail(email);
    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const newDepartment = hasDepartment ? department : current.department;
    const newPosition = hasPosition ? position : current.position;

    await User.updateProfile(email, {
        name,
        department: newDepartment,
        position: newPosition
    });
    
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
      const user = await User.findByEmail(email, conn);
      
      if (!user) { // Assuming inactive users should also be deletable if found
         // The original query checked for is_active = TRUE, let's respect that logic if needed
         // But usually deletion should work regardless. Original code:
         // SELECT id FROM employees WHERE email = ? AND is_active = TRUE
         // If user is inactive, findByEmail returns it, but we might want to fail?
         // Let's assume finding the user is enough, but check active status if critical.
         // Original code returned 404 if inactive.
      }

      if (!user || !user.is_active) {
        await conn.rollback();
        return res.status(404).json({ success: false, error: 'Active user not found' });
      }

      const employeeId = user.id;
      
      await Permission.revokeAll(employeeId, conn);
      await Chat.deleteAllForUser(employeeId, conn);
      await User.delete(employeeId, conn);
      
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
