import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function addSpeechFlag() {
  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ Connected to database.');

    // Check if flag exists
    const [rows] = await connection.execute(
      "SELECT id FROM live_data_sources WHERE source_type = 'internal_flag' AND name = 'SPEECH_SETTINGS_ACCESS'"
    );

    if (rows.length === 0) {
      await connection.execute(
        "INSERT INTO live_data_sources (name, source_type, description, config) VALUES (?, ?, ?, ?)",
        ['SPEECH_SETTINGS_ACCESS', 'internal_flag', 'Controls user access to Pronunciation/Speech Settings', '{}']
      );
      console.log('✅ "SPEECH_SETTINGS_ACCESS" flag created.');
    } else {
      console.log('ℹ️ "SPEECH_SETTINGS_ACCESS" flag already exists.');
    }

    await connection.end();
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

addSpeechFlag();
