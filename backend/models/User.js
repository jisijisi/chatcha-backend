import { pool } from '../config/database.js';

export class User {
    static async findByEmail(email, conn = pool) {
        const [rows] = await conn.execute(
            "SELECT id, name, email, department, position, is_active, google_tokens FROM employees WHERE email = ?",
            [email]
        );
        return rows[0];
    }

    static async findById(id, conn = pool) {
        const [rows] = await conn.execute(
            "SELECT id, name, email, department, position, is_active FROM employees WHERE id = ?",
            [id]
        );
        return rows[0];
    }

    static async create({ name, email, department, position, is_active = true }, conn = pool) {
        const [result] = await conn.execute(
            `INSERT INTO employees (name, email, department, position, is_active, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [name, email, department, position, is_active]
        );
        return result.insertId;
    }

    static async updateProfile(email, { name, department, position, is_active }, conn = pool) {
        // Build dynamic query to avoid overwriting with null if not provided
        let query = "UPDATE employees SET updated_at = NOW()";
        const params = [];

        if (name !== undefined) {
            query += ", name = ?";
            params.push(name);
        }
        if (department !== undefined) {
            query += ", department = ?";
            params.push(department);
        }
        if (position !== undefined) {
            query += ", position = ?";
            params.push(position);
        }
        if (is_active !== undefined) {
            query += ", is_active = ?";
            params.push(is_active);
        }

        query += " WHERE email = ?";
        params.push(email);

        await conn.execute(query, params);
    }

    static async updateGoogleTokens(email, tokens, conn = pool) {
        const tokenString = tokens ? JSON.stringify(tokens) : null;
        await conn.execute(
            "UPDATE employees SET google_tokens = ? WHERE email = ?",
            [tokenString, email]
        );
    }

    static async activate(id, conn = pool) {
        await conn.execute(
            "UPDATE employees SET is_active = TRUE, updated_at = NOW() WHERE id = ?",
            [id]
        );
    }

    static async delete(id, conn = pool) {
        await conn.execute("DELETE FROM employees WHERE id = ?", [id]);
    }
}
