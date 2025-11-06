// LocalStorage Management
import { CONFIG } from './config.js';

export class StorageManager {
  constructor() {
    this._saveTimeout = null;
  }

  loadFromStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Failed to load ${key}:`, error);
      return null;
    }
  }

  saveToStorage(data) {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION, JSON.stringify(data.currentConversation));
        localStorage.setItem(CONFIG.STORAGE_KEYS.CHATS, JSON.stringify(data.chats));
        localStorage.setItem(CONFIG.STORAGE_KEYS.ACTIVE_CHAT_INDEX, JSON.stringify(data.activeChatIndex));
        localStorage.setItem(CONFIG.STORAGE_KEYS.HISTORY_COLLAPSED, JSON.stringify(data.historyCollapsed));
        if (data.userName) {
          localStorage.setItem(CONFIG.STORAGE_KEYS.USER_NAME, JSON.stringify(data.userName));
        }
        this._saveTimeout = null;
      } catch (error) {
        console.error("Failed to save to storage:", error);
      }
    }, 100);
  }

  loadAll() {
    return {
      chats: this.loadFromStorage(CONFIG.STORAGE_KEYS.CHATS) || [],
      currentConversation: this.loadFromStorage(CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION) || [],
      activeChatIndex: this.loadFromStorage(CONFIG.STORAGE_KEYS.ACTIVE_CHAT_INDEX),
      historyCollapsed: this.loadFromStorage(CONFIG.STORAGE_KEYS.HISTORY_COLLAPSED) ?? false,
      userName: this.loadFromStorage(CONFIG.STORAGE_KEYS.USER_NAME) || null
    };
  }
}