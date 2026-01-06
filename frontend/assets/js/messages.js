// messages.js - Fixed Edit/Cancel/Save Logic & Ghost Tooltip Issue
import { CONFIG } from './config.js';

export class MessageManager {
  constructor(chatApp) {
    this.app = chatApp;
    this.followUpSuggestionsEnabled = true;
  }

  ensureActionButtons(message) {
    const isBot = message.classList.contains('bot');
    const content = message.querySelector('.message-content').textContent;
    const actionsDiv = message.querySelector('.message-actions');
    
    if (!actionsDiv) return;
    
    // Clear existing to avoid duplicates
    actionsDiv.innerHTML = '';
    
    // --- Copy Button ---
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn copy-btn';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    this.app.modalManager.addTooltip(copyBtn, 'Copy text', 'bottom');
    
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(content);
        copyBtn.classList.add('copied');
        
        const originalIcon = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        
        // Refresh tooltip
        this.app.modalManager.addTooltip(copyBtn, 'Copied!', 'bottom');
        
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = originalIcon;
          this.app.modalManager.addTooltip(copyBtn, 'Copy text', 'bottom');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        this.app.showToast('Failed to copy text', 'error');
      }
    });
    
    actionsDiv.appendChild(copyBtn);
    
    // --- Bot Actions (Expand, Regenerate) ---
    if (isBot) {
      // Expand Button
      const expandBtn = document.createElement('button');
      expandBtn.className = 'message-action-btn expand-btn';
      expandBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      `;
      this.app.modalManager.addTooltip(expandBtn, 'Full Screen', 'bottom');

      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const modal = document.getElementById('data-view-modal');
        const modalBody = document.getElementById('data-view-body');
        const modalTitle = document.getElementById('data-view-title');
        
        if (!modal || !modalBody) return;
        
        const messageContent = message.querySelector('.message-content');
        if (!messageContent) return;
        
        const contentClone = messageContent.cloneNode(true);
        
        // Remove interactive elements from clone
        const existingBtn = contentClone.querySelector('.view-data-btn');
        if (existingBtn) existingBtn.remove();
        
        // Unhide hidden content
        const hiddenContent = contentClone.querySelector('.data-content-hidden');
        if (hiddenContent) hiddenContent.style.display = 'block';
        
        modalBody.innerHTML = '';
        modalBody.appendChild(contentClone);
        
        // Apply formatting to the modal
        if (this.app.markdownParser) {
           this.app.markdownParser.applySyntaxHighlighting(modalBody);
           this.app.markdownParser.renderCharts(modalBody);
        }
        
        if (modalTitle) modalTitle.textContent = '📄 Expanded View';
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
      
      actionsDiv.appendChild(expandBtn);

      // Regenerate Button
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'message-action-btn regenerate-btn';
      regenerateBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M16 21h5v-5"></path>
        </svg>
      `;
      this.app.modalManager.addTooltip(regenerateBtn, 'Regenerate', 'bottom');
      
      regenerateBtn.addEventListener('click', (e) => {
        // FIX: Force tooltip cleanup before the element is removed
        e.currentTarget.dispatchEvent(new MouseEvent('mouseleave'));
        document.querySelectorAll('.tooltip, .tippy-box').forEach(t => t.remove());
        
        this.handleRegenerate(message);
      });
      
      actionsDiv.appendChild(regenerateBtn);
    } 
    // --- User Actions (Edit) ---
    else {
      const editBtn = document.createElement('button');
      editBtn.className = 'message-action-btn edit-btn';
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      `;
      this.app.modalManager.addTooltip(editBtn, 'Edit', 'bottom');
      
      editBtn.addEventListener('click', (e) => {
        // FIX: Force tooltip cleanup before the element is hidden
        e.currentTarget.dispatchEvent(new MouseEvent('mouseleave'));
        document.querySelectorAll('.tooltip, .tippy-box').forEach(t => t.remove());

        this.handleEdit(message);
      });
      
      actionsDiv.appendChild(editBtn);
    }
  }

  initMessageActionButtons() {
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
      if (!msg.querySelector('.message-actions').hasChildNodes()) {
        this.ensureActionButtons(msg);
      }
    });
  }

  handleRegenerate(botMessage) {
    if (this.app.isLoading) return;
    
    const allMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message'));
    const botIndex = allMessages.indexOf(botMessage);
    
    if (botIndex > 0) {
      const userMessage = allMessages[botIndex - 1];
      if (userMessage.classList.contains('user')) {
        const question = userMessage.querySelector('.message-content').textContent;
        
        // 1. Remove Bot Message from UI
        botMessage.remove();
        
        // 2. Find the correct index in the conversation data
        // We count User messages to find the corresponding index in the data array
        const userMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message.user'));
        const userMsgIndex = userMessages.indexOf(userMessage);
        
        if (userMsgIndex >= 0) {
          // CRITICAL FIX: 
          // We slice the conversation up to (but NOT including) this index.
          // This effectively "rewinds" history to before this question was asked.
          // The submitQuestion function will treat it as a new question and add it back properly.
          this.app.currentConversation = this.app.currentConversation.slice(0, userMsgIndex);
        }
        
        // 3. Resubmit
        this.app.isLoading = true;
        this.app.uiManager.toggleSendButton(true);
        this.app.elements.chatInput.disabled = true;
        
        // 4. Call submit
        this.app.chatManager.submitQuestion(question, false);
      }
    }
  }

  handleEdit(userMessage) {
    if (this.app.isLoading) return;
    
    const contentDiv = userMessage.querySelector('.message-content');
    const actionsDiv = userMessage.querySelector('.message-actions');
    
    // Capture original state
    const originalHTML = contentDiv.innerHTML;
    
    // Convert HTML breaks back to newlines for the textarea
    const currentText = contentDiv.innerText; 
    
    userMessage.classList.add('editing');
    actionsDiv.style.display = 'none';
    
    contentDiv.innerHTML = `
      <div class="edit-input-wrapper">
        <textarea class="edit-input"></textarea>
        <div class="edit-actions">
          <button type="button" class="edit-cancel">Cancel</button>
          <button type="button" class="edit-save">Save & Submit</button>
        </div>
      </div>
    `;
    
    const textarea = contentDiv.querySelector('textarea');
    textarea.value = currentText; // Set value safely
    
    const cancelBtn = contentDiv.querySelector('.edit-cancel');
    const saveBtn = contentDiv.querySelector('.edit-save');
    
    // Auto-resize logic
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.focus();
    
    // Handlers
    const closeEdit = () => {
      userMessage.classList.remove('editing');
      actionsDiv.style.display = '';
    };

    // CANCEL: Restore exact original HTML
    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      contentDiv.innerHTML = originalHTML;
      closeEdit();
    };
    
    // SAVE: Process new text
    saveBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const newText = textarea.value.trim();
      
      if (newText && newText !== currentText.trim()) {
        // 1. Find index in the conversation array based on User Message Count
        const userMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message.user'));
        const convIndex = userMessages.indexOf(userMessage);
        
        if (convIndex === -1) {
          console.error("Could not find message index");
          this.app.showToast("Error editing message", "error");
          contentDiv.innerHTML = originalHTML;
          closeEdit();
          return;
        }

        // 2. Remove this message and EVERYTHING after it from UI
        const allMessages = Array.from(this.app.elements.chatDiv.querySelectorAll('.message'));
        const domIndex = allMessages.indexOf(userMessage);
        
        for (let i = allMessages.length - 1; i >= domIndex; i--) {
          allMessages[i].remove();
        }
        
        // 3. Update State: Keep conversation up to (but not including) this index
        this.app.currentConversation = this.app.currentConversation.slice(0, convIndex);
        
        // 4. Submit new question
        this.app.elements.chatInput.value = newText;
        this.app.askQuestion();
        
      } else {
        // If empty or unchanged, treat as cancel
        contentDiv.innerHTML = originalHTML;
        closeEdit();
      }
    };

    // Resize on input
    textarea.oninput = () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    };
    
    // Keyboard shortcuts
    textarea.onkeydown = (e) => {
      if (e.key === 'Escape') {
        cancelBtn.click();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveBtn.click();
      }
    };
  }

  async addFollowUpSuggestions(messageElement, originalQuestion, answer) {
    if (!this.followUpSuggestionsEnabled) return;
    
    // Use the current conversation history from the app state
    const history = Array.isArray(this.app.currentConversation) ? this.app.currentConversation : [];
    
    // Call the backend LLM to get smart suggestions
    const suggestions = await this.app.apiManager.getFollowUpSuggestions(history, answer);
    
    if (!suggestions || suggestions.length === 0) return;

    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'followup-suggestions';
    
    const title = document.createElement('div');
    title.className = 'followup-suggestions-title';
    title.textContent = 'Related questions:';
    suggestionsDiv.appendChild(title);
    
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'followup-chips';
    
    suggestions.forEach(suggestion => {
      const chip = document.createElement('button');
      chip.className = 'followup-chip';
      chip.textContent = suggestion;
      chip.addEventListener('click', () => {
        this.app.elements.chatInput.value = suggestion;
        this.app.askQuestion();
      });
      chipsDiv.appendChild(chip);
    });
    
    suggestionsDiv.appendChild(chipsDiv);
    
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.appendChild(suggestionsDiv);
        // Scroll to bottom again in case suggestions expanded the view
        this.app.uiManager.scrollToBottom();
    }
  }

  // DEPRECATED: Old client-side generation logic
  // generateSuggestions(ctx) { ... }

  disableFollowUpSuggestions() {
    const allChips = document.querySelectorAll('.followup-chip');
    allChips.forEach(chip => {
      chip.classList.add('disabled');
      chip.disabled = true;
    });
  }

  enableFollowUpSuggestions() {
    // Placeholder for future toggle logic
  }
}