import { CONFIG } from '../config.js';

export class ChatSocket {
    constructor(app, voiceManager, chatUI) {
        this.app = app;
        this.voiceManager = voiceManager;
        this.chatUI = chatUI;
        this._fdQueue = [];
        this._fdProcessing = false;
        this._fdWs = null;
        this._fdFillerSound = new Audio("https://actions.google.com/sounds/v1/cartoon/pop.ogg");
        this._fdFillerSound.volume = 0.2;
    }

    async useFullDuplex(question, thinkingDiv = null, callbacks = {}) {
        let botMessage;
        let contentDiv;
        let cursorSpan = null;
        let firstChunkArrived = false;

        if (thinkingDiv && thinkingDiv.classList && thinkingDiv.classList.contains('message')) {
            botMessage = thinkingDiv;
            contentDiv = botMessage.querySelector('.message-content');
        } else {
            botMessage = this.chatUI.createMessageElement("bot", "");
            this.app.elements.chatDiv.appendChild(botMessage);
            contentDiv = botMessage.querySelector('.message-content');
            contentDiv.innerHTML = ""; 

            cursorSpan = document.createElement('span');
            cursorSpan.className = 'typing-cursor'; 
            cursorSpan.style.borderRight = '2px solid #0d6efd';
            cursorSpan.style.animation = 'blink 1s step-start infinite';
            contentDiv.appendChild(cursorSpan);

            this._fdFillerSound.play().catch(() => {});
        }

        this._fdQueue = [];
        this._fdProcessing = false;
        let fullTextAccumulator = "";
        let accessedDocuments = [];
        let sourceCategories = {};

        const apiBase = CONFIG.API_BASE || 'http://localhost:3000';
        const wsBase = apiBase.replace(/^http/, 'ws'); 
        const WS_URL = `${wsBase}/ws/full-duplex`;
        
        console.log(`🔌 Connecting to Voice WS: ${WS_URL}`);

        try {
            this._fdWs = new WebSocket(WS_URL);

            this._fdWs.onopen = () => {
                console.log("⚡ WS Connected");
                const userEmail = this.app.authManager.getUserEmail();
                this._fdWs.send(JSON.stringify({ 
                    type: 'generate_response', 
                    text: question,
                    userEmail: userEmail
                }));
            };

            this._fdWs.onmessage = (event) => {
                const msg = JSON.parse(event.data);

                if (msg.type === 'speech_event') {
                    if (!firstChunkArrived) {
                        firstChunkArrived = true;
                        if (contentDiv) {
                            contentDiv.innerHTML = '';
                        }
                        if (!cursorSpan) {
                            cursorSpan = document.createElement('span');
                            cursorSpan.className = 'typing-cursor';
                            cursorSpan.style.borderRight = '2px solid #0d6efd';
                            cursorSpan.style.animation = 'blink 1s step-start infinite';
                            if (contentDiv) contentDiv.appendChild(cursorSpan);
                        } else {
                            if (cursorSpan.parentNode !== contentDiv) contentDiv.appendChild(cursorSpan);
                        }
                        this._fdFillerSound.play().catch(() => {});
                    }

                    const binaryString = atob(msg.audio);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                    const blob = new Blob([bytes], { type: msg.mime });

                    this._fdQueue.push({ text: msg.text, audioBlob: blob });
                    fullTextAccumulator += msg.text;

                    if (msg.metadata || msg.accessed_documents || msg.source_categories) {
                        const meta = msg.metadata || {};
                        accessedDocuments = meta.accessed_documents || msg.accessed_documents || accessedDocuments;
                        sourceCategories = meta.source_categories || msg.source_categories || sourceCategories;
                        try {
                            if (botMessage && botMessage.dataset) {
                                botMessage.dataset.accessedDocuments = JSON.stringify(accessedDocuments || []);
                                botMessage.dataset.sourceCategories = JSON.stringify(sourceCategories || {});
                            }
                            try { this.chatUI.renderSourcesHTMLAsync(contentDiv, accessedDocuments || [], [], sourceCategories || {}); } catch (_) {}
                        } catch (e) {
                            console.warn('Failed to render progressive sources:', e);
                        }
                    }

                    this.processFdQueue(contentDiv, cursorSpan);
                }
                else if (msg.type === 'done') {
                    console.log("✅ Stream Complete");
                    let missingKnowledge = false;
                    if (msg.metadata) {
                        accessedDocuments = msg.metadata.accessed_documents || [];
                        sourceCategories = msg.metadata.source_categories || {};
                        missingKnowledge = msg.metadata.missing_knowledge || false;
                    }

                    const checkDone = setInterval(() => {
                        if (this._fdQueue.length === 0 && !this._fdProcessing) {
                            clearInterval(checkDone);
                            (async () => {
                                try {
                                    if (callbacks.onComplete) {
                                        await callbacks.onComplete(question, fullTextAccumulator, botMessage, accessedDocuments, sourceCategories, missingKnowledge);
                                    }
                                } catch (e) {
                                    console.warn('Error finalizing fd session', e);
                                }
                            })();
                        }
                    }, 100);
                }
                else if (msg.type === 'error') {
                    console.error("WS Error:", msg.message);
                    this.app.showToast("Error generating voice response", "error");
                    if (callbacks.onError) callbacks.onError();
                }
            };

            this._fdWs.onerror = (e) => {
                console.error("WS Error", e);
                this.app.showToast("Connection error", "error");
                if (callbacks.onError) callbacks.onError();
            };

        } catch (e) {
            console.error("WS Setup Failed", e);
            if (callbacks.onFallback) callbacks.onFallback();
        }
    }

