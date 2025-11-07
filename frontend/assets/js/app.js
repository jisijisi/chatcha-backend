// Main Application Entry Point
import { CONFIG } from './config.js';
import { StorageManager } from './storage.js';
import { APIManager } from './api.js';
import { MarkdownParser } from './markdown.js';
import { MessageManager } from './messages.js';
import { ModalManager } from './modal.js';
import { UIManager } from './ui.js';
import { ChatManager } from './chat.js';
// import { SheetsManager } from './sheets.js'; // REMOVED
import { getDynamicGreeting } from './utils.js';

class ChatApp {
  constructor() {
    // Initialize managers
    this.storageManager = new StorageManager();
    this.apiManager = new APIManager();
    this.markdownParser = new MarkdownParser();
    // this.sheetsManager = new SheetsManager(); // REMOVED
    
    // Pass markdown parser to API manager for streaming updates
    this.apiManager.setMarkdownParser(this.markdownParser);
    
    // Load data from storage
    const storedData = this.storageManager.loadAll();
    this.chats = storedData.chats;
    this.currentConversation = storedData.currentConversation;
    this.activeChatIndex = storedData.activeChatIndex;
    this.historyCollapsed = storedData.historyCollapsed;
    this.userName = storedData.userName;
    
    // State - Changed from resumeData to hrKnowledgeBase
    this.hrKnowledgeBase = {};
    this.hasConversation = this.currentConversation.length > 0;
    this.isLoading = false;
    this.currentFollowUpElement = null;
    this._scrollTimeout = null;
    this.greetingInterval = null;

    // Cache DOM elements
    this.elements = {
      chatDiv: document.getElementById("chat"),
      chatInput: document.getElementById("question"),
      chatContainer: document.getElementById("chat-container"),
      welcomeDiv: document.getElementById("welcome-message"),
      chatHistory: document.getElementById("chat-history"),
      sendBtn: document.getElementById("send-btn"),
      newChatBtn: document.getElementById("new-chat"),
      sidebar: document.getElementById("sidebar"),
      sidebarToggle: document.getElementById("sidebar-toggle"),
      mobileMenuToggle: document.getElementById("mobile-menu-toggle"),
      overlay: document.getElementById("sidebar-overlay"),
      inputForm: document.querySelector(".input-area"),
      modalOverlay: document.getElementById("modal-overlay"),
      modalTitle: document.getElementById("modal-title"),
      modalMessage: document.getElementById("modal-message"),
      modalInput: document.getElementById("modal-input"),
      modalCancel: document.getElementById("modal-cancel"),
      modalConfirm: document.getElementById("modal-confirm"),
      modalClose: document.querySelector(".modal-close"),
      historyDropdown: document.getElementById("history-dropdown"),
      historyDropdownList: document.getElementById("history-dropdown-list"),
      mobileHeader: document.getElementById("mobile-header"),
      mobileHeaderToggle: document.getElementById("mobile-header-toggle"),
      mobileHeaderTitle: document.getElementById("mobile-header-title"),
      mobileHeaderLogo: document.getElementById("mobile-header-logo"),
      mobileHeaderDropdown: document.getElementById("mobile-header-dropdown"),
      mobileRenameOption: document.getElementById("mobile-rename-option"),
      mobileDeleteOption: document.getElementById("mobile-delete-option")
    };

    // Initialize other managers (that need this.elements)
    this.modalManager = new ModalManager(this.elements);
    this.uiManager = new UIManager(this);
    this.messageManager = new MessageManager(this);
    this.chatManager = new ChatManager(this);

    this.mediaQuery = window.matchMedia('(max-width: 768px)');
    
    this.startGreetingUpdateInterval();
    this.init();
  }

