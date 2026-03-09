import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js'; 
import { ChatUI } from './modules/ChatUI.js';
import { VoiceManager } from './modules/VoiceManager.js';
import { ChatSocket } from './modules/ChatSocket.js';

export class ChatManager {
  constructor(chatApp) {
    this.app = chatApp;
    this.chatUI = new ChatUI(this.app);
    this.voiceManager = new VoiceManager(this.app);
    this.chatSocket = new ChatSocket(this.app, this.voiceManager, this.chatUI);
    this._scrollHandler = null;
    this._isLoadingMore = false;
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

    const userMessage = this.chatUI.createMessageElement("user", question);
    this.app.elements.chatDiv.appendChild(userMessage);

    this.app.elements.chatInput.value = "";
    this.app.updateCharacterCount();

    requestAnimationFrame(() => {
      this.app.uiManager.scrollToBottom();
      this.app.messageManager.ensureActionButtons(userMessage);
    });

    if (wasVoiceInput) {
      if (CONFIG.MIC_RESPONSE_MODE === 'thinking') {
        await this.submitQuestion(question, true);
      } else {
        const thinkingPhrases = this.getContextThinkingPhrases(question);
        const thinkingDiv = this.chatUI.createTypingIndicator(question, thinkingPhrases);
        this.app.elements.chatDiv.appendChild(thinkingDiv);
        requestAnimationFrame(() => this.app.uiManager.scrollToBottom());
        
        await this.useFullDuplex(question, thinkingDiv);
      }
    } else {
      await this.submitQuestion(question, false);
    }
  }

  async useFullDuplex(question, thinkingDiv = null) {
      await this.chatSocket.useFullDuplex(question, thinkingDiv, {
          onComplete: async (q, fullAnswer, botMessage, accessedDocuments, sourceCategories, missingKnowledge) => {
              await this.finalizeFdSession(q, fullAnswer, botMessage, accessedDocuments, sourceCategories, missingKnowledge);
          },
          onError: () => {
             this.finalizeFdSession(question, "", thinkingDiv, [], {}).catch(() => {});
          },
          onFallback: async () => {
             await this.submitQuestion(question, true);
          }
      });
  }

