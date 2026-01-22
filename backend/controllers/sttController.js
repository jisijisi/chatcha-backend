import fs from 'fs';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper to convert file to GenerativePart
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: fs.readFileSync(path).toString("base64"),
      mimeType
    },
  };
}

export async function transcribe(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // console.log("🎙️ STT Controller received file:", req.file);

    // Use Gemini 1.5 Flash which is fast and supports audio
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Determine mime type (default to audio/mp3 or whatever multer detected)
    // Common from MediaRecorder: audio/webm, audio/ogg, audio/mp4
    const mimeType = req.file.mimetype || 'audio/webm';

    const audioPart = fileToGenerativePart(req.file.path, mimeType);
    
    const prompt = "Transcribe the following audio exactly as spoken. Return ONLY the text, no other commentary.";

    const result = await model.generateContent([prompt, audioPart]);
    const response = await result.response;
    const text = response.text();

    // console.log("📝 STT Transcription Result:", text);

    // Clean up file
    fs.unlink(req.file.path, (err) => {
      if (err) console.warn('Failed to delete uploaded audio:', err);
    });

    return res.json({ transcript: text.trim() });

  } catch (err) {
    console.error('STT transcribe error:', err);
    
    // Clean up file if it exists
    if (req.file && req.file.path) {
        fs.unlink(req.file.path, (e) => {});
    }

    return res.status(500).json({ error: 'Server error processing audio', details: err.message });
  }
}
