// backend/scripts/test_gemini_tts.js
import "dotenv/config"; // load .env when running this script directly
import fs from "fs";
import path from "path";
import * as ttsService from "../services/ttsService.js";

async function main() {
  const text = process.argv[2] || "Hello from Gemini TTS test.";
  const voice = process.argv[3] || "Kore";

  console.log(`Starting Gemini TTS test.\nText: ${text}\nVoice: ${voice}`);

  try {
    const result = await ttsService.generateSpeech(text, voice);

    if (!result || !result.data) {
      console.error("No audio returned from service.");
      process.exitCode = 2;
      return;
    }

    const { data: audioBase64, mimeType } = result;
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // If backend returned raw PCM (audio/l16), wrap into WAV for playback
    let finalBuffer = audioBuffer;
    let outExt = (() => {
      if (!mimeType) return "mp3";
      if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
      if (mimeType.includes("wav")) return "wav";
      if (mimeType.includes("ogg")) return "ogg";
      if (mimeType.includes("l16")) return "wav"; // we'll convert
      return "bin";
    })();

    if (mimeType && mimeType.includes("l16")) {
      // assume 24000 Hz mono - mirror controller behavior
      const wav = pcm16ToWav(audioBuffer, 24000, 1);
      finalBuffer = wav;
    }

    const outDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, `gemini_tts_${Date.now()}.${outExt}`);
    fs.writeFileSync(outPath, finalBuffer);

    console.log(`Saved audio -> ${outPath}`);
    console.log(`MIME: ${mimeType || "unknown"}, Bytes: ${finalBuffer.length}`);

  } catch (err) {
    console.error("Error generating TTS:", err && err.message ? err.message : err);
    process.exitCode = 1;
  }
}

function pcm16ToWav(pcmBuffer, sampleRate = 24000, numChannels = 1) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(16, offset); offset += 2;
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;
  pcmBuffer.copy(buffer, offset);
  return buffer;
}

if (import.meta.url === `file://${process.cwd().replace(/\\/g, "/")}/backend/scripts/test_gemini_tts.js`) {
  main();
} else {
  // Also allow running directly via `node backend/scripts/test_gemini_tts.js`
  main();
}

// Usage:
//  node backend/scripts/test_gemini_tts.js "Hello world" Kore
// Requires environment variable: GEMINI_API_KEY
