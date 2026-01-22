// frontend/assets/js/chat.js - COMPLETE REVISED VERSION
import { CONFIG } from './config.js';
import { escapeHtml } from './utils.js';
import { TRANSLATIONS } from './translations.js'; 

export class ChatManager {
  constructor(chatApp) {
    this.app = chatApp;
    this.audioElem = null;
    this.liveTTS = null;
    this.geminiLive = null;
    
    // Strict state management for TTS
    this._audioQueue = [];
    this._isSpeaking = false;
    this._ttsStop = false;
    this._currentTTSStream = null;
    this._ttsSentenceQueue = [];
    this._ttsLastSpokenIndex = 0;
    this._ttsSeqCounter = 0;
    this._ttsNextToEnqueue = 0;
    this._ttsPendingAudio = {};
    
    // Track active blob URLs to prevent premature revocation
    this._activeBlobUrls = new Set();

    // Full Duplex State
    this._fdQueue = [];
    this._fdProcessing = false;
    this._fdWs = null;
    this._fdFillerSound = new Audio("https://actions.google.com/sounds/v1/cartoon/pop.ogg");
    this._fdFillerSound.volume = 0.2;
  }

  async askQuestion(wasVoiceInput = false) {
    if (this.app.isLoading) return;

    const question = this.app.elements.chatInput.value.trim();
    if (!question) {
      this.app.showToast('Please enter a question', 'warning');
      return;
    }

    this.app.isLoading = true;
    this.app.hasConversation = true;
    this.app.uiManager.updateUI();
    this.app.uiManager.toggleSendButton(true);
    this.app.elements.chatInput.disabled = true;
    this.app.messageManager.disableFollowUpSuggestions();

    const userMessage = this.createMessageElement("user", question);
    this.app.elements.chatDiv.appendChild(userMessage);

    this.app.elements.chatInput.value = "";
    this.app.updateCharacterCount();

    requestAnimationFrame(() => {
      this.app.uiManager.scrollToBottom();
      this.app.messageManager.ensureActionButtons(userMessage);
    });

    if (wasVoiceInput) {
      // Respect configured microphone response mode: either use full-duplex
      // streaming voice responses, or present a text-only response with
      // the visual "thinking" indicator. For the combined UX we show the
      // thinking indicator first and then switch to full-duplex streaming
      // when audio/text chunks arrive.
      if (CONFIG.MIC_RESPONSE_MODE === 'thinking') {
        await this.submitQuestion(question, true);
      } else {
        // Create a thinking indicator so the user sees progress while the
        // backend prepares the streamed response. Pass it into useFullDuplex
        // so it can be reused until the first streamed chunk arrives.
        const thinkingDiv = this.createTypingIndicator(question);
        this.app.elements.chatDiv.appendChild(thinkingDiv);
        requestAnimationFrame(() => this.app.uiManager.scrollToBottom());
        await this.useFullDuplex(question, thinkingDiv);
      }
    } else {
      // Standard Text Mode (No Audio)
      await this.submitQuestion(question, false);
    }
  }

  // ==========================================================
  // 🎙️ FULL DUPLEX "MAGIC" MODE (Voice-to-Voice)
  // ==========================================================
  async useFullDuplex(question, thinkingDiv = null) {
    // If a thinkingDiv was provided, reuse it as the bot message until the
    // first streamed chunk arrives. This preserves the "thinking" UI while
    // the backend prepares the response.
    let botMessage;
    let contentDiv;
    let cursorSpan = null;
    let firstChunkArrived = false;

    if (thinkingDiv && thinkingDiv.classList && thinkingDiv.classList.contains('message')) {
      botMessage = thinkingDiv;
      contentDiv = botMessage.querySelector('.message-content');
      // leave existing thinking text in place for now
    } else {
      // 1. Create Bot Bubble (Empty initially)
      botMessage = this.createMessageElement("bot", "");
      this.app.elements.chatDiv.appendChild(botMessage);
      contentDiv = botMessage.querySelector('.message-content');
      contentDiv.innerHTML = ""; // clear any default content

      // Add typing cursor effect initially
      cursorSpan = document.createElement('span');
      cursorSpan.className = 'typing-cursor'; 
      cursorSpan.style.borderRight = '2px solid #0d6efd';
      cursorSpan.style.animation = 'blink 1s step-start infinite';
      contentDiv.appendChild(cursorSpan);

      // Play filler sound (Pop)
      this._fdFillerSound.play().catch(() => {});
    }

    // 2. Initialize Queue
    this._fdQueue = [];
    this._fdProcessing = false;
    let fullTextAccumulator = "";
    let accessedDocuments = [];
    let sourceCategories = {};

    // 3. Connect WebSocket
    // Use CONFIG.API_BASE to construct WS URL (handles separate frontend/backend ports)
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
            // On the first streamed chunk, if we had a thinking indicator,
            // convert it into the streaming UI (clear thinking text and add
            // a cursor) so the full-duplex typewriter/audio playback can run.
            if (!firstChunkArrived) {
              firstChunkArrived = true;
              // If we reused a thinkingDiv, reset contentDiv now
              if (contentDiv) {
                contentDiv.innerHTML = '';
              }
              // Create cursorSpan if not present
              if (!cursorSpan) {
                cursorSpan = document.createElement('span');
                cursorSpan.className = 'typing-cursor';
                cursorSpan.style.borderRight = '2px solid #0d6efd';
                cursorSpan.style.animation = 'blink 1s step-start infinite';
                if (contentDiv) contentDiv.appendChild(cursorSpan);
              } else {
                // ensure cursorSpan is attached
                if (cursorSpan.parentNode !== contentDiv) contentDiv.appendChild(cursorSpan);
              }
              // Play filler sound now that streaming starts
              this._fdFillerSound.play().catch(() => {});
            }

            // Decode Audio
            const binaryString = atob(msg.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const blob = new Blob([bytes], { type: msg.mime });

            // Add to queue
            this._fdQueue.push({ text: msg.text, audioBlob: blob });
            fullTextAccumulator += msg.text;

            // If this chunk includes metadata about sources, update local state
            if (msg.metadata || msg.accessed_documents || msg.source_categories) {
              const meta = msg.metadata || {};
              accessedDocuments = meta.accessed_documents || msg.accessed_documents || accessedDocuments;
              sourceCategories = meta.source_categories || msg.source_categories || sourceCategories;
              try {
                if (botMessage && botMessage.dataset) {
                  botMessage.dataset.accessedDocuments = JSON.stringify(accessedDocuments || []);
                  botMessage.dataset.sourceCategories = JSON.stringify(sourceCategories || {});
                }
                // Render/update sources block in the message content (try to resolve IDs)
                try { this.renderSourcesHTMLAsync(contentDiv, accessedDocuments || [], [], sourceCategories || {}); } catch (_) {}
              } catch (e) {
                console.warn('Failed to render progressive sources:', e);
              }
            }

            // Trigger processing
            this.processFdQueue(contentDiv, cursorSpan);
          }
            else if (msg.type === 'done') {
              console.log("✅ Stream Complete");
              if (msg.metadata) {
                accessedDocuments = msg.metadata.accessed_documents || [];
                sourceCategories = msg.metadata.source_categories || {};
              }

              // When done, ensure we resolve document IDs to human-friendly names
              // before finalizing the session. Wait for queue to finish first.
              const checkDone = setInterval(() => {
                if (this._fdQueue.length === 0 && !this._fdProcessing) {
                  clearInterval(checkDone);
                  (async () => {
                    try {
                      let resolvedDocs = accessedDocuments || [];
                      // If they look like numeric IDs, try to fetch metadata
                      const needResolve = Array.isArray(resolvedDocs) && resolvedDocs.some(d => (typeof d === 'number') || (typeof d === 'string' && /^\d+$/.test(String(d).trim())));
                      if (needResolve) {
                        const fetched = await this.fetchDocumentsByIds(resolvedDocs);
                        if (Array.isArray(fetched) && fetched.length > 0) {
                          resolvedDocs = fetched;
                        }
                      }
                      await this.finalizeFdSession(question, fullTextAccumulator, botMessage, resolvedDocs, sourceCategories);
                    } catch (e) {
                      console.warn('Error finalizing fd session with resolved docs', e);
                      try { await this.finalizeFdSession(question, fullTextAccumulator, botMessage, accessedDocuments, sourceCategories); } catch(_){}
                    }
                  })();
                }
              }, 100);
            }
            else if (msg.type === 'error') {
                console.error("WS Error:", msg.message);
                this.app.showToast("Error generating voice response", "error");
                this.finalizeFdSession(question, fullTextAccumulator, botMessage, [], {}).catch(() => {});
            }
        };

