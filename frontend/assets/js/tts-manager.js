
import { CONFIG } from './config.js';

export class TTSManager {
    constructor() {
        this.audioContext = null;
        this.speechQueue = [];
        this.isPlaying = false;
        this.isEnabled = true;
        this.currentSource = null;
        this.hasInitialized = false;
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

        if (!this.hasInitialized) await this.init();

        try {
            const allowedVoices = ['Puck','Charon','Kore','Fenrir','Aoede'];
            const voice = allowedVoices.includes(CONFIG.TTS_VOICE_NAME) ? CONFIG.TTS_VOICE_NAME : 'Kore';
            const response = await fetch(`${CONFIG.API_BASE}/tts/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, voice })
            });

            if (!response.ok) throw new Error('TTS Fetch failed');

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.speechQueue.push({
                textChunk: text,
                audioBuffer: audioBuffer,
                duration: audioBuffer.duration
            });

            if (!this.isPlaying) {
                this.playNext();
            }

        } catch (error) {
            console.warn("TTS enqueue failed:", error);
        }
    }

    playNext() {
        if (this.speechQueue.length === 0) {
            this.isPlaying = false;
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
                this.audioContext.resume().catch(() => {});
            }
        } catch {}
        source.start(0);
    }
}
