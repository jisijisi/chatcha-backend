// frontend/assets/js/app.js
import { CONFIG } from './config.js';
import { DataSyncManager } from './data-sync.js';
import { APIManager } from './api.js';
import { MarkdownParser } from './markdown.js';
import { MessageManager } from './messages.js';
import { ModalManager } from './modal.js';
import { UIManager } from './ui.js';
import { ChatManager } from './chat.js';
import { TTSManager } from './tts-manager.js';
import { AuthManager } from './auth.js';
import { ChartRenderer } from './chart-renderer.js'; 
import { UserIntegrationsManager } from './user-integrations.js';
import { SettingsManager } from './settings-manager.js';
import { TRANSLATIONS } from './translations.js';

class ChatApp {
  constructor() {
    this.authManager = new AuthManager();
    const isLoginPage = window.location.pathname.includes('login.html') || 
                       (window.location.pathname === '/' && !this.authManager.isAuthenticated());
    if (isLoginPage) {
      if (this.authManager.isAuthenticated()) { window.location.href = 'index.html'; return; }
      return;
    }
    if (!this.authManager.isAuthenticated()) { window.location.href = 'login.html'; return; }
    this.initializeApp();
  }

  initializeApp() {
    this.apiManager = new APIManager();
    this.apiManager.setAuthManager(this.authManager);
    this.dataSyncManager = new DataSyncManager(this.authManager, this.apiManager);
    this.markdownParser = new MarkdownParser();
    this.chartRenderer = new ChartRenderer();
    this.markdownParser.setChartRenderer(this.chartRenderer);
    this.apiManager.setMarkdownParser(this.markdownParser);
    this.chats = [];
    this.currentConversation = [];
    this.activeChatIndex = null;
    this.historyCollapsed = false;
    this.userName = null;
    this.hrKnowledgeBase = {};
    this.hasConversation = false;
    this.isLoading = false;
    this.currentFollowUpElement = null;
    this._scrollTimeout = null;
    this.greetingInterval = null;
    this.voices = []; 
    this.isVoiceInput = false; 
    this.suggestedQuestionsInterval = null; 
    this.currentLang = localStorage.getItem('app_language') || 'en';

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

    this.modalManager = new ModalManager(this.elements);
    this.uiManager = new UIManager(this);
    this.messageManager = new MessageManager(this);
    this.chatManager = new ChatManager(this);
    this.ttsManager = new TTSManager();
    this.userIntegrations = new UserIntegrationsManager(this);
    this.settingsManager = new SettingsManager(this);
    this.mediaQuery = window.matchMedia('(max-width: 768px)');
    this.scrollPosition = 0;
    this.startGreetingUpdateInterval();
    this.init();
  }

