import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod_12345';

export const jwtAuth = async (req, res, next) => {
    let token;
    
    // Check for Authorization header
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        // Check for token in query parameters (for SSE)
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    // 1. Try JWT Verification
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; 
        return next();
    } catch (jwtError) {
        // JWT failed, fall through to legacy check
    }

    // 2. Legacy Admin Token Fallback
    try {
        if (token.startsWith('admin_token_')) {
            const parts = token.split('_'); // admin_token_TIMESTAMP_ID
            const adminId = parts[3];

            if (adminId) {
                const [rows] = await pool.execute(
                    'SELECT id, email, name, department, position FROM employees WHERE id = ? AND is_active = TRUE',
                    [adminId]
                );

                if (rows.length > 0) {
                    const admin = rows[0];
                    req.user = {
                        id: admin.id,
                        email: admin.email,
                        name: admin.name,
                        role: 'admin',
                        type: 'employee'
                    };
                    return next();
                }
            }
        }
    } catch (dbError) {
        console.error('Legacy Token Check Error:', dbError);
    }

    // If both fail
    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
};
