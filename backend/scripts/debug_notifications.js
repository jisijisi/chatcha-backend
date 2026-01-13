
import { pool } from '../config/database.js';

async function inspectNotifications() {
  try {
    console.log('--- INSPECTING ADMINS ---');
    const [admins] = await pool.execute("SELECT id, name, email, role FROM employees WHERE role = 'admin'");
    console.log(JSON.stringify(admins, null, 2));

    console.log('\n--- INSPECTING RECENT NOTIFICATIONS ---');
    const [notifications] = await pool.execute("SELECT id, user_id, message, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 5");
    console.log(JSON.stringify(notifications, null, 2));

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

inspectNotifications();
