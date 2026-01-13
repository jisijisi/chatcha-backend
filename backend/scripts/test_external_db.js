
import { pool } from '../config/database.js';

async function testExternalDB() {
  try {
    console.log('--- Testing Access to employees_db.employees ---');
    const [rows] = await pool.execute('SELECT * FROM employees_db.employees LIMIT 1');
    console.log('Success! Row:', rows[0]);
    console.log('Columns:', Object.keys(rows[0]));
  } catch (err) {
    console.error('Access Failed:', err.message);
  } finally {
    process.exit();
  }
}

testExternalDB();
