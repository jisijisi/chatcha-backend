// frontend/assets/js/settings-manager.js
import { TRANSLATIONS } from './translations.js';
import { CONFIG } from './config.js';
import { validateJSON, setButtonLoading, openModal, closeModal } from './ui.js';
import { escapeHtml } from './utils.js';

export class SettingsManager {
  constructor(chatApp) {
    this.app = chatApp;
    this.modal = null;
    this.kbModal = null;
    this.currentPanel = 'general';
    this.originalProfileData = {};
    this.isMobile = window.innerWidth <= 768;
    this.systemThemeListener = null;
    
    // Knowledge Base State
    this.currentKbTab = 'docs'; 
    this.kbLoaded = false;
    this.categories = [];
    this.subcategories = []; // Added to store subcategories for safe lookup
    this.editingDocId = null;
    
    // Subcategory Editing State
    this.editingSubcatId = null;
    
    // Delete State
    this.deleteTargetId = null;
    this.deleteTargetType = null;
    this.progressEventSource = null;
  }

  init() {
    this.modal = document.getElementById('settings-modal-overlay');
    this.kbModal = document.getElementById('kb-full-modal-overlay');
    
    if (!this.modal) return;

    this.setupEventListeners();
    this.setupCacheProgressModalHandlers();
    this.setupMobileDetection();
    this.applyStoredSettings();
  }

  setupMobileDetection() {
    window.addEventListener('resize', () => {
      this.isMobile = window.innerWidth <= 768;
      this.ensureConsistentHeight();
    });
  }