    processFdQueue(contentDiv, cursorSpan) {
        if (this._fdProcessing || this._fdQueue.length === 0) return;
        this._fdProcessing = true;

        const item = this._fdQueue.shift();
        
        const audioUrl = URL.createObjectURL(item.audioBlob);
        const audio = new Audio(audioUrl);

        this.app.uiManager.showMicStopSpeakingMode();

        audio.addEventListener('loadedmetadata', () => {
            const durationMs = (audio.duration * 1000) || 1000; 
            
            audio.play().catch(e => console.error("Playback failed", e));
            
            this.runFdTypewriter(item.text, durationMs, contentDiv, cursorSpan).then(() => {
                 // Text rendering finished for this chunk
            });
        });

        audio.onended = () => {
            this._fdProcessing = false;
            this.processFdQueue(contentDiv, cursorSpan); 
        };
        
        audio.onerror = () => {
            this._fdProcessing = false;
            this.processFdQueue(contentDiv, cursorSpan);
        };
    }

    runFdTypewriter(text, totalDurationMs, contentDiv, cursorSpan) {
        return new Promise((resolve) => {
            if (cursorSpan && cursorSpan.parentNode === contentDiv) {
                contentDiv.removeChild(cursorSpan);
            }

            const span = document.createElement('span');
            contentDiv.appendChild(span);
            
            if (cursorSpan) contentDiv.appendChild(cursorSpan);
            
            let i = 0;
            const charDelay = (totalDurationMs / (text.length + 1)) * 0.95;

            const typeChar = () => {
                if (i < text.length) {
                    span.textContent += text.charAt(i);
                    this.app.uiManager.scrollToBottom();
                    i++;
                    setTimeout(typeChar, charDelay);
                } else {
                    const space = document.createTextNode(" ");
                    if (cursorSpan && cursorSpan.parentNode === contentDiv) {
                        contentDiv.insertBefore(space, cursorSpan);
                    } else {
                        contentDiv.appendChild(space);
                    }
                    resolve();
                }
            };
            typeChar();
        });
    }

    close() {
        if (this._fdWs) {
            this._fdWs.close();
            this._fdWs = null;
        }
        this._fdQueue = [];
        this._fdProcessing = false;
    }
}
