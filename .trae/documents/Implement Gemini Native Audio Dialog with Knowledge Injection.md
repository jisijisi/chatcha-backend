# Implement Gemini Native Audio Dialog with Knowledge
## Technical Implementation:
### 1. Backend Service
1. **Fetch Knowledge**: Retrieve "Code of Conduct" from the `knowledge_documents` database table.
2. **WebSocket Proxy**: Implement a new WebSocket handler in `backend/ws/native_audio_ws.js` that bridges the frontend to the Google Multimodal Live API (`v1alpha`).
3. **Instruction Setup**: Inject the Code of Conduct data into the `system_instruction` of the Gemini Live session.

### 2. Frontend Test Page
1. **Create UI**: A new page `frontend/native-audio-test.html` with a simple "Connect & Talk" button.
2. **Audio Capture**: Use `getUserMedia` and an `AudioWorklet` to capture 16-bit PCM audio at 24kHz.
3. **Playback**: Use `AudioContext` to play back the native audio response from Gemini in real-time.

## Key Differences from Current Implementation
1. **Latency**: Sub-second response vs. current multi-step hybrid approach.
2. **Native Audio**: Model hears your voice directly (including tone/emotion) and responds natively without a separate TTS step.

Do you want me to proceed with creating the test UI and the backend bridge?