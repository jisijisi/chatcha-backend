// backend/services/ttsService.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// 📋 Priority List of Models to try
// We use the exact IDs found in your diagnostic script.
const AVAILABLE_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts"
];

let genAI = null;

function getGenAIClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing. Add GEMINI_API_KEY to your .env or environment variables.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Internal helper to attempt generation with a single model ID
 */
async function tryGenerateWithModel(client, modelName, text, voiceName) {
  console.log(`🔊 Attempting TTS with model: ${modelName}...`);
  
  const model = client.getGenerativeModel({ 
    model: modelName 
  });

  const result = await model.generateContent({
    contents: [{ parts: [{ text: text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"], 
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName, 
          },
        },
      },
    },
  });

  const response = await result.response;
  const candidates = response.candidates;

  if (candidates && candidates[0]?.content?.parts?.[0]?.inlineData) {
    const inline = candidates[0].content.parts[0].inlineData;
    const data = inline.data;
    const mimeType = inline.mimeType || 'audio/mpeg';
    console.log(`✅ TTS Success: ${modelName} generated ${data.length} bytes (base64), mime=${mimeType}.`);
    return { data, mimeType };
  }
  
  throw new Error(`Model ${modelName} returned no audio data.`);
}

/**
 * Generates speech from text using available Gemini TTS models.
 * Tries models in order; throws error only if ALL fail.
 * @param {string} text - The text to convert to speech.
 * @param {string} voiceName - The voice tone (Puck, Charon, Kore, Fenrir, Aoede).
 * @returns {Promise<string>} - The base64 encoded audio string.
 */
export async function generateSpeech(text, voiceName = "Leda") {
  const client = getGenAIClient();
  let lastError = null;

  // 🔄 Loop through all defined models
  for (const modelName of AVAILABLE_MODELS) {
    try {
      // If successful, return immediately (stopping the loop)
      const audio = await tryGenerateWithModel(client, modelName, text, voiceName);
      return audio; 
    } catch (error) {
      console.warn(`⚠️ TTS Failed on ${modelName}: ${error.message}`);
      lastError = error;
      // The loop continues to the next model automatically...
    }
  }

  // ❌ If we get here, ALL models failed.
  console.error("❌ All Gemini TTS models failed.");
  throw lastError || new Error("All available TTS models failed.");
}