  async init() {
    console.log('Initializing Cindy CDO Assistant...');
    this.uiManager.updateLanguage(this.currentLang);
    
    // Load data FIRST before showing skeleton
    await this.loadInitialData();
    
    this.updateUserInfo();
    
    // CRITICAL: Check Profile Completion
    // This will trigger the custom modal with Dropdowns if user is Company Employee and missing details
    // It will also trigger for External users if they lack a Name
    await this.checkProfileOnboarding();
    
    await this.loadHRKnowledge();
    
    // Only initialize cache if we have auth
    if (this.authManager.isAuthenticated()) {
        try {
            await this.apiManager.initializeCDOCache();
            console.log('Server-side RAG system initialized');
        } catch (e) {
            console.warn('Cache init warning:', e);
        }
    }
    
    this.loadVoices(); 
    this.userIntegrations.handleOAuthReturn();
    
    // If userName is still null (e.g. guest who skipped?), show default welcome
    if (!this.userName) {
      const defaultName = this.authManager.getDefaultDisplayName();
      this.modalManager.showWelcomeModal((name) => {
        this.userName = name || defaultName;
        this.saveToStorage();
        this.uiManager.updateWelcomeMessage();
        this.updateUserInfo(); 
        const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
        this.showToast(`${t.toasts.welcomeMsg} ${this.userName}!`, 'success');
      });
    } else {
      this.uiManager.updateWelcomeMessage();
    }
    
    this.setupEventListeners();
    this.uiManager.addWelcomeAvatar();
    
    // Render history AFTER data is loaded
    this.uiManager.render();
    
    this.uiManager.initScrollToBottom();
    this.uiManager.setupDataViewModal();
    this.initCharacterCounter();
    
    const { adjustHeight, resetHeight } = this.autoResizeTextarea();
    this.resetTextareaHeight = resetHeight; 
    
    this.updateScrollButtonPosition();
    this.addSuggestedQuestions();
    this.startSuggestedQuestionsInterval(); 
    this.messageManager.initMessageActionButtons();
    this.markdownParser.initLazySyntaxHighlighting();
    this.modalManager.initializeTooltips();
    this.settingsManager.init();

    // Initialize TTS audio context on first user gesture to avoid autoplay restrictions
    const initTTSOnGesture = async () => {
      try {
        document.removeEventListener('click', initTTSOnGesture);
        await this.ttsManager.init();
        console.log('TTS Manager initialized');
      } catch (e) { console.warn('TTS init failed:', e); }
    };
    document.addEventListener('click', initTTSOnGesture);
    
    // ADD TOOLTIP TO MICROPHONE BUTTON
    if (this.elements.micBtn) {
      this.modalManager.addTooltip(this.elements.micBtn, 'Use microphone', 'bottom');
    }
    
    // ADD TOOLTIP TO SEND BUTTON
    if (this.elements.sendBtn) {
      this.modalManager.addTooltip(this.elements.sendBtn, 'Send message', 'bottom');
    }
    
    if (this.hasConversation) {
      this.chatManager.renderCurrentChat();
    } else if (this.chats.length > 0 && this.activeChatIndex !== null) {
      this.chatManager.loadChat(this.activeChatIndex);
    }
    
    this.uiManager.updateMobileHeader();
    
    document.addEventListener('streamingUpdate', (e) => {
      const { fullAnswer, chunk, isFinal, contentDiv, messageElement, plain } = e.detail;
      if (plain) {
        contentDiv.textContent = fullAnswer;
      } else {
        contentDiv.innerHTML = this.markdownParser.parseMarkdown(fullAnswer);
        this.markdownParser.applySyntaxHighlighting(contentDiv);
        if (this.markdownParser.renderCharts) {
           this.markdownParser.renderCharts(contentDiv);
        }
      }
      this.uiManager.scrollToStartOfResponse(messageElement);

      // Feed semantic final chunks into TTSManager (text-only input only)
      // REVISED: Remove this block completely to stop any implicit TTS
      /* 
      try {
        if (!plain && chunk && this.ttsManager && typeof this.ttsManager.enqueue === 'function') {
          const candidate = (chunk || '').trim();
          const isSentence = /[.!?]\s*$/.test(candidate) || isFinal;
          if (candidate && isSentence) {
            this.ttsManager.enqueue(candidate).catch(() => {});
          }
        }
      } catch (e) { console.warn('TTS feed error', e); }
      */
    });
    
    console.log('Cindy CDO Assistant initialized successfully!');
    const loader = document.getElementById('global-loader');
    if (loader) { setTimeout(() => { loader.classList.add('hidden'); }, 500); }
    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    this.showToast(t.toasts.readyMsg, 'success');
    this.subscribePermissionUpdates();
  }

  async loadInitialData() {
      // Check for auth before attempting network calls
      if (!this.authManager.isAuthenticated()) {
          console.warn('Skipping data load: User not authenticated');
          this.chats = [];
          this.currentConversation = [];
          this.activeChatIndex = null;
          return;
      }

      try {
          const storedData = await this.dataSyncManager.loadAll();
          this.chats = storedData.chats || [];
          this.historyCollapsed = storedData.historyCollapsed;
          this.userName = storedData.userName;
      } catch (e) {
          console.error('Failed to load initial data:', e);
          this.chats = [];
      }
      
      const isPageRefresh = sessionStorage.getItem('chat_tab_active');
      if (isPageRefresh) {
          const localIndex = localStorage.getItem('chat_ui_active_index');
          this.activeChatIndex = localIndex ? JSON.parse(localIndex) : null;
          
          // Validate index against loaded chats
          if (this.activeChatIndex !== null && this.chats[this.activeChatIndex]) {
             this.currentConversation = this.chats[this.activeChatIndex].conversation || [];
             this.hasConversation = true;
          } else {
             this.currentConversation = [];
             this.hasConversation = false;
             this.activeChatIndex = null;
          }
      } else {
          this.currentConversation = [];
          this.activeChatIndex = null;
          this.hasConversation = false;
          localStorage.removeItem('chat_ui_active_index');
          sessionStorage.setItem('chat_tab_active', 'true');
      }
  }

  async loadHRKnowledge() {
      this.hrKnowledgeBase = { full_content: {} };
  }

  saveToStorage() {
    this.dataSyncManager.saveToStorage({
      currentConversation: this.currentConversation,
      chats: this.chats,
      activeChatIndex: this.activeChatIndex,
      historyCollapsed: this.historyCollapsed,
      userName: this.userName
    });
    localStorage.setItem('chat_ui_active_index', JSON.stringify(this.activeChatIndex));
  }
  
