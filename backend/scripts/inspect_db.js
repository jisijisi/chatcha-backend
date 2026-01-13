
import { pool } from '../config/database.js';

async function inspect() {
  try {
    console.log('--- Inspecting "employees" table ---');
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'
    `);
    console.log('Columns:', columns.map(c => c.COLUMN_NAME).join(', '));

    const [rows] = await pool.execute('SELECT * FROM employees LIMIT 5');
    console.log('First 5 rows:', rows);

    console.log('\n--- Inspecting "employee_benefits" table ---');
    const [benefitCols] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_benefits'
    `);
    console.log('Columns:', benefitCols.map(c => c.COLUMN_NAME).join(', '));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

inspect();