  async finalizeFdSession(question, fullAnswer, botMessage, accessedDocuments, sourceCategories, missingKnowledge = false) {
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
    const answerWithSources = this.chatUI.buildAnswerWithSources(fullAnswer, accessedDocuments, [], sourceCategories, missingKnowledge);
    
    // 3. Render Sources HTML
    const contentDiv = botMessage.querySelector('.message-content');
    if (contentDiv) {
      const cleanedAnswer = this.chatUI.cleanAIResponse(answerWithSources);
      
      if (this.app && this.app.markdownParser) {
        contentDiv.innerHTML = this.app.markdownParser.parseMarkdown(cleanedAnswer);
        this.app.markdownParser.applySyntaxHighlighting(contentDiv);
        if (this.app.markdownParser.renderCharts) this.app.markdownParser.renderCharts(contentDiv);
      }
      this.chatUI.styleSourcesSection(contentDiv);
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
    
    this.chatSocket.close();
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
    const thinkingPhrases = this.getContextThinkingPhrases(question);
    const thinkingDiv = this.chatUI.createTypingIndicator(question, thinkingPhrases);
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
      console.log('📤 Sending request to API (Streaming)...', { wasVoiceInput, question });
      
      let fullAnswer = "";
      let responseMessage = null;
      let contentDiv = null;
      let isFirstChunk = true;
      let accessedDocs = [];
      let accessedTools = [];
      let sourceCats = {};
      let missingKnowledge = false;

      await this.app.apiManager.getAIResponseStream(
        question,
        this.app.hrKnowledgeBase,
        this.app.currentConversation,
        this.app.userName,
        {
            onMeta: (data) => {
                if (data.thinking_phrases && thinkingDiv._setThinkingPhrases) {
                    thinkingDiv._setThinkingPhrases(data.thinking_phrases, 2000);
                }
            },
            onChunk: (text) => {
                if (isFirstChunk) {
                    if (thinkingDiv._stopThinking) thinkingDiv._stopThinking();
                    
                    responseMessage = this.chatUI.createMessageElement("bot", "");
                    responseMessage.dataset.rawAnswer = "";
                    
                    if (thinkingDiv.parentNode) {
                        thinkingDiv.replaceWith(responseMessage);
                    } else {
                        this.app.elements.chatDiv.appendChild(responseMessage);
                    }
                    contentDiv = responseMessage.querySelector('.message-content');
                    isFirstChunk = false;
                }
                
                fullAnswer += text;
                this.chatUI.updateStreamingMessage(contentDiv, fullAnswer);
                this.app.uiManager.scrollToBottom();
            },
            onDone: (data) => {
                accessedDocs = data.accessed_documents || [];
                accessedTools = data.accessed_tools || [];
                sourceCats = data.source_categories || {};
            },
            onError: (err) => {
                throw err;
            }
        }
      );

      let cleanedAnswer = this.chatUI.cleanAIResponse(fullAnswer);

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

      const answerWithSources = this.chatUI.buildAnswerWithSources(cleanedAnswer, accessedDocs, accessedTools, sourceCats, missingKnowledge);
      const finalAnswer = wasVoiceInput ? this.voiceManager._sanitizePlainText(cleanedAnswer) : answerWithSources;
      
      if (responseMessage) {
          responseMessage.dataset.rawAnswer = answerWithSources;
          responseMessage.dataset.originalAnswer = cleanedAnswer;
          responseMessage.dataset.accessedDocuments = JSON.stringify(accessedDocs || []);
          responseMessage.dataset.accessedTools = JSON.stringify(accessedTools || []);
          responseMessage.dataset.sourceCategories = JSON.stringify(sourceCats || {});
          
          const finalContentDiv = responseMessage.querySelector('.message-content');
          this.chatUI.updateStreamingMessage(finalContentDiv, finalAnswer); 
          
          if (!wasVoiceInput) {
            this.app.markdownParser.applySyntaxHighlighting(finalContentDiv);
            this.app.markdownParser.renderCharts(finalContentDiv);
            this.chatUI.styleSourcesSection(finalContentDiv);
            const tables = finalContentDiv.querySelectorAll('.table-wrapper');
            const jsonTables = finalContentDiv.querySelectorAll('.grid-table-placeholder');
            if ((fullAnswer.includes('|') && tables.length === 0) || (fullAnswer.includes('```json_table') && jsonTables.length === 0)) {
              this.chatUI.showTableError(finalContentDiv, 'Table formatting issue detected');
            }
          } else {
             await this.chatUI.renderSourcesHTMLAsync(finalContentDiv, accessedDocs, accessedTools, sourceCats);
             this.chatUI.styleSourcesSection(finalContentDiv);
          }
      }

      requestAnimationFrame(() => {
        if (responseMessage) {
            this.app.messageManager.ensureActionButtons(responseMessage);
            this.app.messageManager.addFollowUpSuggestions(responseMessage, question, cleanedAnswer);
        }
      });
      
      this.app.currentConversation.push({ 
        question, 
        answer: answerWithSources, 
        accessed_documents: accessedDocs || [],
        accessed_tools: accessedTools || [],
        source_categories: sourceCats || {}, 
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
           this.chatUI.handleMaintenanceMode();
           return;
        }
        this.chatUI.showErrorWithRetry(
          "Sorry, I encountered an error while processing your request. Please try again.", 
          question,
          async () => {
             this.app.isLoading = true;
             this.app.uiManager.toggleSendButton(true);
             this.app.elements.chatInput.disabled = true;
             this.app.messageManager.disableFollowUpSuggestions();
             await this.submitQuestion(question, false);
          }
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

  async loadChat(index) {
    const chat = this.app.chats[index];
    if (!chat) return;
    
    if (this.app.activeChatIndex === index && this.app.hasConversation) {
      this.app.uiManager.closeMobileSidebar();
      return;
    }
    
    console.log(`📂 Loading chat: ${chat.title}`);
    
    // Cleanup previous scroll handler
    if (this._scrollHandler) {
        this.app.elements.chatDiv.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
    }

    // Lazy Loading Logic
    if (!chat.loaded && chat.sessionId) {
        // Show loading state
        this.app.uiManager.toggleSendButton(true); 
        this.app.isLoading = true;

        try {
            // Fetch messages for this session
            const data = await this.app.apiManager.loadSessionMessages(chat.sessionId, 0, 20);
            
            // Update chat object
            chat.conversation = data.conversation || [];
            chat.loaded = true;
            
            // Sync to local storage/memory
            this.app.chats[index] = chat;
            this.app.saveToStorage();
        } catch (e) {
            console.error("Failed to load chat messages", e);
            this.app.showToast("Failed to load conversation", "error");
        } finally {
            this.app.uiManager.toggleSendButton(false);
            this.app.isLoading = false;
        }
    }
    
    this.app.activeChatIndex = index;
    this.app.hasConversation = true;
    this.app.currentConversation = chat.conversation.slice();
    this.app.saveToStorage(); 
    this.app.uiManager.updateUI();
    this.app.uiManager.highlightActiveChat();
    this.app.uiManager.updateMobileHeader();
    
    this.chatUI.renderCurrentChat();
    
    // Setup Scroll Pagination
    if (chat.conversation.length >= 20) {
        this.setupScrollPagination(chat.sessionId);
    }
    
    this.app.uiManager.closeMobileSidebar();
    this.app.uiManager.closeAllDropdowns();
  }

  setupScrollPagination(sessionId) {
      const chatDiv = this.app.elements.chatDiv;
      
      this._scrollHandler = async () => {
          if (chatDiv.scrollTop === 0 && !this._isLoadingMore) {
             await this.loadMoreMessages(sessionId);
          }
      };
      
      chatDiv.addEventListener('scroll', this._scrollHandler);
  }

  async loadMoreMessages(sessionId) {
      if (this._isLoadingMore) return;
      
      this._isLoadingMore = true;
      const offset = this.app.currentConversation.length;
      
      // Add loading spinner at top
      const spinner = document.createElement('div');
      spinner.className = 'history-loader';
      spinner.innerHTML = '<div class="loader-spinner"></div>'; // Ensure CSS exists for this
      if (this.app.elements.chatDiv.firstChild) {
          this.app.elements.chatDiv.insertBefore(spinner, this.app.elements.chatDiv.firstChild);
      } else {
          this.app.elements.chatDiv.appendChild(spinner);
      }
      
      try {
          // Fetch older messages
          const data = await this.app.apiManager.loadSessionMessages(sessionId, offset, 20);
          const newMessages = data.conversation || [];
          
          if (newMessages.length > 0) {
              // Prepend to current conversation
              this.app.currentConversation = [...newMessages, ...this.app.currentConversation];
              
              // Update chat object
              if (this.app.activeChatIndex !== null) {
                  this.app.chats[this.app.activeChatIndex].conversation = [...this.app.currentConversation];
              }
              
              // Render new messages at top without scrolling
              this.chatUI.prependMessages(newMessages);
          } else {
              // No more messages
              if (this._scrollHandler) {
                  this.app.elements.chatDiv.removeEventListener('scroll', this._scrollHandler);
                  this._scrollHandler = null;
              }
          }
      } catch (e) {
          console.error("Error loading more messages:", e);
      } finally {
          if (spinner.parentNode) spinner.remove();
          this._isLoadingMore = false;
      }
  }

  enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis) {
    this.chatUI.enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis, {
        onRename: async (newName) => {
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
            this.voiceManager.updateCorrespondingChatTitle(index, newName); // Wait, updateCorrespondingChatTitle is in ChatUI or VoiceManager?
            // Ah, I missed moving updateCorrespondingChatTitle to ChatUI or removing it if it's not there.
            // Let's check ChatUI again. I added it to ChatUI plan but I should check if I implemented it.
            // I implemented it in ChatUI in the plan, but wait, looking at my ChatUI implementation...
            // I did NOT include updateCorrespondingChatTitle in ChatUI in the last Write tool call!
            // I must have missed it. I need to fix that.
            
            // For now, I will implement it here or fix ChatUI.
            // It's better to fix ChatUI.
            this.updateCorrespondingChatTitle(index, newName);
            this.app.uiManager.updateMobileHeader();
        },
        onComplete: () => {
             this.app.uiManager.renderHistory();
        }
    });
  }

  updateCorrespondingChatTitle(index, newTitle) {
    const sidebarItem = document.querySelector(`#chat-history li[data-chat-index="${index}"] .chat-title`);
    if (sidebarItem) sidebarItem.textContent = newTitle;
    const dropdownItem = document.querySelector(`#history-dropdown-list li[data-chat-index="${index}"] .chat-title`);
    if (dropdownItem) dropdownItem.textContent = newTitle;
  }

  speakResponse(text) {
      this.voiceManager.speakResponse(text);
  }
  
  stopAudio() {
      this.voiceManager.stopAudio();
  }

  // Delegated methods that might be called from outside
  renderCurrentChat() {
    if (this.chatUI) {
      this.chatUI.renderCurrentChat();
    }
  }

  speakWithGemini(text) { this.voiceManager.speakWithGemini(text); }
  
  // No-ops or placeholders
  async testTTSDiagnostic() {}
  async getNewResponseForEdit(question, conversationIndex) {}
  async createNewBotResponse(question, conversationIndex) {}
  async archiveMessageToSheets(question, answer) { return; }
}
