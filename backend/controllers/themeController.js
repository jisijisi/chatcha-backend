import { pool } from '../config/database.js';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Helper to get active AI model
async function getActiveModel() {
    try {
        const [rows] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
        return rows.length > 0 && rows[0].ai_model ? rows[0].ai_model : "gemini-1.5-flash";
    } catch (error) {
        console.error('⚠️ Failed to fetch active model from settings:', error.message);
        return "gemini-1.5-flash"; // Fallback
    }
}

export const generateThemeFromPrompt = async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not set" });
    }

    try {
        const activeModel = await getActiveModel();
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: activeModel });

        const systemPrompt = `
        You are an expert UI designer and CSS wizard specializing in creating immersive themes for chat applications.
        Your goal is to generate a JSON theme configuration that perfectly matches the user's description.
        
        The JSON structure MUST be exactly as follows:
        {
            "colors": {
                "--primary-color": "hex code",
                "--primary-hover": "hex code",
                "--text-brand": "hex code",
                "--bg-body": "hex code",
                "--bg-card": "hex code",
                "--sidebar-bg": "hex code",
                "--text-main": "hex code",
                "--text-muted": "hex code",
                "--user-msg-bg": "hex code",
                "--user-msg-text": "hex code",
                "--bot-msg-bg": "hex code",
                "--bot-msg-text": "hex code"
            },
            "custom_css": "valid CSS string",
            "avatar_variant": "one of: 'default', 'christmas', 'newyear', 'custom'"
        }

        Rules:
        1. **Color Theory**: Choose a cohesive color palette based on the user's prompt.
        2. **Custom CSS (The Magic)**:
           - You can write ANY valid CSS in the "custom_css" field to implement effects, animations, or structural changes.
           - **Targeting**:
             - \`body\`: Main container. Use \`body::before\` or \`body::after\` for full-screen backgrounds/overlays.
             - \`.chat-container\`: Main chat area.
             - \`#chat\`: The message list container.
             - \`.input-area\`: The bottom input section.
             - \`#sidebar\`: The left sidebar.
           - **Animations**: Define \`@keyframes\` within the string if needed.
           - **Example**: If user wants "matrix rain", you would generate the CSS to create that effect on \`body::before\`.
           - **Example**: If user wants "bouncing input", add animation to \`.input-area\`.
           - **IMPORTANT**: Do NOT use the old "effect" field. Put all visual logic in "custom_css".
        3. **Avatar Logic**:
           - If user mentions "Santa", "Christmas", "Holiday": Set "avatar_variant" to 'christmas'.
           - If user mentions "New Year", "Party": Set "avatar_variant" to 'newyear'.
           - Otherwise: 'default'.
        4. **Strict Output**: Return ONLY the JSON object. No markdown.
        
        User Description: "${prompt}"
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });

        const text = result.response.text();
        let themeConfig;
        
        try {
            themeConfig = JSON.parse(text);
        } catch (e) {
            // Fallback cleanup if the model adds markdown code blocks
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            themeConfig = JSON.parse(cleaned);
        }

        res.json({ success: true, config: themeConfig });

    } catch (error) {
        console.error("Theme generation error:", error);
        res.status(500).json({ error: "Failed to generate theme: " + error.message });
    }
};

export const getActiveTheme = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ui_themes WHERE is_active = TRUE LIMIT 1');
    if (rows.length === 0) {
      // Return default if no active theme found
      return res.json({
        name: 'Default',
        config: {
          colors: {
            '--primary-color': '#EF4444',
            '--primary-hover': '#DC2626',
            '--bg-body': '#F3F4F6',
            '--bg-card': '#FFFFFF',
            '--text-main': '#1F2937',
            '--text-muted': '#6B7280',
            '--sidebar-bg': '#FFFFFF'
          },
          effect: 'none',
          avatar_variant: 'default',
          custom_avatar: null
        }
      });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching active theme:', error);
    res.status(500).json({ error: 'Failed to fetch theme' });
  }
};

export const getThemes = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ui_themes ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching themes:', error);
    res.status(500).json({ error: 'Failed to fetch themes' });
  }
};

export const createTheme = async (req, res) => {
  const { name, config } = req.body;
  if (!name || !config) {
    return res.status(400).json({ error: 'Name and config are required' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO ui_themes (name, config, is_active) VALUES (?, ?, FALSE)',
      [name, JSON.stringify(config)]
    );
    res.status(201).json({ id: result.insertId, name, config, is_active: false });
  } catch (error) {
    console.error('Error creating theme:', error);
    res.status(500).json({ error: 'Failed to create theme' });
  }
};

export const updateTheme = async (req, res) => {
  const { id } = req.params;
  const { name, config } = req.body;

  try {
    await pool.query(
      'UPDATE ui_themes SET name = ?, config = ? WHERE id = ?',
      [name, JSON.stringify(config), id]
    );
    res.json({ id, name, config });
  } catch (error) {
    console.error('Error updating theme:', error);
    res.status(500).json({ error: 'Failed to update theme' });
  }
};

export const activateTheme = async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Deactivate all
    await connection.query('UPDATE ui_themes SET is_active = FALSE');

    // Activate selected
    await connection.query('UPDATE ui_themes SET is_active = TRUE WHERE id = ?', [id]);

    await connection.commit();
    
    // Fetch the newly activated theme to return it
    const [rows] = await connection.query('SELECT * FROM ui_themes WHERE id = ?', [id]);
    
    res.json({ message: 'Theme activated', theme: rows[0] });
  } catch (error) {
    await connection.rollback();
    console.error('Error activating theme:', error);
    res.status(500).json({ error: 'Failed to activate theme' });
  } finally {
    connection.release();
  }
};

export const deleteTheme = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Prevent deleting active theme
    const [activeCheck] = await pool.query('SELECT is_active FROM ui_themes WHERE id = ?', [id]);
    if (activeCheck.length > 0 && activeCheck[0].is_active) {
      return res.status(400).json({ error: 'Cannot delete the active theme' });
    }

    await pool.query('DELETE FROM ui_themes WHERE id = ?', [id]);
    res.json({ message: 'Theme deleted' });
  } catch (error) {
    console.error('Error deleting theme:', error);
    res.status(500).json({ error: 'Failed to delete theme' });
  }
};

// Avatar Upload Handler
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.files || !req.files.avatar) {
      return res.status(400).json({ error: 'No avatar file uploaded' });
    }

    const avatarFile = req.files.avatar;
    const uploadDir = path.join(process.cwd(), 'frontend', 'assets', 'images', 'custom_avatars');
    
    // Create directory if not exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `avatar_${Date.now()}${path.extname(avatarFile.name)}`;
    const uploadPath = path.join(uploadDir, filename);

    await avatarFile.mv(uploadPath);

    const publicPath = `assets/images/custom_avatars/${filename}`;
    res.json({ url: publicPath });

  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Avatar upload failed' });
  }
};
