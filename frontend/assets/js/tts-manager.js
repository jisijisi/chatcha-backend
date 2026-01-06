
import { CONFIG } from './config.js';

class RateLimiter {
    constructor(limit, interval) {
        this.limit = limit;
        this.interval = interval;
        this.timestamps = [];
    }

    async check() {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(t => now - t < this.interval);

        if (this.timestamps.length >= this.limit) {
            const oldest = this.timestamps[0];
            const waitTime = this.interval - (now - oldest);
            return waitTime;
        }

        this.timestamps.push(now);
        return 0;
    }
}

export class TTSManager {
    constructor() {
        this.audioContext = null;
        this.speechQueue = [];
        this.isPlaying = false;
        this.isEnabled = true;
        this.currentSource = null;
        this.hasInitialized = false;
        this.rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute
    }

    async init() {
        if (this.hasInitialized) return;
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.hasInitialized = true;
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        } catch (e) {
            console.error("Failed to initialize AudioContext", e);
        }
    }

    reset() {
        this.stop();
        this.speechQueue = [];
        this.rateLimiter.timestamps = [];
    }

    stop() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Ignore errors if already stopped
            }
            this.currentSource = null;
        }
        this.isPlaying = false;
        this.speechQueue = []; // Clear queue on stop
    }

    async enqueue(text) {
        if (!this.isEnabled || !text.trim()) return;
        const result = await this.fetchAudio(text);
        if (result) {
            this.enqueueBuffer(result);
        }
    }

    async fetchAudio(text) {
        if (!this.isEnabled || !text.trim()) return null;
        if (!this.hasInitialized) await this.init();

        try {
            let waitTime = await this.rateLimiter.check();
            if (waitTime > 0) {
                console.warn(`TTS Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
                
                // Dispatch event to UI
                const event = new CustomEvent('tts-rate-limit', { 
                    detail: { waitTime } 
                });
                document.dispatchEvent(event);

                // Wait for the rate limit to reset
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // Dispatch event to hide UI
                document.dispatchEvent(new CustomEvent('tts-rate-limit-resolved'));
                
                // Re-register timestamp after waiting
                this.rateLimiter.timestamps.push(Date.now());
            }

            const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda'];
            const configVoice = CONFIG.TTS_VOICE_NAME || 'Kore';
            const matchedVoice = allowedVoices.find(v => v.toLowerCase() === configVoice.toLowerCase());
            const voice = matchedVoice || 'Kore';

            const response = await fetch(`${CONFIG.API_BASE}/tts/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, voice })
            });

            if (!response.ok) throw new Error('TTS Fetch failed');

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            return {
                textChunk: text,
                audioBuffer: audioBuffer,
                duration: audioBuffer.duration
            };

        } catch (error) {
            console.warn("TTS fetchAudio failed:", error);
            return null;
        }
    }

    enqueueBuffer(item) {
        if (!item || !item.audioBuffer) return;
        
        this.speechQueue.push(item);

        if (!this.isPlaying) {
            this.playNext();
        }
    }

    async playNext() {
        if (this.speechQueue.length === 0) {
            this.isPlaying = false;
            document.dispatchEvent(new CustomEvent('tts-playback-ended'));
            return;
        }

        this.isPlaying = true;
        const item = this.speechQueue.shift();
        
        const source = this.audioContext.createBufferSource();
        source.buffer = item.audioBuffer;
        source.connect(this.audioContext.destination);

        source.onended = () => {
            this.currentSource = null;
            this.playNext();
        };

        this.currentSource = source;
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        } catch (e) {
            console.warn("AudioContext resume failed", e);
        }
        
        // Add a small delay (50ms) to prevent the first syllable from being cut off
        // due to hardware latency or fade-in effects.
        const startTime = this.audioContext.currentTime + 0.05;
        source.start(startTime);
    }
}