        this._fdWs.onerror = (e) => {
            console.error("WS Error", e);
            this.app.showToast("Connection error", "error");
            this.finalizeFdSession(question, fullTextAccumulator, botMessage, [], {}).catch(() => {});
        };

    } catch (e) {
        console.error("WS Setup Failed", e);
        // Fallback to standard
        await this.submitQuestion(question, true);
    }
  }

  async processFdQueue(contentDiv, cursorSpan) {
    if (this._fdProcessing || this._fdQueue.length === 0) return;
    this._fdProcessing = true;

    const item = this._fdQueue.shift();
    
    const audioUrl = URL.createObjectURL(item.audioBlob);
    const audio = new Audio(audioUrl);

    // Show mic as active (speaking)
    this.app.uiManager.showMicStopSpeakingMode();

    audio.addEventListener('loadedmetadata', () => {
        const durationMs = (audio.duration * 1000) || 1000; 
        
        audio.play().catch(e => console.error("Playback failed", e));
        
        // Start visual typing, synced to audio length
        this.runFdTypewriter(item.text, durationMs, contentDiv, cursorSpan).then(() => {
             // Text rendering finished for this chunk
        });
    });

    audio.onended = () => {
        this._fdProcessing = false;
        this.processFdQueue(contentDiv, cursorSpan); // Next chunk
    };
    
    // Safety timeout in case onended doesn't fire
    audio.onerror = () => {
        this._fdProcessing = false;
        this.processFdQueue(contentDiv, cursorSpan);
    };
  }

  runFdTypewriter(text, totalDurationMs, contentDiv, cursorSpan) {
    return new Promise((resolve) => {
        // Remove cursor temporarily to append text before it
        if (cursorSpan && cursorSpan.parentNode === contentDiv) {
            contentDiv.removeChild(cursorSpan);
        }

        const span = document.createElement('span');
        // span.className = 'typing-active'; 
        contentDiv.appendChild(span);
        
        // Re-append cursor at the end
        if (cursorSpan) contentDiv.appendChild(cursorSpan);
        
        let i = 0;
        // Calculate typing speed based on audio duration
        // Speed up slightly (0.95) to finish just before audio ends
        const charDelay = (totalDurationMs / (text.length + 1)) * 0.95;

        const typeChar = () => {
            if (i < text.length) {
                span.textContent += text.charAt(i);
                this.app.uiManager.scrollToBottom();
                i++;
                setTimeout(typeChar, charDelay);
            } else {
                // Add a space after the chunk
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

  async finalizeFdSession(question, fullAnswer, botMessage, accessedDocuments, sourceCategories) {
    // 1. Clean up UI
    const cursor = botMessage.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
    
    this.app.uiManager.hideMicStopSpeakingMode();
    this.app.isLoading = false;
    this.app.uiManager.toggleSendButton(false);
    this.app.elements.chatInput.disabled = false;
    this.app.messageManager.enableFollowUpSuggestions();
    
    if (window.innerWidth > 768) {
        this.app.elements.chatInput.focus();
    }

    // 2. Build Sources & Metadata
    const answerWithSources = this.buildAnswerWithSources(fullAnswer, accessedDocuments, [], sourceCategories);
    
    // 3. Render Sources HTML
    const contentDiv = botMessage.querySelector('.message-content');
    if (contentDiv) {
      // Clean and build the full answer with sources
      const cleanedAnswer = this.cleanAIResponse(answerWithSources);
      
      // Use the Markdown parser to render the HTML, identical to page load
      if (this.app && this.app.markdownParser) {
        contentDiv.innerHTML = this.app.markdownParser.parseMarkdown(cleanedAnswer);
        this.app.markdownParser.applySyntaxHighlighting(contentDiv);
        if (this.app.markdownParser.renderCharts) this.app.markdownParser.renderCharts(contentDiv);
      }
      // Apply final styling corrections
      this.styleSourcesSection(contentDiv);
    }

    // 4. Save to History
    botMessage.dataset.rawAnswer = answerWithSources;
    botMessage.dataset.accessedDocuments = JSON.stringify(accessedDocuments || []);
    botMessage.dataset.sourceCategories = JSON.stringify(sourceCategories || {});

    this.app.currentConversation.push({ 
        question, 
        answer: answerWithSources, 
        accessed_documents: accessedDocuments || [],
        accessed_tools: [],
        source_categories: sourceCategories || {}, 
        timestamp: new Date().toISOString() 
    });
    this.saveConversation();

    requestAnimationFrame(() => {
        this.app.messageManager.ensureActionButtons(botMessage);
        this.app.messageManager.addFollowUpSuggestions(botMessage, question, fullAnswer);
    });

    if (this._fdWs) {
        this._fdWs.close();
        this._fdWs = null;
    }
  }

  getThinkingPhrases() {
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const phrases = t.thinking && Array.isArray(t.thinking.placeholders) ? t.thinking.placeholders : [];
    const fallback = [
      "Thinking...",
      "Analyzing...",
      "Gathering context...",
      "Searching knowledge...",
      "Formulating answer..."
    ];
    return phrases.length > 0 ? phrases : fallback;
  }
 
  getContextThinkingPhrase(question) {
    const q = (question || '').toLowerCase();
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const ctx = t.thinkingCtx || {};
    const chartTriggers = ['chart', 'graph', 'trend', 'visualize', 'plot', 'over time', 'distribution'];
    const compareTriggers = ['compare', 'vs', 'versus', 'difference', 'which is better'];
    const tableTriggers = ['list', 'table', 'breakdown', 'categories', 'show all'];
    const policyTriggers = ['policy', 'policies', 'leave', 'vacation', 'remote work', 'benefits', 'penalties', 'guidelines', 'procedure'];
    const scheduleTriggers = ['schedule', 'calendar', 'meeting', 'event', 'deadline'];
    const emailTriggers = ['email', 'reply', 'message', 'draft', 'respond'];
    const calcTriggers = ['calculate', 'sum', 'average', 'percent', 'percentage', 'ratio', 'growth', 'projection', 'estimate'];
    const infoTriggers = ['what is', 'tell me about', 'explain', 'define', 'details'];
    const debugTriggers = ['error', 'issue', 'problem', 'fix', 'troubleshoot', 'not working', 'why'];
    const hasAny = (arr) => arr.some(x => q.includes(x));
    if (hasAny(chartTriggers)) return ctx.chart || 'Analyzing trends';
    if (hasAny(compareTriggers)) return ctx.compare || 'Comparing options';
    if (hasAny(tableTriggers)) return ctx.table || 'Organizing data';
    if (hasAny(calcTriggers)) return ctx.calc || 'Crunching the numbers';
    if (hasAny(policyTriggers)) return ctx.policy || 'Checking HR policies';
    if (hasAny(scheduleTriggers)) return ctx.schedule || 'Looking up schedules';
    if (hasAny(emailTriggers)) return ctx.email || 'Drafting a helpful reply';
    if (hasAny(debugTriggers)) return ctx.debug || 'Tracing the steps';
    if (hasAny(infoTriggers)) return ctx.info || 'Gathering the right details';
    return ctx.general || 'Thinking it through';
  }
 
  getContextThinkingPhrases(question) {
    const primary = this.getContextThinkingPhrase(question);
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const base = (t.thinking && Array.isArray(t.thinking.placeholders)) ? t.thinking.placeholders : [];
    const cleanedBase = base.map(p => p.replace(/\.\.\.$/, ''));
    const pool = [primary, ...cleanedBase];
    const unique = [];
    const seen = new Set();
    for (const p of pool) {
      const k = (p || '').toLowerCase();
      if (!seen.has(k) && p) {
        seen.add(k);
        unique.push(p);
      }
    }
    return unique.length > 0 ? unique : [primary];
  }
 
  async submitQuestion(question, wasVoiceInput = false) {
    const thinkingDiv = this.createTypingIndicator(question);
    this.app.elements.chatDiv.appendChild(thinkingDiv);

    requestAnimationFrame(() => {
      this.app.uiManager.scrollToBottom();
    });

    this.app.apiManager.getThinkingPhrases(
      question,
      this.app.currentConversation,
      this.app.userName
    ).then(({ meta }) => {
      const phrases = meta && Array.isArray(meta.thinking_phrases) ? meta.thinking_phrases : null;
      if (phrases && thinkingDiv && thinkingDiv._setThinkingPhrases) {
        thinkingDiv._setThinkingPhrases(phrases, 2500);
      }
    }).catch(() => {});

    try {
      console.log('📤 Sending request to API...', { wasVoiceInput, question });
      
      const { answer, accessed_documents, accessed_tools, source_categories } = await this.app.apiManager.getAIResponse(
        question,
        this.app.hrKnowledgeBase,
        this.app.currentConversation,
        this.app.userName,
        thinkingDiv
      );
      
      let cleanedAnswer = this.cleanAIResponse(answer);

      // Clean sources
      const sourcesPatterns = [
        /\n*---\n*\n*\*?Source:?[\s\S]*?(?=\n\n|$)/gi,
        /\n*---\n*\n*\*?Sources:?[\s\S]*?(?=\n\n|$)/gi,
        /\n*---\n*\n*\*?Cite:?[\s\S]*?(?=\n\n|$)/gi,
        /\n*---\n*\n*\*?SOURCES:?[\s\S]*?(?=\n\n|$)/gi,
        /\n*---\n*\n*\*?SOURCE:?[\s\S]*?(?=\n\n|$)/gi,
        /\n\n---\n\n\*\*Source[\s\S]*?(?=\n\n|$)/gi,
        /\n\n---\n\n\*\*Sources[\s\S]*?(?=\n\n|$)/gi,
        /\n\n---\n\nSource[\s\S]*?(?=\n\n|$)/gi,
        /\n\n---\n\nSources[\s\S]*?(?=\n\n|$)/gi,
      ];

      sourcesPatterns.forEach(pattern => {
        cleanedAnswer = cleanedAnswer.replace(pattern, '');
      });

      cleanedAnswer = cleanedAnswer.replace(/\n\n---\s*$/g, '');
      cleanedAnswer = cleanedAnswer.replace(/\n{3,}/g, '\n\n'); 
      cleanedAnswer = cleanedAnswer.trim();

      const answerWithSources = this.buildAnswerWithSources(cleanedAnswer, accessed_documents, accessed_tools, source_categories);
      const finalAnswer = wasVoiceInput ? this._sanitizePlainText(cleanedAnswer) : answerWithSources;
      
      const responseMessage = this.createMessageElement("bot", "");
      responseMessage.dataset.rawAnswer = answerWithSources;
      responseMessage.dataset.originalAnswer = cleanedAnswer;
      responseMessage.dataset.accessedDocuments = JSON.stringify(accessed_documents || []);
      responseMessage.dataset.accessedTools = JSON.stringify(accessed_tools || []);
      responseMessage.dataset.sourceCategories = JSON.stringify(source_categories || {});

      if (thinkingDiv._stopThinking) thinkingDiv._stopThinking();
      if (thinkingDiv.parentNode) {
        thinkingDiv.replaceWith(responseMessage);
      } else {
        this.app.elements.chatDiv.appendChild(responseMessage);
      }
      
      const contentDiv = responseMessage.querySelector('.message-content');
      const _streamStartMs = performance.now();
      
      console.log("🔊 TTS Decision:", { wasVoiceInput, useLive: !!this.liveTTS });
      
      // REVISED: Disabled TTS even for voice input as per user request
      // The microphone will only convert speech to text (STT), but the AI will reply with text only.
      // await this.streamContent(finalAnswer, contentDiv, responseMessage, wasVoiceInput);
      await this.streamContent(finalAnswer, contentDiv, responseMessage, false);
      
      this._lastTextRenderFinishedAt = performance.now();
      console.log("📝 Text response finished", {
        finishedIso: new Date().toISOString(),
        streamDurationMs: Math.round(this._lastTextRenderFinishedAt - _streamStartMs),
        length: answerWithSources.length,
        wasVoiceInput
      });

      // TTS logic removed here
      
      if (wasVoiceInput) {
        // If it was voice input, we might want to do something else, but per requirement:
        // "When the question is just inputed to the input field, the bot response would only be text reposne"
        // Since we are in the 'submitQuestion' flow (Standard Text Mode), we do NOT play audio.
        // The Full Duplex flow handles the voice-to-voice scenario separately.
      }


      if (contentDiv && !wasVoiceInput) {
        this.app.markdownParser.applySyntaxHighlighting(contentDiv);
        this.app.markdownParser.renderCharts(contentDiv);
        this.styleSourcesSection(contentDiv);
        const tables = contentDiv.querySelectorAll('.table-wrapper');
        const jsonTables = contentDiv.querySelectorAll('.grid-table-placeholder');
        if ((answer.includes('|') && tables.length === 0) || (answer.includes('```json_table') && jsonTables.length === 0)) {
          this.showTableError(contentDiv, 'Table formatting issue detected');
        }
      }
      if (contentDiv && wasVoiceInput) {
        await this.renderSourcesHTMLAsync(contentDiv, accessed_documents, accessed_tools, source_categories);
        this.styleSourcesSection(contentDiv);
      }

      requestAnimationFrame(() => {
        this.app.messageManager.ensureActionButtons(responseMessage);
        this.app.messageManager.addFollowUpSuggestions(responseMessage, question, cleanedAnswer);
      });
      
      this.app.currentConversation.push({ 
        question, 
        answer: answerWithSources, 
        accessed_documents: accessed_documents || [],
        accessed_tools: accessed_tools || [],
        source_categories: source_categories || {}, 
        timestamp: new Date().toISOString() 
      });
      this.saveConversation();
      
    } catch (error) {
      console.error("❌ AI Response Error:", error);
      
      if (error.name === 'AbortError') {
        console.log('⚠️ Request aborted by user');
        if (thinkingDiv._stopThinking) thinkingDiv._stopThinking();
        if (thinkingDiv.parentNode) thinkingDiv.remove();
      } else {
        if (thinkingDiv._stopThinking) thinkingDiv._stopThinking();
        if (thinkingDiv.parentNode) thinkingDiv.remove();
        if (error.status === 503 || (error.message && error.message.includes('Maintenance'))) {
           this.handleMaintenanceMode();
           return;
        }
        this.showErrorWithRetry(
          "Sorry, I encountered an error while processing your request. Please try again.", 
          question
        );
        this.app.showToast('Failed to get response from AI', 'error');
      }
    } finally {
      this.app.isLoading = false;
      this.app.uiManager.toggleSendButton(false);
      this.app.elements.chatInput.disabled = false;
      this.app.messageManager.enableFollowUpSuggestions();
      this.app.uiManager.scrollToBottom();
      
      if (window.innerWidth > 768) {
        this.app.elements.chatInput.focus();
      }
      
      this.app.apiManager.abortController = null;
      this.app.uiManager.updateScrollButton();
    }
  }

  // ==========================================================
  // 🎯 NEW: Stream content with parallel TTS
  // ==========================================================
  async streamContentWithTTS(text, contentDiv, messageElement, shouldSpeak = false) {
    return new Promise((resolve) => {
      let i = 0;
      let buffer = "";
      const size = 24;
      
      let accumulatedText = "";
      
      const step = () => {
        if (i >= text.length) { 
          resolve(); 
          return; 
        }
        
        buffer += text.slice(i, i + size);
        i += size;
        
        const chunk = text.slice(Math.max(0, i - size), i);
        const isFinal = i >= text.length;
        const evt = new CustomEvent('streamingUpdate', { 
          detail: { 
            fullAnswer: buffer, 
            chunk,
            isFinal,
            contentDiv, 
            messageElement 
          } 
        });
        document.dispatchEvent(evt);
        
        if (shouldSpeak && !this._ttsStop) {
          const cleanText = this.extractCleanText(contentDiv.innerHTML);
          accumulatedText = cleanText;
          
          const unspokenText = accumulatedText.substring(this._ttsLastSpokenIndex);
          const sentenceMatch = unspokenText.match(/[^.!?]*[.!?]+/);
          
          if (sentenceMatch && sentenceMatch[0].length > 20) {
            const sentenceToSpeak = sentenceMatch[0].trim();
            this._ttsLastSpokenIndex += sentenceMatch.index + sentenceMatch[0].length;
            
            console.log("🔊 Queueing sentence (LIVE):", sentenceToSpeak.substring(0, 60) + "...");
            
            setTimeout(() => {
              if (!this._ttsStop) {
                this.speakWithGemini(sentenceToSpeak);
              }
            }, 300);
          }
        }
        
        setTimeout(step, 30); 
      };
      
      step();
    });
  }

  extractCleanText(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const toRemove = tempDiv.querySelectorAll(
      '.chart-container, pre, code, .sources-section, .sources-header, .sources-list, hr'
    );
    toRemove.forEach(el => el.remove());
    let text = (tempDiv.textContent || tempDiv.innerText).trim();
    text = this.prepareTextForSpeech(text);
    return text;
  }

  async speakSentence(text) {
    if (!text || text.trim().length < 5) return;
    const speechText = this.prepareTextForSpeech(text);
    if (!speechText) return;
    this.speakWithGemini(speechText);
  }

  async speakResponseChunked(text) {
    const speechText = this.prepareTextForSpeech(text);
    if (!speechText) return;
    this.speakWithGemini(speechText);
  }

  splitIntoNaturalSentences(text) {
    const sentences = [];
    const sentenceRegex = /[^.!?]+[.!?]+/g;
    let match;
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence.length > 10) {
        sentences.push(sentence);
      }
    }
    if (sentences.length === 0 && text.trim().length > 0) {
      const commaSplit = text.split(/[,;]/).filter(s => s.trim().length > 10);
      if (commaSplit.length > 0) {
        sentences.push(...commaSplit.map(s => s.trim() + '.'));
      } else {
        sentences.push(text.trim());
      }
    }
    return sentences;
  }

  // ==========================================================
  // 🗣️ UPDATED TTS LOGIC (HYBRID)
  // ==========================================================

  async enqueueTTSChunk(text) {
    const speechText = this.prepareTextForSpeech(text);
    if (!speechText) return;
    // Use centralized TTSManager (Web Audio + FIFO) when available
    try {
      if (this.app && this.app.ttsManager) {
        await this.app.ttsManager.enqueue(speechText);
      } else {
        // Fallback: request blob from APIManager and enqueue as audio element
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

  flushOrderedAudioQueue() {
    this._ttsPendingAudio = {};
    // Delegate to centralized TTS manager if available
    try { if (this.app && this.app.ttsManager) this.app.ttsManager.stop(); } catch (e) {}
    // Cleanup any local audio elements as fallback
    if (this._audioQueue && this._audioQueue.length > 0) {
      this._audioQueue.forEach(item => {
        try {
          if (item.audio) {
            item.audio.pause();
            item.audio.src = "";
            try { item.audio.load(); } catch (_) {}
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
    try { this._activeBlobUrls.clear(); } catch (_) { this._activeBlobUrls = new Set(); }
    this._isSpeaking = false;
    this._ttsSeqCounter = 0;
    this._ttsNextToEnqueue = 0;
    
    // NOTE: 'audio' variable was undefined in previous version's scope here
    // Fixed logic to just clear queue
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

  cleanAIResponse(answer) {
    if (!answer) return answer;
    let cleaned = answer
      .replace(/,\s*}/g, '}')  
      .replace(/,\s*]/g, ']')  
      .replace(/,\s*$/gm, ''); 
    cleaned = cleaned.replace(/},\s*}/g, '}]');
    cleaned = cleaned.replace(/("\s*:\s*"[^"]*")(\s*"\s*:)/g, '$1,$2');
    cleaned = cleaned.replace(/("\s*:\s*"[^"]*")(\s*\n\s*"\s*:)/g, '$1,$2');
    return cleaned;
  }
  
  debugJsonTableStructure(answer) {}

  buildAnswerWithSources(answer, accessed_documents, accessed_tools, source_categories) {
    if (answer.includes('---\n\n**Sources**')) return answer;
    let sourcesSection = '\n\n---\n\n**Sources**\n\n';
    const sources = [];

    if (accessed_documents && accessed_documents.length > 0) {
      accessed_documents.forEach(doc => {
        if (doc) {
          let docName = '';
          let docCategory = '';
          if (typeof doc === 'object' && doc.name) {
            docName = doc.name;
            docCategory = doc.category || '';
          } else if (typeof doc === 'string') {
            docName = doc.trim();
          } else if (typeof doc === 'number') {
            docName = `Document ${doc}`;
          }
          if (docName && docName !== 'null' && docName !== 'undefined') {
            if (docCategory) {
              sources.push(`📄 ${docName} (${docCategory})`);
            } else {
              sources.push(`📄 ${docName}`);
            }
          }
        }
      });
    }

    if (accessed_tools && accessed_tools.length > 0) {
      accessed_tools.forEach(tool => {
        if (tool) {
          let toolName = '';
          if (typeof tool === 'object' && tool.name) {
            toolName = tool.name;
          } else if (typeof tool === 'string') {
            toolName = tool.trim();
          } else if (typeof tool === 'number') {
            toolName = `Live Data Tool ${tool}`;
          }
          if (toolName && toolName !== 'null' && toolName !== 'undefined') {
            sources.push(`🔧 ${toolName}`);
          }
        }
      });
    }

    const uniqueSources = [...new Set(sources)];
    if (uniqueSources.length === 0) {
      sourcesSection += '• Knowledge Base\n';
    } else {
      uniqueSources.forEach(source => {
        sourcesSection += `• ${source}\n`;
      });
    }
    return answer + sourcesSection;
  }

  async streamContent(text, contentDiv, messageElement, plainMode = false) {
    return new Promise((resolve) => {
      const tokens = (text.match(/[\s]+|[^\s]+/g) || []);
      const totalLen = text.length;
      const baseDelay = 36;
      const wordsPerChunk = totalLen > 1500 ? 5 : totalLen > 800 ? 4 : 3;
      let idx = 0;
      let buffer = "";
      
      const takeChunk = () => {
        if (idx >= tokens.length) { resolve(); return; }
        let chunk = "";
        let words = 0;
        while (idx < tokens.length && words < wordsPerChunk) {
          const t = tokens[idx++];
          chunk += t;
          if (!/\s+/.test(t)) words++;
          if (/[.!?]$/.test(t) || /\n$/.test(t)) break;
        }
        buffer += chunk;
        const isFinal = idx >= tokens.length;
        const evt = new CustomEvent('streamingUpdate', { detail: { fullAnswer: buffer, chunk, isFinal, contentDiv, messageElement, plain: !!plainMode } });
        document.dispatchEvent(evt);
        
        let delay = baseDelay;
        if (/[.!?]\s*$/.test(chunk)) delay += 160;
        else if (/[,;:]\s*$/.test(chunk)) delay += 100;
        else if (/\n\s*$/.test(chunk)) delay += 140;
        
        setTimeout(() => {
          requestAnimationFrame(takeChunk);
        }, delay);
      };
      
      requestAnimationFrame(takeChunk);
    });
  }

  validateTableStructure(tableLines) {
    if (tableLines.length < 2) return false;
    const headerRow = tableLines[0];
    const hasHeaderPipes = headerRow.includes('|');
    const hasDataRows = tableLines.slice(1).some(line => 
      line.includes('|') && !line.match(/^[-:\s|]+$/)
    );
    return hasHeaderPipes && hasDataRows;
  }

  showTableError(contentDiv, message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'table-error';
    errorDiv.innerHTML = `
      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin: 10px 0;">
        <strong>⚠️ Table Display Issue</strong>
        <p style="margin: 8px 0 0 0; font-size: 0.9em;">${message}. The raw data is available below.</p>
      </div>
    `;
    contentDiv.insertBefore(errorDiv, contentDiv.firstChild);
  }

  styleSourcesSection(contentDiv) {
    if (!contentDiv) return;
    const hrs = contentDiv.querySelectorAll('hr');
    hrs.forEach(hr => {
      const nextElement = hr.nextElementSibling;
      if (!nextElement) return;
      const textContent = nextElement.textContent.trim().toLowerCase();
      const isSourcesHeader = textContent === 'sources' || 
                            textContent === 'sources:' || 
                            textContent.startsWith('sources');
      if (isSourcesHeader) {
        hr.classList.add('sources-divider');
        hr.style.borderTop = '1px solid #e2e8f0';
        hr.style.margin = '28px 0 16px 0';
        hr.style.opacity = '0.6';
        
        nextElement.classList.add('sources-header');
        nextElement.style.color = '#64748b';
        nextElement.style.fontSize = '0.85rem';
        nextElement.style.fontWeight = '600';
        nextElement.style.textTransform = 'uppercase';
        nextElement.style.letterSpacing = '0.5px';
        nextElement.style.marginTop = '0';
        nextElement.style.marginBottom = '12px';
        
        let listElement = nextElement.nextElementSibling;
        if (listElement && listElement.tagName === 'UL') {
          listElement.classList.add('sources-list');
          listElement.style.margin = '12px 0 0 0';
          listElement.style.padding = '0';
          listElement.style.listStyle = 'none';
          listElement.style.background = 'transparent';
          listElement.style.border = 'none';
          
          const listItems = listElement.querySelectorAll('li');
          listItems.forEach(li => {
            li.style.padding = '6px 0';
            li.style.color = '#64748b';
            li.style.fontSize = '0.85rem';
            li.style.lineHeight = '1.6';
            li.style.paddingLeft = '20px';
            li.style.position = 'relative';
            li.style.listStyle = 'none';
            const firstChar = li.textContent.trim()[0];
            const isEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(firstChar);
            if (!isEmoji) {
              li.style.paddingLeft = '20px';
              const bullet = document.createElement('span');
              bullet.textContent = '•';
              bullet.style.position = 'absolute';
              bullet.style.left = '0';
              bullet.style.color = '#94a3b8';
              li.insertBefore(bullet, li.firstChild);
            }
          });
        }
      }
    });
    
    const lastPara = contentDiv.querySelector('p:last-of-type');
    if (lastPara && lastPara.textContent.trim().toLowerCase().includes('source')) {
      lastPara.style.borderTop = '1px solid #e2e8f0';
      lastPara.style.paddingTop = '16px';
      lastPara.style.marginTop = '24px';
      lastPara.style.color = '#64748b';
      lastPara.style.fontSize = '0.85rem';
    }
  }
  
  renderSourcesHTML(contentDiv, accessed_documents, accessed_tools, source_categories) {
    if (!contentDiv) return;
    // Remove any existing sources block so updates replace instead of appending
    const existing = contentDiv.querySelector('.sources-section');
    if (existing) existing.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'sources-section';
    const hr = document.createElement('hr');
    const header = document.createElement('p');
    header.textContent = 'Sources';
    const list = document.createElement('ul');
    const items = [];
    if (Array.isArray(accessed_documents)) {
      accessed_documents.forEach(doc => {
        if (!doc) return;
        let name = '';
        let category = '';
        if (typeof doc === 'object') {
          name = (doc.name || '').trim();
          category = (doc.category || '').trim();
        } else if (typeof doc === 'string') {
          name = doc.trim();
        } else if (typeof doc === 'number') {
          name = `Document ${doc}`;
        }
        if (name && name !== 'null' && name !== 'undefined') {
          items.push(category ? `${name} (${category})` : name);
        }
      });
    }
    if (Array.isArray(accessed_tools)) {
      accessed_tools.forEach(tool => {
        if (!tool) return;
        let name = '';
        if (typeof tool === 'object') {
          name = (tool.name || '').trim();
        } else if (typeof tool === 'string') {
          name = tool.trim();
        } else if (typeof tool === 'number') {
          name = `Live Data Tool ${tool}`;
        }
        if (name && name !== 'null' && name !== 'undefined') {
          items.push(name);
        }
      });
    }
    const seen = new Set();
    items.forEach(text => {
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
    wrapper.appendChild(hr);
    wrapper.appendChild(header);
    wrapper.appendChild(list);
    contentDiv.appendChild(wrapper);
  }

  async resolveDocumentMetadata(doc) {
    // Returns { name, category } or null
    try {
      if (!doc) return null;
      if (typeof doc === 'object') {
        return { name: (doc.name || '').trim(), category: (doc.category || '').trim() };
      }
      let id = null;
      if (typeof doc === 'number') id = doc;
      if (typeof doc === 'string') {
        const m = doc.match(/Document\s*(\d+)/i);
        if (m) id = Number(m[1]);
        else if (/^\d+$/.test(doc.trim())) id = Number(doc.trim());
      }
      if (id !== null && this.app && this.app.apiManager && this.app.apiManager.getDocument) {
        const resp = await this.app.apiManager.getDocument(id);
        const doc = resp && (resp.document || resp.document || resp);
        if (doc && (doc.title || doc.name || doc.id)) {
          return { name: (doc.title || doc.name || `Document ${doc.id || id}`).trim(), category: (doc.category_name || doc.subcategory_name || doc.category || '').trim() };
        }
      }
    } catch (e) {
      console.warn('resolveDocumentMetadata error', e);
    }
    return null;
  }

  async renderSourcesHTMLAsync(contentDiv, accessed_documents, accessed_tools, source_categories) {
    // Render immediate items first (may include placeholders), then try to resolve IDs
    this.renderSourcesHTML(contentDiv, accessed_documents, accessed_tools, source_categories);
    if (!Array.isArray(accessed_documents) || accessed_documents.length === 0) return;
    const unresolved = [];
    accessed_documents.forEach(doc => {
      if (!doc) return;
      if (typeof doc === 'object' && (doc.name || doc.title)) return; // already resolved
      if (typeof doc === 'string' && !/^Document\s*\d+/i.test(doc) && !/^\d+$/.test(doc.trim())) return;
      unresolved.push(doc);
    });
    if (unresolved.length === 0) return;

    // Fetch metadata in parallel
    const promises = unresolved.map(d => this.resolveDocumentMetadata(d));
    const results = await Promise.all(promises);
    const resolved = [];
    results.forEach(r => { if (r && r.name) resolved.push(r); });
    if (resolved.length === 0) return;

    // Merge resolved names back into accessed_documents and update dataset if possible
    const finalDocs = accessed_documents.map(doc => {
      try {
        if (typeof doc === 'object' && (doc.name || doc.title)) return doc;
        const m = (typeof doc === 'string' && doc.match(/Document\s*(\d+)/i)) ? Number(doc.match(/Document\s*(\d+)/i)[1]) : (typeof doc === 'string' && /^\d+$/.test(doc.trim()) ? Number(doc.trim()) : null);
        if (m !== null) {
          const found = results.find((res, idx) => {
            const orig = unresolved[idx];
            if (typeof orig === 'number') return orig === m;
            if (typeof orig === 'string' && orig.match(/Document\s*(\d+)/i)) return Number(orig.match(/Document\s*(\d+)/i)[1]) === m;
            return false;
          });
          if (found && found.name) return { name: found.name, category: found.category || '' };
        }
      } catch (e) {}
      return doc;
    });

    try {
      // Update dataset on parent message if present
      const parentMsg = contentDiv && contentDiv.closest && contentDiv.closest('.message');
      if (parentMsg && parentMsg.dataset) {
        parentMsg.dataset.accessedDocuments = JSON.stringify(finalDocs || []);
      }
    } catch (e) {}

    // Re-render sources block with resolved names
    try {
      const existing = contentDiv.querySelector('.sources-section');
      if (existing) existing.remove();
      const docsForRender = finalDocs.map(d => (typeof d === 'object' ? d : (typeof d === 'string' ? d : '')));
      this.renderSourcesHTML(contentDiv, docsForRender, accessed_tools, source_categories);
    } catch (e) {
      console.warn('Failed to re-render resolved sources', e);
    }
  }

  async fetchDocumentsByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const results = [];
    try {
      const promises = ids.map(id => {
        try {
          return this.app.apiManager.getDocument(id).catch(e => ({ error: e }));
        } catch (e) {
          return Promise.resolve({ error: e });
        }
      });
      const responses = await Promise.all(promises);
      for (const resp of responses) {
        if (!resp) continue;
        const doc = resp.document || resp;
        if (doc && (doc.title || doc.name || doc.id)) {
          results.push({ name: doc.title || doc.name || `Document ${doc.id || ''}`, category: doc.category_name || doc.subcategory_name || '' });
        }
      }
    } catch (e) {
      console.warn('fetchDocumentsByIds error', e);
    }
    return results;
  }

  handleMaintenanceMode() {
    this.app.showToast('🔧 System is under maintenance. Please try again later.', 'warning');
    const maintenanceDiv = document.createElement('div');
    maintenanceDiv.className = 'message bot error';
    maintenanceDiv.innerHTML = `
      <div class="message-header">
        <img src="assets/images/avatar-yellow.png" alt="Cindy" class="bot-avatar">
        <span class="bot-name">System Message</span>
      </div>
      <div class="message-content">
        <p><strong>🔧 System Under Maintenance</strong></p>
        <p>ChatCDO is currently undergoing scheduled maintenance. Please check back shortly.</p>
      </div>
    `;
    this.app.elements.chatDiv.appendChild(maintenanceDiv);
    this.app.elements.chatInput.disabled = true; 
  }

  deleteChat(index, title) {
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const chat = this.app.chats[index];
    if (!chat) return;

    this.app.modalManager.showModal({
      title: t.modals.deleteTitle,
      message: `${t.modals.deleteMessage} "${title}"?`,
      inputValue: null,
      confirmText: t.modals.deleteConfirm,
      cancelText: t.modals.cancel,
      confirmClass: "delete",
      onConfirm: async () => {
        if (this.app.authManager.getUserType() === 'employee' || this.app.authManager.getUserType() === 'external') {
          const userEmail = this.app.authManager.getUserEmail();
          const sessionId = chat.sessionId;
          if (userEmail && sessionId) {
            try {
              await this.app.apiManager.deleteChatSession(userEmail, sessionId);
            } catch (error) {
              if (error.status !== 503) {
                 this.app.showToast('Failed to delete chat from server', 'error');
                 return;
              }
            }
          }
        }
        
        this.app.chats.splice(index, 1);
        
        if (this.app.activeChatIndex === index || this.app.chats.length === 0) {
          this.app.activeChatIndex = null;
          this.app.currentConversation = [];
          this.app.hasConversation = false;
          this.app.elements.chatDiv.innerHTML = "";
          this.app.elements.chatInput.value = "";
          this.app.elements.chatInput.disabled = false;
        } else if (this.app.activeChatIndex > index) {
          this.app.activeChatIndex--;
        }
        
        this.app.saveToStorage();
        this.app.uiManager.renderHistory();
        this.app.uiManager.updateUI();
        this.app.uiManager.updateMobileHeader();
        this.app.showToast(t.toasts.chatDeleted, 'success');
      }
    });
  }

  saveConversation() {
    if (this.app.currentConversation.length === 0) return;
    
    const firstQuestion = this.app.currentConversation[0]?.question || "";
    const autoGeneratedTitle = firstQuestion.slice(0, CONFIG.MAX_TITLE_LENGTH) + 
                    (firstQuestion.length > CONFIG.MAX_TITLE_LENGTH ? "..." : "") || 
                    "Untitled Chat";
    const currentTimestamp = Date.now();

    if (this.app.activeChatIndex !== null && this.app.activeChatIndex >= 0) {
      const oldConversation = this.app.chats[this.app.activeChatIndex].conversation;
      const conversationChanged = JSON.stringify(oldConversation) !== JSON.stringify(this.app.currentConversation);
      
      if (conversationChanged) {
        this.app.chats[this.app.activeChatIndex] = {
          title: this.app.chats[this.app.activeChatIndex].title || autoGeneratedTitle,
          conversation: [...this.app.currentConversation],
          timestamp: currentTimestamp,
          sessionId: this.app.chats[this.app.activeChatIndex].sessionId || `session-${currentTimestamp}`
        };
      } else {
        this.app.chats[this.app.activeChatIndex].timestamp = currentTimestamp;
      }
    } else {
      this.app.chats.unshift({
        title: autoGeneratedTitle,
        conversation: [...this.app.currentConversation],
        timestamp: currentTimestamp,
        sessionId: `session-${currentTimestamp}`
      });
      this.app.activeChatIndex = 0;
    }
    
    this.app.saveToStorage();
    this.app.uiManager.renderHistory();
    this.app.uiManager.updateMobileHeader();
  }

  loadChat(index) {
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const chat = this.app.chats[index];
    if (!chat) return;
    
    if (this.app.activeChatIndex === index && this.app.hasConversation) {
      this.app.uiManager.closeMobileSidebar();
      return;
    }
    
    console.log(`📂 Loading chat: ${chat.title}`);
    
    this.app.activeChatIndex = index;
    this.app.hasConversation = true;
    this.app.currentConversation = chat.conversation.slice();
    this.app.saveToStorage(); 
    this.app.uiManager.updateUI();
    this.app.uiManager.highlightActiveChat();
    this.app.uiManager.updateMobileHeader();
    
    const { chatDiv } = this.app.elements;
    const fragment = document.createDocumentFragment();
    
    this.app.currentConversation.forEach(msg => {
      const userMsg = this.createMessageElement("user", msg.question);
      
      let fullAnswer = msg.answer;
      if (!fullAnswer.includes('---\n\n**Sources**')) {
        fullAnswer = this.buildAnswerWithSources(
          msg.answer,
          msg.accessed_documents || [],
          msg.accessed_tools || [],
          msg.source_categories || {}
        );
      }
      
      const botMsg = this.createMessageElement("bot", fullAnswer);
      
      botMsg.dataset.accessedDocuments = JSON.stringify(msg.accessed_documents || []);
      botMsg.dataset.accessedTools = JSON.stringify(msg.accessed_tools || []);
      botMsg.dataset.sourceCategories = JSON.stringify(msg.source_categories || {});
      
      fragment.appendChild(userMsg);
      fragment.appendChild(botMsg);
    });
    
    chatDiv.innerHTML = "";
    chatDiv.appendChild(fragment);
    
    setTimeout(() => {
      const allMessages = chatDiv.querySelectorAll('.message');
      allMessages.forEach(message => {
        if (!message.querySelector('.typing')) {
          this.app.messageManager.ensureActionButtons(message);
        }
      });
      
      const botMessages = chatDiv.querySelectorAll('.message.bot');
      botMessages.forEach(message => {
        const contentDiv = message.querySelector('.message-content');
        if (contentDiv) {
          const rawContent = contentDiv.innerHTML;
          const cleanedContent = this.cleanAIResponse(rawContent);
          if (cleanedContent !== rawContent) {
            contentDiv.innerHTML = cleanedContent;
          }
          
          this.app.markdownParser.applySyntaxHighlighting(contentDiv);
          this.app.markdownParser.renderCharts(contentDiv);
          this.styleSourcesSection(contentDiv);
        }
      });
    }, 0);
    
    this.app.uiManager.scrollToBottom();
    this.app.uiManager.closeMobileSidebar();
    this.app.uiManager.closeAllDropdowns();
    // Toast notification removed
  }

  enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis) {
    if (listItem.querySelector('.rename-input')) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
    input.value = currentTitle;
    input.maxLength = CONFIG.MAX_TITLE_LENGTH;
    listItem.replaceChild(input, titleSpan);
    ellipsis.style.display = "none";
    input.focus();
    input.select();
    
    let renameCompleted = false;
    const completeRename = async () => {
      if (renameCompleted) return;
      renameCompleted = true;
      const newName = input.value.trim();
      if (newName && newName !== currentTitle) {
        this.app.chats[index].title = newName;
        if (this.app.authManager.getUserType() === 'employee') {
          const userEmail = this.app.authManager.getUserEmail();
          const sessionId = this.app.chats[index].sessionId;
          if (userEmail && sessionId) {
            try {
              await this.app.apiManager.renameChatSession(userEmail, sessionId, newName);
            } catch (error) {
              console.warn('Failed to rename on server:', error);
            }
          }
        }
        this.app.saveToStorage();
        titleSpan.textContent = newName;
        this.updateCorrespondingChatTitle(index, newName);
        this.app.uiManager.updateMobileHeader();
      } 
      listItem.replaceChild(titleSpan, input);
      ellipsis.style.display = "";
      this.app.uiManager.renderHistory();
    };
    
    const cancelRename = () => {
      if (renameCompleted) return;
      renameCompleted = true;
      listItem.replaceChild(titleSpan, input);
      ellipsis.style.display = "";
    };
    
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        completeRename();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelRename();
      } else if (e.key === " ") {
        e.stopPropagation();
      }
    });
    input.addEventListener("blur", (e) => {
      setTimeout(() => { 
        if (!renameCompleted) cancelRename(); 
      }, 150);
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("input", (e) => e.stopPropagation());
  }

  createMessageElement(type, content, isThinking = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;

    if (type === 'bot' && !isThinking) {
      messageDiv.dataset.rawContent = content;
    }
    
    const headerDiv = document.createElement("div");
    headerDiv.className = "message-header";
    
    if (type === 'user') {
      const nameSpan = document.createElement('span');
      nameSpan.textContent = this.app.userName || 'You';
      nameSpan.className = 'user-name';
      headerDiv.appendChild(nameSpan);
    } else {
      const avatar = document.createElement("img");
      avatar.src = isThinking ? "assets/images/avatar-thinking.png" : "assets/images/avatar.png";
      avatar.alt = isThinking ? "Cindy is thinking" : "Cindy";
      avatar.className = isThinking ? "bot-avatar thinking" : "bot-avatar";
      
      const nameSpan = document.createElement("span");
      nameSpan.textContent = isThinking ? "Cindy is thinking..." : "Cindy";
      nameSpan.className = "bot-name";
      
      headerDiv.appendChild(avatar);
      headerDiv.appendChild(nameSpan);
    }
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    
    if (type === 'bot' && !isThinking) {
      const cleanedContent = this.cleanAIResponse(content);
      contentDiv.innerHTML = this.app.markdownParser.parseMarkdown(cleanedContent);
    } else {
      contentDiv.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
    }
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    messageDiv.appendChild(actionsDiv);

    return messageDiv;
  }

  createTypingIndicator(question) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot";
    const headerDiv = document.createElement("div");
    headerDiv.className = "message-header";
    const avatar = document.createElement("img");
    avatar.src = "assets/images/avatar-thinking.png";
    avatar.alt = "Cindy is thinking";
    avatar.className = "bot-avatar thinking";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = "Cindy";
    nameSpan.className = "bot-name";
    headerDiv.appendChild(avatar);
    headerDiv.appendChild(nameSpan);
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    const typingDiv = document.createElement("div");
    typingDiv.className = "typing";
    typingDiv.setAttribute("aria-label", "Cindy is typing");
    const textSpan = document.createElement("span");
    textSpan.className = "thinking-text";
    let phrases = this.getContextThinkingPhrases(question);
    let idx = 0;
    textSpan.textContent = phrases[idx] || '';
    const dot1 = document.createElement("span");
    dot1.className = "dot";
    const dot2 = document.createElement("span");
    dot2.className = "dot";
    const dot3 = document.createElement("span");
    dot3.className = "dot";
    typingDiv.appendChild(textSpan);
    typingDiv.appendChild(dot1);
    typingDiv.appendChild(dot2);
    typingDiv.appendChild(dot3);
    contentDiv.appendChild(typingDiv);
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    let intervalMs = 2500;
    let intervalId = setInterval(() => {
      idx = (idx + 1) % phrases.length;
      textSpan.textContent = phrases[idx] || '';
    }, intervalMs);
    messageDiv._stopThinking = () => { clearInterval(intervalId); };
    messageDiv._setThinkingPhrases = (newPhrases, newIntervalMs) => {
      if (Array.isArray(newPhrases) && newPhrases.length > 0) {
        const cleaned = newPhrases.map(p => String(p).replace(/\.\.\.$/, '')).filter(p => p.length > 0);
        const uniq = [];
        const seen = new Set();
        for (const p of cleaned) {
          const k = p.toLowerCase();
          if (!seen.has(k)) { seen.add(k); uniq.push(p); }
        }
        phrases = uniq;
        idx = 0;
        textSpan.textContent = phrases[idx] || '';
      }
      if (Number(newIntervalMs) > 0) {
        intervalMs = Number(newIntervalMs);
      }
      clearInterval(intervalId);
      intervalId = setInterval(() => {
        idx = (idx + 1) % phrases.length;
        textSpan.textContent = phrases[idx] || '';
      }, intervalMs);
    };
    return messageDiv;
  }

  showErrorWithRetry(message, originalQuestion) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message bot error';
    errorDiv.innerHTML = `
      <div class="message-header">
        <img src="assets/images/avatar-yellow.png" alt="Cindy" class="bot-avatar">
        <span class="bot-name">Cindy</span>
      </div>
      <div class="message-content">
        <p>${message}</p>
        <button class="retry-btn">Try Again</button>
      </div>
    `;
    const retryBtn = errorDiv.querySelector('.retry-btn');
    retryBtn.addEventListener('click', async () => {
      errorDiv.remove();
      this.app.isLoading = true;
      this.app.uiManager.toggleSendButton(true);
      this.app.elements.chatInput.disabled = true;
      this.app.messageManager.disableFollowUpSuggestions();
      await this.submitQuestion(originalQuestion, false);
    });
    this.app.elements.chatDiv.appendChild(errorDiv);
    this.app.uiManager.scrollToBottom();
  }

  renderCurrentChat() {
    const { chatDiv } = this.app.elements;
    const fragment = document.createDocumentFragment();
    this.app.currentConversation.forEach(msg => {
      const userMsg = this.createMessageElement("user", msg.question);
      let fullAnswer = msg.answer;
      if (!fullAnswer.includes('---\n\n**Sources**')) {
        fullAnswer = this.buildAnswerWithSources(
          msg.answer,
          msg.accessed_documents || [],
          msg.accessed_tools || [],
          msg.source_categories || {}
        );
      }
      const botMsg = this.createMessageElement("bot", fullAnswer);
      botMsg.dataset.accessedDocuments = JSON.stringify(msg.accessed_documents || []);
      botMsg.dataset.accessedTools = JSON.stringify(msg.accessed_tools || []);
      botMsg.dataset.sourceCategories = JSON.stringify(msg.source_categories || {});
      fragment.appendChild(userMsg);
      fragment.appendChild(botMsg);
    });
    chatDiv.innerHTML = "";
    chatDiv.appendChild(fragment);
    setTimeout(() => {
      const allMessages = chatDiv.querySelectorAll('.message');
      allMessages.forEach(message => {
        if (!message.querySelector('.typing')) {
          this.app.messageManager.ensureActionButtons(message);
        }
      });
      const botMessages = chatDiv.querySelectorAll('.message.bot');
      botMessages.forEach(msg => {
        const contentDiv = msg.querySelector('.message-content');
        if (contentDiv) {
          const rawContent = contentDiv.innerHTML;
          const cleanedContent = this.cleanAIResponse(rawContent);
          if (cleanedContent !== rawContent) {
            contentDiv.innerHTML = cleanedContent;
          }
          this.app.markdownParser.applySyntaxHighlighting(contentDiv);
          this.app.markdownParser.renderCharts(contentDiv);
          this.styleSourcesSection(contentDiv);
        }
      });
    }, 0);
    this.app.uiManager.scrollToBottom();
  }

  async speakResponse(text) {
    const speechText = this.prepareTextForSpeech(text);
    if (!speechText || speechText.length < 5) return;
    this.stopAudio();
    this._ttsStop = false;
    this.speakWithGemini(speechText);
  }

  splitTextIntoChunks(text) {
    if (text.length < 200) return [text];
    const sentenceRegex = /([.!?]+)(?=\s|$)/g;
    const rawSentences = text.replace(sentenceRegex, "$1|###|").split("|###|");
    const chunks = [];
    let currentChunk = "";
    const TARGET_CHUNK_LENGTH = 150; 
    for (let part of rawSentences) {
      part = part.trim();
      if (!part) continue;
      if (currentChunk.length + part.length < TARGET_CHUNK_LENGTH) {
        currentChunk += (currentChunk ? " " : "") + part;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = part;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  stopAudio() {
    this._ttsStop = true;
    
    if (this.liveTTS) {
      try { this.liveTTS.stop(); } catch (_) {}
    }
    if (this.audioElem) {
      try {
        this.audioElem.pause();
        this.audioElem.currentTime = 0;
        this.audioElem.src = "";
        this.audioElem.load();
        this.audioElem.onended = null;
        this.audioElem.onerror = null;
        this.audioElem.oncanplaythrough = null;
      } catch (e) {}
      this.audioElem = null;
    }
    this.cleanupAudioQueue();
    this.app.uiManager.hideMicStopSpeakingMode();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this._ttsSentenceQueue = [];
    
    // Stop Full Duplex as well
    if (this._fdWs) {
        this._fdWs.close();
        this._fdWs = null;
    }
    this._fdQueue = [];
    this._fdProcessing = false;
  }

  async speakWithGemini(text) {
    // Stop any existing queue if this is a fresh start request, 
    // unless called internally by the queue
    if (!text) return;
    
    // NOTE: In the streaming flow, we just want to enqueue.
    await this.enqueueTTSChunk(text);
  }

  // Restored Native Browser TTS Logic for Fallback
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

  getPreferredAudioMime() {
    const test = document.createElement("audio");
    const candidates = [
      "audio/webm; codecs=opus",
      "audio/ogg; codecs=opus",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav"
    ];
    for (const type of candidates) {
      const can = test.canPlayType(type);
      if (can === "probably" || can === "maybe") return type;
    }
    return "audio/wav";
  }

  getCompatibleAudioMime() {
    const audio = document.createElement('audio');
    const mimeTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/ogg; codecs=opus',
      'audio/webm; codecs=opus',
      'audio/mp4',
    ];
    for (const mimeType of mimeTypes) {
      if (audio.canPlayType(mimeType) === 'probably' || 
          audio.canPlayType(mimeType) === 'maybe') {
        return mimeType;
      }
    }
    return 'audio/wav';
  }

  updateCorrespondingChatTitle(index, newTitle) {
    const sidebarItem = document.querySelector(`#chat-history li[data-chat-index="${index}"] .chat-title`);
    if (sidebarItem) sidebarItem.textContent = newTitle;
    const dropdownItem = document.querySelector(`#history-dropdown-list li[data-chat-index="${index}"] .chat-title`);
    if (dropdownItem) dropdownItem.textContent = newTitle;
  }

  async testTTSDiagnostic() {}
  async getNewResponseForEdit(question, conversationIndex) {}
  async createNewBotResponse(question, conversationIndex) {}
  async archiveMessageToSheets(question, answer) { return; }
}