  async init() {
    console.log('Initializing ChatCHA CDO Assistant...'); // No change needed
    
    await this.loadHRKnowledge();
    
    // Initialize CDO cache from localStorage or fetch fresh data
    await this.apiManager.initializeCDOCache();

    // HR knowledge base is now handled server-side via RAG
    console.log('Server-side RAG system initialized');
    
    // Check if Sheets integration is enabled - REMOVED
    
    if (!this.userName) {
      this.modalManager.showWelcomeModal((name) => {
        this.userName = name || "You";
        this.saveToStorage();
        this.uiManager.updateWelcomeMessage();
        this.showToast(`Welcome, ${this.userName}!`, 'success');
      });
    } else {
      this.uiManager.updateWelcomeMessage();
    }
    
    this.setupEventListeners();
    this.uiManager.addWelcomeAvatar();
    this.uiManager.render();
    
    this.uiManager.initScrollToBottom();
    this.initCharacterCounter();
    this.addSuggestedQuestions();
    
    // Initialize message manager with immediate action button setup
    this.messageManager.initMessageActionButtons();
    this.markdownParser.initLazySyntaxHighlighting();
    this.modalManager.initializeTooltips();
    
    // Load existing conversation or last active chat
    if (this.hasConversation) {
      this.chatManager.renderCurrentChat();
    } else if (this.chats.length > 0 && this.activeChatIndex !== null) {
      this.chatManager.loadChat(this.activeChatIndex);
    }
    
    this.uiManager.updateMobileHeader();

    // Setup streaming update listener
    document.addEventListener('streamingUpdate', (e) => {
      const { fullAnswer, contentDiv, messageElement } = e.detail;
      contentDiv.innerHTML = this.markdownParser.parseMarkdown(fullAnswer);
      this.markdownParser.applySyntaxHighlighting(contentDiv);
      this.uiManager.scrollToStartOfResponse(messageElement);
    });
    
    console.log('ChatCHA CDO Assistant initialized successfully!'); // No change needed
    this.showToast('Ready to assist with your CDO questions!', 'success');
  }

  async loadHRKnowledge() {
      try {
          // HR knowledge is now handled server-side
          this.hrKnowledgeBase = { full_content: {} };
          console.log('HR knowledge base handled server-side');
      } catch (error) {
          console.log('HR knowledge base handled server-side');
          this.hrKnowledgeBase = { full_content: {} };
      }
  }

  saveToStorage() {
    this.storageManager.saveToStorage({
      currentConversation: this.currentConversation,
      chats: this.chats,
      activeChatIndex: this.activeChatIndex,
      historyCollapsed: this.historyCollapsed,
      userName: this.userName
    });
  }

  startGreetingUpdateInterval() {
    this.greetingInterval = setInterval(() => {
      if (!this.hasConversation) {
        this.uiManager.updateWelcomeMessage();
      }
    }, 60000);
  }

  stopGreetingUpdateInterval() {
    if (this.greetingInterval) {
      clearInterval(this.greetingInterval);
      this.greetingInterval = null;
    }
  }

  // Delegate methods to appropriate managers
  askQuestion() {
    return this.chatManager.askQuestion();
  }

  loadChat(index) {
    return this.chatManager.loadChat(index);
  }

  showToast(message, type, duration) {
    return this.modalManager.showToast(message, type, duration);
  }

  toggleSendButton(isLoading) {
    return this.uiManager.toggleSendButton(isLoading);
  }

  stopGeneration() {
    console.log('Stopping generation...');
    this.apiManager.stopGeneration();
    
    const typingIndicator = this.elements.chatDiv.querySelector('.message.bot:last-child .typing');
    if (typingIndicator) {
      typingIndicator.closest('.message').remove();
    }
    
    this.isLoading = false;
    this.elements.sendBtn.disabled = false;
    this.elements.chatInput.disabled = false;
    this.toggleSendButton(false);
    this.elements.chatInput.focus();
    this.showToast('Generation stopped', 'warning');
  }

  initCharacterCounter() {
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';
    
    const input = this.elements.chatInput;
    input.parentNode.insertBefore(inputWrapper, input);
    inputWrapper.appendChild(input);
    
    const existingCounter = this.elements.inputForm.querySelector('.input-counter');
    if (existingCounter) {
      existingCounter.remove();
    }
    
    const counter = document.createElement('div');
    counter.className = 'input-counter';
    counter.textContent = '0/500';
    
    inputWrapper.appendChild(counter);
    this.elements.charCounter = counter;
    
    let counterTimeout;
    this.elements.chatInput.addEventListener('input', () => {
      clearTimeout(counterTimeout);
      counterTimeout = setTimeout(() => this.updateCharacterCount(), 50);
    });
    
    this.updateCharacterCount();
  }

  updateCharacterCount() {
    const maxLength = 500;
    const currentLength = this.elements.chatInput.value.length;
    const counter = this.elements.charCounter;
    
    if (counter) {
      counter.textContent = `${currentLength}/${maxLength}`;
      
      counter.classList.remove('warning', 'error');
      if (currentLength > maxLength * 0.8 && currentLength <= maxLength) {
        counter.classList.add('warning');
      } else if (currentLength > maxLength) {
        counter.classList.add('error');
      }
    }
  }

