// backend/middleware/maintenance.js
import { pool } from '../config/database.js';

export const checkMaintenanceMode = async (req, res, next) => {
    // 1. EXEMPTION: Always allow Admin routes so you don't lock yourself out
    if (req.path.startsWith('/admin')) {
        return next();
    }

    // 2. EXEMPTION: Allow static assets (images, css, js) so the error page looks good
    if (req.path.startsWith('/assets') || req.path.includes('.')) {
        return next();
    }

    try {
        // 3. Check Database Status
        const [rows] = await pool.execute(
            "SELECT maintenance_mode FROM system_settings WHERE id = 1"
        );

        // 4. If Maintenance Mode is ON (1/true), block the request
        if (rows.length > 0 && rows[0].maintenance_mode) {
            console.log(`⛔ Maintenance Block: Request to ${req.path} denied`);
            
            return res.status(503).json({ 
                success: false,
                error: 'Service Unavailable', 
                message: 'System is currently undergoing scheduled maintenance.',
                maintenance_mode: true
            });
        }

        // 5. If OFF, proceed
        next();
        
    } catch (error) {
        console.error("⚠️ Maintenance check failed:", error);
        // Fail safe: If DB error, let traffic through or handle globally
        next(); 
    }
};