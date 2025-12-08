// UI Rendering and Updates
import { groupChatsByDate, getDateOrder, getDynamicGreeting, truncateTitle } from './utils.js';
import { CONFIG } from './config.js';

export class UIManager {
  constructor(chatApp) {
    this.app = chatApp;
    // --- MODIFIED: Changed speaker icon to stop icon ---
    this.originalMicIcon = this.app.elements.micBtn ? this.app.elements.micBtn.innerHTML : '';
    this.stopIcon = `
      <svg class="stop-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="20" height="20">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
    `;
    // --- END MODIFICATION ---
  }

  render() {
    this.updateUI();
    this.renderHistory();
    this.updateMobileHeader();
    this.addButtonTooltips();
  }

  updateUI() {
    const { welcomeDiv, chatContainer, chatDiv } = this.app.elements;
    
    if (!this.app.hasConversation) {
      welcomeDiv.classList.add("show");
      chatContainer.classList.add("centered");
      chatDiv.style.display = "none";
    } else {
      welcomeDiv.classList.remove("show");
      chatContainer.classList.remove("centered");
      chatDiv.style.display = "flex";
    }
    
    this.updateScrollButton();
  }

  updateWelcomeMessage() {
    const welcomeDiv = this.app.elements.welcomeDiv;
    const h2 = welcomeDiv.querySelector('h2');
    const p = welcomeDiv.querySelector('p');
    
    if (h2) {
      const greeting = getDynamicGreeting();
      const userName = this.app.userName && this.app.userName !== 'You' ? `, ${this.app.userName}` : '';
      h2.textContent = `${greeting}${userName}`;
    }
    
    if (p) {
      p.textContent = "I'm Cindy, your company AI assistant. How can I help you today?"; // UPDATED
    }
  }

  addWelcomeAvatar() {
    const welcomeDiv = this.app.elements.welcomeDiv;
    
    if (welcomeDiv.querySelector('.welcome-avatar-container')) {
      return;
    }
    
    const container = document.createElement('div');
    container.className = 'welcome-avatar-container';
    
    const border = document.createElement('div');
    border.className = 'welcome-avatar-border';
    
    const avatar = document.createElement('img');
    avatar.src = 'assets/images/avatar-welcome.png';
    avatar.alt = 'Cindy waving hello';
    avatar.className = 'welcome-avatar';
    
    container.appendChild(border);
    container.appendChild(avatar);
    
    const h2 = welcomeDiv.querySelector('h2');
    if (h2) {
      welcomeDiv.insertBefore(container, h2);
    }
  }