  setupEventListeners() {
    // --- Standard Settings Listeners ---
    const closeBtn = document.getElementById('settings-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    this.modal.addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal-overlay') this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
          if (this.modal.classList.contains('active')) this.close();
          if (this.kbModal && this.kbModal.classList.contains('active')) this.closeKnowledgeBaseModal();
      }
    });

    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => this.switchPanel(item.getAttribute('data-panel')));
    });

    const themeBtns = document.querySelectorAll('.theme-btn');
    themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        themeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setTheme(btn.dataset.theme);
      });
    });

    const langSelect = document.getElementById('settings-language-select');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => this.setLanguage(e.target.value));
    }

    const profileForm = document.getElementById('profile-form');
    if (profileForm) profileForm.addEventListener('submit', (e) => this.saveProfile(e));

    const cancelBtn = document.getElementById('profile-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.resetProfile());

    const logoutBtn = document.getElementById('settings-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.close();
        this.app.handleLogout();
      });
    }

    const deleteAccountBtn = document.getElementById('settings-delete-account-btn');
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', () => this.handleDeleteAccount());
    }

    const sendOtpBtn = document.getElementById('settings-send-otp-btn');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener('click', () => this.handleSendOtp());
    }
    const verifyOtpBtn = document.getElementById('settings-verify-otp-btn');
    if (verifyOtpBtn) {
      verifyOtpBtn.addEventListener('click', () => this.handleVerifyOtp());
    }

    // --- Google Integration Listeners ---
    const btnConnect = document.getElementById('btn-google-connect');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => {
        if (this.app.userIntegrations) this.app.userIntegrations.initiateGoogleAuth();
      });
    }

    const btnDisconnect = document.getElementById('btn-google-disconnect');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => {
        if (this.app.userIntegrations) this.app.userIntegrations.disconnectGoogle();
      });
    }

    // --- KNOWLEDGE BASE LISTENERS ---
    
    // 1. Context Menu Button
    const kbOptionBtn = document.getElementById('kb-option');
    if (kbOptionBtn) {
        // Pre-check access and hide button if not allowed
        this.app.apiManager.hasKbSettingsAccess()
          .then(res => {
            if (!res || res.allowed !== true) {
              kbOptionBtn.style.display = 'none';
            }
          })
          .catch(() => {});
        kbOptionBtn.addEventListener('click', async (e) => {
            const contextMenu = document.getElementById('user-context-menu');
            if (contextMenu) contextMenu.classList.remove('show');
            const access = await this.app.apiManager.hasKbSettingsAccess().catch(() => ({ allowed: false }));
            if (!access || access.allowed !== true) {
              const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
              this.app.showToast('You do not have access to Knowledge Base settings', 'warning');
              return;
            }
            this.openKnowledgeBaseModal();
        });
    }

    // 2. KB Modal Close Buttons
    const kbFullClose = document.getElementById('kb-full-close');
    const kbFullCloseBtn = document.getElementById('kb-full-close-btn');
    if (kbFullClose) kbFullClose.addEventListener('click', () => this.closeKnowledgeBaseModal());
    if (kbFullCloseBtn) kbFullCloseBtn.addEventListener('click', () => this.closeKnowledgeBaseModal());

    // 3. Tab Switching
    document.querySelectorAll('.kb-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchKbTab(btn.dataset.kbTab));
    });

    // 4. Refresh & Search
    const kbRefresh = document.getElementById('kb-refresh-btn');
    if (kbRefresh) kbRefresh.addEventListener('click', () => this.loadKnowledgeBase(true));
    
    const kbSearch = document.getElementById('kb-search-input');
    if (kbSearch) kbSearch.addEventListener('input', (e) => this.filterKnowledgeBase(e.target.value));

    // 5. Actions
    const btnAddDoc = document.getElementById('btn-add-doc');
    if (btnAddDoc) btnAddDoc.addEventListener('click', () => this.openDocModal(null));

    // Fix Add Subcategory Button Binding
    const btnAddSubcat = document.getElementById('btn-add-subcat');
    if (btnAddSubcat) {
        // Remove potential duplicate listeners by cloning
        const newBtn = btnAddSubcat.cloneNode(true);
        btnAddSubcat.parentNode.replaceChild(newBtn, btnAddSubcat);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.openSubcatModal(null);
        });
    }

    const btnRegen = document.getElementById('btn-regen-cache');
    if (btnRegen) {
      btnRegen.setAttribute('type', 'button');
      btnRegen.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.handleRegenerateCache(); });
    }

    // 6. Editor Actions
    const btnCancelDoc = document.getElementById('kb-doc-cancel');
    if (btnCancelDoc) btnCancelDoc.addEventListener('click', () => this.closeDocModal());

    const btnCloseDoc = document.getElementById('kb-doc-close');
    if (btnCloseDoc) btnCloseDoc.addEventListener('click', () => this.closeDocModal());

    const btnSaveDoc = document.getElementById('kb-doc-save');
    if (btnSaveDoc) btnSaveDoc.addEventListener('click', () => this.handleSaveDocument());

    const btnConvert = document.getElementById('btn-kb-convert');
    if (btnConvert) btnConvert.addEventListener('click', () => this.handleFileConvert());

    const docCatSelect = document.getElementById('kb-doc-category');
    if (docCatSelect) docCatSelect.addEventListener('change', (e) => this.loadSubcategoriesForEditor(e.target.value));
    
    const docContent = document.getElementById('kb-doc-content');
    if (docContent) {
        docContent.addEventListener('input', (e) => {
            const val = e.target.value;
            const validIndicator = document.getElementById('kb-json-validator');
            if (validIndicator) {
                if (validateJSON(val)) {
                    validIndicator.textContent = "Valid JSON";
                    validIndicator.style.color = "green";
                    validIndicator.style.display = "block";
                } else {
                    validIndicator.textContent = "Invalid JSON";
                    validIndicator.style.color = "red";
                    validIndicator.style.display = "block";
                }
            }
        });
    }

    // 7. View Document Modal Listeners
    const kbViewClose = document.getElementById('kb-view-close');
    const kbViewCloseBtn = document.getElementById('kb-view-close-btn');
    
    if (kbViewClose) kbViewClose.addEventListener('click', () => closeModal('kb-view-modal'));
    if (kbViewCloseBtn) kbViewCloseBtn.addEventListener('click', () => closeModal('kb-view-modal'));

    // 8. Delete Confirm Modal
    const delClose = document.getElementById('kb-delete-close');
    const delCancel = document.getElementById('kb-delete-cancel');
    const delConfirm = document.getElementById('kb-delete-confirm');

    if (delClose) delClose.onclick = () => closeModal('kb-delete-confirm-modal');
    if (delCancel) delCancel.onclick = () => closeModal('kb-delete-confirm-modal');
    if (delConfirm) delConfirm.onclick = () => this.confirmDeleteAction();

    // 9. Subcategory Modal Actions
    const subClose = document.getElementById('kb-subcat-close');
    const subCancel = document.getElementById('kb-subcat-cancel');
    const subSave = document.getElementById('kb-subcat-save');

    if (subClose) subClose.onclick = () => closeModal('kb-subcat-modal');
    if (subCancel) subCancel.onclick = () => closeModal('kb-subcat-modal');
    if (subSave) {
        const newSave = subSave.cloneNode(true);
        subSave.parentNode.replaceChild(newSave, subSave);
        newSave.onclick = (e) => {
            e.preventDefault();
            this.saveSubcategory();
        };
    }
  }

  async handleSendOtp() {
    const emailInput = document.getElementById('settings-email-login');
    const passwordInput = document.getElementById('settings-password-login');
    const otpGroup = document.getElementById('settings-otp-group');
    const verifyActions = document.getElementById('settings-verify-actions');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
      this.app.showToast('Enter a valid email', 'error');
      return;
    }
    const res = await this.app.apiManager.requestOtp(email);
    if (res && res.success) {
      this.app.showToast('OTP sent to email', 'success');
      if (otpGroup) otpGroup.style.display = 'block';
      if (verifyActions) verifyActions.style.display = 'flex';
    } else {
      this.app.showToast(res?.message || 'Failed to send OTP', 'error');
    }
  }

  async handleVerifyOtp() {
    const emailInput = document.getElementById('settings-email-login');
    const otpInput = document.getElementById('settings-otp-code');
    const email = emailInput ? emailInput.value.trim() : '';
    const code = otpInput ? otpInput.value.trim() : '';
    if (!email || !code) {
      this.app.showToast('Enter email and OTP', 'error');
      return;
    }
    const res = await this.app.apiManager.verifyOtp(email, code);
    if (res && res.success) {
      const username = email.split('@')[0];
      const resolvedType = (res.user && res.user.type) ? res.user.type : (res.is_company_email ? 'employee' : 'external');
      const session = {
        userType: resolvedType,
        email: email,
        username: username,
        authMethod: 'otp',
        loginTime: new Date().toISOString()
      };
      localStorage.setItem('chatcdo_session', JSON.stringify(session));
      this.app.showToast('Signed in', 'success');
      this.app.updateUserInfo();
    } else {
      this.app.showToast(res?.message || 'Verification failed', 'error');
    }
  }

  // ... (applyStoredSettings, setTheme, setLanguage, updateSettingsText, setText, safeUpdateText, open, close... KEEP AS IS)
  applyStoredSettings() {
    const storedTheme = localStorage.getItem('app_theme') || 'system';
    this.setTheme(storedTheme, false);
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
      if (btn.dataset.theme === storedTheme) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    const storedLang = localStorage.getItem('app_language') || 'en';
    const langSelect = document.getElementById('settings-language-select');
    if (langSelect) langSelect.value = storedLang;
    
    if (this.app.uiManager) {
        this.app.uiManager.updateLanguage(storedLang);
    }
    
    this.updateSettingsText(storedLang);
  }

  setTheme(theme, save = true) {
    if (save) localStorage.setItem('app_theme', theme);

    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    if (this.systemThemeListener) {
      mediaQuery.removeEventListener('change', this.systemThemeListener);
      this.systemThemeListener = null;
    }

    if (theme === 'system') {
      const applySystemTheme = (e) => {
        const isDark = e.matches;
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
      };
      applySystemTheme(mediaQuery);
      this.systemThemeListener = applySystemTheme;
      mediaQuery.addEventListener('change', this.systemThemeListener);
    } else {
      root.setAttribute('data-theme', theme);
    }
    
    if (save) {
      const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
      this.app.showToast(`${t.toasts.themeSet} ${theme}`, 'success');
    }
  }

  setLanguage(lang) {
    localStorage.setItem('app_language', lang);
    if (this.app.uiManager) {
        this.app.uiManager.updateLanguage(lang);
    }
    this.updateSettingsText(lang);
    
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const langName = lang === 'en' ? 'English' : 'Tagalog';
    this.app.showToast(`${t.toasts.langSet} ${langName}`, 'success');
  }

  updateSettingsText(lang) {
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
    const s = t.settings;

    const headerTitle = document.querySelector('.settings-header h2');
    if (headerTitle) headerTitle.textContent = s.header;

    this.safeUpdateText('.settings-nav-item[data-panel="general"]', s.nav.general);
    this.safeUpdateText('.settings-nav-item[data-panel="profile"]', s.nav.profile);
    this.safeUpdateText('.settings-nav-item[data-panel="integration"]', s.nav.integration);
    this.safeUpdateText('.settings-nav-item[data-panel="about"]', s.nav.about);

    const generalPanel = document.getElementById('settings-general');
    if (generalPanel) {
        const sections = generalPanel.querySelectorAll('.settings-section-title');
        if (sections[0]) sections[0].textContent = s.general.appearance;
        if (sections[1]) sections[1].textContent = s.general.language;
        
        const labels = generalPanel.querySelectorAll('.settings-item-label');
        if (labels[0]) labels[0].textContent = s.general.theme;
        if (labels[1]) labels[1].textContent = s.general.interfaceLang;
    }
    
    this.setText('.theme-btn[data-theme="system"]', s.general.themeSystem);
    this.setText('.theme-btn[data-theme="light"]', s.general.themeLight);
    this.setText('.theme-btn[data-theme="dark"]', s.general.themeDark);
    
    const profilePanel = document.getElementById('settings-profile');
    if (profilePanel) {
        const titles = profilePanel.querySelectorAll('.settings-section-title');
        if (titles[0]) titles[0].textContent = s.profile.infoTitle;
        if (titles[1]) titles[1].textContent = s.profile.actionsTitle;
        
        const labels = profilePanel.querySelectorAll('.form-label');
        if (labels[0]) labels[0].textContent = s.profile.displayName;
        if (labels[1]) labels[1].textContent = s.profile.email;
        if (labels[2]) labels[2].textContent = s.profile.phone;
        
        const actionLabels = profilePanel.querySelectorAll('.settings-item-label');
        if (actionLabels[0]) actionLabels[0].textContent = s.profile.logoutAll;
        if (actionLabels[1]) actionLabels[1].textContent = s.profile.deleteAccount;
        
        this.setText('#profile-cancel-btn', s.profile.buttons.discard);
        this.setText('#profile-form button[type="submit"]', s.profile.buttons.save);
        this.setText('#settings-logout-btn', s.profile.buttons.logout);
        this.setText('#settings-delete-account-btn', s.profile.buttons.delete);
    }

    const intPanel = document.getElementById('settings-integration');
    if (intPanel) {
        this.setText('#settings-integration .settings-section-title', s.integration.title);
        this.setText('.integration-details h4', s.integration.googleTitle);
        this.setText('.integration-details p', s.integration.googleDesc);
        
        const btnConnect = document.getElementById('btn-google-connect');
        if (btnConnect) btnConnect.textContent = btnConnect.classList.contains('btn-connected-state') ? s.integration.btnConnected : s.integration.btnConnect;
        
        this.setText('#btn-google-disconnect', s.integration.btnDisconnect);
    }

    const kbModal = document.getElementById('kb-full-modal-overlay');
    if (kbModal && t.settings.knowledge) {
      this.setText('#kb-full-title', t.settings.knowledge.title);
      const searchInput = document.getElementById('kb-search-input');
      if (searchInput) searchInput.placeholder = t.settings.knowledge.searchPlaceholder;
      this.safeUpdateText('#kb-refresh-btn', t.settings.knowledge.actions.refresh);
      this.safeUpdateText('#btn-add-doc', t.settings.knowledge.actions.addDoc);
      this.safeUpdateText('#btn-add-subcat', t.settings.knowledge.actions.addSubcat);
      this.safeUpdateText('#btn-regen-cache', t.settings.knowledge.actions.regenCache);

      const k = t.settings.knowledge.addDoc;
      this.setText('#kb-doc-modal-title', k.title);
      const aiLabel = document.querySelector('.file-upload-label span:first-child');
      if (aiLabel) aiLabel.textContent = k.aiLabel;
      
      this.safeUpdateText('#btn-kb-convert', k.uploadBtn);
      
      const labelTitle = document.querySelector('label[for="kb-doc-title"]');
      if (labelTitle) labelTitle.textContent = k.docTitle;
      
      const labelCat = document.querySelector('label[for="kb-doc-category"]');
      if (labelCat) labelCat.textContent = k.category;
      
      const labelSub = document.querySelector('label[for="kb-doc-subcategory"]');
      if (labelSub) labelSub.textContent = k.subcategory;
      
      const labelContent = document.querySelector('label[for="kb-doc-content"]');
      if (labelContent) labelContent.textContent = k.content;
      
      this.setText('#kb-doc-save', k.save);
      this.setText('#kb-doc-cancel', k.cancel);
    }

    const aboutPanel = document.getElementById('settings-about');
    if (aboutPanel) {
        const aboutContent = aboutPanel.querySelector('.about-content');
        if (aboutContent) {
           const h3s = aboutContent.querySelectorAll('h3');
           const ps = aboutContent.querySelectorAll('p');
           
           if(h3s[0]) h3s[0].textContent = s.about.title;
           if(ps[0]) ps[0].textContent = s.about.desc;
           
           if(h3s[1]) h3s[1].textContent = s.about.version;
           
           if(h3s[2]) h3s[2].textContent = s.about.featuresTitle;
           if(ps[2]) ps[2].innerHTML = s.about.featuresList;
           
           if(h3s[3]) h3s[3].textContent = s.about.supportTitle;
           if(ps[3]) ps[3].innerHTML = s.about.supportDesc;
           
           if(h3s[4]) h3s[4].textContent = s.about.legalTitle;
           if(ps[4]) {
               const links = ps[4].querySelectorAll('a');
               if (links[0]) links[0].textContent = s.about.privacy;
               if (links[1]) links[1].textContent = s.about.terms;
           }
        }
    }
  }
  
  setText(selector, text) {
      const el = document.querySelector(selector);
      if (el) el.textContent = text;
  }
  
  safeUpdateText(selector, text) {
      const el = document.querySelector(selector);
      if (el) {
          const icon = el.querySelector('svg');
          el.innerHTML = '';
          if (icon) el.appendChild(icon);
          el.appendChild(document.createTextNode(' ' + text));
      }
  }

  // --- SETTINGS MODAL CONTROL ---
  open() {
    this.loadUserData();
    this.configureRoleBasedAccess();
    
    const lang = localStorage.getItem('app_language') || 'en';
    this.updateSettingsText(lang);
    
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    this.ensureConsistentHeight();
  }

  close() {
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // --- KNOWLEDGE BASE MODAL CONTROL ---
  openKnowledgeBaseModal() {
    if (this.kbModal) {
      this.kbModal.classList.add('active');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => this.loadKnowledgeBase());
    }
  }

  closeKnowledgeBaseModal() {
    if (this.kbModal) {
      this.kbModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  configureRoleBasedAccess() {
    const userType = this.app.authManager.getUserType(); 
    const isGuest = userType === 'guest';
    const integrationTab = document.querySelector('.settings-nav-item[data-panel="integration"]');
    if (integrationTab) {
      integrationTab.style.display = isGuest ? 'none' : '';
      if (isGuest && this.currentPanel === 'integration') this.switchPanel('general');
    }
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    if (isGuest) {
      if (profileEmail) { profileEmail.disabled = true; profileEmail.value = 'Guest Session'; }
      if (profilePhone) { profilePhone.disabled = true; profilePhone.placeholder = "Not available for guests"; }
    } else {
      if (profileEmail) profileEmail.disabled = true; 
      if (profilePhone) { profilePhone.disabled = false; profilePhone.placeholder = "Enter your phone number"; }
    }
    const logoutBtn = document.getElementById('settings-logout-btn');
    if (logoutBtn) {
      const actionsSection = logoutBtn.closest('.settings-section');
      if (actionsSection) actionsSection.style.display = isGuest ? 'none' : 'block';
    }
  }

  switchPanel(panelName) {
    document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    
    const navItem = document.querySelector(`[data-panel="${panelName}"]`);
    const panel = document.getElementById(`settings-${panelName}`);
    if (navItem) navItem.classList.add('active');
    if (panel) panel.classList.add('active');
    
    this.currentPanel = panelName;
    this.ensureConsistentHeight();
  }

  ensureConsistentHeight() {
    const modal = document.querySelector('.settings-modal');
    if (modal) {
      if (!this.isMobile) {
        modal.style.height = '600px';
        modal.style.maxHeight = '85vh';
      } else {
        modal.style.height = '';
        modal.style.maxHeight = '';
      }
    }
  }

  loadUserData() {
    const email = this.app.authManager.getUserEmail();
    const username = this.app.authManager.getUsername();
    const profileName = document.getElementById('profile-display-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    if (profileName) {
      profileName.value = this.app.userName || username || '';
      this.originalProfileData.name = profileName.value;
    }
    if (profileEmail && email) profileEmail.value = email;
    if (profilePhone) this.originalProfileData.phone = profilePhone.value;
  }

  async saveProfile(event) {
    event.preventDefault();
    const displayName = document.getElementById('profile-display-name').value.trim();
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    
    if (!displayName) {
      this.app.showToast(t.toasts.nameCannotEmpty, 'error');
      return;
    }
    if (displayName !== this.originalProfileData.name) {
      const userType = this.app.authManager.getUserType();
      const oldName = this.app.userName;
      this.app.userName = displayName;
      this.app.updateUserInfo();
      this.app.uiManager.updateWelcomeMessage();
      this.app.saveToStorage();

      if (userType === 'employee' || userType === 'external') {
        const email = this.app.authManager.getUserEmail();
        try {
          const success = await this.app.apiManager.updateUserName(email, displayName);
          if (success) {
            this.app.showToast(t.toasts.profileUpdated, 'success');
            this.originalProfileData.name = displayName;
          } else {
            throw new Error('Server update failed');
          }
        } catch (error) {
          this.app.userName = oldName;
          this.app.updateUserInfo();
          this.app.saveToStorage();
          this.app.showToast(t.toasts.profileUpdateFailed, 'error');
          return;
        }
      } else {
        this.app.showToast(t.toasts.profileLocalOnly, 'success');
      }
    } else {
      this.app.showToast(t.toasts.profileSaved, 'success');
    }
    this.app.chatManager.renderCurrentChat();
  }

  resetProfile() {
    const profileName = document.getElementById('profile-display-name');
    const profilePhone = document.getElementById('profile-phone');
    if (profileName) profileName.value = this.originalProfileData.name || '';
    if (profilePhone) profilePhone.value = this.originalProfileData.phone || '';
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    this.app.showToast(t.toasts.changesDiscarded, 'info');
  }

  handleDeleteAccount() {
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const email = this.app.authManager.getUserEmail();
    if (!email) {
      this.app.showToast('No authenticated user', 'error');
      return;
    }
    this.app.modalManager.showModal({
      title: t.modals.deleteAccountTitle || 'Delete Account',
      message: t.modals.deleteAccountMessage || 'This will permanently delete your account and data.\n\nType your email or DELETE to confirm:',
      inputValue: '',
      confirmText: t.modals.deleteAccountConfirm || 'Delete Account',
      cancelText: t.modals.cancel || 'Cancel',
      confirmClass: 'delete',
      onConfirm: async (value) => {
        const v = (typeof value === 'string') ? value.trim() : '';
        const isValid = v && (v.toLowerCase() === email.toLowerCase() || v.toUpperCase() === 'DELETE');
        if (!isValid) {
          this.app.showToast('Please type your email or DELETE to confirm.', 'warning');
          return false;
        }
        try {
          const res = await this.app.apiManager.deleteAccount(email);
          if (res && res.success) {
            this.app.showToast('Account deleted', 'success');
            this.app.authManager.logout();
            window.location.href = 'login.html';
          } else {
            this.app.showToast(res?.error || 'Failed to delete account', 'error');
          }
        } catch {
          this.app.showToast('Failed to delete account', 'error');
        }
      }
    });
  }

  // =========================================================================
  // KNOWLEDGE BASE LOGIC (REVISED)
  // =========================================================================

  async loadKnowledgeBase(forceRefresh = false) {
    this.loadCacheStatus();

    if (this.currentKbTab === 'docs') {
      await this.loadDocumentsList();
    } else {
      await this.loadSubcategoriesList();
    }
    
    if (forceRefresh) {
        const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
        this.app.showToast(t.toasts.kbRefreshed, 'success');
    }
  }

  async loadCacheStatus() {
    try {
      const data = await this.app.apiManager.getDatabaseStats(); 
      const dot = document.querySelector('.status-dot');
      const text = document.querySelector('.status-text');
      const meta = document.querySelector('.kb-status-meta');
      
      if (data && data.success) {
        if (dot) dot.className = 'status-dot green';
        if (text) text.textContent = 'Active';
        if (meta) {
            meta.innerHTML = `
              <span><strong>${data.knowledge_base_files || 0}</strong> Files</span>
              <span><strong>${data.chunks_count || 0}</strong> Chunks</span>
            `;
        }
      }
    } catch (e) { console.error('Stats error', e); }
  }

  switchKbTab(tabName) {
    this.currentKbTab = tabName;
    
    document.querySelectorAll('.kb-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-kb-tab="${tabName}"]`)?.classList.add('active');
    
    document.querySelectorAll('.kb-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`kb-tab-${tabName}`)?.classList.add('active');

    this.loadKnowledgeBase();
  }

  async loadDocumentsList() {
    const tbody = document.getElementById('kb-docs-list-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="kb-loading">Loading documents...</td></tr>`;

    try {
      const data = await this.app.apiManager.getDocuments(); 
      const docs = data.documents || [];

      if (docs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No documents found.</td></tr>`;
        return;
      }

      tbody.innerHTML = docs.map(doc => `
        <tr class="kb-doc-row">
          <td><strong>${escapeHtml(doc.title)}</strong></td>
          <td>${escapeHtml(doc.category_name || 'General')} &rarr; ${escapeHtml(doc.subcategory_name || 'Others')}</td>
          <td><span class="kb-badge ${doc.status}">${doc.status}</span></td>
          <td class="kb-actions-cell">
            <button class="kb-action-btn view" onclick="window.chatApp.settingsManager.handleViewDocument(${doc.id})" title="View Content">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="kb-action-btn edit" onclick="window.chatApp.settingsManager.openDocModal(${doc.id})" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="kb-action-btn delete" onclick="window.chatApp.settingsManager.handleDeleteDocument(${doc.id})" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center; padding:20px;">Error loading documents.</td></tr>`;
    }
  }

  async loadSubcategoriesList() {
    const tbody = document.getElementById('kb-subcats-list-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" class="kb-loading">Loading subcategories...</td></tr>`;

    try {
      const data = await this.app.apiManager.getSubcategories();
      this.subcategories = data.subcategories || []; // Store for lookup

      if (this.subcategories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">No subcategories found.</td></tr>`;
        return;
      }

      // UPDATED: Use safe helper method for Edit action
      tbody.innerHTML = this.subcategories.map(sub => `
        <tr>
          <td><strong>${escapeHtml(sub.name)}</strong></td>
          <td>${escapeHtml(sub.category_name)}</td>
          <td class="kb-actions-cell">
            <button class="kb-action-btn edit" onclick="window.chatApp.settingsManager.prepareEditSubcategory(${sub.id})" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="kb-action-btn delete" onclick="window.chatApp.settingsManager.handleDeleteSubcategory(${sub.id})" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="3" style="color:red; text-align:center;">Error loading subcategories: ${e.message}</td></tr>`;
    }
  }
  
  // NEW: Safe helper to prepare edit
  prepareEditSubcategory(id) {
      const sub = this.subcategories.find(s => s.id === id);
      if (sub) {
          this.openSubcatModal(sub.id, sub.name, sub.category_id, sub.description || '');
      }
  }

  filterKnowledgeBase(query) {
    const container = document.getElementById('kb-docs-list-body');
    if (!container) return;
    
    const lowerQuery = query.toLowerCase();
    const rows = container.querySelectorAll('tr');

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(lowerQuery) ? '' : 'none';
    });
  }

  // --- NEW: View Document Handler ---
  async handleViewDocument(id) {
    try {
      document.getElementById('kb-view-title').textContent = "Loading...";
      document.getElementById('kb-view-content').textContent = "Fetching document details...";
      openModal('kb-view-modal');

      const res = await this.app.apiManager.getDocument(id);
      if (res.document) {
        const doc = res.document;
        
        document.getElementById('kb-view-title').textContent = doc.title;
        document.getElementById('kb-view-category').textContent = `${doc.category_name} / ${doc.subcategory_name}`;
        
        const statusEl = document.getElementById('kb-view-status');
        statusEl.textContent = doc.status;
        statusEl.className = `kb-badge ${doc.status}`; 
        
        let content = doc.content;
        if (typeof content === 'object') {
          content = JSON.stringify(content, null, 2);
        }
        document.getElementById('kb-view-content').textContent = content;
      }
    } catch (e) {
      console.error(e);
      document.getElementById('kb-view-content').textContent = "Error loading document.";
      this.app.showToast('Failed to load document', 'error');
    }
  }

  // UPDATED: Open Document Modal (not overlay)
  openDocModal(id = null) {
      this.editingDocId = id;
      console.log(`Opening Doc Modal. Edit Mode: ${id ? 'Yes' : 'No'}`);
      
      const title = document.getElementById('kb-doc-modal-title');
      const tInput = document.getElementById('kb-doc-title');
      const cInput = document.getElementById('kb-doc-content');
      const fInput = document.getElementById('kb-file-upload');
      
      if (title) title.textContent = id ? 'Edit Document' : 'Add Document';
      
      if (!id) {
          if(tInput) tInput.value = '';
          if(cInput) cInput.value = '';
          if(fInput) fInput.value = '';
          requestAnimationFrame(() => this.loadCategoriesForEditor());
      } else {
          requestAnimationFrame(() => this.handleEditDocument(id));
      }
      
      openModal('kb-doc-modal');
  }
  
  closeDocModal() {
      closeModal('kb-doc-modal');
      this.editingDocId = null;
  }

  async loadCategoriesForEditor(targetSelectId = 'kb-doc-category') {
    const catSelect = document.getElementById(targetSelectId);
    if (!catSelect) return;

    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    
    catSelect.innerHTML = `<option value="">Loading...</option>`;
    
    const data = await this.app.apiManager.getCategories();
    this.categories = data.categories || [];
    
    catSelect.innerHTML = `<option value="">Select Category...</option>` + 
      this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      
    // Reset subcat if doc editor
    if (targetSelectId === 'kb-doc-category') {
        const subSelect = document.getElementById('kb-doc-subcategory');
        if (subSelect) {
          subSelect.innerHTML = `<option value="">${t.settings.knowledge.addDoc.selectCatFirst}</option>`;
          subSelect.disabled = true;
        }
    }
  }

  async loadSubcategoriesForEditor(categoryId, selectedSubId = null) {
    const subSelect = document.getElementById('kb-doc-subcategory');
    if (!subSelect) return;

    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    
    if (!categoryId) {
      subSelect.innerHTML = `<option value="">${t.settings.knowledge.addDoc.selectCatFirst}</option>`;
      subSelect.disabled = true;
      return;
    }
    
    subSelect.disabled = false;
    subSelect.innerHTML = '<option value="">Loading...</option>';
    
    const data = await this.app.apiManager.getSubcategories(categoryId);
    const subs = data.subcategories || [];
    
    subSelect.innerHTML = `<option value="">${t.settings.knowledge.addDoc.selectSub}</option>` + 
      subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      
    if (selectedSubId) {
        subSelect.value = selectedSubId;
    }
  }

  async handleEditDocument(id) {
    try {
      const res = await this.app.apiManager.getDocument(id);
      if (res.document) {
        const doc = res.document;
        const titleInput = document.getElementById('kb-doc-title');
        const contentInput = document.getElementById('kb-doc-content');
        
        if (titleInput) titleInput.value = doc.title;
        
        let content = doc.content;
        if (typeof content === 'object') content = JSON.stringify(content, null, 2);
        if (contentInput) contentInput.value = content;

        await this.loadCategoriesForEditor();
        
        let catId = null;
        if (this.categories) {
            const catObj = this.categories.find(c => c.name === doc.category_name);
            if (catObj) catId = catObj.id;
        }
        
        if (catId) {
          const catSelect = document.getElementById('kb-doc-category');
          if (catSelect) catSelect.value = catId;
          
          // FIX: Await the loading and pass the subcategory ID to select it
          await this.loadSubcategoriesForEditor(catId, doc.subcategory_id);
        }
        
        const statusSelect = document.getElementById('kb-doc-status');
        if (statusSelect) statusSelect.value = doc.status;
      }
    } catch (e) {
      console.error(e);
      this.app.showToast('Failed to load document details', 'error');
      this.closeDocModal();
    }
  }

  async handleFileConvert() {
    const fileInput = document.getElementById('kb-file-upload');
    const btn = document.getElementById('btn-kb-convert');
    
    if (!fileInput || !fileInput.files[0]) {
      const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
      this.app.showToast(t.toasts.selectFile, 'warning');
      return;
    }
    
    const file = fileInput.files[0];
    if (btn) setButtonLoading(btn, true);
    this.openConversionStatusModal();
    this.simulateConversionProgress();
    
    try {
      const data = await this.app.apiManager.convertFileToJSON(file);
      if (data.success && data.json) {
        let jsonContent = data.json;
        if (typeof jsonContent === 'object') {
            jsonContent = JSON.stringify(jsonContent, null, 2);
        }
        
        const contentInput = document.getElementById('kb-doc-content');
        if (contentInput) contentInput.value = jsonContent;
        
        try {
          const parsed = JSON.parse(jsonContent);
          const titleInput = document.getElementById('kb-doc-title');
          if (parsed.title && titleInput) titleInput.value = parsed.title;
        } catch (e) {
            console.warn("Could not parse JSON for title auto-fill");
        }
        
        this.showConversionSuccess(file.name, jsonContent);
      }
    } catch (error) {
      console.error("Conversion Error:", error);
      this.showConversionError(error.message);
    } finally {
      if (btn) setButtonLoading(btn, false);
    }

    this.setupCacheProgressModalHandlers();
  }

  openConversionStatusModal() {
    const modal = document.getElementById('kb-conversion-status-modal');
    const title = document.getElementById('kb-conversion-status-title');
    const loading = document.getElementById('kb-conversion-loading');
    const success = document.getElementById('kb-conversion-success');
    const error = document.getElementById('kb-conversion-error');
    const closeBtn = document.getElementById('kb-conversion-status-close');
    const footer = document.getElementById('kb-conversion-footer');
    const fill = document.getElementById('kb-conversion-progress-fill');
    const text = document.getElementById('kb-conversion-progress-text');
    if (!modal) return;
    openModal('kb-conversion-status-modal');
    const footerBtn = document.getElementById('kb-conversion-close-btn');
    if (footerBtn) footerBtn.onclick = () => this.closeConversionStatusModal();
    if (closeBtn) closeBtn.onclick = () => this.closeConversionStatusModal();
    requestAnimationFrame(() => {
      if (title) title.textContent = 'Converting File';
      if (loading) loading.style.display = 'block';
      if (success) success.style.display = 'none';
      if (error) error.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'none';
      if (footer) footer.style.display = 'none';
      if (fill) fill.style.width = '0%';
      if (text) text.textContent = 'Uploading file...';
    });
  }

  closeConversionStatusModal() {
    closeModal('kb-conversion-status-modal');
  }

  simulateConversionProgress() {
    const progressFill = document.getElementById('kb-conversion-progress-fill');
    const progressText = document.getElementById('kb-conversion-progress-text');
    if (!progressFill || !progressText) return;
    const stages = [
      { progress: 20, text: 'Uploading file...' },
      { progress: 40, text: 'Analyzing content...' },
      { progress: 60, text: 'Extracting information...' },
      { progress: 80, text: 'Structuring data...' },
      { progress: 95, text: 'Finalizing...' }
    ];
    let currentStage = 0;
    const interval = setInterval(() => {
      if (!progressFill || !progressText) { clearInterval(interval); return; }
      if (currentStage < stages.length) {
        progressFill.style.width = stages[currentStage].progress + '%';
        progressText.textContent = stages[currentStage].text;
        currentStage++;
      } else {
        clearInterval(interval);
      }
    }, 800);
    window.conversionProgressInterval = interval;
  }

  showConversionSuccess(filename, jsonContent) {
    if (window.conversionProgressInterval) clearInterval(window.conversionProgressInterval);
    const title = document.getElementById('kb-conversion-status-title');
    const loading = document.getElementById('kb-conversion-loading');
    const success = document.getElementById('kb-conversion-success');
    const closeBtn = document.getElementById('kb-conversion-status-close');
    const footer = document.getElementById('kb-conversion-footer');
    const nameEl = document.getElementById('kb-conversion-filename');
    const sizeEl = document.getElementById('kb-conversion-size');
    if (title) title.textContent = 'Conversion Complete';
    if (loading) loading.style.display = 'none';
    if (success) success.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'block';
    if (footer) footer.style.display = 'flex';
    if (nameEl) nameEl.textContent = filename;
    const size = new Blob([jsonContent]).size;
    const sizeKB = (size / 1024).toFixed(2);
    if (sizeEl) sizeEl.textContent = `${sizeKB} KB`;
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    this.app.showToast(t.toasts.fileConverted, 'success');
  }

  showConversionError(errorMessage) {
    if (window.conversionProgressInterval) clearInterval(window.conversionProgressInterval);
    const title = document.getElementById('kb-conversion-status-title');
    const loading = document.getElementById('kb-conversion-loading');
    const error = document.getElementById('kb-conversion-error');
    const closeBtn = document.getElementById('kb-conversion-status-close');
    const footer = document.getElementById('kb-conversion-footer');
    const msgEl = document.getElementById('kb-conversion-error-message');
    if (title) title.textContent = 'Conversion Failed';
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'block';
    if (footer) footer.style.display = 'flex';
    if (msgEl) msgEl.textContent = errorMessage || 'Unknown error';
    this.app.showToast(errorMessage || 'Conversion failed', 'error');
  }

  async handleSaveDocument() {
    const title = document.getElementById('kb-doc-title')?.value;
    const subcatId = document.getElementById('kb-doc-subcategory')?.value;
    const content = document.getElementById('kb-doc-content')?.value;
    const status = document.getElementById('kb-doc-status')?.value;
    const btn = document.getElementById('kb-doc-save');
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;

    if (!title || !subcatId || !content) {
      this.app.showToast(t.toasts.missingFields, 'warning');
      return;
    }

    if (!validateJSON(content)) {
      this.app.showToast('Invalid JSON content', 'error');
      return;
    }

    if (btn) setButtonLoading(btn, true);

    try {
      const payload = {
        title,
        subcategory_id: subcatId,
        content: JSON.parse(content),
        status: status || 'published' 
      };
      
      let res;
      if (this.editingDocId) {
          res = await this.app.apiManager.updateDocument(this.editingDocId, payload);
      } else {
          res = await this.app.apiManager.createDocument(payload);
      }

      if (res.success) {
        this.app.showToast(t.toasts.docSaved, 'success');
        this.closeDocModal();
        this.loadDocumentsList();
      } else {
        throw new Error(res.error || 'Failed to save');
      }
    } catch (error) {
      this.app.showToast(error.message, 'error');
    } finally {
      if (btn) setButtonLoading(btn, false);
    }
  }

  // --- NEW: Delete Confirmation Handling ---
  openDeleteConfirmModal(id, type) {
    this.deleteTargetId = id;
    this.deleteTargetType = type;
    openModal('kb-delete-confirm-modal');
  }

  async confirmDeleteAction() {
    closeModal('kb-delete-confirm-modal');
    if (!this.deleteTargetId) return;

    if (this.deleteTargetType === 'doc') {
      try {
        const res = await this.app.apiManager.deleteDocument(this.deleteTargetId);
        if (res.success) {
          this.app.showToast('Document deleted', 'success');
          this.loadDocumentsList();
        }
      } catch (error) {
        this.app.showToast('Failed to delete', 'error');
      }
    } else if (this.deleteTargetType === 'subcat') {
      try {
        const res = await this.app.apiManager.deleteSubcategory(this.deleteTargetId);
        if (res.success) {
          this.app.showToast('Subcategory deleted', 'success');
          this.loadSubcategoriesList();
        } else {
          this.app.showToast(res.error || 'Failed to delete subcategory', 'error');
        }
      } catch (error) {
        this.app.showToast('Error deleting subcategory', 'error');
      }
    }
  }

  handleDeleteDocument(id) {
    this.openDeleteConfirmModal(id, 'doc');
  }

  handleDeleteSubcategory(id) {
    this.openDeleteConfirmModal(id, 'subcat');
  }

  // --- NEW: Subcategory Modal Logic ---
  async openSubcatModal(id = null, name = '', parentId = '', description = '') {
      this.editingSubcatId = id;
      console.log(`Opening Subcategory Modal. Edit Mode: ${id ? 'Yes' : 'No'}`);
      
      const title = document.getElementById('kb-subcat-title');
      const nameInput = document.getElementById('kb-subcat-name');
      const parentSelect = document.getElementById('kb-subcat-parent');
      const descInput = document.getElementById('kb-subcat-description');
      
      if (title) title.textContent = id ? 'Edit Subcategory' : 'Add Subcategory';
      if (nameInput) nameInput.value = name;
      if (descInput) descInput.value = description || '';
      openModal('kb-subcat-modal');
      requestAnimationFrame(async () => {
        await this.loadCategoriesForEditor('kb-subcat-parent');
        if (parentSelect && parentId) parentSelect.value = parentId;
      });
  }

  async saveSubcategory() {
      const nameInput = document.getElementById('kb-subcat-name');
      const catSelect = document.getElementById('kb-subcat-parent');
      const descInput = document.getElementById('kb-subcat-description');
      const saveBtn = document.getElementById('kb-subcat-save');
      
      const name = nameInput?.value;
      const catId = catSelect?.value;
      const description = descInput?.value || '';
      
      if (!name || !catId) {
          this.app.showToast('Name and Parent Category are required', 'warning');
          return;
      }
      
      setButtonLoading(saveBtn, true);
      
      try {
          let res;
          if (this.editingSubcatId) {
              res = await this.app.apiManager.updateSubcategory(this.editingSubcatId, name, catId, description);
          } else {
              res = await this.app.apiManager.createSubcategory(name, catId, description);
          }
          
          if (res.success) {
              this.app.showToast('Subcategory saved successfully', 'success');
              
              // Ensure we close properly
              closeModal('kb-subcat-modal');
              
              // Refresh list in background
              await this.loadSubcategoriesList(); 
          } else {
              this.app.showToast(res.error || 'Failed to save', 'error');
          }
      } catch (e) {
          console.error("Save Subcategory Error:", e);
          this.app.showToast(e.message || 'Error creating subcategory', 'error');
      } finally {
          setButtonLoading(saveBtn, false);
      }
  }

  async openAddSubcatModal() {
    this.openSubcatModal(null);
  }

  async handleRegenerateCache() {
    const t = TRANSLATIONS[this.app.currentLang] || TRANSLATIONS.en;
    const btn = document.getElementById('btn-regen-cache');
    this.app.modalManager.showModal({
      title: 'Regenerate Cache',
      message: 'Are you sure you want to regenerate the cache? This might take a while depending on the size of your Knowledge Base.',
      inputValue: null,
      confirmText: 'Regenerate',
      cancelText: 'Cancel',
      confirmClass: 'primary',
      onConfirm: () => {
        if (btn) setButtonLoading(btn, true);
        this.openCacheProgressModal();
        this.connectToCacheProgressStream();
        (async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const res = await this.app.apiManager.regenerateCache();
            if (!res.success) {
              throw new Error(res.error || 'Failed to start cache regeneration');
            }
          } catch (e) {
            if (this.progressEventSource) { this.progressEventSource.close(); this.progressEventSource = null; }
            this.showCacheRegenerationError(e.message);
            this.app.showToast('Failed to start cache regeneration', 'error');
            if (btn) setButtonLoading(btn, false);
          }
        })();
      }
    });
  }

  setupCacheProgressModalHandlers() {
    const closeBtn = document.getElementById('cache-progress-close');
    const cancelBtn = document.getElementById('cache-progress-cancel');
    const finishBtn = document.getElementById('cache-progress-finish');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (finishBtn && finishBtn.style.display !== 'none') { this.closeCacheProgressModal(); }
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.app.showToast('Cache regeneration cannot be cancelled once started', 'warning');
      };
    }
    if (finishBtn) {
      finishBtn.onclick = async (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.closeCacheProgressModal();
        await this.loadCacheStatus();
      };
    }
  }

  openCacheProgressModal() {
    const title = document.getElementById('cache-modal-title');
    const loading = document.getElementById('cache-status-loading');
    const result = document.getElementById('cache-status-result');
    const closeBtn = document.getElementById('cache-progress-close');
    const cancelBtn = document.getElementById('cache-progress-cancel');
    const finishBtn = document.getElementById('cache-progress-finish');
    const fill = document.getElementById('cache-progress-fill-modal');
    const text = document.getElementById('cache-progress-text-modal');
    const bar = document.getElementById('cache-progressbar');
    const msg = document.getElementById('cache-status-message');
    const sub = document.getElementById('cache-status-subtext');
    this.setupCacheProgressModalHandlers();
    openModal('cache-progress-modal');
    requestAnimationFrame(() => {
      if (title) title.textContent = 'Regenerating Cache...';
      if (loading) loading.style.display = 'block';
      if (result) result.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      if (finishBtn) finishBtn.style.display = 'none';
      if (fill) fill.style.width = '0%';
      if (text) text.textContent = '0% Complete';
      if (bar) bar.setAttribute('aria-valuenow', '0');
      if (msg) msg.textContent = 'Starting embedding process...';
      if (sub) sub.textContent = 'This operation may take several minutes depending on the volume of knowledge data.';
    });
  }

  closeCacheProgressModal() {
    closeModal('cache-progress-modal');
    if (this.progressEventSource) { this.progressEventSource.close(); this.progressEventSource = null; }
  }

  updateCacheProgress(stage, progress) {
    const progressFill = document.getElementById('cache-progress-fill-modal');
    const progressText = document.getElementById('cache-progress-text-modal');
    const bar = document.getElementById('cache-progressbar');
    if (progressFill) { progressFill.style.width = progress + '%'; }
    if (progressText) { progressText.textContent = `${progress}% Complete`; }
    if (bar) { bar.setAttribute('aria-valuenow', String(progress)); }
  }

  showCacheRegenerationSuccess(data) {
    const title = document.getElementById('cache-modal-title');
    if (title) title.textContent = 'Cache Regeneration Complete';
    const loading = document.getElementById('cache-status-loading');
    if (loading) loading.style.display = 'none';
    const result = document.getElementById('cache-status-result');
    if (result) result.style.display = 'block';
    const closeBtn = document.getElementById('cache-progress-close');
    if (closeBtn) closeBtn.style.display = 'block';
    const cancelBtn = document.getElementById('cache-progress-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const finishBtn = document.getElementById('cache-progress-finish');
    if (finishBtn) finishBtn.style.display = 'inline-block';
    const resultIcon = document.getElementById('cache-result-icon');
    const resultTitle = document.getElementById('cache-result-title');
    const resultSubtext = document.getElementById('cache-result-subtext');
    if (resultIcon) { resultIcon.className = 'conversion-result-icon success'; resultIcon.innerHTML = '<span style="font-size: 3rem;">✅</span>'; }
    if (resultTitle) { resultTitle.textContent = 'Regeneration Successful!'; resultTitle.style.color = '#10b981'; }
    if (resultSubtext) { resultSubtext.textContent = 'The RAG system cache has been fully rebuilt and is now active.'; }
    if (data && data.files !== undefined) { const filesEl = document.getElementById('cache-result-files'); if (filesEl) filesEl.textContent = data.files; }
    if (data && data.chunks !== undefined) { const chunksEl = document.getElementById('cache-result-chunks'); if (chunksEl) chunksEl.textContent = data.chunks; }
  }

  showCacheRegenerationError(errorMessage) {
    const title = document.getElementById('cache-modal-title');
    if (title) title.textContent = 'Cache Regeneration Failed';
    const loading = document.getElementById('cache-status-loading');
    if (loading) loading.style.display = 'none';
    const result = document.getElementById('cache-status-result');
    if (result) result.style.display = 'block';
    const closeBtn = document.getElementById('cache-progress-close');
    if (closeBtn) closeBtn.style.display = 'block';
    const cancelBtn = document.getElementById('cache-progress-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const finishBtn = document.getElementById('cache-progress-finish');
    if (finishBtn) finishBtn.style.display = 'inline-block';
    const resultIcon = document.getElementById('cache-result-icon');
    const resultTitle = document.getElementById('cache-result-title');
    const resultSubtext = document.getElementById('cache-result-subtext');
    if (resultIcon) { resultIcon.className = 'conversion-result-icon error'; resultIcon.innerHTML = '<span style="font-size: 3rem;">❌</span>'; }
    if (resultTitle) { resultTitle.textContent = 'Regeneration Failed'; resultTitle.style.color = '#ef4444'; }
    if (resultSubtext) { resultSubtext.textContent = errorMessage || 'An error occurred during cache regeneration.'; }
    const filesEl = document.getElementById('cache-result-files');
    if (filesEl) filesEl.textContent = '—';
    const chunksEl = document.getElementById('cache-result-chunks');
    if (chunksEl) chunksEl.textContent = '—';
  }

  connectToCacheProgressStream() {
    if (this.progressEventSource) { this.progressEventSource.close(); this.progressEventSource = null; }
    const streamUrl = `${CONFIG.API_BASE}/cache/progress-stream`;
    this.progressEventSource = new EventSource(streamUrl);
    this.progressEventSource.onmessage = (event) => {
      try { const data = JSON.parse(event.data); this.handleCacheProgressUpdate(data); } catch (_) {}
    };
    this.progressEventSource.onopen = () => {};
    this.progressEventSource.onerror = () => {
      setTimeout(() => {
        if (this.progressEventSource && this.progressEventSource.readyState === EventSource.CLOSED) {
          if (this.progressEventSource) { this.progressEventSource.close(); this.progressEventSource = null; }
          const modal = document.getElementById('cache-progress-modal');
          const finishBtn = document.getElementById('cache-progress-finish');
          if (modal && modal.classList.contains('active') && finishBtn && finishBtn.style.display === 'none') {
            this.showCacheRegenerationError('Connection lost. Please check your network or try again.');
          }
        }
      }, 5000);
    };
  }

  async handleCacheProgressUpdate(data) {
    const btn = document.getElementById('btn-regen-cache');
    switch (data.type) {
      case 'connected':
        break;
      case 'heartbeat':
        break;
      case 'progress':
        this.updateCacheProgress(data.stage, data.progress);
        const statusMessage = document.getElementById('cache-status-message');
        if (statusMessage) {
          statusMessage.textContent = data.message || 'Processing...';
        }
        break;
      case 'complete':
        if (this.progressEventSource) { this.progressEventSource.close(); this.progressEventSource = null; }
        this.showCacheRegenerationSuccess(data.data);
        this.app.showToast('Cache regenerated successfully');
        if (btn) setButtonLoading(btn, false);
        await this.loadCacheStatus();
        break;
      case 'error':
        if (this.progressEventSource) { this.progressEventSource.close(); this.progressEventSource = null; }
        this.showCacheRegenerationError(data.message);
        this.app.showToast('Cache regeneration failed', 'error');
        if (btn) setButtonLoading(btn, false);
        break;
    }
  }
}
