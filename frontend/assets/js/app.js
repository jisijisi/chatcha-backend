// Main Application Entry Point
import { CONFIG } from './config.js';
import { DataSyncManager } from './data-sync.js'; // RENAMED
import { APIManager } from './api.js';
import { MarkdownParser } from './markdown.js';
import { MessageManager } from './messages.js';
import { ModalManager } from './modal.js';
import { UIManager } from './ui.js';
import { ChatManager } from './chat.js';
import { AuthManager } from './auth.js';
// import { SheetsManager } from './sheets.js'; // REMOVED
import { getDynamicGreeting } from './utils.js';

class ChatApp {
  constructor() {
    // Initialize auth manager first
    this.authManager = new AuthManager();
    
    // Check authentication - redirect to login if not authenticated
    if (!this.authManager.requireAuth()) {
      return; // Stop initialization if not authenticated
    }
    
    // Initialize managers (pass authManager to DataSyncManager)
    this.apiManager = new APIManager();
    this.apiManager.setAuthManager(this.authManager); // NEW: Pass AuthManager to API
    
    this.dataSyncManager = new DataSyncManager(this.authManager, this.apiManager); // RENAMED & MODIFIED
    
    this.markdownParser = new MarkdownParser();
    // this.sheetsManager = new SheetsManager(); // REMOVED
    
    // Pass markdown parser to API manager for streaming updates
    this.apiManager.setMarkdownParser(this.markdownParser);
    
    // Initialize state to safe defaults (data is loaded in init())
    this.chats = [];
    this.currentConversation = [];
    this.activeChatIndex = null;
    this.historyCollapsed = false;
    this.userName = null;
    
    // State - Changed from resumeData to hrKnowledgeBase
    this.hrKnowledgeBase = {};
    this.hasConversation = false;
    this.isLoading = false;
    this.currentFollowUpElement = null;
    this._scrollTimeout = null;
    this.greetingInterval = null;
    this.voices = []; 
    this.isVoiceInput = false; 
    this.suggestedQuestionsInterval = null; 

    // --- NEW: Moved question categories here ---
    this.questionCategories = {
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
      mobileDeleteOption: document.getElementById("mobile-delete-option"),
      micBtn: document.getElementById("mic-btn"),
      logoutBtn: document.getElementById("logout-btn"),
      userDisplayName: document.getElementById("user-display-name"),
      userTypeLabel: document.getElementById("user-type-label")
    };

    // Initialize other managers (that need this.elements)
    this.modalManager = new ModalManager(this.elements);
    this.uiManager = new UIManager(this);
    this.messageManager = new MessageManager(this);
    this.chatManager = new ChatManager(this);

    this.mediaQuery = window.matchMedia('(max-width: 768px)');
    this.scrollPosition = 0;

    this.startGreetingUpdateInterval();
    this.init(); // Start the async initialization
  }