  addSuggestedQuestions() {
    // UPDATED: Changed questions to be more general for a company assistant
    const questionCategories = {
      companyInfo: [
        "Tell me about the history of CDO.",
        "What are CDO's main products?",
        "What is the company's mission or vision?",
      ],
      hrPolicies: [
        "What is the company policy on remote work?",
        "How do I file for a vacation leave?",
        "What are the company holidays?",
      ],
      employeeRelations: [
        "How do I handle a conflict with a coworker?",
        "What are the steps for a performance review?",
        "Where can I find information on employee benefits?",
      ],
      general: [
        "Who is the founder of CDO?",
        "What brands does CDO own?",
        "Explain the process for internal job applications."
      ]
    };

    const container = document.createElement('div');
    container.className = 'suggested-questions';
    
    const selectedQuestions = this.getRandomQuestions(questionCategories, 6);
    
    selectedQuestions.forEach(question => {
      const button = document.createElement('button');
      button.className = 'suggested-question';
      button.textContent = question;
      button.type = 'button';
      
      button.addEventListener('click', () => {
        this.elements.chatInput.value = question;
        this.updateCharacterCount();
        this.askQuestion();
      });
      
      container.appendChild(button);
    });
    
    // Clear existing questions before adding new ones
    const existingContainer = this.elements.welcomeDiv.querySelector('.suggested-questions');
    if (existingContainer) {
      existingContainer.remove();
    }
    
    this.elements.welcomeDiv.appendChild(container);
  }

  getRandomQuestions(categories, count) {
    const allQuestions = [];
    
    Object.values(categories).forEach(categoryQuestions => {
      allQuestions.push(...categoryQuestions);
    });
    
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  deleteChat(index, title) {
    this.modalManager.showModal({
      title: "Delete Chat",
      message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      inputValue: null,
      confirmText: "Delete",
      confirmClass: "delete",
      onConfirm: () => {
        this.chats.splice(index, 1);

        if (this.activeChatIndex === index || this.chats.length === 0) {
          this.activeChatIndex = null;
          this.currentConversation = [];
          this.hasConversation = false;
          this.elements.chatDiv.innerHTML = "";
          this.elements.chatInput.value = "";
          this.elements.chatInput.disabled = false;
        } else if (this.activeChatIndex > index) {
          this.activeChatIndex--;
        }

        this.saveToStorage();
        this.uiManager.renderHistory();
        this.uiManager.updateUI();
        this.uiManager.updateMobileHeader();
        this.showToast('Chat deleted successfully', 'success');
      }
    });
  }

  enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis) {
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
        this.chats[index].title = newName;
        this.saveToStorage();
        
        titleSpan.textContent = newName;
        this.updateCorrespondingChatTitle(index, newName);
        this.uiManager.updateMobileHeader();
        this.showToast('Chat renamed successfully', 'success');
      } else if (!newName) {
        this.showToast('Chat name cannot be empty', 'error');
      }
      
