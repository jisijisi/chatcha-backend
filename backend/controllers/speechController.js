import { pool } from '../config/database.js';
import { invalidateCache } from '../utils/speechNormalizer.js';

// --- Lazy Table Initialization ---
// Ensures table exists when controller is first used
const ensureTableExists = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS speech_normalization (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pattern VARCHAR(255) NOT NULL,
                replacement VARCHAR(255) NOT NULL,
                type ENUM('acronym', 'brand', 'unit', 'general') DEFAULT 'general',
                description VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_pattern (pattern)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
    } catch (error) {
        console.error("Failed to ensure speech_normalization table:", error);
    }
};

// Initialize once
ensureTableExists();

// --- Controllers ---

/**
 * GET /api/speech/rules
 * Fetch all normalization rules
 */
export const getRules = async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM speech_normalization ORDER BY created_at DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * POST /api/speech/rules
 * Add a new rule
 */
export const addRule = async (req, res) => {
    const { pattern, replacement, type, description } = req.body;
    
    if (!pattern || !replacement) {
        return res.status(400).json({ error: "Pattern and Replacement are required." });
    }

    try {
        const [result] = await pool.query(
            "INSERT INTO speech_normalization (pattern, replacement, type, description) VALUES (?, ?, ?, ?)",
            [pattern, replacement, type || 'general', description || '']
        );
        
        invalidateCache(); // Clear cache so next TTS uses new rule
        res.status(201).json({ id: result.insertId, message: "Rule added successfully." });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: "Rule for this pattern already exists." });
        }
        res.status(500).json({ error: error.message });
    }
};

/**
 * PUT /api/speech/rules/:id
 * Update an existing rule
 */
export const updateRule = async (req, res) => {
    const { id } = req.params;
    const { pattern, replacement, type, description, is_active } = req.body;

    try {
        await pool.query(
            "UPDATE speech_normalization SET pattern = ?, replacement = ?, type = ?, description = ?, is_active = ? WHERE id = ?",
            [pattern, replacement, type, description, is_active, id]
        );

        invalidateCache();
        res.json({ message: "Rule updated successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * DELETE /api/speech/rules/:id
 * Delete a rule
 */
export const deleteRule = async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query("DELETE FROM speech_normalization WHERE id = ?", [id]);
        
        invalidateCache();
        res.json({ message: "Rule deleted successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