  async init() {
    console.log('Initializing Cindy CDO Assistant...');
    
    // NEW: Load data from the appropriate source (API or LocalStorage)
    await this.loadInitialData();

    // Update user info display
    this.updateUserInfo();
    
    await this.loadHRKnowledge();
    
    // Initialize CDO cache from localStorage or fetch fresh data
    await this.apiManager.initializeCDOCache();

    // HR knowledge base is now handled server-side via RAG
    console.log('Server-side RAG system initialized');
    
    this.loadVoices(); 
    
    if (!this.userName) {
      // Get default name based on authentication
      const defaultName = this.authManager.getDefaultDisplayName();
      
      this.modalManager.showWelcomeModal((name) => {
        this.userName = name || defaultName;
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
    this.startSuggestedQuestionsInterval(); 
    
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
    
    console.log('Cindy CDO Assistant initialized successfully!');
    this.showToast('Ready to assist with your CDO questions!', 'success');
  }

  // NEW ASYNC LOAD METHOD
  async loadInitialData() {
      const storedData = await this.dataSyncManager.loadAll();
      this.chats = storedData.chats;
      this.currentConversation = storedData.currentConversation;
      this.activeChatIndex = storedData.activeChatIndex;
      this.historyCollapsed = storedData.historyCollapsed;
      this.userName = storedData.userName;
      this.hasConversation = this.currentConversation.length > 0;
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
    this.dataSyncManager.saveToStorage({ // RENAMED
      currentConversation: this.currentConversation,
      chats: this.chats,
      activeChatIndex: this.activeChatIndex,
      historyCollapsed: this.historyCollapsed,
      userName: this.userName
    });
  }
  
  // --- REST OF APP.JS (UNCHANGED LOGIC) ---
  
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

  updateUserInfo() {
    const userType = this.authManager.getUserType();
    const email = this.authManager.getUserEmail();
    const username = this.authManager.getUsername();
    
    if (this.elements.userDisplayName && this.elements.userTypeLabel) {
      if (userType === 'employee' && email) {
        // Display email or username for employees
        this.elements.userDisplayName.textContent = username || email;
        this.elements.userTypeLabel.textContent = 'Employee';
      } else {
        // Guest user
        this.elements.userDisplayName.textContent = 'Guest';
        this.elements.userTypeLabel.textContent = 'Guest User';
      }
    }
  }

  
  handleLogout() {
    const userType = this.authManager.getUserType();
    const isGuest = userType === 'guest';
    
    // Different message for guest vs employee
    const message = isGuest 
      ? "Are you sure you want to logout? All your chat history will be deleted permanently."
      : "Are you sure you want to logout? Your chat history will be preserved for next time.";
    
    this.modalManager.showModal({
      title: "Logout",
      message: message,
      inputValue: null,
      confirmText: "Logout",
      confirmClass: "delete",
      onConfirm: () => {
        // Show loading state in modal
        const confirmBtn = this.elements.modalConfirm;
        const originalText = confirmBtn.textContent;
        confirmBtn.textContent = 'Logging out...';
        confirmBtn.disabled = true;
        
        // Stop any ongoing speech
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        
        // Clear intervals
        this.stopGreetingUpdateInterval();
        this.stopSuggestedQuestionsInterval();
        
        // CRITICAL: Don't save to storage before logout for guests
        if (isGuest) {
          console.log('🚫 Skipping save to storage for guest logout');
          // Don't call this.saveToStorage() for guests
        }
        
        // Logout from auth manager (this will clear guest data automatically)
        this.authManager.logout();
        
        // Show appropriate toast message
        const toastMessage = isGuest 
          ? 'Logged out. Guest data cleared.' 
          : 'Logged out successfully';
        
        this.showToast(toastMessage, 'success');
        
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1000);
      }
    });
  }

  // Delegate methods to appropriate managers
  askQuestion() {
    this.stopSuggestedQuestionsInterval(); 
    const wasVoiceInput = this.isVoiceInput;
    this.isVoiceInput = false; // Reset flag immediately
    return this.chatManager.askQuestion(wasVoiceInput);
  }

  loadChat(index) {
    this.stopSuggestedQuestionsInterval(); 
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
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.uiManager.hideMicStopSpeakingMode(); 
    }
    
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
    const micBtn = this.elements.micBtn; // Get mic button
    
    input.parentNode.insertBefore(inputWrapper, input);
    
    if (micBtn) { // Move mic button inside wrapper
      inputWrapper.appendChild(micBtn);
    }
    inputWrapper.appendChild(input); // Move input inside wrapper
    
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
    const container = document.createElement('div');
    container.className = 'suggested-questions';
    
    // Use the class property
    const selectedQuestions = this.getRandomQuestions(this.questionCategories, 6);
    
    selectedQuestions.forEach(question => {
      const button = document.createElement('button');
      button.className = 'suggested-question';
      button.textContent = question;
      button.type = 'button';
      
      button.addEventListener('click', () => {
        this.elements.chatInput.value = question;
        this.updateCharacterCount();
        this.isVoiceInput = false; 
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

  // --- NEW: Function to rotate questions ---
  rotateSuggestedQuestions() {
    const container = this.elements.welcomeDiv.querySelector('.suggested-questions');
    if (!container) return; // Failsafe

    container.classList.add('fading'); // Start fade-out

    setTimeout(() => {
      // 1. Get new questions
      const selectedQuestions = this.getRandomQuestions(this.questionCategories, 6);
      
      // 2. Clear old buttons
      container.innerHTML = ''; 

      // 3. Create new buttons
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

      // 4. Fade back in
      container.classList.remove('fading');
    }, 500); // This MUST match the CSS transition duration (0.5s)
  }

  // --- NEW: Function to start the timer ---
  startSuggestedQuestionsInterval() {
    // Clear any existing one first
    this.stopSuggestedQuestionsInterval();
    // Start a new one
    this.suggestedQuestionsInterval = setInterval(() => {
      // Only rotate if we are on the welcome screen
      if (!this.hasConversation) {
        this.rotateSuggestedQuestions();
      }
    }, 10000); // 10 seconds
  }

  // --- NEW: Function to stop the timer ---
  stopSuggestedQuestionsInterval() {
    if (this.suggestedQuestionsInterval) {
      clearInterval(this.suggestedQuestionsInterval);
      this.suggestedQuestionsInterval = null;
    }
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

  lockBodyScroll() {
      if (window.innerWidth <= 768) {
        this.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${this.scrollPosition}px`;
        document.body.style.width = '100%';
      }
    }

    unlockBodyScroll() {
      if (window.innerWidth <= 768) {
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('width');
        window.scrollTo(0, this.scrollPosition);
    }
  }

  setupEventListeners() {
    const { chatInput, sendBtn, newChatBtn, sidebarToggle, mobileMenuToggle, overlay, inputForm, micBtn, logoutBtn } = this.elements;

    // Logout button
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        this.handleLogout();
      });
    }

    // Form submission
    inputForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.isVoiceInput = false; 
      this.askQuestion();
    });

    // Send/Stop button
    sendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.isLoading) {
        this.stopGeneration();
      } else {
        this.isVoiceInput = false; 
        this.askQuestion();
      }
    });

    // Enter key to send
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!this.isLoading) {
          this.isVoiceInput = false; 
          this.askQuestion();
        }
      }
    });

    // New chat button
    newChatBtn.addEventListener("click", () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        this.uiManager.hideMicStopSpeakingMode(); 
      }
      
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
      this.startSuggestedQuestionsInterval(); 
    });

    // === MODIFIED: Sidebar toggle (desktop) ===
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        if (window.innerWidth > 768) {
          this.elements.sidebar.classList.toggle("minimized");
          const isMinimized = this.elements.sidebar.classList.contains("minimized");
          
          // Update ARIA label
          sidebarToggle.setAttribute("aria-label", isMinimized ? "Expand sidebar" : "Minimize sidebar");
          
          // Tooltip logic (still valid)
          const existingTooltip = sidebarToggle.querySelector('.tooltip');
          if (existingTooltip) existingTooltip.remove();
          this.modalManager.addTooltip(sidebarToggle, isMinimized ? 'Expand sidebar' : 'Minimize sidebar', 'right');
          
          if (!isMinimized) {
            this.modalManager.removeSidebarTooltips();
            this.uiManager.closeHistoryDropdown(); 
          } else {
            this.uiManager.addButtonTooltips();
          }
        }
      });
    }

    // === MODIFIED: Logo click to expand when minimized ===
    const logoContainer = document.querySelector(".logo-container");
    if (logoContainer) {
      logoContainer.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (window.innerWidth > 768 && this.elements.sidebar.classList.contains("minimized")) {
          this.elements.sidebar.classList.remove("minimized");
          this.uiManager.closeHistoryDropdown(); 
          
          if (sidebarToggle) {
            sidebarToggle.setAttribute("aria-label", "Minimize sidebar");
            
            // Tooltip logic (still valid)
            const existingTooltip = sidebarToggle.querySelector('.tooltip');
            if (existingTooltip) existingTooltip.remove();
            this.modalManager.addTooltip(sidebarToggle, 'Minimize sidebar', 'right');
          }
          
          this.modalManager.removeSidebarTooltips();
          
          // Add subtle animation feedback
          logoContainer.style.transform = 'scale(0.95)';
          setTimeout(() => {
            logoContainer.style.transform = '';
          }, 150);
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
        
        // ADD THESE LINES:
        if (isShowing) {
          this.lockBodyScroll();
        } else {
          this.unlockBodyScroll();
        }
      });
    }

    // Mobile header toggle
    if (this.elements.mobileHeaderToggle) {
      this.elements.mobileHeaderToggle.addEventListener("click", () => {
        const isShowing = this.elements.sidebar.classList.toggle("show");
        this.elements.overlay.classList.toggle("active");
        this.elements.mobileHeaderToggle.setAttribute("aria-expanded", isShowing.toString());
        this.uiManager.closeAllDropdowns();
        
        if (isShowing) {
          this.lockBodyScroll();
        } else {
          this.unlockBodyScroll();
        }
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
      this.unlockBodyScroll();
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

    // === MODIFIED: Resize handling ===
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

    // === REVISED: SPEECH RECOGNITION LOGIC (UNCHANGED) ===
    if (micBtn) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US'; 
        let isRecognizing = false;

        // When speech is recognized
        recognition.onresult = (event) => {
          let transcript = event.results[0][0].transcript;
          
          // --- APPLY CORRECTION ---
          transcript = this.capitalizeAndPunctuate(transcript);
          
          chatInput.value = transcript;
          this.updateCharacterCount();
          this.showToast('Voice captured! Sending...', 'success', 2000);
          
          this.isVoiceInput = true; // <-- SET THE FLAG
          this.askQuestion();
        };

        // Handle errors
        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          this.showToast(`Voice error: ${event.error}`, 'error');
        };
        
        // When recognition ends (for any reason)
        recognition.onend = () => {
          isRecognizing = false;
          micBtn.classList.remove('recording');
          micBtn.setAttribute('aria-label', 'Use voice input');
        };

        // Handle the button click
        micBtn.addEventListener('click', () => {
          
          // --- NEW: State 3 - AI is speaking, user wants to stop it ---
          if (micBtn.classList.contains('speaking-mode')) {
            if (window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
            // Manually trigger the 'onend' logic to reset the UI
            this.uiManager.hideMicStopSpeakingMode();
            return;
          }

          // --- State 2: User is listening, user wants to stop ---
          if (isRecognizing) {
            recognition.stop();
          } else {
            // --- State 1: Idle, user wants to start listening ---
            if (this.isLoading) {
              this.showToast('Please wait for the current response', 'warning');
              return;
            }
            if (window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
            
            recognition.start();
            isRecognizing = true;
            micBtn.classList.add('recording');
            micBtn.setAttribute('aria-label', 'Stop listening');
            this.showToast('Listening...', 'info', 2000);
          }
        });

      } else {
        // If browser is not supported, hide the button
        micBtn.style.display = 'none';
        console.warn('Web Speech API not supported in this browser.');
      }
    }
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
  
  loadVoices() {
    if ('speechSynthesis' in window) {
      const setVoices = () => {
        this.voices = window.speechSynthesis.getVoices();
        if (this.voices.length > 0) {
          console.log("Speech voices loaded successfully:", this.voices.length);
        } else {
          // This can happen on some browsers, they load asynchronously
          console.warn("Voices list empty, will try again on use.");
        }
      };
      
      // This event is crucial for many browsers
      window.speechSynthesis.onvoiceschanged = setVoices;
      
      // Initial attempt (for browsers that load them immediately)
      setVoices();
    }
  }

  // --- NEW: Helper function for grammar ---
  capitalizeAndPunctuate(text) {
    if (!text) return "";
  
    // 1. Trim whitespace
    let correctedText = text.trim();
  
    // 2. Capitalize the first letter
    correctedText = correctedText.charAt(0).toUpperCase() + correctedText.slice(1);
  
    // 3. Add punctuation if it's missing
    const lastChar = correctedText.slice(-1);
    if (lastChar !== '.' && lastChar !== '?' && lastChar !== '!') {
      // Simple check for a question
      const questionWords = ['what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'should', 'would', 'will'];
      const firstWord = correctedText.split(' ')[0].toLowerCase();
      
      if (questionWords.includes(firstWord)) {
        correctedText += '?';
      } else {
        correctedText += '.';
      }
    }
  
    return correctedText;
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