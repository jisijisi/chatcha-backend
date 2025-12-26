// middleware/auth.js
import { pool } from '../config/database.js';

export const adminAuthMiddleware = async (req, res, next) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    } else {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    const sessionToken = token.split('_'); // Format: admin_token_TIMESTAMP_ID
    
    if (sessionToken[0] !== 'admin' || sessionToken[1] !== 'token') {
      return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    }

    const adminId = sessionToken[3];
    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }

    const [adminRows] = await pool.execute(
      `SELECT id FROM employees WHERE id = ? AND is_active = TRUE`,
      [adminId]
    );

    if (adminRows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Admin user not found or inactive' });
    }

    req.adminUser = { id: adminId };
    next();

  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