  startGreetingUpdateInterval() {
    this.greetingInterval = setInterval(() => {
      if (!this.hasConversation) {
        this.uiManager.updateWelcomeMessage();
      }
    }, 60000);
  }

  subscribePermissionUpdates() {
    const email = this.authManager.getUserEmail();
    if (!email) return;
    const url = `${CONFIG.API_BASE}/permissions/stream?email=${encodeURIComponent(email)}`;
    try {
      const es = new EventSource(url);
      this._permES = es;
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'permissions_updated') {
            this.showToast('Your access permissions have been updated', 'info');
            const kbModal = document.getElementById('settings-modal');
            if (kbModal && kbModal.classList.contains('active')) {
              this.settingsManager.loadKnowledgeBase(true);
            }
          }
        } catch {}
      };
      es.onerror = () => {};
    } catch {}
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
        this.elements.userDisplayName.textContent = this.userName || username || email;
        this.elements.userTypeLabel.textContent = 'Employee';
      } else if (userType === 'external' && email) {
        // Handle External Users (Gmail/Yahoo etc)
        this.elements.userDisplayName.textContent = this.userName || username || email;
        this.elements.userTypeLabel.textContent = 'External User';
      } else {
        // Handle Anonymous Guests
        this.elements.userDisplayName.textContent = this.userName || 'Guest';
        this.elements.userTypeLabel.textContent = 'Guest User';
      }
    }
    const avatar = document.querySelector('.user-avatar');
    if (avatar) {
      const session = this.authManager.getSession();
      const nameForAvatar = this.userName || username || email || 'Guest';
      const pictureUrl = session && session.picture ? session.picture : null;
      if (pictureUrl) {
        avatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = pictureUrl;
        img.alt = nameForAvatar;
        img.referrerPolicy = 'no-referrer';
        img.loading = 'lazy';
        avatar.appendChild(img);
      } else {
        avatar.innerHTML = `<span class="initials">${(nameForAvatar || 'G').charAt(0).toUpperCase()}</span>`;
      }
    }
  }

  async checkProfileOnboarding() {
    const session = this.authManager.getSession();
    if (!session || !session.email) return;

    const email = session.email;
    // Check if domain matches company
    const isCompany = email.toLowerCase().endsWith('@cdo.com.ph'); 

    // Immediate onboarding for NEW external users based on session flag
    if (session.userType === 'external' && session.isNewUser === true) {
      const currentName = session.username || '';
      await this.showOnboardingModal({
        isCompany: false,
        currentName,
        currentDept: '',
        currentPos: ''
      });
      const updated = { ...session, username: this.userName || currentName, isNewUser: false };
      localStorage.setItem('chatcdo_session', JSON.stringify(updated));
      return;
    }

    try {
      const prof = await this.apiManager.getUserProfile(email);
      const user = prof.user;
      const exists = prof.exists;

      const needsName = !exists || !user || !user.name;
      const needsDetails = isCompany && (!user || !user.department || !user.position);

      if (needsName || needsDetails) {
        const currentName = (user && user.name) ? user.name : (session.username || '');
        await this.showOnboardingModal({ 
            isCompany, 
            currentName,
            currentDept: user ? user.department : '',
            currentPos: user ? user.position : ''
        });
      }
    } catch (e) {
      console.error("Profile check failed", e);
    }
  }

  async showOnboardingModal({ isCompany, currentName, currentDept, currentPos }) {
    return new Promise((resolve) => {
        // 1. Define Dropdown Options
        const DEPARTMENTS = [
            "Administration",
            "Finance & Accounting",
            "Human Resources",
            "Information Technology",
            "Logistics & Supply Chain",
            "Marketing",
            "Production / Manufacturing",
            "Quality Assurance",
            "Research & Development",
            "Sales",
            "Legal"
        ];

        const ROLES = [
            "Staff / Associate",
            "Analyst",
            "Specialist",
            "Supervisor",
            "Team Lead",
            "Manager",
            "Senior Manager",
            "Director",
            "Vice President",
            "Executive"
        ];

        // 2. Create Modal Elements
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.style.zIndex = '10300'; 
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.maxWidth = '450px';
        
        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `<h3>👋 Welcome to ChatCDO!</h3>`;
        
        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';
        
        let subText = "What should I call you?";
        if (isCompany) {
            subText = "Since you are a company employee, please complete your profile details.";
        }
        
        body.innerHTML = `<p>${subText}</p>`;
        
        const form = document.createElement('div');
        form.style.display = 'grid';
        form.style.gap = '15px';
        
        // --- Field: Display Name (Everyone) ---
        const nameGroup = document.createElement('div');
        nameGroup.innerHTML = `<label class="form-label" style="display:block;margin-bottom:5px;font-weight:500">Display Name *</label>`;
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-input modal-input';
        nameInput.value = currentName || '';
        nameInput.placeholder = 'e.g., Juan Dela Cruz';
        nameGroup.appendChild(nameInput);
        form.appendChild(nameGroup);
        
        let roleInput, deptInput;

        // --- Fields: Role & Dept (Company Only) ---
        if (isCompany) {
            // 1. Department Dropdown
            const deptGroup = document.createElement('div');
            deptGroup.innerHTML = `<label class="form-label" style="display:block;margin-bottom:5px;font-weight:500">Department *</label>`;
            
            deptInput = document.createElement('select'); // Select
            deptInput.className = 'form-input modal-input';
            
            // Default placeholder
            const defaultDeptOpt = document.createElement('option');
            defaultDeptOpt.value = "";
            defaultDeptOpt.textContent = "Select Department...";
            defaultDeptOpt.disabled = true;
            defaultDeptOpt.selected = !currentDept;
            deptInput.appendChild(defaultDeptOpt);

            // Populate Departments
            DEPARTMENTS.forEach(dept => {
                const opt = document.createElement('option');
                opt.value = dept;
                opt.textContent = dept;
                if (currentDept === dept) opt.selected = true;
                deptInput.appendChild(opt);
            });
            deptGroup.appendChild(deptInput);
            form.appendChild(deptGroup);

            // 2. Role/Position Dropdown
            const roleGroup = document.createElement('div');
            roleGroup.innerHTML = `<label class="form-label" style="display:block;margin-bottom:5px;font-weight:500">Job Position *</label>`;
            
            roleInput = document.createElement('select'); // Select
            roleInput.className = 'form-input modal-input';
            
            // Default placeholder
            const defaultRoleOpt = document.createElement('option');
            defaultRoleOpt.value = "";
            defaultRoleOpt.textContent = "Select Role...";
            defaultRoleOpt.disabled = true;
            defaultRoleOpt.selected = !currentPos;
            roleInput.appendChild(defaultRoleOpt);

            // Populate Roles
            ROLES.forEach(role => {
                const opt = document.createElement('option');
                opt.value = role;
                opt.textContent = role;
                if (currentPos === role) opt.selected = true;
                roleInput.appendChild(opt);
            });
            roleGroup.appendChild(roleInput);
            form.appendChild(roleGroup);
        }

        body.appendChild(form);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'modal-btn modal-btn-confirm';
        saveBtn.innerHTML = 'Let\'s Get Started! 🚀';
        
        footer.appendChild(saveBtn);
        
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Logic
        saveBtn.onclick = async () => {
            const nameVal = nameInput.value.trim();
            // Fallbacks for External Users
            const roleVal = isCompany ? roleInput.value : 'External User';
            const deptVal = isCompany ? deptInput.value : 'External';

            // Validation
            if (!nameVal) {
                alert("Please enter your name");
                return;
            }
            if (isCompany && (!roleVal || !deptVal)) {
                alert("Please select your Department and Role");
                return;
            }

            saveBtn.textContent = 'Setting up...';
            saveBtn.disabled = true;

            const email = this.authManager.getUserEmail();
            
        try {
            await this.apiManager.upsertUserProfile({
                email, 
                name: nameVal,
                department: deptVal,
                position: roleVal,
                activate: true
            });

            // Update local state
            this.userName = nameVal;
            this.updateUserInfo();
            this.uiManager.updateWelcomeMessage();
            
            // Persist session username and clear isNewUser flag
            const session = this.authManager.getSession();
            if (session) {
              const updated = { ...session, username: nameVal, isNewUser: false };
              localStorage.setItem('chatcdo_session', JSON.stringify(updated));
            }
            
            // Cleanup
            document.body.removeChild(overlay);
            const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
            this.showToast(`${t.toasts.welcomeMsg} ${this.userName}!`, 'success');
            resolve();
            } catch (err) {
                console.error(err);
                saveBtn.textContent = 'Try Again';
                saveBtn.disabled = false;
                alert("Failed to save profile. Please check connection.");
            }
        };
    });
  }
  
  handleLogout() {
    const userType = this.authManager.getUserType();
    const isGuest = userType === 'guest';
    const lang = localStorage.getItem('app_language') || 'en';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

    const message = isGuest 
      ? t.modals.logoutMessageGuest
      : t.modals.logoutMessageEmp;
    
    this.modalManager.showModal({
      title: t.modals.logoutTitle,
      message: message,
      inputValue: null,
      confirmText: t.modals.logoutConfirm,
      cancelText: t.modals.cancel,
      confirmClass: "delete",
      onConfirm: () => {
        const confirmBtn = this.elements.modalConfirm;
        confirmBtn.textContent = 'Logging out...';
        confirmBtn.disabled = true;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (this.chatManager && this.chatManager.stopAudio) this.chatManager.stopAudio();
        
        this.stopGreetingUpdateInterval();
        this.stopSuggestedQuestionsInterval();
        
        sessionStorage.removeItem('chat_tab_active'); 
        localStorage.removeItem('chat_ui_active_index');

        this.authManager.logout();
        
        const toastMessage = isGuest ? t.toasts.loggedOutGuest : t.toasts.loggedOut;
        this.showToast(toastMessage, 'success');
        
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1000);
      }
    });
  }

  askQuestion(forceVoice = false) {
    this.stopSuggestedQuestionsInterval(); 
    const wasVoiceInput = forceVoice || this.isVoiceInput;
    this.isVoiceInput = false; 
    if (this.resetTextareaHeight) this.resetTextareaHeight();
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
    this.apiManager.stopGeneration();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (this.chatManager && this.chatManager.stopAudio) {
      this.chatManager.stopAudio();
    }
    this.uiManager.hideMicStopSpeakingMode(); 
    const typingIndicator = this.elements.chatDiv.querySelector('.message.bot:last-child .typing');
    if (typingIndicator) typingIndicator.closest('.message').remove();
    this.isLoading = false;
    this.elements.sendBtn.disabled = false;
    this.elements.chatInput.disabled = false;
    this.toggleSendButton(false);
    this.elements.chatInput.focus();
    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    this.showToast(t.toasts.generationStopped, 'warning');
  }

  initCharacterCounter() {
    const counter = document.querySelector('.input-counter');
    if (!counter) return;
    this.elements.charCounter = counter;
    let counterTimeout;
    this.elements.chatInput.addEventListener('input', () => {
      clearTimeout(counterTimeout);
      counterTimeout = setTimeout(() => this.updateCharacterCount(), 50);
    });
    this.updateCharacterCount();
  }

  autoResizeTextarea() {
    const textarea = this.elements.chatInput;
    const baseHeight = 44; 
    const mobileBaseHeight = 44; 
    const maxHeight = 200;
    const adjustHeight = () => {
      const isMobile = window.innerWidth <= 768;
      const minHeight = isMobile ? mobileBaseHeight : baseHeight;
      textarea.style.height = minHeight + 'px';
      const scrollHeight = textarea.scrollHeight;
      if (scrollHeight > minHeight) {
        const newHeight = Math.min(scrollHeight, maxHeight);
        textarea.style.height = newHeight + 'px';
      }
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
      this.updateScrollButtonPosition();
    };
    let resizeTimeout;
    const debouncedAdjust = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(adjustHeight, 0);
    };
    const resetHeight = () => {
      const isMobile = window.innerWidth <= 768;
      const minHeight = isMobile ? mobileBaseHeight : baseHeight;
      textarea.style.height = minHeight + 'px';
      textarea.style.overflowY = 'hidden';
      this.updateScrollButtonPosition();
    };
    textarea.addEventListener('input', debouncedAdjust);
    textarea.addEventListener('paste', () => setTimeout(adjustHeight, 0));
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) setTimeout(adjustHeight, 0);
    });
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resetHeight();
        adjustHeight();
      }, 100);
    });
    resetHeight();
    return { adjustHeight, resetHeight };
  }
  
  updateScrollButtonPosition() {
    const scrollBtn = document.querySelector('.scroll-to-bottom');
    const inputArea = this.elements.inputForm;
    if (scrollBtn && inputArea) {
      const inputHeight = inputArea.offsetHeight;
      scrollBtn.style.bottom = `${inputHeight + 20}px`;
    }
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
    
    const currentLang = localStorage.getItem('app_language') || 'en';
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    const questions = t.suggested;
    
    const selectedQuestions = this.getRandomQuestions(questions, 6);
    
    selectedQuestions.forEach(question => {
      const button = document.createElement('button');
      button.className = 'suggested-question';
      button.textContent = question;
      button.type = 'button';
      button.addEventListener('click', () => {
        this.elements.chatInput.value = question;
        this.updateCharacterCount();
        this.isVoiceInput = false; // Explicitly disable voice mode for suggested questions
        this.askQuestion();
      });
      container.appendChild(button);
    });
    
    const existingContainer = this.elements.welcomeDiv.querySelector('.suggested-questions');
    if (existingContainer) existingContainer.remove();
    
    this.elements.welcomeDiv.appendChild(container);
  }

  rotateSuggestedQuestions() {
    const container = this.elements.welcomeDiv.querySelector('.suggested-questions');
    if (!container) return; 

    container.classList.add('fading'); 

    setTimeout(() => {
      const currentLang = localStorage.getItem('app_language') || 'en';
      const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
      const questions = t.suggested;

      const selectedQuestions = this.getRandomQuestions(questions, 6);
      container.innerHTML = ''; 

      selectedQuestions.forEach(question => {
        const button = document.createElement('button');
        button.className = 'suggested-question';
        button.textContent = question;
        button.type = 'button';
        button.addEventListener('click', () => {
        this.elements.chatInput.value = question;
        this.updateCharacterCount();
        this.isVoiceInput = false; // Explicitly disable voice mode
        this.askQuestion();
      });
        container.appendChild(button);
      });

      container.classList.remove('fading');
    }, 500); 
  }

  startSuggestedQuestionsInterval() {
    this.stopSuggestedQuestionsInterval();
    this.suggestedQuestionsInterval = setInterval(() => {
      if (!this.hasConversation) {
        this.rotateSuggestedQuestions();
      }
    }, 10000); 
  }

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
    return this.chatManager.deleteChat(index, title);
  }
  
  enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis) {
    return this.chatManager.enableInlineRename(index, currentTitle, listItem, titleSpan, ellipsis);
  }
  
  updateCorrespondingChatTitle(index, newTitle) {
    const sidebarItem = document.querySelector(`#chat-history li[data-chat-index="${index}"] .chat-title`);
    if (sidebarItem) sidebarItem.textContent = newTitle;
    const dropdownItem = document.querySelector(`#history-dropdown-list li[data-chat-index="${index}"] .chat-title`);
    if (dropdownItem) dropdownItem.textContent = newTitle;
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
    const { chatInput, sendBtn, newChatBtn, sidebarToggle, mobileMenuToggle, overlay, inputForm, micBtn } = this.elements;
    
    this.uiManager.setupUserContextMenu();
    
    const historyToggle = document.querySelector('.history-toggle');
    const historyDropdown = document.getElementById('history-dropdown');
    
    if (historyToggle && historyDropdown) {
      historyToggle.addEventListener('click', function() {
        if (!historyDropdown.classList.contains('show')) {
          historyToggle.classList.add('dropdown-open');
          document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
        } else {
          historyToggle.classList.remove('dropdown-open');
        }
      });
      historyToggle.addEventListener('mouseenter', function() {
        if (historyDropdown.classList.contains('show')) {
          const tooltip = historyToggle.querySelector('.tooltip');
          if (tooltip) tooltip.style.display = 'none';
        }
      });
    }
    
    setInterval(function() {
      const dd = document.getElementById('history-dropdown');
      if (dd && dd.classList.contains('show')) {
        document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
      }
    }, 50);

    inputForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.isVoiceInput = false; 
      this.askQuestion();
    });

    sendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.isLoading) {
        this.stopGeneration();
      } else {
        this.isVoiceInput = false; 
        this.askQuestion();
      }
    });

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!this.isLoading) {
          this.isVoiceInput = false; 
          this.askQuestion();
        }
      }
    });

    newChatBtn.addEventListener("click", () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (this.chatManager && this.chatManager.stopAudio) {
        this.chatManager.stopAudio();
      }
      this.uiManager.hideMicStopSpeakingMode(); 
      this.currentConversation = [];
      this.hasConversation = false;
      this.activeChatIndex = null;
      this.elements.chatDiv.innerHTML = "";
      this.elements.chatInput.value = "";
      if (this.resetTextareaHeight) this.resetTextareaHeight();
      this.saveToStorage();
      this.uiManager.updateUI();
      this.uiManager.updateWelcomeMessage();
      this.uiManager.highlightActiveChat();
      this.uiManager.updateMobileHeader();
      this.uiManager.closeAllDropdowns();
      this.uiManager.closeMobileSidebar();
      this.uiManager.updateScrollButton();
      const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
      this.showToast(t.toasts.startedNewChat, 'success');
      this.startSuggestedQuestionsInterval(); 
    });

    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        if (window.innerWidth > 768) {
          const contextMenu = document.getElementById('user-context-menu');
          if (contextMenu && contextMenu.classList.contains('show')) {
            contextMenu.classList.remove('show');
          }
          this.elements.sidebar.classList.toggle("minimized");
          const isMinimized = this.elements.sidebar.classList.contains("minimized");
          sidebarToggle.setAttribute("aria-label", isMinimized ? "Expand sidebar" : "Minimize sidebar");
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

    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener("click", () => {
        const isShowing = this.elements.sidebar.classList.toggle("show");
        this.elements.overlay.classList.toggle("active");
        mobileMenuToggle.setAttribute("aria-expanded", isShowing.toString());
        this.uiManager.closeAllDropdowns();
        if (isShowing) {
          this.lockBodyScroll();
        } else {
          this.unlockBodyScroll();
        }
      });
    }
    
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
    
    if (this.elements.mobileHeaderTitle) {
      this.elements.mobileHeaderTitle.addEventListener("click", () => {
        if (this.hasConversation && this.activeChatIndex !== null) {
          this.toggleMobileHeaderDropdown();
        }
      });
    }

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

    overlay.addEventListener("click", () => {
      this.elements.sidebar.classList.remove("show");
      this.elements.overlay.classList.remove("active");
      if (mobileMenuToggle) mobileMenuToggle.setAttribute("aria-expanded", "false");
      if (this.elements.mobileHeaderToggle) this.elements.mobileHeaderToggle.setAttribute("aria-expanded", "false");
      this.uiManager.closeAllDropdowns();
      this.unlockBodyScroll();
    });

    this.elements.modalCancel.addEventListener("click", () => this.modalManager.closeModal());
    this.elements.modalClose.addEventListener("click", () => this.modalManager.closeModal());
    this.elements.modalConfirm.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.modalManager.handleModalConfirm(e);
    });

    this.elements.modalOverlay.addEventListener("click", (e) => {
      if (e.target === this.elements.modalOverlay) this.modalManager.closeModal();
    });

    this.elements.modalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.modalManager.handleModalConfirm();
      } else if (e.key === "Escape") {
        this.modalManager.closeModal();
      }
    });

    const logoContainer = document.querySelector(".logo-container");
    if (logoContainer) {
      logoContainer.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.innerWidth > 768 && this.elements.sidebar.classList.contains("minimized")) {
          const contextMenu = document.getElementById('user-context-menu');
          if (contextMenu && contextMenu.classList.contains('show')) {
            contextMenu.classList.remove('show');
          }
          this.elements.sidebar.classList.remove("minimized");
          this.uiManager.closeHistoryDropdown(); 
          if (sidebarToggle) {
            sidebarToggle.setAttribute("aria-label", "Minimize sidebar");
            const existingTooltip = sidebarToggle.querySelector('.tooltip');
            if (existingTooltip) existingTooltip.remove();
            this.modalManager.addTooltip(sidebarToggle, 'Minimize sidebar', 'right');
          }
          this.modalManager.removeSidebarTooltips();
          logoContainer.style.transform = 'scale(0.95)';
          setTimeout(() => {
            logoContainer.style.transform = '';
          }, 150);
        }
      });
    }

    document.addEventListener("click", (e) => {
      const historyDropdown = document.getElementById('history-dropdown');
      if (historyDropdown && historyDropdown.classList.contains('show')) {
        document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
      }
      if (!e.target.closest(".dropdown") && !e.target.closest(".ellipsis")) {
        this.uiManager.closeAllDropdowns();
      }
      if (!e.target.closest(".mobile-header-dropdown") && !e.target.closest(".mobile-header-title")) {
        this.closeMobileHeaderDropdown();
      }
      if (!e.target.closest('.history-dropdown') && !e.target.closest('.history-toggle') && !e.target.closest('#sidebar.minimized')) {
        this.uiManager.closeHistoryDropdown();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.uiManager.closeAllDropdowns();
        this.closeMobileHeaderDropdown();
        if (this.elements.modalOverlay.classList.contains("active")) {
          this.modalManager.closeModal();
        }
      }
    });

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
            if (sidebarToggle) sidebarToggle.setAttribute("aria-label", "Minimize sidebar");
          }
          if (this.elements.mobileMenuToggle) this.elements.mobileMenuToggle.setAttribute("aria-expanded", "false");
          if (this.elements.mobileHeaderToggle) this.elements.mobileHeaderToggle.setAttribute("aria-expanded", "false");
          this.uiManager.addButtonTooltips();
        }
        this.uiManager.updateMobileHeader();
        this.uiManager.closeAllDropdowns();
        this.closeMobileHeaderDropdown();
      }, 100);
    });

    this.mediaQuery.addEventListener("change", (e) => {
      this.uiManager.updateMobileHeader();
      if (!e.matches) {
        this.uiManager.addButtonTooltips();
        this.elements.sidebar.classList.remove("show");
        this.elements.overlay.classList.remove("active");
      }
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        this.uiManager.updateMobileHeader();
      }, 100);
    });

    // VOICE RECOGNITION SETUP WITH TRANSLATIONS
    if (micBtn) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; 
        let isRecognizing = false;

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (interimTranscript) {
            chatInput.value = interimTranscript;
          }

          if (finalTranscript) {
            finalTranscript = this.capitalizeAndPunctuate(finalTranscript);
            chatInput.value = finalTranscript;
            this.updateCharacterCount();
            const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
            this.showToast(t.toasts.voiceCaptured, 'success', 2000);
            this.isVoiceInput = true; 
            this.askQuestion(true);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
          this.showToast(`${t.toasts.voiceError} ${event.error}`, 'error');
        };
        
        recognition.onend = () => {
          isRecognizing = false;
          micBtn.classList.remove('recording');
          micBtn.setAttribute('aria-label', 'Use voice input');
        };

        micBtn.addEventListener('click', () => {
          if (micBtn.classList.contains('speaking-mode')) {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (this.chatManager && this.chatManager.stopAudio) this.chatManager.stopAudio();
            this.uiManager.hideMicStopSpeakingMode();
            return;
          }
          if (isRecognizing) {
            recognition.stop();
          } else {
            if (this.isLoading) {
              const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
              this.showToast(t.toasts.pleaseWait, 'warning');
              return;
            }
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (this.chatManager && this.chatManager.stopAudio) this.chatManager.stopAudio();
            recognition.start();
            isRecognizing = true;
            micBtn.classList.add('recording');
            micBtn.setAttribute('aria-label', 'Stop listening');
            const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
            this.showToast(t.toasts.listening, 'info', 2000);
          }
        });
      } else {
        micBtn.style.display = 'none';
        console.warn('Web Speech API not supported in this browser.');
      }
    }
  }

  toggleMobileHeaderDropdown() {
    const { mobileHeaderDropdown } = this.elements;
    // Check if element exists before accessing classList
    if (mobileHeaderDropdown && mobileHeaderDropdown.classList.contains('show')) {
      this.closeMobileHeaderDropdown();
    } else {
      this.showMobileHeaderDropdown();
    }
  }

  showMobileHeaderDropdown() {
    const { mobileHeaderDropdown, mobileHeaderTitle } = this.elements;
    if (mobileHeaderDropdown) mobileHeaderDropdown.classList.add('show');
    if (mobileHeaderTitle) mobileHeaderTitle.classList.add('dropdown-active');
  }

  closeMobileHeaderDropdown() {
    const { mobileHeaderDropdown, mobileHeaderTitle } = this.elements;
    if (mobileHeaderDropdown) mobileHeaderDropdown.classList.remove('show');
    if (mobileHeaderTitle) mobileHeaderTitle.classList.remove('dropdown-active');
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
    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    this.modalManager.showModal({
      title: t.modals.renameTitle,
      message: t.modals.renameMessage,
      inputValue: chat.title,
      confirmText: t.modals.renameConfirm,
      confirmClass: "",
      onConfirm: (newName) => {
        if (newName && newName.trim() && newName !== chat.title) {
          this.chats[this.activeChatIndex].title = newName.trim();
          this.saveToStorage();
          this.uiManager.renderHistory();
          this.uiManager.updateMobileHeader();
          this.showToast(t.toasts.chatRenamed, 'success');
        } else if (!newName || !newName.trim()) {
          this.showToast(t.toasts.validChatName, 'error');
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
          console.warn("Voices list empty, will try again on use.");
        }
      };
      window.speechSynthesis.onvoiceschanged = setVoices;
      setVoices();
    }
  }

  capitalizeAndPunctuate(text) {
    if (!text) return "";
    let correctedText = text.trim();
    correctedText = correctedText.charAt(0).toUpperCase() + correctedText.slice(1);
    const lastChar = correctedText.slice(-1);
    if (lastChar !== '.' && lastChar !== '?' && lastChar !== '!') {
      const questionWords = ['what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'should', 'would', 'will'];
      const firstWord = correctedText.split(' ')[0].toLowerCase();
      if (questionWords.includes(firstWord)) correctedText += '?';
      else correctedText += '.';
    }
    return correctedText;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
  });
} else {
  window.chatApp = new ChatApp();
}
