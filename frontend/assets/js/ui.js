// frontend/assets/js/ui.js
import { groupChatsByDate, getDateOrder, truncateTitle } from './utils.js';
import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';

export class UIManager {
  constructor(chatApp) {
    this.app = chatApp;
    this.currentLang = localStorage.getItem('app_language') || 'en';
    this.originalMicIcon = this.app.elements.micBtn ? this.app.elements.micBtn.innerHTML : '';
    this.stopIcon = `
      <svg class="stop-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="20" height="20">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
    `;
  }

  render() {
    this.updateLanguage(this.currentLang);
    this.updateUI();
    this.updateMobileHeader();
    this.addButtonTooltips();
  }

  updateLanguage(lang) {
    this.currentLang = lang;
    if (this.app) {
        this.app.currentLang = lang;
    }
    localStorage.setItem('app_language', lang);

    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

    // --- 1. Sidebar Elements ---
    this.safeSetText('#new-chat span', t.sidebar.newChat);
    
    const historyHeaderTitle = document.querySelector('.history-header h2');
    if (historyHeaderTitle) {
        historyHeaderTitle.textContent = t.sidebar.previousChats;
    }
    
    this.safeSetText('#settings-option', t.sidebar.settings, true);
    this.safeSetText('#contact-option', t.sidebar.contact, true);
    this.safeSetText('#logout-option', t.sidebar.logout, true);

    // --- 2. Welcome Message ---
    this.updateWelcomeMessage();
    this.safeSetText('#welcome-message p', t.welcome.subtitle);

    // --- 3. Input Area ---
    const input = document.getElementById('question');
    if (input) input.placeholder = t.input.placeholder;
    
    // --- 4. Settings Modal Translations (DEFENSIVE UPDATE) ---
    const settingsModal = document.querySelector('.settings-modal');
    
    if (settingsModal) {
        // Header
        const headerTitle = settingsModal.querySelector('.settings-header h2');
        if (headerTitle) headerTitle.textContent = t.settings.header;

        // Sidebar Nav
        const navItems = settingsModal.querySelectorAll('.settings-nav-item');
        if (navItems && navItems.length > 0) {
            if (navItems[0]) this.safeSetText(navItems[0], t.settings.nav.general, true);
            if (navItems[1]) this.safeSetText(navItems[1], t.settings.nav.profile, true);
            if (navItems[2]) this.safeSetText(navItems[2], t.settings.nav.integration, true);
            if (navItems[3]) this.safeSetText(navItems[3], t.settings.nav.knowledge, true);
            if (navItems[4]) this.safeSetText(navItems[4], t.settings.nav.about, true);
        }

        // General Panel
        const genPanel = document.getElementById('settings-general');
        if (genPanel) {
            const sections = genPanel.querySelectorAll('.settings-section');
            if (sections[0]) {
                const title = sections[0].querySelector('.settings-section-title');
                const label = sections[0].querySelector('.settings-item-label');
                if (title) title.textContent = t.settings.general.appearance;
                if (label) label.textContent = t.settings.general.theme;
                
                const themeBtns = sections[0].querySelectorAll('.theme-btn');
                if (themeBtns.length >= 3) {
                    if (themeBtns[0]) themeBtns[0].textContent = t.settings.general.themeSystem;
                    if (themeBtns[1]) themeBtns[1].textContent = t.settings.general.themeLight;
                    if (themeBtns[2]) themeBtns[2].textContent = t.settings.general.themeDark;
                }
            }

            if (sections[1]) {
                const title = sections[1].querySelector('.settings-section-title');
                const label = sections[1].querySelector('.settings-item-label');
                if (title) title.textContent = t.settings.general.language;
                if (label) label.textContent = t.settings.general.interfaceLang;
            }
        }

        // Profile Panel
        const profPanel = document.getElementById('settings-profile');
        if (profPanel) {
            const sections = profPanel.querySelectorAll('.settings-section');
            if (sections[0]) {
                const title = sections[0].querySelector('.settings-section-title');
                if (title) title.textContent = t.settings.profile.infoTitle;
                
                const labels = profPanel.querySelectorAll('.form-label');
                if (labels[0]) labels[0].textContent = t.settings.profile.displayName;
                if (labels[1]) labels[1].textContent = t.settings.profile.email;
                if (labels[2]) labels[2].textContent = t.settings.profile.phone;

                const discardBtn = document.getElementById('profile-cancel-btn');
                if (discardBtn) discardBtn.textContent = t.settings.profile.buttons.discard;
                
                const saveBtn = profPanel.querySelector('button[type="submit"]');
                if (saveBtn) saveBtn.textContent = t.settings.profile.buttons.save;
            }

            if (sections[1]) {
                const title = sections[1].querySelector('.settings-section-title');
                if (title) title.textContent = t.settings.profile.actionsTitle;
                
                const items = sections[1].querySelectorAll('.settings-item');
                if (items[0]) {
                    const label = items[0].querySelector('.settings-item-label');
                    if (label) label.textContent = t.settings.profile.logoutAll;
                    const btn = document.getElementById('settings-logout-btn');
                    if (btn) btn.textContent = t.settings.profile.buttons.logout;
                }
                if (items[1]) {
                    const label = items[1].querySelector('.settings-item-label');
                    if (label) label.textContent = t.settings.profile.deleteAccount;
                    const btn = document.getElementById('settings-delete-account-btn');
                    if (btn) btn.textContent = t.settings.profile.buttons.delete;
                }
            }
        }

        // Integration Panel
        const intPanel = document.getElementById('settings-integration');
        if (intPanel) {
            const title = intPanel.querySelector('.settings-section-title');
            if (title) title.textContent = t.settings.integration.title;
            
            const googleTitle = intPanel.querySelector('.integration-details h4');
            if (googleTitle) googleTitle.textContent = t.settings.integration.googleTitle;
            
            const googleDesc = intPanel.querySelector('.integration-details p');
            if (googleDesc) googleDesc.textContent = t.settings.integration.googleDesc;

            const btnConnect = document.getElementById('btn-google-connect');
            if (btnConnect) {
                const isConnected = btnConnect.classList.contains('btn-connected-state');
                btnConnect.textContent = isConnected ? t.settings.integration.btnConnected : t.settings.integration.btnConnect;
            }

            const btnDisconnect = document.getElementById('btn-google-disconnect');
            if (btnDisconnect) {
                btnDisconnect.textContent = t.settings.integration.btnDisconnect;
            }
        }

        // Knowledge Base Panel (NEW)
        const kbPanel = document.getElementById('settings-knowledge');
        if (kbPanel && t.settings.knowledge) {
            const title = kbPanel.querySelector('.settings-section-title');
            if (title) title.textContent = t.settings.knowledge.title;
            
            const searchInput = document.getElementById('kb-search-input');
            if (searchInput) searchInput.placeholder = t.settings.knowledge.searchPlaceholder;
            
            const refreshBtn = document.getElementById('kb-refresh-btn');
            if (refreshBtn) {
               const icon = refreshBtn.querySelector('svg');
               refreshBtn.innerHTML = '';
               if(icon) refreshBtn.appendChild(icon);
               refreshBtn.appendChild(document.createTextNode(' ' + t.settings.knowledge.actions.refresh));
            }
            
            const addDocBtn = document.getElementById('btn-add-doc');
            if (addDocBtn) addDocBtn.textContent = '+ ' + t.settings.knowledge.actions.addDoc;

            const addSubBtn = document.getElementById('btn-add-subcat');
            if (addSubBtn) addSubBtn.textContent = '+ ' + t.settings.knowledge.actions.addSubcat;

            const regenBtn = document.getElementById('btn-regen-cache');
            if (regenBtn) {
                const icon = regenBtn.querySelector('svg');
                regenBtn.innerHTML = '';
                if(icon) regenBtn.appendChild(icon);
                regenBtn.appendChild(document.createTextNode(' ' + t.settings.knowledge.actions.regenCache));
            }
        }
        
        // About Panel
        const aboutPanel = document.getElementById('settings-about');
        if (aboutPanel) {
             const h3s = aboutPanel.querySelectorAll('h3');
             if(h3s[0]) h3s[0].textContent = t.settings.about.title;
             if(h3s[1]) h3s[1].textContent = t.settings.about.version;
             if(h3s[2]) h3s[2].textContent = t.settings.about.featuresTitle;
             if(h3s[3]) h3s[3].textContent = t.settings.about.supportTitle;
             if(h3s[4]) h3s[4].textContent = t.settings.about.legalTitle;

             const ps = aboutPanel.querySelectorAll('p');
             if(ps[0]) ps[0].textContent = t.settings.about.desc;
             if(ps[2]) ps[2].innerHTML = t.settings.about.featuresList;
             if(ps[3]) ps[3].innerHTML = t.settings.about.supportDesc;
             if(ps[4]) {
                 const links = ps[4].querySelectorAll('a');
                 ps[4].childNodes[0].textContent = "© 2025 CDO Foodsphere. All rights reserved.\n";
                 if(links[0]) links[0].textContent = t.settings.about.privacy;
                 if(links[1]) links[1].textContent = t.settings.about.terms;
             }
        }
    }

    if (this.app && this.app.rotateSuggestedQuestions) {
      this.app.rotateSuggestedQuestions();
    }
    
    if (this.app && this.app.authManager) {
        this.updateUserInfo(this.app.authManager.getUserType());
    }

    this.renderHistory();
  }

