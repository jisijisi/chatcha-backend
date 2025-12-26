import { WebSocketServer } from 'ws';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as ttsService from '../services/ttsService.js';
import { ragSystem } from '../services/ragService.js';
import { getEnhancedContext } from '../services/aiService.js';

// Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Using the faster Flash model for low latency
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

/**
 * Helper: Convert Raw PCM16 to WAV (Required for browser playback)
 */
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

export default function attachFullDuplexWS(server) {
  const wss = new WebSocketServer({ server, path: '/ws/full-duplex' });

  wss.on('connection', (ws) => {
    console.log('⚡ Full-duplex client connected');
    // Pre-warm Gemini TTS (non-blocking) to reduce first audio latency
    ttsService.generateSpeech(" ", "Leda").catch(() => {});
    
    // Promise chain to ensure Audio 1 plays before Audio 2, even if Audio 2 generates faster
    let sendQueue = Promise.resolve();

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === 'generate_response') {
          const userText = msg.text;
          const userEmail = msg.userEmail || null;
          
          console.log(`Processing User Input: "${userText}" (User: ${userEmail})`);
          
          let sentenceBuffer = "";

          // Prosody-safe extractor: returns complete spoken sentences first,
          // and only falls back to clause splitting if the remaining buffer grows too long.
          function extractProsodySafeChunks(buffer) {
            const chunks = [];
            let consumedEnd = 0;

            // Strong boundaries: full sentences ending with . ? ! (keep trailing punctuation)
            const sentenceRegex = /[^.!?]+[.!?]+(\s+|$)/g;
            let match;
            while ((match = sentenceRegex.exec(buffer)) !== null) {
              const sentence = match[0].trim();
              if (sentence.length >= 20) {
                chunks.push(sentence);
                consumedEnd = match.index + match[0].length;
              }
            }

            // Remaining text after consuming full sentences
            let remaining = buffer.slice(consumedEnd);

            // Weak fallback: only if the remaining buffer grows too long, split on clauses
            if (remaining.length > 120) {
              const clauseRegex = /[^,;:]+[,;:]+(\s+|$)/g;
              let clauseMatch;
              let clauseConsumedEnd = 0;
              while ((clauseMatch = clauseRegex.exec(remaining)) !== null) {
                const clause = clauseMatch[0].trim();
                if (clause.length >= 30) {
                  chunks.push(clause);
                  clauseConsumedEnd = clauseMatch.index + clauseMatch[0].length;
                }
              }
              if (clauseConsumedEnd > 0) {
                // remove clauseConsumed from remaining
                remaining = remaining.slice(clauseConsumedEnd);
              }
            }

            return { chunks, remaining };
          }

          try {
              // --- STEP 1: RETRIEVE CONTEXT (RAG) ---
              // This gives us the company knowledge + Wikipedia info
              const { finalContext, documentIds, sourceMap, categoryMap } = await getEnhancedContext(userText, ragSystem, 10, userEmail);

              // --- STEP 2: PROMPT ENGINEERING ---
              // Force the model to start short. This ensures the first audio chunk is tiny and fast.
              const systemPrompt = `
You are Cindy, the intelligent AI assistant for CDO Foodsphere Inc.
Your persona is charming, sophisticated, knowledgeable, and slightly alluring while remaining professional.

IMPORTANT INSTRUCTIONS FOR VOICE MODE:
1. You are speaking to the user via voice. Adopt a warm, engaging, and captivating tone.
2. Keep your responses CONCISE and NATURAL.
3. AVOID complex markdown like tables, extensive lists, or code blocks unless absolutely necessary.
4. Keep your first sentence extremely short (under 5 words) to ensure fast audio playback.
5. Use the provided CONTEXT to answer the question. If the answer is not in the context, say you don't know politely.

CONTEXT:
${finalContext}
`;
              const fullPrompt = `${systemPrompt}\n\nUser says: ${userText}`;

              const result = await model.generateContentStream(fullPrompt);
              
              for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                sentenceBuffer += chunkText;

                // Extract prosody-safe chunks (sentences first, clauses as fallback)
                const { chunks, remaining } = extractProsodySafeChunks(sentenceBuffer);
                sentenceBuffer = remaining;

                for (const fullSentence of chunks) {
                  if (!fullSentence || fullSentence.length === 0) continue;

                  // Send text immediately to client (no waiting for TTS)
                  try {
                    ws.send(JSON.stringify({ type: 'text_chunk', text: fullSentence }));
                  } catch (e) {
                    console.error('WS send text_chunk error', e);
                  }

                  // Guard: only send prosody-safe chunks to TTS
                  // Must end with allowed punctuation and have >= 5 words
                  const endsWithPunct = /[.!?,;:]$/.test(fullSentence.trim());
                  const wordCount = fullSentence.trim().split(/\s+/).filter(Boolean).length;
                  if (!endsWithPunct || wordCount < 5) {
                    // Not safe for TTS yet — skip TTS generation for this chunk
                    continue;
                  }

                  // Start TTS generation immediately (concurrent)
                  const audioTask = ttsService.generateSpeech(fullSentence, "Leda")
                    .then(audio => ({ text: fullSentence, audio }))
                    .catch(() => null);

                  // Preserve playback order: queue delivery but do NOT block generation
                  sendQueue = sendQueue.then(async () => {
                    const result = await audioTask;
                    if (result) {
                      await sendToClient(ws, result.text, result.audio);
                    }
                  }).catch(err => console.error('TTS delivery queue error', err));
                }
              }

              // Flush whatever is left in the buffer
              if (sentenceBuffer.trim().length > 0) {
                 const finalText = sentenceBuffer.trim();

                 // Send remaining text immediately
                 try {
                   ws.send(JSON.stringify({ type: 'text_chunk', text: finalText }));
                 } catch (e) { console.error('WS send final text_chunk error', e); }

                 // Only generate TTS if the remaining text is prosody-safe
                 const endsWithPunct = /[.!?,;:]$/.test(finalText);
                 const wordCount = finalText.split(/\s+/).filter(Boolean).length;
                 if (endsWithPunct && wordCount >= 5) {
                   const audioTask = ttsService.generateSpeech(finalText, "Leda")
                     .then(audio => ({ text: finalText, audio }))
                     .catch(() => null);

                   sendQueue = sendQueue.then(async () => {
                     const result = await audioTask;
                     if (result) await sendToClient(ws, result.text, result.audio);
                   }).catch(err => console.error('Final TTS delivery error', err));
                 }
              }

                // Build rich document metadata from sourceMap/categoryMap so frontend
                // receives human-friendly names (matches HTTP /ask behavior).
                  const documentSources = [];
                  try {
                    // Prefer deterministic ordering: use documentIds (ordered by relevance) to pick top sources.
                    const seenNames = new Set();

                    // If Wikipedia is present in context, include it first.
                    const wikiName = 'Wikipedia - CDO Foodsphere';
                    if (finalContext && finalContext.includes('Context from: Wikipedia - CDO Foodsphere')) {
                      documentSources.push({ id: 'wikipedia', name: wikiName, category: 'General Information' });
                      seenNames.add(wikiName.toLowerCase());
                    }

                    // Build reverse map: id -> array of names (a doc id may map to multiple display names)
                    const idToNames = {};
                    for (const [name, id] of Object.entries(sourceMap || {})) {
                      if (!idToNames[id]) idToNames[id] = [];
                      idToNames[id].push(name);
                    }

                    // Iterate documentIds in order and pick the first non-wikipedia source
                    if (Array.isArray(documentIds)) {
                      for (const did of documentIds) {
                        const names = idToNames[did] || [];
                        for (const nm of names) {
                          const key = String(nm || '').toLowerCase();
                          if (seenNames.has(key)) continue;
                          documentSources.push({ id: did, name: nm, category: (categoryMap && categoryMap[nm]) || '' });
                          seenNames.add(key);
                          break; // only one display name per id
                        }
                        if (documentSources.length >= 2) break; // limit to top 2
                      }
                    }

                    // Fallback: if still empty, expose numeric documentIds as Document N placeholders
                    if (documentSources.length === 0 && Array.isArray(documentIds) && documentIds.length > 0) {
                      documentIds.slice(0, 2).forEach(did => {
                        documentSources.push({ id: did, name: `Document ${did}`, category: '' });
                      });
                    }
                    // If we have wiki + one doc but want to prefer only two, ensure length <=2
                    if (documentSources.length > 2) documentSources.splice(2);
                  } catch (e) {
                    console.warn('Failed to build documentSources for WS metadata', e);
                  }

                // Signal completion with rich Metadata
                sendQueue = sendQueue.then(() => {
                  ws.send(JSON.stringify({ 
                    type: 'done',
                    metadata: {
                      accessed_documents: documentSources || [],
                      source_categories: categoryMap || {}
                    }
                  }));
                });

          } catch (modelError) {
              console.error("Gemini Model Error:", modelError);
              ws.send(JSON.stringify({ type: 'error', message: modelError.message }));
          }
        }
      } catch (e) {
        console.error('WS Error:', e);
      }
    });
  });

  return wss;
}

// 📦 Helper to bundle text and audio into one packet
async function sendToClient(ws, text, ttsResult) {
    try {
        const { data: audioBase64, mimeType } = ttsResult;
        console.log(`🎙️ Sending Chunk: "${text.substring(0, 15)}..."`);

        let finalData = audioBase64;
        let finalMime = mimeType;

        // Wrap raw PCM in WAV header if needed
        if (!mimeType || mimeType.toLowerCase().includes("l16") || mimeType.toLowerCase().includes("pcm")) {
            const rawBuffer = Buffer.from(audioBase64, 'base64');
            const wavBuffer = pcm16ToWav(rawBuffer);
            finalData = wavBuffer.toString('base64');
            finalMime = 'audio/wav';
        }

        ws.send(JSON.stringify({ 
            type: 'speech_event', 
            text: text, 
            mime: finalMime, 
            audio: finalData 
        }));
    } catch (err) {
        console.error("Packet Gen Error:", err);
    }
}