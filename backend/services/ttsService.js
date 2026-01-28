// backend/services/ttsService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeForSpeech } from "../utils/speechNormalizer.js";

// 📋 Priority List of Models to try
// We use the exact IDs found in your diagnostic script.
const AVAILABLE_MODELS = [
  "gemini-2.5-pro-preview-tts",
  "gemini-2.5-flash-preview-tts"
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
  
  // Check for SSML/Phonetics
  const hasSSML = /<speak>|<phoneme/i.test(text);
  let promptText = text;

  if (hasSSML) {
    console.log("🎤 SSML tags detected. Adding pronunciation instructions...");
    promptText = `Please generate natural-sounding speech for the following text. 
    Important: The text contains SSML-like tags for specific pronunciations. 
    - When you see <phoneme alphabet="ipa" ph="...">word</phoneme>, pronounce "word" exactly as the IPA phonetic string specified in 'ph'.
    - Do NOT read the XML tags (like <speak>, <phoneme>, </phoneme>) out loud.
    - Maintain smooth, natural prosody. Do NOT pause or break the flow when encountering these tags.
    - Only speak the content.
    
    Text to speak:
    ${text}`;
    
    console.log("📝 [TTS Service] Final Prompt being sent to model:");
    console.log(promptText);
  }

  // Use system instruction to ensure model focuses on audio generation
  const model = client.getGenerativeModel({ 
    model: modelName,
    // systemInstruction removed as it causes issues with TTS models
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
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
  
  console.warn(`⚠️ TTS No Audio for ${modelName}. Response:`, JSON.stringify(response, null, 2));
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
  // Normalize text for better pronunciation (native languages, acronyms, etc.)
  const normalizedText = await normalizeForSpeech(text);

  const client = getGenAIClient();
  let lastError = null;

  // 🔄 Loop through all defined models
  for (const modelName of AVAILABLE_MODELS) {
    try {
      // If successful, return immediately (stopping the loop)
      const audio = await tryGenerateWithModel(client, modelName, normalizedText, voiceName);
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
