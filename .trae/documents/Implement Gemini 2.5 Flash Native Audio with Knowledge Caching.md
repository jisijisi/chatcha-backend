## Implement Gemini 2.5 Flash Native Audio with Code of Conduct Knowledge

I will create a testing environment for the Native Audio feature, using Gemini 2.5 Flash and the provided Code of Conduct JSON as a cached knowledge base.

### **1. Backend: Context Caching Service**
* **Create `backend/services/geminiCacheService.js`**:
    * Implement logic to convert the provided JSON into a structured system prompt.
    * Use the Google Generative AI SDK to create a `cachedContent` resource.
    * Store the `cacheName` in the database or a local config for persistence across sessions.
* **Knowledge Injection**: I will prepare a "Knowledge Seed" script to upload the JSON you provided so the model "knows" it before the first conversation starts.

### **2. Backend: Multimodal Live API Bridge**
* **Create `backend/controllers/liveAudioController.js`**:
    * Set up a WebSocket server (using the existing `ws` package) to handle real-time audio streams.
    * Bridge the incoming audio bytes from the client directly to the Gemini Multimodal Live API.
    * Handle the "Native Audio" response stream, sending audio back to the frontend in chunks.

### **3. Frontend: Testing UI**
* **Create `frontend/test-live-audio.html`**:
    * A clean, modern interface specifically for testing this feature.
    * **Features**:
        * "Connect Live" button to initiate the WebSocket.
        * Visual "Waveform" or level meter to show your voice activity.
        * "Live Transcript" area to see what the AI is saying in real-time.
        * Audio toggle to mute/unmute the AI's voice.
* **Create `frontend/js/liveAudioClient.js`**:
    * Implement the `Web Audio API` to capture high-quality PCM audio from the microphone.
    * Handle WebSocket binary messaging for low-latency streaming.

### **4. Verification & Testing**
* **Speed Test**: I will measure the latency from the end of a user's question to the start of the AI's audio response.
* **Knowledge Check**: I will test the AI by asking specific questions about "Foodsphere, Inc. Code of Conduct" (e.g., "What is the policy on gifts?") to ensure it uses the cached knowledge accurately.

**Would you like me to start by creating the Knowledge Caching service and uploading your JSON?**