import { pool } from '../config/database.js';

async function createThemeTable() {
  try {
    const connection = await pool.getConnection();
    
    console.log('Creating ui_themes table...');
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ui_themes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        colors JSON NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Check if default theme exists, if not create it
    const [rows] = await connection.query('SELECT * FROM ui_themes WHERE name = ?', ['Default']);
    if (rows.length === 0) {
      console.log('Inserting default theme...');
      const defaultColors = {
        '--primary-color': '#EF4444',
        '--primary-hover': '#DC2626',
        '--bg-body': '#F3F4F6',
        '--bg-card': '#FFFFFF',
        '--text-main': '#1F2937',
        '--text-muted': '#6B7280',
        '--sidebar-bg': '#FFFFFF',
        '--sidebar-width': '280px'
      };
      
      await connection.query(
        'INSERT INTO ui_themes (name, colors, is_active) VALUES (?, ?, ?)',
        ['Default', JSON.stringify(defaultColors), true]
      );
    }

    console.log('✅ ui_themes table setup complete');
    connection.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up ui_themes table:', error);
    process.exit(1);
  }
}

createThemeTable();