  renderHistory() {
    const { chatHistory } = this.app.elements;
    const historyNav = chatHistory.parentElement;
    
    let historyHeader = historyNav.querySelector('.history-header');
    
    if (!historyHeader) {
      const oldH2 = historyNav.querySelector('h2');
      if (oldH2) oldH2.remove();
      
      historyHeader = document.createElement('div');
      historyHeader.className = 'history-header';
      historyHeader.innerHTML = `
        <h2>Previous Chats</h2>
        <button class="history-toggle" aria-label="Toggle chat history" aria-expanded="${!this.app.historyCollapsed}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      `;
      
      historyNav.insertBefore(historyHeader, chatHistory);
      
      const toggleBtn = historyHeader.querySelector('.history-toggle');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
        
        if (isSidebarMinimized) {
          this.toggleHistoryDropdown();
        } else {
          this.app.historyCollapsed = !this.app.historyCollapsed;
          this.app.saveToStorage();
          this.updateHistoryCollapse();
        }
      });
    }
    
    chatHistory.innerHTML = "";
    const fragment = document.createDocumentFragment();
    
    const groupedChats = groupChatsByDate(this.app.chats);
    const dateOrder = getDateOrder(groupedChats);
    
    dateOrder.forEach(dateCategory => {
      if (groupedChats[dateCategory]) {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.textContent = dateCategory;
        fragment.appendChild(dateSeparator);
        
        groupedChats[dateCategory].forEach(({ chat, index }) => {
          fragment.appendChild(this.createHistoryItem(chat, index));
        });
      }
    });
    
    chatHistory.appendChild(fragment);
    
    this.updateHistoryCollapse();
    this.highlightActiveChat();
    this.addButtonTooltips();
  }

  updateHistoryCollapse() {
    const historyHeader = document.querySelector('.history-header');
    const toggleBtn = historyHeader?.querySelector('.history-toggle');
    const { chatHistory } = this.app.elements;
    
    if (this.app.historyCollapsed) {
      chatHistory.classList.add('collapsed'); // <-- MODIFIED
      toggleBtn?.classList.add('collapsed');
      toggleBtn?.setAttribute('aria-expanded', 'false');
    } else {
      chatHistory.classList.remove('collapsed'); // <-- MODIFIED
      toggleBtn?.classList.remove('collapsed');
      toggleBtn?.setAttribute('aria-expanded', 'true');
    }
  }

  createHistoryItem(chat, index) {
    const li = document.createElement("li");
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.setAttribute("aria-label", `Load chat: ${chat.title}`);
    li.dataset.chatIndex = index;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = chat.title;
    titleSpan.className = "chat-title";
    titleSpan.style.cssText = "flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
    
    // === MODIFICATION START ===
    // Improved click handler with better checks
    li.addEventListener("click", (e) => {
      // Don't load chat if clicking on specific interactive elements
      if (
        e.target.closest('.ellipsis') ||
        e.target.closest('.dropdown') ||
        e.target.closest('.rename-input')
      ) {
        return;
      }
      
      // Cancel any active renames before loading chat
      this.cancelAllActiveRenames();
      this.app.loadChat(index);
    });
    // === MODIFICATION END ===

    const ellipsis = document.createElement("button");
    ellipsis.className = "ellipsis";
    ellipsis.textContent = "⋯";
    ellipsis.setAttribute("aria-label", "Chat options");
    ellipsis.setAttribute("aria-haspopup", "true");
    ellipsis.setAttribute("aria-expanded", "false");
    
    if (window.innerWidth > CONFIG.MOBILE_BREAKPOINT) {
      this.app.modalManager.addTooltip(ellipsis, 'Options', 'top');
    }

    // Create dropdown
    const dropdown = this.createDropdownMenu(chat, index, ellipsis, li, titleSpan);

    ellipsis.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // Stop click from bubbling to the li
      this.toggleDropdown(dropdown, ellipsis, li);
    });
    
    // === MODIFICATION START ===
    // Added keydown for accessibility on the li
    li.addEventListener("keydown", (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        // Don't trigger if we are on the ellipsis button
        if (document.activeElement === ellipsis) {
           return;
        }
        e.preventDefault();
        this.cancelAllActiveRenames();
        this.app.loadChat(index);
      }
    });
    // === MODIFICATION END ===

    li.appendChild(titleSpan);
    li.appendChild(ellipsis);
    li.appendChild(dropdown);

    return li;
  }

  createDropdownMenu(chat, index, ellipsis, listItem, titleSpan) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.style.display = 'none';

    const renameOption = document.createElement("button");
    renameOption.className = "dropdown-option rename";
    renameOption.textContent = "Rename";
    renameOption.setAttribute("role", "menuitem");

    const deleteOption = document.createElement("button");
    deleteOption.className = "dropdown-option delete";
    deleteOption.textContent = "Delete";
    deleteOption.setAttribute("role", "menuitem");

    dropdown.appendChild(renameOption);
    dropdown.appendChild(deleteOption);

    renameOption.addEventListener("click", (e) => {
      e.stopPropagation();
      // Cancel any existing rename operations first
      this.cancelAllActiveRenames();
      this.app.enableInlineRename(index, chat.title, listItem, titleSpan, ellipsis);
      this.closeAllDropdowns();
    });

    deleteOption.addEventListener("click", (e) => {
      e.stopPropagation();
      this.app.deleteChat(index, chat.title);
      this.closeAllDropdowns();
    });

    return dropdown;
  }

  cancelAllActiveRenames() {
    // Find all active rename inputs and trigger their cancel
    const allRenameInputs = document.querySelectorAll('.rename-input');
    allRenameInputs.forEach(input => {
      // Trigger Escape key event to cancel rename
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        code: 'Escape',
        bubbles: true,
        cancelable: true
      });
      input.dispatchEvent(escapeEvent);
    });
  }

  toggleDropdown(dropdown, ellipsis, listItem) {
    const isShowing = dropdown.classList.contains("show");
    
    // Close all other dropdowns first
    document.querySelectorAll(".dropdown.show").forEach(menu => {
      if (menu !== dropdown) {
        menu.classList.remove("show");
        menu.style.display = 'none';
        const otherEllipsis = menu.parentElement?.querySelector('.ellipsis');
        if (otherEllipsis) {
          otherEllipsis.setAttribute("aria-expanded", "false");
        }
      }
    });
    
    if (!isShowing) {
      const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
      const isInHistoryDropdown = listItem.closest('#history-dropdown-list') !== null;
      
      // Get positions
      const ellipsisRect = ellipsis.getBoundingClientRect();
      const listItemRect = listItem.getBoundingClientRect();
      
      // Always use fixed positioning for consistent behavior
      dropdown.style.position = 'fixed';
      dropdown.style.zIndex = '1010';
      
      if (isInHistoryDropdown) {
        // For items in the history dropdown (when sidebar is minimized)
        const historyDropdownRect = this.app.elements.historyDropdown.getBoundingClientRect();
        dropdown.style.top = `${listItemRect.top}px`;
        dropdown.style.left = `${historyDropdownRect.right + 5}px`;
      } else if (isSidebarMinimized) {
        // Regular sidebar items when minimized (shouldn't happen but keep as fallback)
        dropdown.style.top = `${ellipsisRect.bottom + 5}px`;
        dropdown.style.left = `${ellipsisRect.left - 100}px`;
      } else {
        // Normal sidebar (expanded) - position right beside the list item
        dropdown.style.top = `${listItemRect.top}px`;
        dropdown.style.left = `${listItemRect.right + 5}px`;
      }
      
      // Hide tooltip when dropdown is shown
      const tooltip = ellipsis.querySelector('.tooltip');
      if (tooltip) {
        tooltip.classList.remove('show');
      }
      
      dropdown.style.display = 'block';
      dropdown.classList.add("show");
      ellipsis.setAttribute("aria-expanded", "true");
      
      // Add click outside listener specifically for this dropdown
      setTimeout(() => {
        const clickHandler = (e) => {
          // Check if click is outside both the dropdown and ellipsis
          if (!dropdown.contains(e.target) && !ellipsis.contains(e.target)) {
            this.closeDropdown(dropdown, ellipsis);
            document.removeEventListener('click', clickHandler);
          }
        };
        document.addEventListener('click', clickHandler);
      }, 0);
    } else {
      this.closeDropdown(dropdown, ellipsis);
    }
  }

  closeDropdown(dropdown, ellipsis) {
    dropdown.classList.remove("show");
    dropdown.style.display = 'none';
    ellipsis.setAttribute("aria-expanded", "false");
    
    // Restore tooltip visibility
    const tooltip = ellipsis.querySelector('.tooltip');
    if (tooltip && window.innerWidth > CONFIG.MOBILE_BREAKPOINT) {
      tooltip.classList.add('show');
    }
  }

  closeAllDropdowns() {
    document.querySelectorAll(".dropdown.show").forEach(menu => {
      menu.classList.remove("show");
      menu.style.display = 'none';
    });
    document.querySelectorAll(".ellipsis[aria-expanded='true']").forEach(el => {
      el.setAttribute("aria-expanded", "false");
      
      // Restore tooltip visibility
      const tooltip = el.querySelector('.tooltip');
      if (tooltip && window.innerWidth > CONFIG.MOBILE_BREAKPOINT) {
        tooltip.classList.add('show');
      }
    });
    
    // Also close history dropdown
    this.closeHistoryDropdown();
  }

  highlightActiveChat() {
    document.querySelectorAll("#chat-history li").forEach(li => {
      li.classList.remove("active");
    });
    
    document.querySelectorAll("#history-dropdown-list li").forEach(li => {
      li.classList.remove("active");
    });
    
    if (this.app.activeChatIndex !== null && this.app.activeChatIndex >= 0 && this.app.hasConversation) {
      const activeItem = document.querySelector(`#chat-history li[data-chat-index="${this.app.activeChatIndex}"]`);
      if (activeItem) {
        activeItem.classList.add("active");
      }
      
      const activeDropdownItem = document.querySelector(`#history-dropdown-list li[data-chat-index="${this.app.activeChatIndex}"]`);
      if (activeDropdownItem) {
        activeDropdownItem.classList.add("active");
      }
    }
  }

  updateMobileHeader() {
    const { mobileHeader, mobileHeaderTitle, mobileHeaderLogo } = this.app.elements;
    
    const shouldShow = window.innerWidth <= 768;
    
    if (shouldShow) {
      mobileHeader.setAttribute("aria-hidden", "false");
      mobileHeader.classList.add("show");
      
      if (this.app.hasConversation && this.app.activeChatIndex !== null) {
        const currentChat = this.app.chats[this.app.activeChatIndex];
        if (currentChat) {
          const titleText = mobileHeaderTitle.querySelector('.title-text');
          titleText.textContent = truncateTitle(currentChat.title, 25);
          mobileHeaderTitle.classList.add('clickable');
          mobileHeaderTitle.setAttribute('aria-label', 'Chat options');
          mobileHeaderLogo.classList.add('hidden');
        } else {
          const titleText = mobileHeaderTitle.querySelector('.title-text');
          titleText.textContent = "Current Chat";
          mobileHeaderTitle.classList.add('clickable');
          mobileHeaderLogo.classList.add('hidden');
        }
      } else {
        const titleText = mobileHeaderTitle.querySelector('.title-text');
        titleText.textContent = "ChatCDO"; // No change needed
        mobileHeaderTitle.classList.remove('clickable');
        mobileHeaderTitle.classList.remove('dropdown-active');
        mobileHeaderTitle.setAttribute('aria-label', '');
        mobileHeaderLogo.classList.remove('hidden');
      }
    } else {
      mobileHeader.setAttribute("aria-hidden", "true");
      mobileHeader.classList.remove("show");
      
      if (window.innerWidth > 768) {
        this.app.elements.sidebar.classList.remove("show");
        this.app.elements.overlay.classList.remove("active");
      }
    }
  }

  addButtonTooltips() {
    if (window.innerWidth <= CONFIG.MOBILE_BREAKPOINT) return;
    
    const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
    
    this.app.modalManager.addTooltip(this.app.elements.sendBtn, 'Send message', 'top');
    
    if (isSidebarMinimized) {
      this.app.modalManager.addTooltip(this.app.elements.newChatBtn, 'New Chat', 'right');
    }
    
    if (this.app.elements.sidebarToggle) {
      const tooltipText = isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar';
      this.app.modalManager.addTooltip(this.app.elements.sidebarToggle, tooltipText, 'right');
    }
    
    const historyToggle = document.querySelector('.history-toggle');
    if (historyToggle && isSidebarMinimized) {
      this.app.modalManager.addTooltip(historyToggle, 'Previous chats', 'right');
    }
  }

  updateScrollButton() {
    const { scrollToBottomBtn, chatDiv, chatContainer } = this.app.elements;
    
    if (!scrollToBottomBtn) return;
    
    const hasMessages = chatDiv.children.length > 0;
    const isWelcomeView = chatContainer.classList.contains('centered');
    
    if (!hasMessages || isWelcomeView) {
      scrollToBottomBtn.classList.remove('visible');
    } else {
      this.handleScroll();
    }
  }

  handleScroll() {
    const { chatDiv, scrollToBottomBtn } = this.app.elements;
    const scrollThreshold = 100;
    
    if (!scrollToBottomBtn) return;
    
    const isNearBottom = chatDiv.scrollHeight - chatDiv.scrollTop - chatDiv.clientHeight <= scrollThreshold;
    
    if (isNearBottom) {
      scrollToBottomBtn.classList.remove('visible');
    } else {
      scrollToBottomBtn.classList.add('visible');
    }
  }

  toggleSendButton(isLoading) {
    const { sendBtn } = this.app.elements;
    
    if (isLoading) {
      sendBtn.innerHTML = `
        <svg class="stop-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      `;
      sendBtn.setAttribute('aria-label', 'Stop generation');
      sendBtn.classList.add('stop-mode');
      
      const existingTooltip = sendBtn.querySelector('.tooltip');
      if (existingTooltip) existingTooltip.remove();
      this.app.modalManager.addTooltip(sendBtn, 'Stop generation', 'top');
    } else {
      sendBtn.innerHTML = `
        <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
      `;
      sendBtn.setAttribute('aria-label', 'Send message');
      sendBtn.classList.remove('stop-mode');
      
      const existingTooltip = sendBtn.querySelector('.tooltip');
      if (existingTooltip) existingTooltip.remove();
      this.app.modalManager.addTooltip(sendBtn, 'Send message', 'top');
    }
  }

  initScrollToBottom() {
    const scrollBtn = document.createElement('button');
    scrollBtn.className = 'scroll-to-bottom';
    scrollBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2">
        <path d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
      </svg>
    `;
    scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
    
    scrollBtn.addEventListener('click', () => {
      this.scrollToBottom();
    });
    
    this.app.elements.chatContainer.appendChild(scrollBtn);
    this.app.elements.scrollToBottomBtn = scrollBtn;
    
    this.app.elements.chatDiv.addEventListener('scroll', this.handleScroll.bind(this));
    
    this.updateScrollButton();
  }

  scrollToBottom() {
    if (this.app._scrollTimeout) clearTimeout(this.app._scrollTimeout);
    this.app._scrollTimeout = requestAnimationFrame(() => {
      this.app.elements.chatDiv.scrollTop = this.app.elements.chatDiv.scrollHeight;
      this.app._scrollTimeout = null;
    });
  }

  scrollToStartOfResponse(messageElement) {
    // Per user request, always scroll to the absolute bottom after a new
    // response (from edit or regenerate) to ensure the action buttons are visible.
    this.scrollToBottom();
    
    // We still call handleScroll to update the scroll-to-bottom button visibility
    // after the scroll completes (which will be triggered by the scroll event).
    // Calling it here ensures the button state is correct even before the event.
    this.handleScroll();
  }

  closeMobileSidebar() {
    if (window.innerWidth <= 768) {
      this.app.elements.sidebar.classList.remove("show");
      this.app.elements.overlay.classList.remove("active");
      if (this.app.elements.mobileMenuToggle) {
        this.app.elements.mobileMenuToggle.setAttribute("aria-expanded", "false");
      }
      if (this.app.elements.mobileHeaderToggle) {
        this.app.elements.mobileHeaderToggle.setAttribute("aria-expanded", "false");
      }
    }
  }

  toggleHistoryDropdown() {
    const { historyDropdown, sidebar } = this.app.elements;
    const isShowing = historyDropdown.classList.contains('show');
    const historyToggle = document.querySelector('.history-toggle');
    
    this.closeAllDropdowns();
    
    if (!isShowing) {
      if (historyToggle) {
        const tooltip = historyToggle.querySelector('.tooltip');
        if (tooltip) {
          tooltip.style.display = 'none';
          tooltip.classList.remove('show');
        }
        
        historyToggle.classList.add('dropdown-open');
      }
      
      this.populateHistoryDropdown();
      
      if (historyToggle) {
        const rect = historyToggle.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        
        historyDropdown.style.position = 'fixed';
        historyDropdown.style.top = `${rect.bottom + 5}px`;
        historyDropdown.style.left = `${sidebarRect.right + 5}px`;
        historyDropdown.style.width = '280px';
      }
      
      historyDropdown.classList.add('show');
      historyDropdown.setAttribute('aria-hidden', 'false');
      
      setTimeout(() => {
        const clickHandler = (e) => {
          if (!historyDropdown.contains(e.target) && 
              !e.target.closest('.history-toggle') &&
              !e.target.closest('.dropdown.show')) {
            this.closeHistoryDropdown();
            document.removeEventListener('click', clickHandler);
          }
        };
        document.addEventListener('click', clickHandler);
      }, 0);
    } else {
      this.closeHistoryDropdown();
    }
  }

  populateHistoryDropdown() {
    const { historyDropdownList } = this.app.elements;
    historyDropdownList.innerHTML = '';
    
    if (this.app.chats.length === 0) {
      const emptyState = document.createElement('li');
      emptyState.textContent = 'No previous chats';
      emptyState.style.padding = '12px';
      emptyState.style.textAlign = 'center';
      emptyState.style.color = 'var(--text-muted)';
      emptyState.style.fontStyle = 'italic';
      emptyState.style.pointerEvents = 'none';
      historyDropdownList.appendChild(emptyState);
      return;
    }
    
    const groupedChats = groupChatsByDate(this.app.chats);
    const dateOrder = getDateOrder(groupedChats);
    
    dateOrder.forEach(dateCategory => {
      if (groupedChats[dateCategory]) {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.textContent = dateCategory;
        dateSeparator.style.padding = '8px 12px';
        dateSeparator.style.fontSize = '0.7rem';
        historyDropdownList.appendChild(dateSeparator);
        
        groupedChats[dateCategory].forEach(({ chat, index }) => {
          const li = document.createElement('li');
          li.setAttribute('role', 'button');
          li.setAttribute('tabindex', '0');
          li.dataset.chatIndex = index;
          
          const titleSpan = document.createElement('span');
          titleSpan.className = 'chat-title';
          titleSpan.textContent = chat.title;
          titleSpan.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
          
          const ellipsis = document.createElement('button');
          ellipsis.className = 'ellipsis';
          ellipsis.textContent = '⋯';
          ellipsis.setAttribute('aria-label', 'Chat options');
          ellipsis.setAttribute('aria-haspopup', 'true');
          ellipsis.setAttribute('aria-expanded', 'false');
          
          const dropdown = this.createDropdownMenuForHistoryItem(chat, index, ellipsis, li, titleSpan);
          
          ellipsis.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop click from bubbling to the li
            this.toggleDropdown(dropdown, ellipsis, li);
          });
          
          li.appendChild(titleSpan);
          li.appendChild(ellipsis);
          li.appendChild(dropdown);
          
          if (this.app.activeChatIndex === index && this.app.hasConversation) {
            li.classList.add('active');
          }
          
          // === MODIFICATION START ===
          // Moved click listener from titleSpan to li
          li.addEventListener('click', (e) => {
            // Don't load chat if clicking on options or rename input
            if (e.target.closest('.ellipsis') || e.target.closest('.rename-input')) {
              return;
            }
            e.stopPropagation(); // Stop it from bubbling up further if needed
            
            this.cancelAllActiveRenames();
            this.app.loadChat(index);
            this.closeHistoryDropdown();
          });
          
          li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              // Don't trigger if we are on the ellipsis button
              if (document.activeElement === ellipsis) {
                return;
              }
              e.preventDefault();
              
              this.cancelAllActiveRenames();
              this.app.loadChat(index);
              this.closeHistoryDropdown();
            }
          });
          // === MODIFICATION END ===
          
          historyDropdownList.appendChild(li);
        });
      }
    });
  }

  createDropdownMenuForHistoryItem(chat, index, ellipsis, listItem, titleSpan) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.style.display = 'none';

    const renameOption = document.createElement("button");
    renameOption.className = "dropdown-option rename";
    renameOption.textContent = "Rename";
    renameOption.setAttribute("role", "menuitem");

    const deleteOption = document.createElement("button");
    deleteOption.className = "dropdown-option delete";
    deleteOption.textContent = "Delete";
    deleteOption.setAttribute("role", "menuitem");

    dropdown.appendChild(renameOption);
    dropdown.appendChild(deleteOption);

    renameOption.addEventListener("click", (e) => {
      e.stopPropagation();
      
      // Close all dropdowns first
      const allDropdowns = this.app.elements.historyDropdownList.querySelectorAll('.dropdown.show');
      allDropdowns.forEach(dd => {
        dd.classList.remove('show');
        dd.style.display = 'none';
        const parentLi = dd.closest('li');
        if (parentLi) {
          const parentEllipsis = parentLi.querySelector('.ellipsis');
          if (parentEllipsis) {
            parentEllipsis.setAttribute('aria-expanded', 'false');
          }
        }
      });
      
      // Cancel any existing rename operations first
      this.cancelAllActiveRenames();
      
      this.enableInlineRenameInDropdown(index, chat.title, listItem, titleSpan, ellipsis);
    });

    deleteOption.addEventListener("click", (e) => {
      e.stopPropagation();
      this.app.deleteChat(index, chat.title);
      this.closeAllDropdowns();
      this.populateHistoryDropdown();
    });

    return dropdown;
  }

  enableInlineRenameInDropdown(index, currentTitle, listItem, titleSpan, ellipsis) {
    if (listItem.querySelector('.rename-input')) {
      return;
    }
    
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
    
    const completeRename = () => {
      if (renameCompleted) return;
      renameCompleted = true;
      
      const newName = input.value.trim();
      
      if (newName && newName !== currentTitle) {
        this.app.chats[index].title = newName;
        this.app.saveToStorage();
        
        titleSpan.textContent = newName;
        this.app.updateCorrespondingChatTitle(index, newName);
        this.app.uiManager.updateMobileHeader();
        
        this.app.uiManager.renderHistory();
        this.populateHistoryDropdown();
        
        this.app.showToast('Chat renamed successfully', 'success');
      } else if (!newName) {
        this.app.showToast('Chat name cannot be empty', 'error');
        titleSpan.textContent = currentTitle;
      }
      
      listItem.replaceChild(titleSpan, input);
      ellipsis.style.display = "";
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
      // Use a timeout to allow other click events to process first
      setTimeout(() => {
        if (!renameCompleted) {
          // If blur happens and rename not completed, cancel it
          cancelRename();
        }
      }, 150);
    });
    
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    
    input.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    input.addEventListener("input", (e) => {
      e.stopPropagation();
    });
  }

  closeHistoryDropdown() {
    const { historyDropdown } = this.app.elements;
    historyDropdown.classList.remove('show');
    historyDropdown.setAttribute('aria-hidden', 'true');
    
    const historyToggle = document.querySelector('.history-toggle');
    if (historyToggle) {
      historyToggle.classList.remove('dropdown-open');
      const tooltip = historyToggle.querySelector('.tooltip');
      if (tooltip) {
        tooltip.style.display = '';
      }
    }
  }

  // --- NEW: Functions to manage Mic Button state ---
  showMicStopSpeakingMode() {
    const { micBtn } = this.app.elements;
    if (micBtn) {
      micBtn.innerHTML = this.stopIcon; // <-- MODIFIED
      micBtn.classList.add('speaking-mode');
      micBtn.classList.remove('recording'); // Ensure it's not also "recording"
      micBtn.setAttribute('aria-label', 'Stop speaking');
    }
  }

  hideMicStopSpeakingMode() {
    const { micBtn } = this.app.elements;
    if (micBtn) {
      micBtn.innerHTML = this.originalMicIcon;
      micBtn.classList.remove('speaking-mode');
      micBtn.setAttribute('aria-label', 'Use voice input');
    }
  }
}