
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
            `SELECT id, name, is_active, department FROM employees WHERE email = ?`,
            [email]
        );
        
        let userId = existing.length ? existing[0].id : null;
        let userName = existing.length ? existing[0].name : null;
        let isNewUser = false;
        let userType = 'external'; // Default to external until verified

        if (existing.length > 0) {
            // Determine type based on DB record
            if (existing[0].department && existing[0].department !== 'External') {
                userType = 'employee';
            }
        }
        
        if (!userId) {
            // Create New User
            isNewUser = true;
            userName = email.split('@')[0]; // Default name
            
            // Set defaults to NULL to trigger Onboarding Modal
            // We do NOT assume employee status based on email anymore
            const defaultDept = null; 
            const defaultPos = null;

            const [result] = await pool.execute(
                `INSERT INTO employees (name, email, department, position, is_active, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, TRUE, NOW(), NOW())`,
                [userName, email, defaultDept, defaultPos]
            );
            userId = result.insertId;
            
            // Default Permissions: EXTERNAL (Safe Default)
            // They will be upgraded to Employee permissions if they validate their ID in the modal
            const [categories] = await pool.execute(
                `SELECT id FROM knowledge_categories 
                 WHERE LOWER(name) LIKE 'company-general%' 
                    OR LOWER(name) LIKE 'company general%'
                    OR LOWER(name) LIKE 'wikipedia%' 
                    OR LOWER(name) LIKE 'wikepedia%'`
            );
            if (categories.length > 0) {
                const values = categories.map(cat => [userId, cat.id, null, null, 'read', null]);
                const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                const flatValues = values.flat();
                await pool.execute(
                    `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by)
                     VALUES ${placeholders}`,
                    flatValues
                );
            }
        } else if (existing[0].is_active === 0) {
            await pool.execute(
                `UPDATE employees SET is_active = TRUE, updated_at = NOW() WHERE id = ?`,
                [userId]
            );
        }
        
        res.json({ 
            success: true, 
            message: "Verified", 
            user: { 
                id: userId, 
                email: email, 
                name: userName,
                type: userType 
            }, 
            is_new_user: isNewUser
        });
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

        // 1. Verify User Exists (Allow for creation if not found, but it should exist from login)
        const [users] = await conn.execute("SELECT id FROM employees WHERE email = ?", [userEmail]);
        let userId;

        if (users.length === 0) {
            console.log(`⚠️ User not found during registration: ${userEmail}. Creating now...`);
            // Create user just in case they were deleted or session is stale
            const [result] = await conn.execute(
                `INSERT INTO employees (name, email, department, position, is_active, created_at, updated_at) 
                 VALUES (?, ?, NULL, NULL, TRUE, NOW(), NOW())`,
                [userEmail.split('@')[0], userEmail]
            );
            userId = result.insertId;
        } else {
            userId = users[0].id;
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
        await conn.execute(
            "UPDATE employees SET name = ?, department = ?, position = ?, updated_at = NOW() WHERE id = ?",
            [employeeData.full_name, employeeData.department, employeeData.position, userId]
        );

        // 4. Update Permissions (Upgrade to Full Access)
        // First, clear existing (likely External) permissions
        await conn.execute("DELETE FROM employee_access_permissions WHERE employee_id = ?", [userId]);

        // Then, grant all permissions
        const [allCategories] = await conn.execute('SELECT id FROM knowledge_categories');
        if (allCategories.length > 0) {
            const values = allCategories.map(cat => [userId, cat.id, null, null, 'read', null]);
            const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = values.flat();
            await conn.execute(
                `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by)
                 VALUES ${placeholders}`,
                flatValues
            );
        }

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
