import { pool } from '../config/database.js';

export class Permission {
    static async grantAll(userId, conn = pool) {
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
    }

    static async grantDefaultExternal(userId, conn = pool) {
        const [categories] = await conn.execute(
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
            await conn.execute(
                `INSERT INTO employee_access_permissions (employee_id, category_id, subcategory_id, source_id, access_level, granted_by)
                 VALUES ${placeholders}`,
                flatValues
            );
        }
    }

    static async revokeAll(userId, conn = pool) {
        await conn.execute("DELETE FROM employee_access_permissions WHERE employee_id = ?", [userId]);
    }
    
    static async checkKbSettingsAccess(userId, conn = pool) {
        const [rows] = await conn.execute(
          `SELECT 1 
           FROM employee_access_permissions 
           WHERE employee_id = ? 
             AND (
               source_id IN (
                 SELECT id FROM live_data_sources 
                 WHERE source_type = 'internal_flag' AND name = 'KB_SETTINGS_ACCESS'
               )
               OR (category_id IS NULL AND subcategory_id IS NULL AND source_id IS NULL)
             )
           LIMIT 1`,
          [userId]
        );
        return rows.length > 0;
    }
}
