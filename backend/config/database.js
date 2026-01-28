// config/database.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from backend root (one level up from config/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });


// Database connection pool
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }, // Always use SSL for Aiven
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  timezone: '+08:00',
});

// Enhanced connection test
export async function testDatabaseConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await pool.getConnection();
      console.log('✅ NEW DATABASE: Aiven MySQL connected successfully!');
      connection.release();
      return true;
    } catch (err) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  console.error('❌ CRITICAL: All database connection attempts failed');
  return false;
}