// backend/controllers/authController.js
import { pool } from '../config/database.js';
import { UserGoogleService } from '../services/userGoogleService.js';
import { SystemEmailService } from '../services/systemEmailService.js';
const otpStore = new Map();

/**
 * 1. Connect Google Account (Exchange Code)
 */
export const connectGoogle = async (req, res) => {
    const { code } = req.body;
    
    // We trust the X-User-Email header because it's an internal tool, 
    // but in production, you'd verify the session/JWT here.
    const userEmail = req.header('X-User-Email'); 

    if (!userEmail) {
        return res.status(401).json({ error: "User email header missing" });
    }

    try {
        console.log(`🔌 Connecting Google account for: ${userEmail}`);
        await UserGoogleService.connectUser(userEmail, code);
        res.json({ success: true, message: "Google account connected successfully!" });
    } catch (error) {
        console.error("Auth Connection Error:", error);
        res.status(500).json({ error: "Failed to connect Google account", details: error.message });
    }
};

/**
 * 2. Check Connection Status
 * UPDATED: Returns the list of granted scopes so UI can show correct status per service
 */
export const checkGoogleStatus = async (req, res) => {
    const userEmail = req.header('X-User-Email');

    if (!userEmail) {
        return res.json({ connected: false, scopes: [] });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT google_tokens FROM employees WHERE email = ?",
            [userEmail]
        );

        if (rows.length > 0 && rows[0].google_tokens) {
            const tokens = typeof rows[0].google_tokens === 'string' 
                ? JSON.parse(rows[0].google_tokens) 
                : rows[0].google_tokens;

            // Check if tokens exist
            const hasTokens = tokens && Object.keys(tokens).length > 0;
            
            // Extract scopes if available (Google usually returns them as a space-separated string)
            const scopeString = tokens.scope || "";
            const scopes = scopeString.split(" ");

            return res.json({ connected: hasTokens, scopes: scopes });
        }

        res.json({ connected: false, scopes: [] });
    } catch (error) {
        console.error("Check Status Error:", error);
        res.status(500).json({ connected: false, scopes: [] });
    }
};

/**
 * 3. Disconnect Google Account
 */
export const disconnectGoogle = async (req, res) => {
    const userEmail = req.header('X-User-Email');

    if (!userEmail) {
        return res.status(401).json({ error: "User email missing" });
    }

    try {
        await pool.execute(
            "UPDATE employees SET google_tokens = NULL WHERE email = ?",
            [userEmail]
        );
        console.log(`🔌 Disconnected Google account for: ${userEmail}`);
        res.json({ success: true, message: "Disconnected successfully" });
    } catch (error) {
        console.error("Disconnect Error:", error);
        res.status(500).json({ error: "Failed to disconnect" });
    }
};

export const requestOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, message: "Valid email required" });
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 5 * 60 * 1000;
        otpStore.set(email.toLowerCase(), { code, expiresAt });
        try {
            await SystemEmailService.sendOtpEmail(email, code, 5);
            res.json({ success: true, message: "OTP sent to email" });
        } catch (sendErr) {
            const msg = sendErr?.message || 'Failed to send OTP email';
            // Fallback for dev/testing if email fails
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEV] OTP for ${email}: ${code}`);
                return res.json({ success: true, message: "OTP generated (Dev Mode)" });
            }
            const isConfigError = msg.includes('Missing Gmail OAuth configuration');
            if (isConfigError) {
                return res.status(500).json({
                    success: false,
                    message: "Email sending is not configured. Please set Gmail OAuth env vars."
                });
            }
            return res.status(500).json({ success: false, message: "Failed to send OTP email" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ success: false, message: "Email and OTP code required" });
        }
        const key = email.toLowerCase();
        const entry = otpStore.get(key);
        if (!entry) {
            return res.status(400).json({ success: false, message: "No OTP requested" });
        }
        if (Date.now() > entry.expiresAt) {
            otpStore.delete(key);
            return res.status(400).json({ success: false, message: "OTP expired" });
        }
        if (entry.code !== String(code)) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
        otpStore.delete(key);
        
        // Check if user exists
        const [existing] = await pool.execute(
            `SELECT id, name, is_active FROM employees WHERE email = ?`,
            [email]
        );
        
        let userId = existing.length ? existing[0].id : null;
        let userName = existing.length ? existing[0].name : null;
        let isNewUser = false;
        
        const companyDomain = process.env.COMPANY_EMAIL_DOMAIN || 'cdo.com.ph';
        const isCompanyEmail = email.toLowerCase().endsWith(`@${companyDomain}`);
        
        if (!userId) {
            // Create New User
            isNewUser = true;
            userName = email.split('@')[0]; // Default name
            
            // Set defaults: 
            // Company users get NULL (to force onboarding dropdowns). 
            // External users get 'External'/'External User' so they are distinct from 'Guest' (anonymous).
            const defaultDept = isCompanyEmail ? null : 'External'; 
            const defaultPos = isCompanyEmail ? null : 'External User';

            const [result] = await pool.execute(
                `INSERT INTO employees (name, email, department, position, is_active, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, TRUE, NOW(), NOW())`,
                [userName, email, defaultDept, defaultPos]
            );
            userId = result.insertId;
            
            // Default Permissions
            await pool.execute(
                `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by) VALUES (?, NULL, NULL, NULL, 'read', NULL)`,
                [userId]
            );
        } else if (existing[0].is_active === 0) {
            await pool.execute(
                `UPDATE employees SET is_active = TRUE, updated_at = NOW() WHERE id = ?`,
                [userId]
            );
        }
        
        // Return type: 'employee' for CDO, 'external' for others (Gmail/Yahoo), 'guest' only for anonymous
        const userType = isCompanyEmail ? 'employee' : 'external';
        
        res.json({ 
            success: true, 
            message: "Verified", 
            user: { 
                id: userId, 
                email: email, 
                name: userName,
                type: userType 
            }, 
            is_new_user: isNewUser, 
            is_company_email: isCompanyEmail 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
};