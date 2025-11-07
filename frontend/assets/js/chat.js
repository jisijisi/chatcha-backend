// Chat and Conversation Management
import { CONFIG } from './config.js';
import { escapeHtml } from './utils.js';
import { ResponseQuality } from './response-quality.js'; // ADD THIS LINE

export class ChatManager {
  constructor(chatApp) {
    this.app = chatApp;
  }

  async askQuestion() {
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

    // Add user message
    const userMessage = this.createMessageElement("user", question);
    this.app.elements.chatDiv.appendChild(userMessage);

    // Clear input
    this.app.elements.chatInput.value = "";
    this.app.updateCharacterCount();

    // Add typing indicator
    const thinkingDiv = this.createTypingIndicator();
    this.app.elements.chatDiv.appendChild(thinkingDiv);

    // Scroll immediately after adding messages
    requestAnimationFrame(() => {
      this.app.uiManager.scrollToBottom();
      // Force action buttons to be added for user message
      this.app.messageManager.ensureActionButtons(userMessage);
    });

    try {
      console.log('Sending request to API...');
      
      const answer = await this.app.apiManager.getAIResponse(
        question,
        this.app.hrKnowledgeBase,
        this.app.currentConversation,
        this.app.userName,
        thinkingDiv
      );

      console.log("=== CHAT.JS RECEIVED ===");
      console.log("Answer:", answer);
      console.log("Answer length:", answer?.length);
      console.log("=== END ===");
      
      console.log('Received response:', answer ? 'Success' : 'Empty response');
      
      // Optional: Log response quality for debugging
      const quality = ResponseQuality.checkResponseQuality(answer, question);
      console.log('Response Quality Score:', quality.score, 'Issues:', quality.issues);
      
      // Create bot response message
      const responseMessage = this.createMessageElement("bot", answer);
      
      // Replace thinking indicator with response
      if (thinkingDiv.parentNode) {
        thinkingDiv.replaceWith(responseMessage);
      } else {
        this.app.elements.chatDiv.appendChild(responseMessage);
      }
      
      const contentDiv = responseMessage.querySelector('.message-content');
      if (contentDiv) {
        this.app.markdownParser.applySyntaxHighlighting(contentDiv);
      }

      // Force action buttons for bot message
      requestAnimationFrame(() => {
        this.app.messageManager.ensureActionButtons(responseMessage);
        this.app.messageManager.addFollowUpSuggestions(responseMessage, question, answer);
      });
      
      this.app.currentConversation.push({ question, answer });
      this.saveConversation();
      
      // Archive the Q&A pair to Google Sheets - REMOVED
      // await this.archiveMessageToSheets(question, answer);
      
      // REMOVED: this.app.showToast('Response received', 'success');
    } catch (error) {
      console.error("AI Response Error:", error);
      
      if (error.name === 'AbortError') {
        console.log('Request cancelled by user');
        if (thinkingDiv.parentNode) {
          thinkingDiv.remove();
        }
      } else {
        // Remove thinking indicator
        if (thinkingDiv.parentNode) {
          thinkingDiv.remove();
        }
        
        // Show error message
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
      
      // Only focus on desktop, not on mobile to prevent keyboard popup
      if (window.innerWidth > 768) {
        this.app.elements.chatInput.focus();
      }
      
      this.app.apiManager.abortController = null;
      this.app.uiManager.updateScrollButton();
    }
  }

  // New method specifically for handling edit responses
  async getNewResponseForEdit(question, conversationIndex) {
    // Find the bot message that corresponds to this conversation index
    const allMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message'));
    const botMessageIndex = (conversationIndex * 2) + 1; // Bot messages are at odd indices
    
    if (botMessageIndex >= allMessages.length) {
      // No bot message exists yet, create one
      await this.createNewBotResponse(question, conversationIndex);
      return;
    }

    const botMessage = allMessages[botMessageIndex];
    
    if (!botMessage) {
      await this.createNewBotResponse(question, conversationIndex);
      return;
    }

    const thinkingDiv = this.createTypingIndicator();
    botMessage.replaceWith(thinkingDiv);

    this.app.isLoading = true;
    this.app.elements.sendBtn.disabled = true;
    this.app.elements.chatInput.disabled = true;
    this.app.uiManager.toggleSendButton(true);
    this.app.uiManager.scrollToBottom();
    this.app.messageManager.disableFollowUpSuggestions();

    try {
      const answer = await this.app.apiManager.getAIResponse(
        question,
        this.app.hrKnowledgeBase,
        this.app.currentConversation.slice(0, conversationIndex),
        this.app.userName,
        thinkingDiv
      );
      
      const responseMessage = this.createMessageElement("bot", answer);
      thinkingDiv.replaceWith(responseMessage);
      
      const responseContentDiv = responseMessage.querySelector('.message-content');
      if (responseContentDiv) {
        this.app.markdownParser.applySyntaxHighlighting(responseContentDiv);
      }
      
      // Force action buttons for bot message
      requestAnimationFrame(() => {
        this.app.messageManager.ensureActionButtons(responseMessage);
        this.app.messageManager.addFollowUpSuggestions(responseMessage, question, answer);
      });
      
      // Update both the question and the answer in the history
      this.app.currentConversation[conversationIndex].question = question;
      this.app.currentConversation[conversationIndex].answer = answer;
      this.saveConversation();
      
      // Archive the EDITED Q&A pair to Google Sheets - REMOVED
      // await this.archiveMessageToSheets(question, answer);
    } catch (error) {
      console.error('Get new response error:', error);
      if (error.name !== 'AbortError') {
        this.app.showToast('Failed to get new response', 'error');
        
        const errorMessage = "Sorry, I failed to get a new response. Please try editing your message again.";
        // Save this error as the "answer"
        this.app.currentConversation[conversationIndex].answer = errorMessage;
        this.saveConversation(); // Save the error state

        const errorResponseElement = this.createMessageElement("bot", errorMessage);
        if (thinkingDiv.parentNode) {
            thinkingDiv.replaceWith(errorResponseElement);
        }
        
        // Add action buttons
        requestAnimationFrame(() => {
            this.app.messageManager.ensureActionButtons(errorResponseElement);
        });
        
      } else {
         // If it was an AbortError, just remove the thinking div
        if (thinkingDiv.parentNode) {
          thinkingDiv.remove();
        }
      }
    } finally {
      this.app.isLoading = false;
      this.app.elements.sendBtn.disabled = false;
      this.app.elements.chatInput.disabled = false;
      this.app.uiManager.toggleSendButton(false);
      this.app.messageManager.enableFollowUpSuggestions();
      this.app.uiManager.scrollToBottom();
    }
  }

  async createNewBotResponse(question, conversationIndex) {
    const thinkingDiv = this.createTypingIndicator();
    this.app.elements.chatDiv.appendChild(thinkingDiv);

    this.app.isLoading = true;
    this.app.elements.sendBtn.disabled = true;
    this.app.elements.chatInput.disabled = true;
    this.app.uiManager.toggleSendButton(true);
    this.app.uiManager.scrollToBottom();
    this.app.messageManager.disableFollowUpSuggestions();

    try {
      const answer = await this.app.apiManager.getAIResponse(
        question,
        this.app.hrKnowledgeBase,
        this.app.currentConversation.slice(0, conversationIndex),
        this.app.userName,
        thinkingDiv
      );
      
      const responseMessage = this.createMessageElement("bot", answer);
      thinkingDiv.replaceWith(responseMessage);
      
      const responseContentDiv = responseMessage.querySelector('.message-content');
      if (responseContentDiv) {
        this.app.markdownParser.applySyntaxHighlighting(responseContentDiv);
      }
      
      // Force action buttons for bot message
      requestAnimationFrame(() => {
        this.app.messageManager.ensureActionButtons(responseMessage);
        this.app.messageManager.addFollowUpSuggestions(responseMessage, question, answer);
      });
      
      // Update both the question and the answer in the history
      this.app.currentConversation[conversationIndex].question = question;
      this.app.currentConversation[conversationIndex].answer = answer;
      this.saveConversation();
      
      // Archive the EDITED Q&A pair to Google Sheets - REMOVED
      // await this.archiveMessageToSheets(question, answer);
    } catch (error) {
      console.error('Create new bot response error:', error);
      if (error.name !== 'AbortError') {
        this.app.showToast('Failed to get response', 'error');
        
        const errorMessage = "Sorry, I failed to get a response. Please try editing your message again.";
        // Save this error as the "answer" so the state is consistent
        this.app.currentConversation[conversationIndex].answer = errorMessage;
        this.saveConversation(); // Save the error state
        
        const errorResponseElement = this.createMessageElement("bot", errorMessage);
        if (thinkingDiv.parentNode) {
          thinkingDiv.replaceWith(errorResponseElement);
        } else {
          this.app.elements.chatDiv.appendChild(errorResponseElement);
        }
        
        // Add action buttons to the new error message (e.g., copy)
        requestAnimationFrame(() => {
          this.app.messageManager.ensureActionButtons(errorResponseElement);
        });
        
      } else {
        // If it was an AbortError, just remove the thinking div
        if (thinkingDiv.parentNode) {
          thinkingDiv.remove();
        }
      }
    } finally {
      this.app.isLoading = false;
      this.app.elements.sendBtn.disabled = false;
      this.app.elements.chatInput.disabled = false;
      this.app.uiManager.toggleSendButton(false);
      this.app.messageManager.enableFollowUpSuggestions();
      this.app.uiManager.scrollToBottom();
    }
  }

  async archiveMessageToSheets(question, answer) {
    // This function is now a no-op but is kept to avoid errors
    // if it were hypothetically called from somewhere else.
    // The actual calls in this file have been removed.
    return;
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
          timestamp: currentTimestamp
        };
      } else {
        this.app.chats[this.app.activeChatIndex] = {
          title: this.app.chats[this.app.activeChatIndex].title || autoGeneratedTitle,
          conversation: [...this.app.currentConversation],
          timestamp: this.app.chats[this.app.activeChatIndex].timestamp
        };
      }
    } else {
      this.app.chats.unshift({
        title: autoGeneratedTitle,
        conversation: [...this.app.currentConversation],
        timestamp: currentTimestamp
      });
      this.app.activeChatIndex = 0;
    }

    this.app.saveToStorage();
    this.app.uiManager.renderHistory();
    this.app.uiManager.updateMobileHeader();
  }

  loadChat(index) {
    const chat = this.app.chats[index];
    if (!chat) return;

    if (this.app.activeChatIndex === index && this.app.hasConversation) {
      this.app.uiManager.closeMobileSidebar();
      return;
    }

    this.app.activeChatIndex = index;
    this.app.hasConversation = true;
    this.app.currentConversation = chat.conversation.slice();
    
    this.app.uiManager.updateUI();
    this.app.uiManager.highlightActiveChat();
    this.app.uiManager.updateMobileHeader();
    
    const { chatDiv } = this.app.elements;
    const fragment = document.createDocumentFragment();
    
    this.app.currentConversation.forEach(msg => {
      fragment.appendChild(this.createMessageElement("user", msg.question));
      fragment.appendChild(this.createMessageElement("bot", msg.answer));
    });
    
    chatDiv.innerHTML = "";
    chatDiv.appendChild(fragment);
    
    // Force action buttons to all messages immediately after they're in DOM
    setTimeout(() => {
      const allMessages = chatDiv.querySelectorAll('.message');
      allMessages.forEach(msg => {
        if (!msg.querySelector('.typing')) {
          this.app.messageManager.ensureActionButtons(msg);
        }
      });
      
      // Apply syntax highlighting
      const botMessages = chatDiv.querySelectorAll('.message.bot');
      botMessages.forEach(message => {
        const contentDiv = message.querySelector('.message-content');
        if (contentDiv) {
          this.app.markdownParser.applySyntaxHighlighting(contentDiv);
        }
      });
    }, 0);
    
    this.app.uiManager.scrollToBottom();
    this.app.uiManager.closeMobileSidebar();
    this.app.uiManager.closeAllDropdowns();
    this.app.showToast(`Loaded chat: ${chat.title}`, 'success');
  }

  createMessageElement(type, content, isThinking = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;
    
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
      avatar.alt = isThinking ? "CHA is thinking" : "CHA"; // UPDATED
      avatar.className = isThinking ? "bot-avatar thinking" : "bot-avatar";
      
      const nameSpan = document.createElement("span");
      nameSpan.textContent = isThinking ? "CHA is thinking..." : "CHA"; // UPDATED
      nameSpan.className = "bot-name";
      
      headerDiv.appendChild(avatar);
      headerDiv.appendChild(nameSpan);
    }
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    
    if (type === 'bot' && !isThinking) {
      contentDiv.innerHTML = this.app.markdownParser.parseMarkdown(content);
      setTimeout(() => this.app.markdownParser.applySyntaxHighlighting(contentDiv), 0);
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

  createTypingIndicator() {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot";
    
    const headerDiv = document.createElement("div");
    headerDiv.className = "message-header";
    
    const avatar = document.createElement("img");
    avatar.src = "assets/images/avatar-thinking.png";
    avatar.alt = "CHA is thinking"; // UPDATED
    avatar.className = "bot-avatar thinking";
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = "CHA is thinking..."; // UPDATED
    nameSpan.className = "bot-name";
    
    headerDiv.appendChild(avatar);
    headerDiv.appendChild(nameSpan);
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.innerHTML = `<div class="typing" aria-label="CHA is typing"><span></span><span></span><span></span></div>`; // UPDATED
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    
    return messageDiv;
  }

  showErrorWithRetry(message, originalQuestion) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message bot error';
    errorDiv.innerHTML = `
      <div class="message-header">
        <img src="assets/images/avatar.png" alt="CHA" class="bot-avatar">
        <span class="bot-name">CHA</span>
      </div>
      <div class="message-content">
        <p>${message}</p>
        <button class="retry-btn">Try Again</button>
      </div>
`; // UPDATED
    
    const retryBtn = errorDiv.querySelector('.retry-btn');
    retryBtn.addEventListener('click', () => {
      errorDiv.remove();
      this.app.elements.chatInput.value = originalQuestion;
      this.askQuestion();
    });
    
    this.app.elements.chatDiv.appendChild(errorDiv);
    this.app.uiManager.scrollToBottom();
  }

  renderCurrentChat() {
    const { chatDiv } = this.app.elements;
    const fragment = document.createDocumentFragment();
    
    this.app.currentConversation.forEach(msg => {
      const userMsg = this.createMessageElement("user", msg.question);
      const botMsg = this.createMessageElement("bot", msg.answer);
      fragment.appendChild(userMsg);
      fragment.appendChild(botMsg);
    });
    
    chatDiv.innerHTML = "";
    chatDiv.appendChild(fragment);
    
    // Force action buttons after messages are in the DOM
    setTimeout(() => {
      const allMessages = chatDiv.querySelectorAll('.message');
      allMessages.forEach(message => {
        if (!message.querySelector('.typing')) {
          this.app.messageManager.ensureActionButtons(message);
        }
      });
      
      // Apply syntax highlighting
      this.app.currentConversation.forEach((msg, index) => {
        const botMessages = chatDiv.querySelectorAll('.message.bot');
        if (botMessages[index]) {
          const contentDiv = botMessages[index].querySelector('.message-content');
          if (contentDiv) {
            this.app.markdownParser.applySyntaxHighlighting(contentDiv);
          }
        }
      });
    }, 0);
    
    this.app.uiManager.scrollToBottom();
  }
}