      listItem.replaceChild(titleSpan, input);
      ellipsis.style.display = "";
      this.uiManager.renderHistory();
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
        if (!renameCompleted) {
          cancelRename();
        }
      }, 150);
    });
    
    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    
    input.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    input.addEventListener("input", (e) => {
      e.stopPropagation();
    });
  }
  
  updateCorrespondingChatTitle(index, newTitle) {
    const sidebarItem = document.querySelector(`#chat-history li[data-chat-index="${index}"] .chat-title`);
    if (sidebarItem) {
      sidebarItem.textContent = newTitle;
    }
    
    const dropdownItem = document.querySelector(`#history-dropdown-list li[data-chat-index="${index}"] .chat-title`);
    if (dropdownItem) {
      dropdownItem.textContent = newTitle;
    }
  }

  setupEventListeners() {
    const { chatInput, sendBtn, newChatBtn, sidebarToggle, mobileMenuToggle, overlay, inputForm } = this.elements;

    // Form submission
    inputForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.askQuestion();
    });

    // Send/Stop button
    sendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.isLoading) {
        this.stopGeneration();
      } else {
        this.askQuestion();
      }
    });

    // Enter key to send
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!this.isLoading) {
          this.askQuestion();
        }
      }
    });

    // New chat button
    newChatBtn.addEventListener("click", () => {
      this.currentConversation = [];
      this.hasConversation = false;
      this.activeChatIndex = null;
      this.elements.chatDiv.innerHTML = "";
      this.elements.chatInput.value = "";
      this.saveToStorage();
      this.uiManager.updateUI();
      this.uiManager.updateWelcomeMessage();
      this.uiManager.highlightActiveChat();
      this.uiManager.updateMobileHeader();
      this.uiManager.closeAllDropdowns();
      this.uiManager.closeMobileSidebar();
      this.uiManager.updateScrollButton();
      this.showToast('Started new chat', 'success');
    });

    // Sidebar toggle (desktop)
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        if (window.innerWidth > 768) {
          this.elements.sidebar.classList.toggle("minimized");
          const isMinimized = this.elements.sidebar.classList.contains("minimized");
          sidebarToggle.setAttribute("aria-label", isMinimized ? "Expand sidebar" : "Minimize sidebar");
          
          const existingTooltip = sidebarToggle.querySelector('.tooltip');
          if (existingTooltip) existingTooltip.remove();
          this.modalManager.addTooltip(sidebarToggle, isMinimized ? 'Expand sidebar' : 'Minimize sidebar', 'right');
          
          if (!isMinimized) {
            this.modalManager.removeSidebarTooltips();
          } else {
            this.uiManager.addButtonTooltips();
          }
        }
      });
    }

    // Logo click to expand when minimized
    const logoContainer = document.querySelector(".logo-container");
    if (logoContainer) {
      logoContainer.addEventListener("click", () => {
        if (window.innerWidth > 768 && this.elements.sidebar.classList.contains("minimized")) {
          this.elements.sidebar.classList.remove("minimized");
          if (sidebarToggle) {
            sidebarToggle.setAttribute("aria-label", "Minimize sidebar");
            const existingTooltip = sidebarToggle.querySelector('.tooltip');
            if (existingTooltip) existingTooltip.remove();
            this.modalManager.addTooltip(sidebarToggle, 'Minimize sidebar', 'right');
          }
          this.modalManager.removeSidebarTooltips();
        }
      });
    }

    // Mobile menu toggle
    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener("click", () => {
        const isShowing = this.elements.sidebar.classList.toggle("show");
        this.elements.overlay.classList.toggle("active");
        mobileMenuToggle.setAttribute("aria-expanded", isShowing.toString());
        this.uiManager.closeAllDropdowns();
      });
    }

    // Mobile header toggle
    if (this.elements.mobileHeaderToggle) {
      this.elements.mobileHeaderToggle.addEventListener("click", () => {
        const isShowing = this.elements.sidebar.classList.toggle("show");
        this.elements.overlay.classList.toggle("active");
        this.elements.mobileHeaderToggle.setAttribute("aria-expanded", isShowing.toString());
        this.uiManager.closeAllDropdowns();
      });
    }

    // Mobile header title click
    if (this.elements.mobileHeaderTitle) {
      this.elements.mobileHeaderTitle.addEventListener("click", () => {
        if (this.hasConversation && this.activeChatIndex !== null) {
          this.toggleMobileHeaderDropdown();
        }
      });
    }

    // Mobile header dropdown options
    if (this.elements.mobileRenameOption) {
      this.elements.mobileRenameOption.addEventListener("click", () => {
        this.renameActiveChat();
      });
    }

    if (this.elements.mobileDeleteOption) {
      this.elements.mobileDeleteOption.addEventListener("click", () => {
        this.deleteActiveChat();
      });
    }

    // Overlay click to close sidebar
    overlay.addEventListener("click", () => {
      this.elements.sidebar.classList.remove("show");
      this.elements.overlay.classList.remove("active");
      if (mobileMenuToggle) {
        mobileMenuToggle.setAttribute("aria-expanded", "false");
      }
      if (this.elements.mobileHeaderToggle) {
        this.elements.mobileHeaderToggle.setAttribute("aria-expanded", "false");
      }
      this.uiManager.closeAllDropdowns();
    });

    // Modal event listeners
    this.elements.modalCancel.addEventListener("click", () => this.modalManager.closeModal());
    this.elements.modalClose.addEventListener("click", () => this.modalManager.closeModal());
    this.elements.modalConfirm.addEventListener("click", () => this.modalManager.handleModalConfirm());

    // Close modal on overlay click
    this.elements.modalOverlay.addEventListener("click", (e) => {
      if (e.target === this.elements.modalOverlay) {
        this.modalManager.closeModal();
      }
    });

    // Modal input - Enter to confirm, Escape to cancel
    this.elements.modalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.modalManager.handleModalConfirm();
      } else if (e.key === "Escape") {
        this.modalManager.closeModal();
      }
    });

    // Close dropdowns on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".dropdown") && !e.target.closest(".ellipsis")) {
        this.uiManager.closeAllDropdowns();
      }
      
      if (!e.target.closest(".mobile-header-dropdown") && 
          !e.target.closest(".mobile-header-title")) {
        this.closeMobileHeaderDropdown();
      }

      if (!e.target.closest('.history-dropdown') && 
          !e.target.closest('.history-toggle') &&
          !e.target.closest('#sidebar.minimized')) {
        this.uiManager.closeHistoryDropdown();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.uiManager.closeAllDropdowns();
        this.closeMobileHeaderDropdown();
        if (this.elements.modalOverlay.classList.contains("active")) {
          this.modalManager.closeModal();
        }
      }
    });

    // Resize handling
    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const isMobile = window.innerWidth <= 768;
        const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
        const isDesktop = window.innerWidth > 1024;
        
        if (isDesktop || isTablet) {
          this.elements.sidebar.classList.remove("show");
          this.elements.overlay.classList.remove("active");
          
          if (isTablet && this.elements.sidebar.classList.contains("minimized")) {
            this.elements.sidebar.classList.remove("minimized");
            if (sidebarToggle) {
              sidebarToggle.setAttribute("aria-label", "Minimize sidebar");
            }
          }
          
          if (this.elements.mobileMenuToggle) {
            this.elements.mobileMenuToggle.setAttribute("aria-expanded", "false");
          }
          if (this.elements.mobileHeaderToggle) {
            this.elements.mobileHeaderToggle.setAttribute("aria-expanded", "false");
          }
          this.uiManager.addButtonTooltips();
        }
        
        this.uiManager.updateMobileHeader();
        this.uiManager.closeAllDropdowns();
        this.closeMobileHeaderDropdown();
      }, 100);
    });

    // Media query listener
    this.mediaQuery.addEventListener("change", (e) => {
      this.uiManager.updateMobileHeader();
      if (e.matches) {
        // Now in mobile view
      } else {
        // Now in tablet/desktop view
        this.uiManager.addButtonTooltips();
        this.elements.sidebar.classList.remove("show");
        this.elements.overlay.classList.remove("active");
      }
    });

    // Orientation change
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        this.uiManager.updateMobileHeader();
      }, 100);
    });
  }

  toggleMobileHeaderDropdown() {
    const { mobileHeaderDropdown } = this.elements;
    if (mobileHeaderDropdown.classList.contains('show')) {
      this.closeMobileHeaderDropdown();
    } else {
      this.showMobileHeaderDropdown();
    }
  }

  showMobileHeaderDropdown() {
    const { mobileHeaderDropdown, mobileHeaderTitle } = this.elements;
    mobileHeaderDropdown.classList.add('show');
    mobileHeaderTitle.classList.add('dropdown-active');
  }

  closeMobileHeaderDropdown() {
    const { mobileHeaderDropdown, mobileHeaderTitle } = this.elements;
    mobileHeaderDropdown.classList.remove('show');
    mobileHeaderTitle.classList.remove('dropdown-active');
  }

  deleteActiveChat() {
    if (this.activeChatIndex === null || this.activeChatIndex < 0) return;
    
    const chat = this.chats[this.activeChatIndex];
    if (!chat) return;
    
    this.deleteChat(this.activeChatIndex, chat.title);
    this.closeMobileHeaderDropdown();
  }

  renameActiveChat() {
    if (this.activeChatIndex === null || this.activeChatIndex < 0) return;
    
    const chat = this.chats[this.activeChatIndex];
    if (!chat) return;
    
    this.closeMobileHeaderDropdown();
    
    this.modalManager.showModal({
      title: "Rename Chat",
      message: "Enter a new name for this chat:",
      inputValue: chat.title,
      confirmText: "Rename",
      confirmClass: "",
      onConfirm: (newName) => {
        if (newName && newName.trim() && newName !== chat.title) {
          this.chats[this.activeChatIndex].title = newName.trim();
          this.saveToStorage();
          this.uiManager.renderHistory();
          this.uiManager.updateMobileHeader();
          this.showToast('Chat renamed successfully', 'success');
        } else if (!newName || !newName.trim()) {
          this.showToast('Please enter a valid chat name', 'error');
        }
      }
    });
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
  });
} else {
  window.chatApp = new ChatApp();
}

// In your main app.js or wherever you initialize APIManager
const apiManager = new APIManager();

// Test phase optimization safely
setTimeout(() => {
  try {
    apiManager.enablePhaseOptimization();
    console.log('Phase optimization enabled successfully');
  } catch (error) {
    console.error('Phase optimization failed, running in legacy mode:', error);
    apiManager.disablePhaseOptimization();
  }
}, 1000);