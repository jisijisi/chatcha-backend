// data-sync.js - Data Synchronization and Persistence Manager
import { CONFIG } from './config.js';

export class DataSyncManager {
  constructor(authManager, apiManager) {
    this._saveTimeout = null;
    this.authManager = authManager;
    this.apiManager = apiManager;
  }

  // Get the appropriate local storage key based on user type (used ONLY for GUEST data)
  getGuestStorageKey(baseKey) {
    // For guests, use base key (shared/temporary)
    return baseKey;
  }

  /**
   * Loads ALL chat data from the appropriate source (API for employee, LocalStorage for guest).
   * @returns {Object} All application data (chats, currentConversation, etc.)
   */
  async loadAll() {
    const userType = this.authManager.getUserType();
    
    if (userType === 'employee') {
      const userEmail = this.authManager.getUserEmail();
      if (userEmail) {
        // 1. Employee: Load from API
        return this.apiManager.loadChatHistory(userEmail);
      }
    }

    // 2. Guest or Employee without email (Fallback to LocalStorage)
    console.log('Loading data from LocalStorage (Guest/Fallback mode)');
    return {
      chats: this.loadGuestFromLocalStorage(CONFIG.STORAGE_KEYS.CHATS) || [],
      currentConversation: this.loadGuestFromLocalStorage(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION) || [],
      activeChatIndex: this.loadGuestFromLocalStorage(CONFIG.STORAGE_KEYS.ACTIVE_CHAT_INDEX),
      historyCollapsed: this.loadGuestFromLocalStorage(CONFIG.STORAGE_KEYS.HISTORY_COLLAPSED) ?? false,
      userName: this.loadGuestFromLocalStorage(CONFIG.STORAGE_KEYS.USER_NAME) || null
    };
  }
  
  // Helper to load data ONLY from local storage (used for GUEST/Fallback)
  loadGuestFromLocalStorage(key) {
    try {
      const storageKey = this.getGuestStorageKey(key);
      const data = localStorage.getItem(storageKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Failed to load ${key} from LocalStorage:`, error);
      return null;
    }
  }

  /**
   * Saves ALL chat data to the appropriate source (API for employee, LocalStorage for guest).
   * @param {Object} data - The data structure to save.
   */
  saveToStorage(data) {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    
    this._saveTimeout = setTimeout(async () => {
      const userType = this.authManager.getUserType();
      
      if (userType === 'employee') {
        const userEmail = this.authManager.getUserEmail();
        if (userEmail) {
          // 1. Employee: Save to API
          this.apiManager.saveChatHistory(data, userEmail);
        } else {
          console.error('Cannot save employee data, email missing.');
        }
      } else {
        // 2. Guest: Save to LocalStorage
        try {
          const currentConvKey = this.getGuestStorageKey(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION);
          const chatsKey = this.getGuestStorageKey(CONFIG.STORAGE_KEYS.CHATS);
          const activeChatKey = this.getGuestStorageKey(CONFIG.STORAGE_KEYS.ACTIVE_CHAT_INDEX);
          const historyCollapsedKey = this.getGuestStorageKey(CONFIG.STORAGE_KEYS.HISTORY_COLLAPSED);
          const userNameKey = this.getGuestStorageKey(CONFIG.STORAGE_KEYS.USER_NAME);

          localStorage.setItem(currentConvKey, JSON.stringify(data.currentConversation));
          localStorage.setItem(chatsKey, JSON.stringify(data.chats));
          localStorage.setItem(activeChatKey, JSON.stringify(data.activeChatIndex));
          localStorage.setItem(historyCollapsedKey, JSON.stringify(data.historyCollapsed));
          
          if (data.userName) {
            localStorage.setItem(userNameKey, JSON.stringify(data.userName));
          }
          
          console.log('Data saved to LocalStorage for guest session.');
        } catch (error) {
          console.error("Failed to save to LocalStorage:", error);
        }
      }
      
      this._saveTimeout = null;
    }, 100);
  }
}