// backend/controllers/ttsController.js
import * as ttsService from "../services/ttsService.js";

/**
 * Handle TTS request from frontend.
 * Expects body: { text: string, voice: string (optional) }
 */
export const speak = async (req, res) => {
  try {
    const { text, voice } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text content is required." });
    }

    const selectedVoice = voice || "Kore";
    const { data: audioBase64, mimeType } = await ttsService.generateSpeech(text, selectedVoice);

    if (!audioBase64 || audioBase64.length === 0) {
       throw new Error("Service returned empty audio data");
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    
    // Normalize mimeType to lowercase for reliable checking
    const safeMimeType = (mimeType || "").toLowerCase();

    console.log(`original mime: ${mimeType} | safe mime: ${safeMimeType}`);

    // Check for 'l16' or 'pcm' (case-insensitive)
    if (safeMimeType.includes("l16") || safeMimeType.includes("pcm")) {
      console.log("⚠️ Raw PCM detected. Converting to WAV...");
      
      // Convert to WAV (24kHz mono is standard for Gemini TTS)
      const wav = pcm16ToWav(audioBuffer, 24000, 1); 
      
      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": wav.length,
      });
      return res.send(wav);
    }

    // Fallback for MP3 or other formats
    const ct = mimeType || "audio/mpeg";
    res.set({
      "Content-Type": ct,
      "Content-Length": audioBuffer.length,
    });

    res.send(audioBuffer);

  } catch (error) {
    console.error("TTS Controller Error:", error);
    res.status(500).json({ 
      error: "Failed to generate speech.", 
      details: error.message 
    });
  }
};

/**
 * Helper: wrap raw 16-bit PCM (little-endian) into a WAV container.
 * @param {Buffer} pcmBuffer - raw PCM16LE bytes
 * @param {number} sampleRate - samples per second (e.g., 24000)
 * @param {number} numChannels - usually 1 (mono) or 2 (stereo)
 * @returns {Buffer} WAV file buffer
 */
function pcm16ToWav(pcmBuffer, sampleRate = 24000, numChannels = 1) {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4; // PCM chunk size
  buffer.writeUInt16LE(1, offset); offset += 2; // Audio format 1 = PCM
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(16, offset); offset += 2; // bits per sample
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;
  pcmBuffer.copy(buffer, offset);
  return buffer;
}
