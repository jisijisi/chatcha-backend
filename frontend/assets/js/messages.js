// Message Actions: Copy, Edit, Regenerate, Follow-ups
import { escapeHtml } from './utils.js';

export class MessageManager {
  constructor(chatApp) {
    this.app = chatApp;
    // this.lastHoveredMessage = null; // No longer needed
  }

  initMessageActionButtons() {
    // Ensure action buttons for existing messages immediately
    this.ensureAllMessageActionButtons();
    
    /*
    // REMOVED: These listeners are redundant.
    // The MutationObserver and explicit calls in chat.js
    // already handle button creation reliably.
    // This removes the "flicker" bug when moving
    // the mouse between messages.

    this.app.elements.chatDiv.addEventListener('mouseover', (e) => {
      const message = e.target.closest('.message');
      if (message && message !== this.lastHoveredMessage && !message.querySelector('.typing')) {
        this.lastHoveredMessage = message;
        this.ensureActionButtons(message);
      }
    });
    
    this.app.elements.chatDiv.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest('.message')) {
        this.lastHoveredMessage = null;
      }
    });
    */

    // Observer for new messages - with immediate execution
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList && node.classList.contains('message')) {
            // Immediate synchronous action button setup for non-typing messages
            if (!node.querySelector('.typing')) {
              // Use immediate approach
              setTimeout(() => {
                this.ensureActionButtons(node);
              }, 0);
            }
          }
        });
      });
    });

    observer.observe(this.app.elements.chatDiv, {
      childList: true,
      subtree: false
    });
  }

  ensureAllMessageActionButtons() {
    const messages = this.app.elements.chatDiv.querySelectorAll('.message:not(.bot .typing)');
    messages.forEach(message => {
      this.ensureActionButtons(message);
    });
  }

  ensureActionButtons(message) {
    if (!message) return;
    if (message.querySelector('.typing')) return;
    
    // Check if buttons already exist and are properly set up
    const actionsContainer = message.querySelector('.message-actions');
    if (actionsContainer && actionsContainer.children.length > 0) {
      return; // Buttons already added
    }
    
    const isUser = message.classList.contains('user');
    const isBot = message.classList.contains('bot');
    
    if (!isUser && !isBot) return;
    
    // Create or get actions container
    let container = actionsContainer;
    if (!container) {
      container = document.createElement('div');
      container.className = 'message-actions';
      message.appendChild(container);
    }
    
    container.innerHTML = '';
    
    if (isUser) {
      container.appendChild(this.createCopyButton(message));
      container.appendChild(this.createEditButton(message));
    } else if (isBot) {
      container.appendChild(this.createCopyButton(message));
      container.appendChild(this.createRegenerateButton(message));
    }
  }

  createCopyButton(message) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn copy-action';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span class="action-tooltip">Copy</span>
    `;
    copyBtn.setAttribute('aria-label', 'Copy message');
    
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const content = message.querySelector('.message-content');
      let textToCopy = content.textContent;
      
      const followupSuggestions = content.querySelector('.followup-suggestions');
      if (followupSuggestions) {
        const tempDiv = content.cloneNode(true);
        const tempFollowup = tempDiv.querySelector('.followup-suggestions');
        if (tempFollowup) tempFollowup.remove();
        textToCopy = tempDiv.textContent;
      }
      
      try {
        await navigator.clipboard.writeText(textToCopy.trim());
        
        const originalSVG = copyBtn.querySelector('svg').outerHTML;
        copyBtn.querySelector('svg').outerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        const tooltip = copyBtn.querySelector('.action-tooltip');
        tooltip.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        
        setTimeout(() => {
          copyBtn.querySelector('svg').outerHTML = originalSVG;
          tooltip.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        this.app.showToast('Failed to copy message', 'error');
      }
    });
    
    return copyBtn;
  }

  createRegenerateButton(message) {
    const allMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message'));
    const messageIndex = allMessages.indexOf(message);
    const conversationIndex = Math.floor(messageIndex / 2);
    
    if (conversationIndex < 0 || conversationIndex >= this.app.currentConversation.length) {
      return document.createElement('div');
    }
    
    const regenerateBtn = document.createElement('button');
    regenerateBtn.className = 'message-action-btn regenerate-action';
    regenerateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      <span class="action-tooltip">Regenerate response</span>
    `;
    regenerateBtn.setAttribute('aria-label', 'Regenerate response');
    
    regenerateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.regenerateResponse(conversationIndex, message, regenerateBtn);
    });
    
    return regenerateBtn;
  }

  async regenerateResponse(conversationIndex, messageElement, regenerateBtn) {
    if (this.app.isLoading) {
      this.app.showToast('Please wait for the current response to complete', 'warning');
      return;
    }
    
    const conversation = this.app.currentConversation[conversationIndex];
    if (!conversation) return;
    
    if (regenerateBtn) {
      regenerateBtn.classList.add('regenerating');
      const tooltip = regenerateBtn.querySelector('.action-tooltip');
      if (tooltip) tooltip.textContent = 'Regenerating...';
    }
    
    this.app.isLoading = true;
    this.app.elements.sendBtn.disabled = true;
    this.app.elements.chatInput.disabled = true;
    this.app.uiManager.toggleSendButton(true);
    this.disableFollowUpSuggestions();
    messageElement.classList.add('regenerating');
    
    let success = false;
    
    try {
      const question = conversation.question;
      const answer = await this.app.apiManager.getAIResponse(
        question,
        this.app.resumeData,
        this.app.currentConversation.slice(0, conversationIndex),
        this.app.userName,
        messageElement
      );
      
      const contentDiv = messageElement.querySelector('.message-content');
      if (contentDiv) {
        contentDiv.innerHTML = this.app.markdownParser.parseMarkdown(answer);
        this.app.markdownParser.applySyntaxHighlighting(contentDiv);
      }
      
      this.app.currentConversation[conversationIndex].answer = answer;
      this.app.chatManager.saveConversation();
      
      this.addFollowUpSuggestions(messageElement, question, answer);
      
      success = true;
      this.app.showToast('Response regenerated successfully', 'success');
    } catch (error) {
      console.error('Regenerate error:', error);
      if (error.name !== 'AbortError') {
        this.app.showToast('Failed to regenerate response', 'error');
      }
    } finally {
      this.app.isLoading = false;
      this.app.elements.sendBtn.disabled = false;
      this.app.elements.chatInput.disabled = false;
      this.app.uiManager.toggleSendButton(false);
      this.enableFollowUpSuggestions();
      
      if (regenerateBtn) {
        regenerateBtn.classList.remove('regenerating');
        // Restore original tooltip text
        const tooltip = regenerateBtn.querySelector('.action-tooltip');
        if (tooltip) tooltip.textContent = 'Regenerate response';
      }
      
      messageElement.classList.remove('regenerating');
    }
  }

  createEditButton(message) {
    const allMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message'));
    const messageIndex = allMessages.indexOf(message);
    const conversationIndex = Math.floor(messageIndex / 2);
    
    // Always create edit button for user messages, even if we can't find the conversation index
    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn edit-action';
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span class="action-tooltip">Edit message</span>
    `;
    editBtn.setAttribute('aria-label', 'Edit message');
    
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.enableMessageEdit(conversationIndex, message);
    });
    
    return editBtn;
  }

  async enableMessageEdit(conversationIndex, messageElement) {
    if (this.app.isLoading) {
      this.app.showToast('Please wait for the current response to complete', 'warning');
      return;
    }
    
    // Find the conversation data
    let conversation = null;
    if (conversationIndex >= 0 && conversationIndex < this.app.currentConversation.length) {
      conversation = this.app.currentConversation[conversationIndex];
    }
    
    if (!conversation) {
      this.app.showToast('Cannot edit this message', 'error');
      return;
    }
    
    const contentDiv = messageElement.querySelector('.message-content');
    if (!contentDiv) return;
    
    const originalText = conversation.question;
    
    const actionsContainer = messageElement.querySelector('.message-actions');
    if (actionsContainer) actionsContainer.style.display = 'none';
    
    messageElement.classList.add('editing');
    
    contentDiv.innerHTML = `
      <div class="edit-input-wrapper">
        <textarea class="edit-input" placeholder="Edit your message...">${escapeHtml(originalText)}</textarea>
        <div class="edit-actions">
          <button class="edit-cancel" type="button">Cancel</button>
          <button class="edit-save" type="button">Save & Resend</button>
        </div>
      </div>
    `;
    
    const textarea = contentDiv.querySelector('.edit-input');
    const cancelBtn = contentDiv.querySelector('.edit-cancel');
    const saveBtn = contentDiv.querySelector('.edit-save');
    
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
    
    const cancelEdit = () => {
      messageElement.classList.remove('editing');
      contentDiv.innerHTML = escapeHtml(originalText).replace(/\n/g, '<br>');
      if (actionsContainer) actionsContainer.style.display = '';
    };
    
    const saveEdit = async () => {
      const newQuestion = textarea.value.trim();
      
      if (!newQuestion) {
        this.app.showToast('Message cannot be empty', 'error');
        return;
      }
      
      if (newQuestion === originalText) {
        cancelEdit();
        return;
      }
      
      const allMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message'));
      const messageIndex = allMessages.indexOf(messageElement);
      
      // Remove all messages after this one (including the bot response)
      const botMessageIndex = messageIndex + 1;
      if (botMessageIndex < allMessages.length) {
        allMessages[botMessageIndex].remove();
      }
      
      // Update the message content
      messageElement.classList.remove('editing');
      contentDiv.innerHTML = escapeHtml(newQuestion).replace(/\n/g, '<br>');
      if (actionsContainer) {
        actionsContainer.style.display = '';
      }
      
      // Update the conversation with the new question and remove the old answer
      this.app.currentConversation[conversationIndex].question = newQuestion;
      this.app.currentConversation[conversationIndex].answer = ''; // Clear the old answer
      
      // Now get a new response for this edited question
      await this.app.chatManager.getNewResponseForEdit(newQuestion, conversationIndex);
      this.app.showToast('Message edited and response updated', 'success');
    };
    
    cancelBtn.addEventListener('click', cancelEdit);
    saveBtn.addEventListener('click', saveEdit);
    
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      }
    });
  }

  generateFollowUpSuggestions(question, answer) {
    const suggestions = [];
    const lowerAnswer = answer.toLowerCase();
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.startsWith('what')) {
      if (lowerAnswer.includes('experience') || lowerAnswer.includes('worked')) {
        suggestions.push("Can you share a specific example?");
        suggestions.push("What challenges did you overcome?");
      } else if (lowerAnswer.includes('skill') || lowerAnswer.includes('technology')) {
        suggestions.push("How proficient are you with this?");
        suggestions.push("Where have you applied this skill?");
      } else {
        suggestions.push("Can you elaborate on that?");
        suggestions.push("How does this apply to real projects?");
      }
    } else if (lowerQuestion.startsWith('how')) {
      suggestions.push("What were the results of this approach?");
      suggestions.push("Have you used this in recent projects?");
      suggestions.push("What alternatives did you consider?");
    } else if (lowerQuestion.startsWith('why')) {
      suggestions.push("How did this decision impact the outcome?");
      suggestions.push("Would you make the same choice again?");
      suggestions.push("What did you learn from this?");
    } else if (lowerQuestion.includes('tell me') || lowerQuestion.includes('describe')) {
      if (lowerAnswer.includes('project')) {
        suggestions.push("What was your specific role?");
        suggestions.push("What technologies were used?");
        suggestions.push("What were the key achievements?");
      } else if (lowerAnswer.includes('team') || lowerAnswer.includes('collaborate')) {
        suggestions.push("How large was the team?");
        suggestions.push("How did you handle conflicts?");
        suggestions.push("What was your leadership style?");
      } else {
        suggestions.push("What was the most challenging aspect?");
        suggestions.push("How did you measure success?");
        suggestions.push("What would you do differently?");
      }
    } else {
      if (lowerAnswer.includes('project') || lowerAnswer.includes('developed')) {
        suggestions.push("What technologies were involved?");
        suggestions.push("What challenges did you face?");
        suggestions.push("What were the outcomes?");
      } else if (lowerAnswer.includes('team') || lowerAnswer.includes('collaborative')) {
        suggestions.push("How did you contribute to the team?");
        suggestions.push("What was your role?");
        suggestions.push("How did you handle disagreements?");
      } else {
        suggestions.push("Can you give me an example?");
        suggestions.push("How does this relate to your experience?");
        suggestions.push("What makes you particularly strong in this area?");
      }
    }
    
    return [...new Set(suggestions)].slice(0, 3);
  }

  addFollowUpSuggestions(messageElement, question, answer) {
    const existingSuggestions = this.app.elements.chatDiv.querySelectorAll('.followup-suggestions');
    existingSuggestions.forEach(suggestion => suggestion.remove());
    
    if (messageElement.querySelector('.followup-suggestions')) {
      return;
    }
    
    const suggestions = this.generateFollowUpSuggestions(question, answer);
    
    if (suggestions.length === 0) return;
    
    const contentDiv = messageElement.querySelector('.message-content');
    if (!contentDiv) return;
    
    const followupDiv = document.createElement('div');
    followupDiv.className = 'followup-suggestions';
    followupDiv.innerHTML = `
      <div class="followup-suggestions-title">💭 Follow-up questions:</div>
      <div class="followup-chips"></div>
    `;
    
    const chipsContainer = followupDiv.querySelector('.followup-chips');
    
    suggestions.forEach(suggestion => {
      const chip = document.createElement('button');
      chip.className = 'followup-chip';
      chip.textContent = suggestion;
      chip.type = 'button';
      
      chip.addEventListener('click', () => {
        if (this.app.isLoading) {
          this.app.showToast('Please wait for the current response to complete', 'warning');
          return;
        }
        
        this.app.elements.chatInput.value = suggestion;
        this.app.updateCharacterCount();
        this.app.askQuestion();
      });
      
      chipsContainer.appendChild(chip);
    });
    
    contentDiv.appendChild(followupDiv);
    this.app.currentFollowUpElement = followupDiv;
  }

  disableFollowUpSuggestions() {
    const followupSuggestions = this.app.elements.chatDiv.querySelector('.followup-suggestions');
    if (followupSuggestions) {
      followupSuggestions.classList.add('disabled');
      const chips = followupSuggestions.querySelectorAll('.followup-chip');
      chips.forEach(chip => {
        chip.classList.add('disabled');
        chip.disabled = true;
      });
    }
  }

  enableFollowUpSuggestions() {
    const followupSuggestions = this.app.elements.chatDiv.querySelector('.followup-suggestions');
    if (followupSuggestions) {
      followupSuggestions.classList.remove('disabled');
      const chips = followupSuggestions.querySelectorAll('.followup-chip');
      chips.forEach(chip => {
        chip.classList.remove('disabled');
        chip.disabled = false;
      });
    }
  }
}