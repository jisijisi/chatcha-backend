// backend/controllers/authController.js
import { pool } from '../config/database.js';
import { UserGoogleService } from '../services/userGoogleService.js';

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