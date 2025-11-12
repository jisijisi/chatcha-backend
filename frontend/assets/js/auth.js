// Authentication Manager
import { CONFIG } from './config.js'; // Import CONFIG for keys

export class AuthManager {
  constructor() {
    this.sessionKey = 'chatcdo_session';
  }

  // Check if user is authenticated
  isAuthenticated() {
    const session = this.getSession();
    return session !== null;
  }

  // Get current session data
  getSession() {
    try {
      const data = localStorage.getItem(this.sessionKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  // Get user type (employee or guest)
  getUserType() {
    const session = this.getSession();
    return session ? session.userType : null;
  }

  // Get user email (null if guest)
  getUserEmail() {
    const session = this.getSession();
    return session ? session.email : null;
  }

  // Get username (null if guest)
  getUsername() {
    const session = this.getSession();
    return session ? session.username : null;
  }

  // Get user-specific storage key for employee data
  getUserStorageKey(baseKey) {
    const session = this.getSession();
    if (!session || session.userType !== 'employee' || !session.email) {
      // Return the base key for guests/unauthenticated (though data-sync should handle this)
      return baseKey;
    }
    // Create a unique key based on user's email
    return `${baseKey}_${session.email}`;
  }

  // Get default display name based on user type
  getDefaultDisplayName() {
    const session = this.getSession();
    if (!session) return 'You';
    
    // If employee, return email; if guest, return 'You'
    if (session.userType === 'employee' && session.email) {
      return session.email;
    }
    
    return 'You';
  }

  // Logout user
  logout() {
    try {
      const session = this.getSession();
      
      // If guest, clear ALL chat data
      if (session && session.userType === 'guest') {
        this.clearGuestData();
      }
      
      // Remove session
      localStorage.removeItem(this.sessionKey);
      return true;
    } catch (error) {
      console.error('Failed to logout:', error);
      return false;
    }
  }

  // Clear all guest data from localStorage
  clearGuestData() {
    try {
      console.log('🧹 Starting GUEST data cleanup...');
      
      // Define ALL possible base keys that should be cleared for guests
      const baseKeys = [
        CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION,
        CONFIG.STORAGE_KEYS.CHATS,
        CONFIG.STORAGE_KEYS.ACTIVE_CHAT_INDEX,
        CONFIG.STORAGE_KEYS.HISTORY_COLLAPSED,
        CONFIG.STORAGE_KEYS.USER_NAME,
        this.sessionKey // Also clear the session key if needed outside of logout
      ];
      
      let removedCount = 0;
      
      // Clear ALL base keys (these are the non-suffixed guest keys)
      baseKeys.forEach(key => {
        try {
          const storageKey = key; // For guests, the storage key is the base key
          
          if (localStorage.getItem(storageKey) !== null) {
            localStorage.removeItem(storageKey);
            console.log(`✓ Removed guest key: ${storageKey}`);
            removedCount++;
          }
        } catch (e) {
          console.log(`- Error removing key: ${key}`, e);
        }
      });
      
      console.log(`✅ Guest data cleanup completed. Removed ${removedCount} items.`);
      
    } catch (error) {
      console.error('❌ Failed to clear guest data:', error);
    }
  }

  // Redirect to login if not authenticated
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }
}