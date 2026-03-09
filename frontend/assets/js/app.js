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
        mobileBranding: document.getElementById("mobile-branding"),
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
    
    // If userName is still null
    if (!this.userName) {
      const defaultName = this.authManager.getDefaultDisplayName();
      const isGuest = this.authManager.getUserType() === 'guest';
      
      this.modalManager.showWelcomeModal({ isGuest }, (name) => {
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

    // Initialize TTS audio context on first user gesture
    const initTTSOnGesture = async () => {
      try {
        document.removeEventListener('click', initTTSOnGesture);
        await this.ttsManager.init();
        console.log('TTS Manager initialized');
      } catch (e) { console.warn('TTS init failed:', e); }
    };
    document.addEventListener('click', initTTSOnGesture);
    
    if (this.elements.micBtn) {
      this.modalManager.addTooltip(this.elements.micBtn, 'Use microphone', 'bottom');
    }
    
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
    });
    
    console.log('Cindy CDO Assistant initialized successfully!');
    const loader = document.getElementById('global-loader');
    if (loader) { setTimeout(() => { loader.classList.add('hidden'); }, 500); }
    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    this.showToast(t.toasts.readyMsg, 'success');
    this.subscribePermissionUpdates();
  }

  async loadInitialData() {
      // Load Theme First
      await this.loadTheme();

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

  async loadTheme() {
    const theme = await this.apiManager.getActiveTheme();
    if (theme) {
      // 1. Apply Colors
      const config = theme.config || { colors: theme.colors };
      const colors = config.colors || {};
      
      this.applyThemeColors(colors);

      // 2. Apply Custom CSS (New AI System)
      this.applyCustomCss(config.custom_css);

      // 3. Apply Effects (Legacy Support)
      this.applyThemeEffect(config.effect);

      // 4. Apply Avatar Variant
      if (config.custom_avatar) {
          this.currentCustomAvatarUrl = config.custom_avatar;
      }
      this.applyAvatarVariant(config.avatar_variant);
    }
  }

  applyThemeColors(colors) {
    let css = '[data-theme="light"] {\n';
    Object.keys(colors).forEach(key => {
      // Remove inline style if it exists, to ensure our new style tag takes precedence
      document.documentElement.style.removeProperty(key);
      css += `  ${key}: ${colors[key]};\n`;
    });
    css += '}\n';

    let styleTag = document.getElementById('theme-colors-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'theme-colors-styles';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = css;
  }

  applyCustomCss(css) {
    let styleTag = document.getElementById('ai-generated-theme-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'ai-generated-theme-styles';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = css || '';
  }

  applyThemeEffect(effect) {
    // Remove existing effects
    document.body.classList.remove('effect-snow', 'effect-lights', 'effect-santa-flying', 'effect-snow-elements');
    
    if (effect && effect !== 'none') {
        // Support multiple effects separated by space or comma if needed, but for now simple string
        // The backend might return "snow santa_flying"
        const effects = effect.split(/[ ,]+/);
        effects.forEach(e => {
            if (e) document.body.classList.add(`effect-${e}`);
        });
    }
  }

  applyAvatarVariant(variant) {
    // This is a simple implementation assuming we want to add a class to a container
    // or change the default avatar image path if we had one.
    // For now, let's add a global class so CSS can target avatar frames.
    
    document.body.classList.remove('avatar-variant-christmas', 'avatar-variant-newyear', 'avatar-variant-custom');
    
    if (variant && variant !== 'default') {
        document.body.classList.add(`avatar-variant-${variant}`);
    }
    
    // For custom avatar, we might need to inject CSS variables if the URL is dynamic
    if (variant === 'custom' && this.currentCustomAvatarUrl) {
       document.documentElement.style.setProperty('--custom-avatar-url', `url('${this.currentCustomAvatarUrl}')`);
    }
    
    this.currentAvatarVariant = variant || 'default';
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

  async updateUserInfo() {
    const email = this.authManager.getUserEmail();
    const username = this.authManager.getUsername();
    
    // Default to session/local values first for immediate feedback
    const sessionType = this.authManager.getUserType();
    let displayType = 'Guest User';
    if (sessionType === 'external') displayType = 'External User';
    else if (sessionType === 'employee') displayType = 'Employee';

    if (this.elements.userDisplayName) {
        this.elements.userDisplayName.textContent = this.userName || username || email || 'Guest';
    }
    if (this.elements.userTypeLabel) {
        this.elements.userTypeLabel.textContent = displayType;
    }

    // Now FETCH the truth from the database
    if (email) {
        try {
            console.log('🔄 Fetching user profile for:', email);
            const profile = await this.apiManager.getUserProfile(email);
            console.log('📥 Profile received:', profile);
            
            if (profile && profile.user) {
                // Update display name from DB if available
                if (profile.user.name && this.elements.userDisplayName) {
                    this.elements.userDisplayName.textContent = profile.user.name;
                    this.userName = profile.user.name; // Sync local state
                }

                // Update Position/Type from DB
                if (this.elements.userTypeLabel) {
                    const dbPosition = profile.user.position;
                    const dbDept = profile.user.department;
                    console.log(`👤 DB Info - Position: ${dbPosition}, Dept: ${dbDept}`);

                    // FORCE UPDATE: Clear it first to ensure the DOM updates
                    this.elements.userTypeLabel.textContent = '';
                    
                    // Robust check: Is Employee if Dept is valid OR Position is valid (and not External/Guest)
                    const isEmployee = (dbDept && dbDept !== 'External') || 
                                     (dbPosition && dbPosition !== 'External User' && dbPosition !== 'Guest');

                    let finalType = 'External User';
                    if (isEmployee) {
                        finalType = 'Employee';
                        console.log('✅ UI Updated to: Employee (Standardized)');
                    } else {
                        console.log('✅ UI Updated to: External User');
                    }
                    this.elements.userTypeLabel.textContent = finalType;

                    // Update Session to match DB truth (Prevents "External" flash on next reload)
                    const currentSession = this.authManager.getSession();
                    const newType = isEmployee ? 'employee' : 'external';
                    
                    if (currentSession && currentSession.userType !== newType) {
                        console.log(`💾 Syncing Session UserType: ${currentSession.userType} -> ${newType}`);
                        const updatedSession = { ...currentSession, userType: newType };
                        localStorage.setItem('chatcdo_session', JSON.stringify(updatedSession));
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to fetch user profile for sidebar:', e);
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
    const isCompany = email.toLowerCase().endsWith('@cdo.com.ph'); 

    if (session.userType === 'external' && session.isNewUser === true) {
      const currentName = session.username || '';
      await this.showOnboardingModal({
        isCompany: isCompany, // Pass the detected company status
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
        // Use the unified ModalManager implementation
        this.modalManager.showWelcomeModal(
            { isCompany, currentName }, 
            async (nameVal) => {
                // This callback is triggered after user confirms (either Step 1 guest or Step 2 employee)
                // The modal.js has already validated the employee ID and set localStorage.
                
                // Retrieve the validated/selected data from localStorage
                // (Set by modal.js before calling this callback)
                const isEmployee = localStorage.getItem('is_cdo_employee') === 'yes';
                
                // If they are an employee but dept/pos are missing, use defaults
                // The backend also handles this, but we sync local state here.
                const deptVal = isEmployee ? (localStorage.getItem('user_department') || 'General') : 'External';
                const positionVal = isEmployee ? (localStorage.getItem('user_position') || 'Employee') : 'External User';
                
                const email = this.authManager.getUserEmail();
                
                try {
                    await this.apiManager.upsertUserProfile({
                        email, 
                        name: nameVal,
                        department: deptVal,
                        position: positionVal,
                        activate: true
                    });

                    this.userName = nameVal;
                    
                    const session = this.authManager.getSession();
                    if (session) {
                        const updated = { ...session, username: nameVal, isNewUser: false };
                        
                        // Explicitly update userType based on the modal selection
                        if (isEmployee) {
                            updated.userType = 'employee';
                            console.log('✅ Updating session userType to: employee');
                        } else {
                            // If user explicitly chose "No" or didn't validate as employee
                            updated.userType = 'external';
                            console.log('✅ Updating session userType to: external');
                        }
                        
                        localStorage.setItem('chatcdo_session', JSON.stringify(updated));
                    }
                    
                    // Force update UI immediately with new data
                    this.updateUserInfo();
                    this.uiManager.updateWelcomeMessage();
                    
                    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
                    this.showToast(`${t.toasts.welcomeMsg} ${this.userName}!`, 'success');
                    resolve();
                    return true; // Return true to close modal
                } catch (err) {
                    console.error(err);
                    this.showToast("Failed to save profile. Please check connection.", 'error');
                    return false; // Return false to keep modal open
                }
            }
        );
    });
  }
  
  handleLogout() {
    const userType = this.authManager.getUserType();
    const isGuest = userType === 'guest';
    const lang = localStorage.getItem('app_language') || 'en';
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

    const message = isGuest ? t.modals.logoutMessageGuest : t.modals.logoutMessageEmp;
    
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
        
        setTimeout(() => { window.location.href = 'login.html'; }, 1000);
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
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
    if (this.chatManager && this.chatManager.stopAudio) { this.chatManager.stopAudio(); }
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
    requestAnimationFrame(() => {
      const scrollBtn = document.querySelector('.scroll-to-bottom');
      const inputArea = this.elements.inputForm;
      if (scrollBtn && inputArea) {
        const inputHeight = inputArea.offsetHeight;
        scrollBtn.style.bottom = `${inputHeight + 20}px`;
      }
    });
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

    const count = this.getSuggestedCount();
    this._lastSuggestedCount = count;
    const selectedQuestions = this.getRandomQuestions(questions, count);

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

    const existingContainer = this.elements.welcomeDiv.querySelector('.suggested-questions');
    if (existingContainer) existingContainer.remove();
    this.elements.welcomeDiv.appendChild(container);

    if (!this._suggestedResizeHandler) {
      let tid = null;
      this._suggestedResizeHandler = () => {
        clearTimeout(tid);
        tid = setTimeout(() => {
          const newCount = this.getSuggestedCount();
          if (newCount !== this._lastSuggestedCount) {
            this.addSuggestedQuestions();
          }
        }, 120);
      };
      window.addEventListener('resize', this._suggestedResizeHandler);
    }
  }

  rotateSuggestedQuestions() {
    const container = this.elements.welcomeDiv.querySelector('.suggested-questions');
    if (!container) return; 

    container.classList.add('fading'); 

    setTimeout(() => {
      const currentLang = localStorage.getItem('app_language') || 'en';
      const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
      const questions = t.suggested;

      const count = this.getSuggestedCount();
      const selectedQuestions = this.getRandomQuestions(questions, count);
      container.innerHTML = '';

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

      container.classList.remove('fading');
    }, 500); 
  }

  getSuggestedCount() {
    try {
      const w = window.innerWidth || 1024;
      if (w <= 600) return 4;         
      if (w <= 900) return 6;         
      return 8;                        
    } catch (e) {
      return 4;
    }
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
    
    // Listen for Theme Updates (Live Preview)
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'UPDATE_THEME') {
        const config = event.data.config || { colors: event.data.theme };
        
        // Colors
        if (config.colors) {
            this.applyThemeColors(config.colors);
        }
        
        // Custom CSS
        this.applyCustomCss(config.custom_css);

        // Effects & Avatar
        if (config.custom_avatar) {
            this.currentCustomAvatarUrl = config.custom_avatar;
        }
        this.applyThemeEffect(config.effect);
        this.applyAvatarVariant(config.avatar_variant);
      }
    });

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
      if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
      if (this.chatManager && this.chatManager.stopAudio) { this.chatManager.stopAudio(); }
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
      // Toast notification removed
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
          setTimeout(() => { logoContainer.style.transform = ''; }, 150);
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
        recognition.maxAlternatives = 1;

        const langMap = { 'en': 'en-US', 'tl': 'fil-PH' };
        recognition.lang = langMap[this.currentLang] || 'en-US';

        let isRecognizing = false;
        let lastToggleTime = 0;

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
            
            setTimeout(() => { this.askQuestion(true); }, 100);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
          
          let errorMsg = event.error;
          if (event.error === 'no-speech') {
              errorMsg = 'No speech detected. Please try again.';
          } else if (event.error === 'network') {
              errorMsg = 'Network error. Please check your connection.';
          } else if (event.error === 'not-allowed') {
              const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
              errorMsg = isIOS 
                ? 'Microphone denied. Go to Settings > Safari > Microphone.' 
                : 'Microphone permission denied.';
          }
          
          this.showToast(`${t.toasts.voiceError}: ${errorMsg}`, 'error');
          isRecognizing = false;
          micBtn.classList.remove('recording');
        };
        
        recognition.onnomatch = (event) => {
            const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
            this.showToast('No speech matched. Please try again.', 'warning');
        };
        
        recognition.onend = () => {
          isRecognizing = false;
          micBtn.classList.remove('recording');
          micBtn.setAttribute('aria-label', 'Use voice input');
        };

        const toggleMic = (e) => {
          e.stopPropagation();

          // Debounce check for mobile compatibility
          const now = Date.now();
          if (now - lastToggleTime < 300) return;
          lastToggleTime = now;

          if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            this.showToast("Voice input requires a secure HTTPS connection.", "error", 4000);
            return;
          }

          recognition.lang = langMap[this.currentLang] || 'en-US';

          if (micBtn.classList.contains('speaking-mode')) {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (this.chatManager && this.chatManager.stopAudio) this.chatManager.stopAudio();
            this.uiManager.hideMicStopSpeakingMode();
            return;
          }

          if (isRecognizing || micBtn.classList.contains('recording')) {
            try {
                recognition.stop();
            } catch (e) {
                console.warn("Recognition stop error:", e);
            }
            // Force cleanup if flag was desynced
            if (!isRecognizing) {
                 micBtn.classList.remove('recording');
                 micBtn.setAttribute('aria-label', 'Use voice input');
            }
          } else {
            if (this.isLoading) {
              const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
              this.showToast(t.toasts.pleaseWait, 'warning');
              return;
            }
            
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (this.chatManager && this.chatManager.stopAudio) this.chatManager.stopAudio();
            
            // --- FIX FOR MOBILE START ---
            try {
                // REMOVED: recognition.abort() to preserve user gesture
                
                recognition.start();
                
                isRecognizing = true;
                micBtn.classList.add('recording');
                micBtn.setAttribute('aria-label', 'Stop listening');
                
                const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
                this.showToast(t.toasts.listening, 'info', 2000);
            } catch (err) {
                console.error("Failed to start recognition:", err);
                
                if (err.name === 'InvalidStateError') {
                    // It is already running. Sync state to true.
                    // If user clicked, they likely wanted to stop, but since we are in the 'start' block, 
                    // it means the UI showed 'stopped'. So we sync to 'recording'.
                    isRecognizing = true;
                    micBtn.classList.add('recording');
                    micBtn.setAttribute('aria-label', 'Stop listening');
                    this.showToast("Microphone is active. Tap again to stop.", "info");
                    return;
                }

                isRecognizing = false;
                micBtn.classList.remove('recording');
                
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                     const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                     const msg = isIOS ? "Microphone denied. Check Settings > Safari > Microphone." : "Microphone access denied. Check settings.";
                     this.showToast(msg, "error");
                } else if (err.name === 'SecurityError') {
                     this.showToast("Voice input requires HTTPS.", "error");
                } else {
                    // Ignore other errors
                    this.showToast(`Could not start microphone: ${err.message || 'Unknown error'}`, "error");
                }
            }
            // --- FIX FOR MOBILE END ---
          }
        };

        micBtn.onclick = toggleMic;

      } else {
        // Fallback for browsers without SpeechRecognition
        if (micBtn) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            micBtn.style.display = 'none';
            console.warn('No getUserMedia support in this browser.');
          } else {
            micBtn.style.display = '';

            let mediaRecorder = null;
            let activeStream = null;
            let audioChunks = [];

            // Helper to find supported MIME type for recording
            const getSupportedMimeType = () => {
              const types = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/ogg;codecs=opus',
                'audio/aac'
              ];
              for (const type of types) {
                if (MediaRecorder.isTypeSupported(type)) return type;
              }
              return ''; // Browser default
            };

            const startRecording = async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                activeStream = stream;
                
                const mimeType = getSupportedMimeType();
                const options = mimeType ? { mimeType } : undefined;
                
                mediaRecorder = new MediaRecorder(stream, options);
                audioChunks = [];

                mediaRecorder.ondataavailable = (ev) => {
                  if (ev.data && ev.data.size > 0) audioChunks.push(ev.data);
                };

                mediaRecorder.onstop = async () => {
                  micBtn.classList.remove('recording');
                  micBtn.setAttribute('aria-label', 'Use voice input');

                  // Use the actual mime type or fallback
                  const blobType = mediaRecorder.mimeType || mimeType || 'audio/webm';
                  const blob = new Blob(audioChunks, { type: blobType });
                  const formData = new FormData();
                  // Append with correct extension if possible, though server might inspect content
                  const ext = blobType.includes('mp4') ? 'mp4' : 
                             blobType.includes('aac') ? 'aac' : 
                             blobType.includes('ogg') ? 'ogg' : 'webm';
                  formData.append('file', blob, `recording.${ext}`);

                  try {
                    const resp = await fetch(`${CONFIG.API_BASE}/stt/transcribe`, {
                      method: 'POST',
                      body: formData
                    });
                    const data = await resp.json();
                    if (data && data.transcript) {
                      chatInput.value = data.transcript;
                      this.isVoiceInput = true;
                      setTimeout(() => this.askQuestion(true), 100);
                    } else {
                      const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
                      this.showToast('Transcription unavailable. Server received audio.', 'warning');
                    }
                  } catch (err) {
                    console.error('Failed to upload audio for transcription', err);
                    this.showToast('Could not upload audio for transcription.', 'error');
                  }

                  if (activeStream) {
                    activeStream.getTracks().forEach((t) => t.stop());
                    activeStream = null;
                  }
                };

                mediaRecorder.start();
                micBtn.classList.add('recording');
                micBtn.setAttribute('aria-label', 'Stop listening');
                const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
                this.showToast(t.toasts.listening || 'Recording...', 'info', 2000);
              } catch (err) {
                console.error('getUserMedia error:', err);
                let msg = 'Microphone access denied or unavailable.';
                
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                    msg = isIOS 
                        ? 'Microphone denied. Please check Settings > Safari > Microphone.' 
                        : 'Microphone permission denied. Please allow access.';
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    msg = 'No microphone found on this device.';
                } else if (err.name === 'NotSupportedError') {
                    msg = 'Secure context required (HTTPS) or audio recording not supported.';
                }
                
                this.showToast(msg, 'error');
              }
            };

            const stopRecording = () => {
              try {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
              } catch (e) {}
            };

            micBtn.onclick = (e) => {
              e.stopPropagation();
              if (micBtn.classList.contains('recording')) {
                stopRecording();
              } else {
                startRecording();
              }
            };
          }
        }
      }
    }
  }

  toggleMobileHeaderDropdown() {
    const { mobileHeaderDropdown } = this.elements;
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
    
    // Check if punctuation is missing
    if (lastChar !== '.' && lastChar !== '?' && lastChar !== '!') {
      const questionWords = [
        // English
        'what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'should', 'would', 'will', 'may', 'might',
        // Tagalog
        'sino', 'ano', 'kailan', 'saan', 'paano', 'bakit', 'alin', 'magkano', 'gaano', 'ilan', 'mayroon', 'pwede', 'maaari'
      ];
      
      const firstWord = correctedText.split(' ')[0].toLowerCase();
      
      // Special handling for "May" in Tagalog which can be "May" (Have/Is there) or English "May"
      if (questionWords.includes(firstWord)) {
        correctedText += '?';
      } else {
        correctedText += '.';
      }
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