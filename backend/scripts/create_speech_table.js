import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function createTable() {
  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false } // Force SSL for Aiven
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ Connected to database.');

    const createQuery = `
      CREATE TABLE IF NOT EXISTS speech_normalization (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pattern VARCHAR(255) NOT NULL,
        replacement VARCHAR(255) NOT NULL,
        type ENUM('acronym', 'brand', 'unit', 'general') DEFAULT 'general',
        description VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_pattern (pattern)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.execute(createQuery);
    console.log('✅ Table "speech_normalization" created or already exists.');

    // Insert default values (using INSERT IGNORE to skip existing)
    console.log('Ensuring default values exist...');
    const defaults = [
      // --- 🇵🇭 Filipino Pronunciation Fixes ---
      { pattern: 'Valenzuela', replacement: 'Va-len-zoo-weh-la', type: 'general' },
      { pattern: 'Quezon', replacement: 'Keh-zon', type: 'general' },
      { pattern: 'Luzon', replacement: 'Loo-zon', type: 'general' },
      { pattern: 'Visayas', replacement: 'Vee-sah-yas', type: 'general' },
      { pattern: 'Mindanao', replacement: 'Min-dah-now', type: 'general' },
      { pattern: 'Caloocan', replacement: 'Kah-loh-oh-kan', type: 'general' },
      { pattern: 'Parañaque', replacement: 'Pah-rah-nyah-keh', type: 'general' },
      { pattern: 'Muntinlupa', replacement: 'Moon-tin-loo-pah', type: 'general' },
      { pattern: 'Pasay', replacement: 'Pah-sigh', type: 'general' },
      { pattern: 'Makati', replacement: 'Mah-kah-tee', type: 'general' },
      { pattern: 'Taguig', replacement: 'Tah-gig', type: 'general' },
      { pattern: 'Las Piñas', replacement: 'Las Peen-yas', type: 'general' },
      { pattern: 'Navotas', replacement: 'Nah-voh-tas', type: 'general' },
      { pattern: 'Malabon', replacement: 'Mah-lah-bon', type: 'general' },
      { pattern: 'Marikina', replacement: 'Mah-ree-kee-nah', type: 'general' },
      { pattern: 'Mandaluyong', replacement: 'Man-dah-loo-yong', type: 'general' },
      { pattern: 'Pateros', replacement: 'Pah-teh-ros', type: 'general' },
      { pattern: 'Philippines', replacement: 'Fee-lee-peens', type: 'general' },
      
      // --- 🏢 CDO / Corporate Acronyms ---
      { pattern: 'CDO', replacement: 'C.D.O.', type: 'acronym' },
      { pattern: 'HR', replacement: 'H.R.', type: 'acronym' },
      { pattern: 'KB', replacement: 'K.B.', type: 'acronym' },
      { pattern: 'SAP', replacement: 'S.A.P.', type: 'acronym' },
      { pattern: 'BAPI', replacement: 'B.A.P.I.', type: 'acronym' },
      { pattern: 'OTP', replacement: 'O.T.P.', type: 'acronym' },
      { pattern: 'CEO', replacement: 'C.E.O.', type: 'acronym' },
      { pattern: 'COO', replacement: 'C.O.O.', type: 'acronym' },
      { pattern: 'CIO', replacement: 'C.I.O.', type: 'acronym' },
      { pattern: 'AI', replacement: 'A.I.', type: 'acronym' },
      { pattern: 'LLM', replacement: 'L.L.M.', type: 'acronym' },
      { pattern: 'RAG', replacement: 'Rag', type: 'acronym' },
      
      // --- 📏 Units & Common Terms ---
      { pattern: 'kg', replacement: 'kilograms', type: 'unit' },
      { pattern: 'lbs', replacement: 'pounds', type: 'unit' },
      { pattern: 'km', replacement: 'kilometers', type: 'unit' },
      
      // --- 🥘 Food Items ---
      { pattern: 'Foodsphere', replacement: 'Foods-fear', type: 'brand' },
      { pattern: 'Tocino', replacement: 'Toh-see-noh', type: 'general' },
      { pattern: 'Longganisa', replacement: 'Long-gah-nee-sah', type: 'general' },
      { pattern: 'Chicharon', replacement: 'Chee-chah-ron', type: 'general' },
      { pattern: 'Kare-kare', replacement: 'Kah-reh kah-reh', type: 'general' },
      { pattern: 'Sinigang', replacement: 'See-nee-gang', type: 'general' },
      { pattern: 'Mekeni', replacement: 'Meh-keh-nee', type: 'brand' },
      { pattern: 'Barangay', replacement: 'Bah-rang-guy', type: 'general' }
    ];

    let insertedCount = 0;
    for (const item of defaults) {
      // Use INSERT IGNORE to avoid errors on duplicates
      const [result] = await connection.execute(
        'INSERT IGNORE INTO speech_normalization (pattern, replacement, type) VALUES (?, ?, ?)',
        [item.pattern, item.replacement, item.type]
      );
      if (result.affectedRows > 0) insertedCount++;
    }
    
    if (insertedCount > 0) {
        console.log(`✅ Inserted ${insertedCount} new default rules.`);
    } else {
        console.log('ℹ️ No new rules inserted (all patterns already exist).');
    }

    await connection.end();
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

createTable();
