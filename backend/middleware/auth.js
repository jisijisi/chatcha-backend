// middleware/auth.js
import { pool } from '../config/database.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod_12345';

export const adminAuthMiddleware = async (req, res, next) => {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  } else {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // 1. Try to verify as standard JWT (New System)
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user exists and is active (Optional extra security)
    // For performance, we might skip DB check on every request, 
    // but for Admin, it's safer to check.
    /*
    const [adminRows] = await pool.execute(
      `SELECT id FROM employees WHERE id = ? AND is_active = TRUE`,
      [decoded.id]
    );
    if (adminRows.length === 0) {
      throw new Error('User no longer active');
    }
    */
   
    req.adminUser = decoded;
    req.user = decoded; // Compatibility with shared controllers
    return next();
  } catch (jwtError) {
    // If JWT verification fails, fall back to legacy token check
    // This allows existing sessions to work until they expire (if we wanted to support them)
    // or handles the transition period.
  }

  // 2. Fallback: Legacy Admin Token Check
  try {
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
    req.user = { id: adminId, role: 'admin' }; // Compatibility
    next();

  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
