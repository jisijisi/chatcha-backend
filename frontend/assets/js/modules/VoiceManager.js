export class VoiceManager {
    constructor(app) {
        this.app = app;
        this._audioQueue = [];
        this._isSpeaking = false;
        this._ttsStop = false;
        this._activeBlobUrls = new Set();
        this._ttsSentenceQueue = [];
        this._ttsLastSpokenIndex = 0;
        this._ttsSeqCounter = 0;
        this._ttsNextToEnqueue = 0;
        this._ttsPendingAudio = {};
    }

    async speakWithGemini(text) {
        if (!text) return;
        await this.enqueueTTSChunk(text);
    }

    async enqueueTTSChunk(text) {
        const speechText = this.prepareTextForSpeech(text);
        if (!speechText) return;
        
        try {
            if (this.app && this.app.ttsManager) {
                await this.app.ttsManager.enqueue(speechText);
            } else {
                console.log("🔊 Fetching Gemini TTS audio for:", speechText.substring(0, 20) + "...");
                let blob = await this.app.apiManager.getTTS(speechText);
                if (!blob || (blob.size && blob.size < 1000)) throw new Error('Invalid audio blob');
                const url = URL.createObjectURL(blob);
                const audio = document.createElement('audio');
                audio.src = url;
                audio.preload = 'auto';
                audio.setAttribute('playsinline', '');
                audio.volume = 1.0;
                audio.onplay = () => this.app.uiManager.showMicStopSpeakingMode();
                this._audioQueue.push({ audio, url, text: speechText });
                this.playQueue();
            }
        } catch (e) {
            console.warn("Gemini TTS failed, falling back to browser:", e);
            this._speakWithBrowserNative(text);
        }
    }

    playQueue() {
        if (this._isSpeaking || this._audioQueue.length === 0 || this._ttsStop) return;
        this._isSpeaking = true;
        const item = this._audioQueue.shift();
        
        item.audio.onended = () => {
            this._isSpeaking = false;
            this.playQueue();
            setTimeout(() => {
                if (item.url) {
                    URL.revokeObjectURL(item.url);
                    this._activeBlobUrls.delete(item.url);
                }
            }, 1000);
        };
        
        item.audio.onerror = () => {
            this._isSpeaking = false;
            this.playQueue();
        };

        item.audio.play().catch(e => {
            console.error("Audio playback failed", e);
            this._isSpeaking = false;
            this.playQueue();
        });
    }

    stopAudio() {
        this._ttsStop = true;
        if (this.app.ttsManager) {
            try { this.app.ttsManager.stop(); } catch (_) {}
        }
        
        this.cleanupAudioQueue();
        this.app.uiManager.hideMicStopSpeakingMode();
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this._ttsSentenceQueue = [];
    }

    cleanupAudioQueue() {
        this._ttsPendingAudio = {};
        if (this._audioQueue && this._audioQueue.length > 0) {
            this._audioQueue.forEach(item => {
                try {
                    if (item.audio) {
                        item.audio.pause();
                        item.audio.src = "";
                        item.audio.load();
                        item.audio.onended = null;
                        item.audio.onerror = null;
                    }
                } catch (_) {}
                if (item.url) {
                    const url = item.url;
                    setTimeout(() => {
                        if (this._activeBlobUrls.has(url)) {
                            try { URL.revokeObjectURL(url); } catch (_) {}
                            this._activeBlobUrls.delete(url);
                        }
                    }, 200);
                }
            });
        }
        this._audioQueue = [];
        const leftover = Array.from(this._activeBlobUrls);
        leftover.forEach(url => {
            setTimeout(() => {
                if (this._activeBlobUrls.has(url)) {
                    try { URL.revokeObjectURL(url); } catch (_) {}
                    this._activeBlobUrls.delete(url);
                }
            }, 500);
        });
        this._isSpeaking = false;
        this._ttsSeqCounter = 0;
        this._ttsNextToEnqueue = 0;
    }

    _speakWithBrowserNative(text) {
        if (!('speechSynthesis' in window)) {
            if (this.app && this.app.showToast) this.app.showToast("TTS unavailable", "error");
            return;
        }
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(this.prepareTextForSpeech(text));
            utterance.lang = 'en-US';
            utterance.rate = 1.0;
            let voices = this.app.voices || [];
            if (voices.length === 0) voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                let selectedVoice = null;
                const prefs = [
                    v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('neural'),
                    v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('google'),
                    v => v.lang === 'en-US' && (v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('susan')),
                    v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('female'),
                    v => v.lang === 'en-US' && v.name.toLowerCase().includes('female'),
                    v => v.lang === 'en-US'
                ];
                for (const c of prefs) {
                    selectedVoice = voices.find(c);
                    if (selectedVoice) break;
                }
                if (selectedVoice) utterance.voice = selectedVoice;
            }
            utterance.onstart = () => this.app.uiManager.showMicStopSpeakingMode();
            utterance.onend = () => this.app.uiManager.hideMicStopSpeakingMode();
            utterance.onerror = () => this.app.uiManager.hideMicStopSpeakingMode();
            window.speechSynthesis.speak(utterance);
        } catch (_) {
            this.app.uiManager.hideMicStopSpeakingMode();
        }
    }

    prepareTextForSpeech(text) {
        if (!text) return "";
        let t = String(text);
        t = t.replace(/^\s*(?:SOURCES_USED:|Sources?:).*$/gmi, "");
        t = t.replace(/^\s*---+\s*$/gmi, "");
        t = t.replace(/[\u{1F600}-\u{1F64F}]/gu, "");
        t = t.replace(/[\u{1F300}-\u{1F5FF}]/gu, "");
        t = t.replace(/[\u{1F680}-\u{1F6FF}]/gu, "");
        t = t.replace(/[\u{2600}-\u{26FF}]/gu, "");
        t = t.replace(/[\u{2700}-\u{27BF}]/gu, "");
        t = t.replace(/[\u{1F900}-\u{1F9FF}]/gu, "");
        t = t.replace(/[\u{1FA70}-\u{1FAFF}]/gu, "");
        t = t.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "");
        t = t.replace(/[\u200D\uFE0F]/g, "");
        t = t.replace(/[ \t]+/g, " ");
        t = t.replace(/\n{2,}/g, "\n");
        t = t.trim();
        return t;
    }

    _sanitizePlainText(text) {
        if (!text) return "";
        let t = String(text);
        t = t.replace(/```([\s\S]*?)```/g, '$1');
        t = t.replace(/`([^`]+)`/g, '$1');
        t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
        t = t.replace(/^\s*#{1,6}\s*/gm, "");
        t = t.replace(/#{2,}/g, "");
        t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
        t = t.replace(/__([^_]+)__/g, '$1');
        t = t.replace(/\*([^*]+)\*/g, '$1');
        t = t.replace(/_([^_]+)_/g, '$1');
        t = t.replace(/^\s*[-*•]\s+/gm, "");
        t = t.replace(/^\s*>\s?/gm, "");
        t = t.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");
        t = t.replace(/<[^>]*>/g, "");
        t = this.prepareTextForSpeech(t);
        t = t.replace(/[ \t]+/g, " ");
        t = t.replace(/\n{2,}/g, "\n");
        t = t.trim();
        return t;
    }
}
