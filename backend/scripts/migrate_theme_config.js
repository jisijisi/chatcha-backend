import { pool } from '../config/database.js';

async function migrateThemeTable() {
  try {
    const connection = await pool.getConnection();
    
    console.log('Migrating ui_themes table...');

    // Check if 'config' column exists
    const [columns] = await connection.query("SHOW COLUMNS FROM ui_themes LIKE 'config'");
    
    if (columns.length === 0) {
      console.log('Adding config column...');
      await connection.query("ALTER TABLE ui_themes ADD COLUMN config JSON AFTER name");
      
      console.log('Migrating data from colors to config...');
      const [rows] = await connection.query("SELECT id, colors FROM ui_themes");
      
      for (const row of rows) {
        // If colors is already an object, use it; otherwise parse it
        let colors = row.colors;
        if (typeof colors === 'string') {
           try { colors = JSON.parse(colors); } catch(e) {}
        }
        
        const config = {
          colors: colors || {},
          effect: 'none',
          avatar_variant: 'default'
        };
        
        await connection.query("UPDATE ui_themes SET config = ? WHERE id = ?", [JSON.stringify(config), row.id]);
      }
      
      // We can keep 'colors' column for backward compatibility or drop it.
      // For safety in this quick iteration, let's keep it but ignore it in new code, 
      // or drop it to force cleanliness. I'll drop it to be clean.
      // await connection.query("ALTER TABLE ui_themes DROP COLUMN colors");
      // Actually, let's keep it for a moment just in case, but let's make it nullable.
      // No, let's just use 'config' going forward.
    } else {
      console.log('Config column already exists.');
    }

    console.log('✅ ui_themes migration complete');
    connection.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error migrating ui_themes table:', error);
    process.exit(1);
  }
}

migrateThemeTable();
