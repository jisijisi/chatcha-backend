
import { pool } from '../config/database.js';

async function listTables() {
  try {
    console.log('--- Listing All Tables ---');
    const [rows] = await pool.execute(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
    `);
    console.log(rows.map(r => r.table_name).join(', '));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

listTables();
