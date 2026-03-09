
import { pool } from '../backend/config/database.js';

async function generateToken() {
  try {
    console.log('🔍 Searching for a valid admin user...');
    
    // Find the first active admin (employee)
    const [rows] = await pool.execute(
      'SELECT id, name, email FROM employees WHERE is_active = TRUE LIMIT 1'
    );

    if (rows.length === 0) {
      console.error('❌ No active admin user found in the database.');
      process.exit(1);
    }

    const admin = rows[0];
    const timestamp = Date.now();
    const token = `admin_token_${timestamp}_${admin.id}`;

    console.log('\n✅ Integration Token Generated Successfully!');
    console.log('---------------------------------------------');
    console.log(`User:  ${admin.name} (${admin.email})`);
    console.log(`ID:    ${admin.id}`);
    console.log(`Token: ${token}`);
    console.log('---------------------------------------------');
    console.log('\n⚠️  Share this token securely with your co-developer.');
    console.log('   It grants full admin access to the API.');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error generating token:', error);
    process.exit(1);
  }
}

generateToken();
