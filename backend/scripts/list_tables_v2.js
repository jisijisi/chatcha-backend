
import { pool } from '../config/database.js';

async function listTables() {
  try {
    console.log('--- Listing All Tables (Raw) ---');
    const [rows] = await pool.execute(`
      SELECT table_name as name
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `);
    console.log('Tables:', rows.map(r => r.name || r.TABLE_NAME));

    console.log('\n--- Checking for "employees_db" database ---');
    const [dbs] = await pool.execute(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE '%employee%'
    `);
    console.log('Databases:', dbs);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

listTables();