  updateUserInfo(userType) {
    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    const typeLabel = document.getElementById('user-type-label');
    if (typeLabel) {
      typeLabel.textContent = (
        userType === 'employee' 
          ? t.sidebar.employee 
          : (userType === 'external' ? 'External User' : t.sidebar.guestUser)
      );
    }
  }

  safeSetText(selector, text, preserveIcon = false) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    
    if (preserveIcon) {
      const icon = el.querySelector('svg');
      const textNode = document.createTextNode(' ' + text);
      
      const children = Array.from(el.childNodes);
      children.forEach(child => {
          if (child !== icon) {
              el.removeChild(child);
          }
      });

      if (!el.contains(icon) && icon) {
          el.prepend(icon);
      }
      el.appendChild(textNode);
    } else {
      el.textContent = text;
    }
  }

  setupProfileRenaming(authManager, apiManager) {
    const userNameElement = document.getElementById('sidebar-user-name');
    const editIcon = document.getElementById('edit-name-btn');

    if (!userNameElement) return;

    const handleRename = async () => {
        const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
        const currentName = userNameElement.textContent;
        const newName = prompt("Enter your new display name:", currentName);

        if (newName && newName.trim() !== "" && newName !== currentName) {
            const email = authManager.getUserEmail();
            userNameElement.textContent = newName;
            
            try {
                const success = await apiManager.updateUserName(email, newName);
                if (success) {
                    if (authManager.updateLocalName) authManager.updateLocalName(newName); 
                    this.app.showToast(t.toasts.nameUpdated, "success");
                } else {
                    userNameElement.textContent = currentName;
                    this.app.showToast(t.toasts.failedUpdate, "error");
                }
            } catch (error) {
                 if (error.message === 'Maintenance Mode') {
                    this.app.showToast(t.toasts.maintenanceMode, "warning");
                 } else {
                    this.app.showToast(t.toasts.errorConnecting, "error");
                 }
                 userNameElement.textContent = currentName;
            }
        }
    };

    userNameElement.style.cursor = 'pointer';
    userNameElement.title = "Click to rename";
    userNameElement.addEventListener('click', handleRename);
    
    if (editIcon) {
        editIcon.addEventListener('click', (e) => {
            e.stopPropagation(); 
            handleRename();
        });
    }
  }

  updateUI() {
    const { welcomeDiv, chatContainer, chatDiv } = this.app.elements;
    
    if (!this.app.hasConversation) {
      welcomeDiv.classList.add("show");
      chatContainer.classList.add("centered");
      chatDiv.style.display = "none";
      // remove conversation mode class so decorative waves show
      document.body.classList.remove('conversation-active');
    } else {
      welcomeDiv.classList.remove("show");
      chatContainer.classList.remove("centered");
      chatDiv.style.display = "flex";
      // when in conversation mode hide decorative waves
      document.body.classList.add('conversation-active');
    }
    this.updateScrollButton();
  }

  updateWelcomeMessage() {
    const welcomeDiv = this.app.elements.welcomeDiv;
    const h2 = welcomeDiv.querySelector('h2');
    
    if (h2) {
      const hour = new Date().getHours();
      const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
      
      let greeting = t.welcome.morning;
      if (hour >= 12 && hour < 18) greeting = t.welcome.afternoon;
      else if (hour >= 18) greeting = t.welcome.evening;

      const nameSpan = document.getElementById('welcome-username');
      const name = this.app.userName && this.app.userName !== 'You' ? this.app.userName : (nameSpan ? nameSpan.textContent : 'Guest');

      h2.innerHTML = `${greeting}, <span id="welcome-username">${name}</span>`;
    }
  }

  addWelcomeAvatar() {
    const welcomeDiv = this.app.elements.welcomeDiv;
    if (welcomeDiv.querySelector('.welcome-avatar-container')) return;
    
    const container = document.createElement('div');
    container.className = 'welcome-avatar-container';
    
    const border = document.createElement('div');
    border.className = 'welcome-avatar-border';
    
    const avatar = document.createElement('img');
    avatar.src = 'assets/images/avatar.png'; 
    avatar.alt = 'Cindy';
    avatar.className = 'welcome-avatar';
    
    container.appendChild(border);
    container.appendChild(avatar);
    
    const h2 = welcomeDiv.querySelector('h2');
    if (h2) welcomeDiv.insertBefore(container, h2);
  }

  renderHistory() {
    const list = this.app.elements.chatHistory;
    const dropdownList = this.app.elements.historyDropdownList;
    if (!list || !dropdownList) return;

    const historyNav = list.parentElement;
    let historyHeader = historyNav.querySelector('.history-header');
    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;

    if (!historyHeader) {
      historyHeader = document.createElement('div');
      historyHeader.className = 'history-header';
      historyHeader.innerHTML = `
        <h2>${t.sidebar.previousChats}</h2>
        <button class="history-toggle" aria-label="Toggle chat history" aria-expanded="${!this.app.historyCollapsed}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      `;
      
      historyNav.insertBefore(historyHeader, list);
      
      const toggleBtn = historyHeader.querySelector('.history-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
          const isMobile = window.innerWidth <= 768;
          
          if (isSidebarMinimized && !isMobile) {
            this.toggleHistoryDropdown();
          } else {
            this.app.historyCollapsed = !this.app.historyCollapsed;
            this.app.saveToStorage();
            this.updateHistoryCollapse();
          }
        });
      }
    } else {
        const headerTitle = historyHeader.querySelector('h2');
        if (headerTitle) headerTitle.textContent = t.sidebar.previousChats;
    }

    const dateMap = {
      "Today": t.dateGroups.today,
      "Yesterday": t.dateGroups.yesterday,
      "Previous 7 Days": t.dateGroups.previous7Days,
      "Previous 30 Days": t.dateGroups.previous30Days,
      "Older": t.dateGroups.older
    };

    // Clear existing content
    list.innerHTML = "";
    dropdownList.innerHTML = "";

    // Check if chats are actually loaded
    if (!this.app.chats || this.app.chats.length === 0) {
        // Show empty state instead of skeleton
        const emptyState = document.createElement('div');
        emptyState.className = 'history-empty-state';
        emptyState.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.875rem;';
        emptyState.textContent = t.sidebar.noChats || 'No previous chats';
        list.appendChild(emptyState);
        return;
    }

    const groupedChats = groupChatsByDate(this.app.chats);
    const dateOrder = getDateOrder(groupedChats);
    
    dateOrder.forEach(dateCategory => {
      if (groupedChats[dateCategory]) {
        const separator = document.createElement("div");
        separator.className = "date-separator";
        separator.textContent = dateMap[dateCategory] || dateCategory;
        
        list.appendChild(separator);
        
        const ddSeparator = separator.cloneNode(true);
        dropdownList.appendChild(ddSeparator);
        
        groupedChats[dateCategory].forEach(({ chat, index }) => {
          list.appendChild(this.createHistoryItem(chat, index));
          dropdownList.appendChild(this.createHistoryItem(chat, index));
        });
      }
    });
    
    this.updateHistoryCollapse();
    this.highlightActiveChat();
  }

  updateHistoryCollapse() {
    const historyHeader = document.querySelector('.history-header');
    const toggleBtn = historyHeader?.querySelector('.history-toggle');
    const { chatHistory } = this.app.elements;
    
    if (this.app.historyCollapsed) {
      chatHistory.classList.add('collapsed');
      toggleBtn?.classList.add('collapsed');
      toggleBtn?.setAttribute('aria-expanded', 'false');
    } else {
      chatHistory.classList.remove('collapsed');
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
    
    li.addEventListener("click", (e) => {
      if (e.target.closest('.ellipsis') || e.target.closest('.dropdown') || e.target.closest('.rename-input')) return;
      this.cancelAllActiveRenames();
      this.app.loadChat(index);
    });

    const ellipsis = document.createElement("button");
    ellipsis.className = "ellipsis";
    ellipsis.textContent = "⋯";
    ellipsis.setAttribute("aria-label", "Chat options");
    ellipsis.setAttribute("aria-haspopup", "true");
    ellipsis.setAttribute("aria-expanded", "false");
    
    if (window.innerWidth > CONFIG.MOBILE_BREAKPOINT) {
      this.app.modalManager.addTooltip(ellipsis, 'Options', 'top');
    }

    const dropdown = this.createDropdownMenu(chat, index, ellipsis, li, titleSpan);

    ellipsis.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDropdown(dropdown, ellipsis, li);
    });
    
    li.addEventListener("keydown", (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement === ellipsis) return;
        e.preventDefault();
        this.cancelAllActiveRenames();
        this.app.loadChat(index);
      }
    });

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

    const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;

    const renameOption = document.createElement("button");
    renameOption.className = "dropdown-option rename";
    renameOption.textContent = t.modals.renameConfirm || "Rename";
    renameOption.setAttribute("role", "menuitem");

    const deleteOption = document.createElement("button");
    deleteOption.className = "dropdown-option delete";
    deleteOption.textContent = t.modals.deleteConfirm || "Delete";
    deleteOption.setAttribute("role", "menuitem");

    dropdown.appendChild(renameOption);
    dropdown.appendChild(deleteOption);

    renameOption.addEventListener("click", (e) => {
      e.stopPropagation();
      const allDropdowns = this.app.elements.historyDropdownList.querySelectorAll('.dropdown.show');
      allDropdowns.forEach(dd => {
        dd.classList.remove('show');
        dd.style.display = 'none';
        const parentLi = dd.closest('li');
        if (parentLi) {
          const parentEllipsis = parentLi.querySelector('.ellipsis');
          if (parentEllipsis) parentEllipsis.setAttribute('aria-expanded', 'false');
        }
      });
      this.cancelAllActiveRenames();
      this.enableInlineRenameInDropdown(index, chat.title, listItem, titleSpan, ellipsis);
    });

    deleteOption.addEventListener("click", (e) => {
      e.stopPropagation();
      this.app.deleteChat(index, chat.title);
      this.closeAllDropdowns();
    });

    return dropdown;
  }

  cancelAllActiveRenames() {
    const allRenameInputs = document.querySelectorAll('.rename-input');
    allRenameInputs.forEach(input => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, code: 'Escape', bubbles: true, cancelable: true });
      input.dispatchEvent(escapeEvent);
    });
  }

  enableInlineRenameInDropdown(index, currentTitle, listItem, titleSpan, ellipsis) {
    if (listItem.querySelector('.rename-input')) return;
    
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
      const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
      if (newName && newName !== currentTitle) {
        this.app.chats[index].title = newName;
        this.app.saveToStorage();
        titleSpan.textContent = newName;
        this.app.updateCorrespondingChatTitle(index, newName);
        this.app.uiManager.updateMobileHeader();
        this.app.uiManager.renderHistory();
        this.app.showToast(t.toasts.chatRenamed, 'success');
      } else if (!newName) {
        this.app.showToast(t.toasts.cannotRename, 'error');
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
      setTimeout(() => { if (!renameCompleted) cancelRename(); }, 150);
    });
    
    input.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); });
    input.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
    input.addEventListener("input", (e) => e.stopPropagation());
  }

  toggleDropdown(dropdown, ellipsis, listItem) {
    const isShowing = dropdown.classList.contains("show");
    
    document.querySelectorAll(".dropdown.show").forEach(menu => {
      if (menu !== dropdown) {
        // Retrieve the original parent from the menu's data attribute if possible,
        // or finding the ellipsis that owns it.
        // But for simplicity, we just hide it. Ideally we should put it back.
        // If we move it to body, we must move it back to hide it properly or remove it.
        
        menu.classList.remove("show");
        menu.style.display = 'none';
        
        // If it was moved to body, move it back to its placeholder or original list item
        if (menu.parentElement === document.body && menu.dataset.originalParentId) {
             // This is tricky without unique IDs. 
             // Let's use the reference we have if we can.
        }
        // Since we are iterating all .dropdown.show, we don't easily have the listItem reference 
        // unless we stored it.
        
        const otherEllipsis = menu._associatedEllipsis; // We'll attach this property
        if (otherEllipsis) otherEllipsis.setAttribute("aria-expanded", "false");
        
        if (menu.parentElement === document.body) {
             menu.remove(); // Remove from body
             // Re-append to original parent is safer if we want to reuse, 
             // but 'createDropdownMenu' creates it fresh? No, it's created once per item.
             // We should put it back.
             if (menu._originalParent) {
                 menu._originalParent.appendChild(menu);
             }
        }
      }
    });
    
    if (!isShowing) {
      const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
      const isInHistoryDropdown = listItem.closest('#history-dropdown-list') !== null;
      
      const ellipsisRect = ellipsis.getBoundingClientRect();
      const listItemRect = listItem.getBoundingClientRect();
      
      // Store original parent and ellipsis for cleanup
      dropdown._originalParent = dropdown.parentElement;
      dropdown._associatedEllipsis = ellipsis;
      
      // Move to body to avoid clipping
      document.body.appendChild(dropdown);
      
      dropdown.style.position = 'fixed';
      dropdown.style.zIndex = '1010';
      
      if (isInHistoryDropdown) {
        const historyDropdownRect = this.app.elements.historyDropdown.getBoundingClientRect();
        dropdown.style.top = `${listItemRect.top}px`;
        dropdown.style.left = `${historyDropdownRect.right + 5}px`;
      } else if (isSidebarMinimized) {
        dropdown.style.top = `${ellipsisRect.bottom + 5}px`;
        dropdown.style.left = `${ellipsisRect.left - 100}px`;
      } else {
        dropdown.style.top = `${listItemRect.top}px`;
        dropdown.style.left = `${listItemRect.right + 5}px`;
      }
      
      // Adjust if off-screen (basic check)
      const dropdownRect = dropdown.getBoundingClientRect();
      if (dropdownRect.right > window.innerWidth) {
          dropdown.style.left = `${window.innerWidth - dropdownRect.width - 10}px`;
      }
      
      const tooltip = ellipsis.querySelector('.tooltip');
      if (tooltip) tooltip.classList.remove('show');
      
      dropdown.style.display = 'block';
      dropdown.classList.add("show");
      ellipsis.setAttribute("aria-expanded", "true");
      
      setTimeout(() => {
        const clickHandler = (e) => {
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
    
    // Move back to original parent
    if (dropdown.parentElement === document.body && dropdown._originalParent) {
        dropdown._originalParent.appendChild(dropdown);
    }
    
    const tooltip = ellipsis.querySelector('.tooltip');
    if (tooltip && window.innerWidth > CONFIG.MOBILE_BREAKPOINT) {
      tooltip.classList.add('show');
    }
  }

  closeAllDropdowns() {
    document.querySelectorAll(".dropdown.show").forEach(menu => {
      menu.classList.remove("show");
      menu.style.display = 'none';
      
      const ellipsis = menu._associatedEllipsis;
      if (ellipsis) {
          ellipsis.setAttribute("aria-expanded", "false");
          const tooltip = ellipsis.querySelector('.tooltip');
          if (tooltip && window.innerWidth > CONFIG.MOBILE_BREAKPOINT) tooltip.classList.add('show');
      }
      
      if (menu.parentElement === document.body && menu._originalParent) {
          menu._originalParent.appendChild(menu);
      }
    });
    this.closeHistoryDropdown();
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
      
      // Populate history before showing
      if (this.app.chats && this.app.chats.length > 0) {
          this.renderHistory(); 
      }
      
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

  closeHistoryDropdown() {
    const { historyDropdown } = this.app.elements;
    historyDropdown.classList.remove('show');
    historyDropdown.setAttribute('aria-hidden', 'true');
    const historyToggle = document.querySelector('.history-toggle');
    if (historyToggle) {
      historyToggle.classList.remove('dropdown-open');
      const tooltip = historyToggle.querySelector('.tooltip');
      if (tooltip) tooltip.style.display = '';
    }
  }

  highlightActiveChat() {
    document.querySelectorAll("#chat-history li").forEach(li => li.classList.remove("active"));
    document.querySelectorAll("#history-dropdown-list li").forEach(li => li.classList.remove("active"));
    
    if (this.app.activeChatIndex !== null && this.app.activeChatIndex >= 0 && this.app.hasConversation) {
      const activeItem = document.querySelector(`#chat-history li[data-chat-index="${this.app.activeChatIndex}"]`);
      if (activeItem) activeItem.classList.add("active");
      
      const activeDropdownItem = document.querySelector(`#history-dropdown-list li[data-chat-index="${this.app.activeChatIndex}"]`);
      if (activeDropdownItem) activeDropdownItem.classList.add("active");
    }
  }

  showMicStopSpeakingMode() {
    const { micBtn } = this.app.elements;
    if (micBtn) {
      micBtn.innerHTML = this.stopIcon;
      micBtn.classList.add('speaking-mode');
      micBtn.classList.remove('recording');
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
      this.app.modalManager.addTooltip(sendBtn, 'Stop generation', 'bottom');
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
      this.app.modalManager.addTooltip(sendBtn, 'Send message', 'bottom');
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
    this.scrollToBottom();
    this.handleScroll();
  }

  updateMobileHeader() {
    const { mobileHeader, mobileHeaderTitle, mobileHeaderLogo } = this.app.elements;
    const shouldShow = window.innerWidth <= 768;
    
    if (shouldShow) {
      if (mobileHeader) {
          mobileHeader.setAttribute("aria-hidden", "false");
          mobileHeader.classList.add("show");
      }
      
      if (this.app.hasConversation && this.app.activeChatIndex !== null) {
        const currentChat = this.app.chats[this.app.activeChatIndex];
        if (currentChat) {
          const titleText = mobileHeaderTitle.querySelector('.title-text');
          if (titleText) titleText.textContent = truncateTitle(currentChat.title, 25);
          mobileHeaderTitle.classList.add('clickable');
          mobileHeaderTitle.setAttribute('aria-label', 'Chat options');
          if (mobileHeaderLogo) mobileHeaderLogo.classList.add('hidden');
        } else {
          const titleText = mobileHeaderTitle.querySelector('.title-text');
          if (titleText) titleText.textContent = "Current Chat";
          mobileHeaderTitle.classList.add('clickable');
          if (mobileHeaderLogo) mobileHeaderLogo.classList.add('hidden');
        }
      } else {
        const titleText = mobileHeaderTitle.querySelector('.title-text');
        if (titleText) titleText.textContent = "ChatCDO";
        mobileHeaderTitle.classList.remove('clickable');
        mobileHeaderTitle.classList.remove('dropdown-active');
        mobileHeaderTitle.setAttribute('aria-label', '');
        if (mobileHeaderLogo) mobileHeaderLogo.classList.remove('hidden');
      }
    } else {
      if (mobileHeader) {
          mobileHeader.setAttribute("aria-hidden", "true");
          mobileHeader.classList.remove("show");
      }
      
      if (window.innerWidth > 768) {
        if (this.app.elements.sidebar) this.app.elements.sidebar.classList.remove("show");
        if (this.app.elements.overlay) this.app.elements.overlay.classList.remove("active");
      }
    }
  }

  addButtonTooltips() {
    if (window.innerWidth <= CONFIG.MOBILE_BREAKPOINT) return;
    
    const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
    
    this.app.modalManager.addTooltip(this.app.elements.sendBtn, 'Send message', 'bottom');
    
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

  setupUserContextMenu() {
    const userInfo = document.getElementById('user-info');
    const contextMenu = document.getElementById('user-context-menu');
    const settingsOption = document.getElementById('settings-option');
    const contactOption = document.getElementById('contact-option');
    const logoutOption = document.getElementById('logout-option');
    
    if (!userInfo || !contextMenu) return;

    userInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShowing = contextMenu.classList.contains('show');
        if (!isShowing) {
          this.closeAllDropdowns();
          const userInfoRect = userInfo.getBoundingClientRect();
          const sidebarRect = this.app.elements.sidebar.getBoundingClientRect();
          const isSidebarMinimized = this.app.elements.sidebar.classList.contains('minimized');
          contextMenu.style.position = 'fixed';
          contextMenu.style.zIndex = '1010';
          if (isSidebarMinimized) {
            contextMenu.style.left = `${sidebarRect.left + 10}px`;
            contextMenu.style.bottom = `${window.innerHeight - userInfoRect.top + 10}px`;
            contextMenu.style.top = 'auto';
            contextMenu.style.width = '180px';
          } else {
            contextMenu.style.bottom = `${window.innerHeight - userInfoRect.top + 5}px`;
            contextMenu.style.left = `${userInfoRect.left}px`;
            contextMenu.style.top = 'auto';
            contextMenu.style.width = `${userInfoRect.width}px`;
          }
          contextMenu.classList.add('show');
          setTimeout(() => {
            const closeHandler = (event) => {
              if (!contextMenu.contains(event.target) && !userInfo.contains(event.target)) {
                contextMenu.classList.remove('show');
                document.removeEventListener('click', closeHandler);
              }
            };
            document.addEventListener('click', closeHandler);
          }, 0);
        } else {
          contextMenu.classList.remove('show');
        }
    });

    if (settingsOption) {
      settingsOption.addEventListener('click', (e) => {
        e.stopPropagation();
        contextMenu.classList.remove('show');
        this.app.settingsManager.open(); 
      });
    }

    if (contactOption) {
      contactOption.addEventListener('click', (e) => {
        e.stopPropagation();
        contextMenu.classList.remove('show');
        
        // Use currentLang which is now synced
        const t = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
        
        this.app.modalManager.showModal({
          title: t.modals.contactTitle,
          message: t.modals.contactMessage,
          inputValue: null,
          confirmText: t.modals.ok,
          cancelText: t.modals.cancel,
          confirmClass: "",
          onConfirm: () => {}
        });
        
        this.app.elements.modalMessage.style.whiteSpace = 'pre-line';
        this.app.elements.modalMessage.style.textAlign = 'left';
        this.app.elements.modalMessage.style.lineHeight = '1.6';
        this.app.elements.modalCancel.style.display = 'none';
      });
    }

    if (logoutOption) {
      logoutOption.addEventListener('click', (e) => {
        e.stopPropagation();
        contextMenu.classList.remove('show');
        this.app.handleLogout();
      });
    }
  }

  setupDataViewModal() {
    const modal = document.getElementById('data-view-modal');
    const closeBtn = document.getElementById('data-view-close');
    const closeFooter = document.getElementById('data-view-close-btn');
    const modalBody = document.getElementById('data-view-body');
    const modalTitle = document.getElementById('data-view-title');
    
    if (!modal || !modalBody) return;

    const closeModal = () => {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (closeFooter) closeFooter.onclick = closeModal;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.view-data-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const messageContent = btn.closest('.message-content');
      if (!messageContent) return;

      const contentClone = messageContent.cloneNode(true);
      const btnInClone = contentClone.querySelector('.view-data-btn');
      if (btnInClone) btnInClone.remove();

      const hiddenContent = contentClone.querySelector('.data-content-hidden');
      if (hiddenContent) hiddenContent.style.display = 'block';

      modalBody.innerHTML = '';
      modalBody.appendChild(contentClone);

      const grids = modalBody.querySelectorAll('.grid-table-placeholder');
      grids.forEach(grid => {
        grid.innerHTML = ''; 
        delete grid.dataset.rendered; 
        grid.style.width = '100%'; 
      });

      const tables = modalBody.querySelectorAll('table:not(.styled):not(.gridjs-table)');
      tables.forEach(table => {
        if (!table.closest('.table-responsive')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'table-responsive';
          table.parentNode.insertBefore(wrapper, table);
          wrapper.appendChild(table);
        }
        table.classList.add('styled');
      });

      if (this.app.markdownParser) {
        this.app.markdownParser.applySyntaxHighlighting(modalBody);
        if (this.app.markdownParser.renderGrids) {
            this.app.markdownParser.renderGrids(modalBody);
        }
      }

      if (modalTitle) modalTitle.textContent = '📊 Data Analysis';

      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      modalBody.scrollTop = 0;
    });
  }

  showRateLimitTimer(waitTimeMs) {
    let timerDiv = document.getElementById('tts-rate-limit-timer');
    if (!timerDiv) {
        timerDiv = document.createElement('div');
        timerDiv.id = 'tts-rate-limit-timer';
        timerDiv.style.cssText = `
            position: fixed;
            bottom: 150px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            z-index: 10000;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            backdrop-filter: blur(4px);
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(timerDiv);
    }

    const updateTimer = () => {
        const remaining = Math.max(0, Math.ceil(waitTimeMs / 1000));
        timerDiv.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Voice limit reached. Resuming in ${remaining}s...</span>
        `;
        if (remaining <= 0) {
            this.hideRateLimitTimer();
        } else {
            waitTimeMs -= 1000;
            this._rateLimitTimeout = setTimeout(updateTimer, 1000);
        }
    };

    updateTimer();
    timerDiv.style.opacity = '1';
  }

  hideRateLimitTimer() {
    const timerDiv = document.getElementById('tts-rate-limit-timer');
    if (timerDiv) {
        timerDiv.style.opacity = '0';
        setTimeout(() => timerDiv.remove(), 300);
    }
    if (this._rateLimitTimeout) {
        clearTimeout(this._rateLimitTimeout);
        this._rateLimitTimeout = null;
    }
  }
}

export function showToast(message, type, duration) {
    if (window.chatApp) {
        window.chatApp.modalManager.showToast(message, type, duration);
    }
}

export function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('loading');
    } else {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

export function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        // Remove any inline styles that might be interfering
        m.style.top = '';
        m.style.left = '';
        m.style.right = '';
        m.style.bottom = '';
        m.style.transform = '';
        m.style.position = '';
        
        // Ensure display flex is set BEFORE adding active to allow transition to happen
        m.style.display = 'flex';
        m.style.zIndex = '10100';
        document.body.style.overflow = 'hidden';

        // Small delay to ensure CSS transition catches the change from opacity 0 to 1
        requestAnimationFrame(() => {
            m.classList.add('active');
        });
    }
}

export function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('active');
        
        // Allow body scroll when closing if no other modals are open
        const activeModals = document.querySelectorAll('.modal.active, .modal-overlay.active');
        if (activeModals.length <= 1) {
            document.body.style.overflow = '';
        }
        
        // Reset display after animation (300ms matches CSS transition)
        setTimeout(() => {
            if (!m.classList.contains('active')) {
                m.style.display = ''; // Reverts to CSS (display: none)
            }
        }, 300);
    }
}

export function validateJSON(str) { 
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}
