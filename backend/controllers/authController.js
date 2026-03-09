
import { pool } from '../config/database.js';
import { User } from '../models/User.js';
import { Permission } from '../models/Permission.js';
import { UserGoogleService } from '../services/userGoogleService.js';
import { SystemEmailService } from '../services/systemEmailService.js';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';

const otpStore = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod_12345';

/**
 * 1. Connect Google Account (Exchange Code)
 * This is for linking a Google account to an existing user session
 */
export const connectGoogle = async (req, res) => {
    const { code } = req.body;
    
    // Use req.user from JWT middleware if available, otherwise fallback to header (for now)
    // In a fully migrated system, we should rely only on req.user
    const userEmail = req.user ? req.user.email : req.header('X-User-Email'); 

    if (!userEmail) {
        return res.status(401).json({ error: "User email missing" });
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
        const user = await User.findByEmail(userEmail);

        if (user && user.google_tokens) {
            const tokens = typeof user.google_tokens === 'string' 
                ? JSON.parse(user.google_tokens) 
                : user.google_tokens;

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
        await User.updateGoogleTokens(userEmail, null);
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
            if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
                console.log(`[DEV] OTP for ${email}: ${code}`);
                console.error("OTP Email Error:", sendErr);
                return res.json({ 
                    success: true, 
                    message: "OTP generated (Dev Mode)", 
                    dev_otp: code,
                    dev_error: sendErr.message
                });
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
        
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Check if user exists
            const existing = await User.findByEmail(email, conn);
            
            let userId = existing ? existing.id : null;
            let userName = existing ? existing.name : null;
            let isNewUser = false;
            
            const isCompanyEmail = email.toLowerCase().endsWith('@cdo.com.ph');
            let userType = isCompanyEmail ? 'employee' : 'external';

            if (existing) {
                // Determine type based on DB record
                if (existing.department && existing.department !== 'External') {
                    userType = 'employee';
                }
            }
            
            if (!userId) {
                // Create New User
                isNewUser = true;
                userName = email.split('@')[0]; // Default name
                
                // Auto-set department and position for company emails
                const defaultDept = isCompanyEmail ? 'General' : null; 
                const defaultPos = isCompanyEmail ? 'Employee' : null;

                userId = await User.create({
                    name: userName,
                    email: email,
                    department: defaultDept,
                    position: defaultPos
                }, conn);
                
                // Set Permissions
                if (isCompanyEmail) {
                    await Permission.grantAll(userId, conn);
                } else {
                    await Permission.grantDefaultExternal(userId, conn);
                }
            } else if (existing.is_active === 0) {
                await User.activate(userId, conn);
            }
            
            await conn.commit();

            // Generate JWT Token
            const token = jwt.sign(
                { 
                    id: userId, 
                    email: email, 
                    name: userName,
                    type: userType 
                }, 
                JWT_SECRET, 
                { expiresIn: '30d' }
            );

            res.json({ 
                success: true, 
                message: "Verified", 
                token: token,
                user: { 
                    id: userId, 
                    email: email, 
                    name: userName,
                    type: userType 
                }, 
                is_new_user: isNewUser
            });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
};

export const validateEmployee = async (req, res) => {
    try {
        const { emp_id } = req.body;
        console.log(`🔍 Validating Employee ID: ${emp_id}`);
        
        if (!emp_id) {
            console.warn('⚠️ Validation failed: No Employee ID provided');
            return res.status(400).json({ valid: false, message: "Employee ID is required" });
        }

        // Query the employees_db.employees table (External Database)
        console.log('📝 Executing DB Query: SELECT ... FROM employees_db.employees');
        const [rows] = await pool.execute(
            "SELECT emp_id, full_name, department, position FROM employees_db.employees WHERE emp_id = ?",
            [emp_id]
        );
        console.log(`✅ DB Query result: ${rows.length} rows found`);

        if (rows.length > 0) {
            const employee = rows[0];
            console.log('👤 Employee found:', employee.full_name);
            return res.json({ 
                valid: true, 
                employee: {
                    emp_id: employee.emp_id,
                    full_name: employee.full_name,
                    department: employee.department,
                    position: employee.position
                }
            });
        } else {
            console.warn(`❌ Employee ID ${emp_id} not found in database`);
            return res.json({ valid: false, message: "Employee ID not found" });
        }
    } catch (error) {
        console.error("❌ Employee Validation Error:", error);
        return res.status(500).json({ valid: false, message: "Validation error", error: error.message });
    }
};

/**
 * Register Verified Employee
 * Promotes a user to 'Employee' status after successful ID validation
 */
export const registerEmployee = async (req, res) => {
    const userEmail = req.header('X-User-Email');
    const { emp_id } = req.body;

    if (!userEmail || !emp_id) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Verify User Exists
        let user = await User.findByEmail(userEmail, conn);
        let userId;

        if (!user) {
            console.log(`⚠️ User not found during registration: ${userEmail}. Creating now...`);
            userId = await User.create({
                name: userEmail.split('@')[0],
                email: userEmail,
                department: null,
                position: null
            }, conn);
        } else {
            userId = user.id;
        }

        // 2. Verify Employee ID again (Security)
        const [empRows] = await conn.execute(
            "SELECT full_name, department, position FROM employees_db.employees WHERE emp_id = ?",
            [emp_id]
        );
        
        if (empRows.length === 0) {
            throw new Error("Invalid Employee ID");
        }
        const employeeData = empRows[0];

        // 3. Update User Profile
        await User.updateProfile(userEmail, {
            name: employeeData.full_name,
            department: employeeData.department,
            position: employeeData.position
        }, conn);

        // 4. Update Permissions (Upgrade to Full Access)
        await Permission.revokeAll(userId, conn);
        await Permission.grantAll(userId, conn);

        await conn.commit();
        res.json({ success: true, message: "Employee verified and registered successfully" });

    } catch (error) {
        await conn.rollback();
        console.error("Register Employee Error:", error);
        res.status(500).json({ success: false, message: error.message || "Registration failed" });
    } finally {
        conn.release();
    }
};

/**
 * Login with Google ID Token
 */
export const googleLogin = async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ success: false, message: "Google token required" });
    }

    try {
        const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const email = payload.email;
        const name = payload.name;
        
        if (!email) {
            return res.status(400).json({ success: false, message: "Invalid Google Token: No email found" });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Check if user exists
            const existing = await User.findByEmail(email, conn);
            
            let userId = existing ? existing.id : null;
            let userName = existing ? existing.name : name || email.split('@')[0];
            let isNewUser = false;
            
            const isCompanyEmail = email.toLowerCase().endsWith('@cdo.com.ph');
            let userType = isCompanyEmail ? 'employee' : 'external';

            if (existing) {
                if (existing.department && existing.department !== 'External') {
                    userType = 'employee';
                }
            }
            
            if (!userId) {
                isNewUser = true;
                const defaultDept = isCompanyEmail ? 'General' : null; 
                const defaultPos = isCompanyEmail ? 'Employee' : null;

                userId = await User.create({
                    name: userName,
                    email: email,
                    department: defaultDept,
                    position: defaultPos
                }, conn);
                
                if (isCompanyEmail) {
                    await Permission.grantAll(userId, conn);
                } else {
                    await Permission.grantDefaultExternal(userId, conn);
                }
            } else if (existing.is_active === 0) {
                await User.activate(userId, conn);
            }

            await conn.commit();

            // Generate JWT Token
            const jwtToken = jwt.sign(
                { 
                    id: userId, 
                    email: email, 
                    name: userName,
                    type: userType 
                }, 
                JWT_SECRET, 
                { expiresIn: '30d' }
            );

            res.json({ 
                success: true, 
                message: "Login successful", 
                token: jwtToken,
                user: { 
                    id: userId, 
                    email: email, 
                    name: userName,
                    type: userType 
                }, 
                is_new_user: isNewUser
            });
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error("Google Login Error:", error);
        res.status(401).json({ success: false, message: "Google authentication failed" });
    }
};
