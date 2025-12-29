// frontend/assets/js/api.js
import { CONFIG } from './config.js';

export class APIManager {
  constructor() {
    this.authManager = null;
    this.markdownParser = null;
    this.abortController = null;
  }

  setAuthManager(authManager) {
    this.authManager = authManager;
  }

  setMarkdownParser(parser) {
    this.markdownParser = parser;
  }

  // ==========================================================
  // 🔐 AUTHENTICATION HEADERS
  // ==========================================================
  _getAuthHeaders() {
    if (!this.authManager) {
      throw new Error("AuthManager not initialized in API");
    }

    const session = this.authManager.getSession();
    const headers = {
      'Content-Type': 'application/json'
    };

    // 1. Handle ANONYMOUS GUEST Users (No Email)
    if (session && session.userType === 'guest') {
      return headers; 
    }

    // 2. Handle LOGGED IN Users (Employee OR External)
    // If they have a valid email, we identify them.
    if (session && session.email) {
      headers['X-User-Email'] = session.email; 
      return headers;
    }

    console.warn("⚠️ No valid session found for API request");
    return headers;
  }

  // ==========================================================
  // 🧠 CORE AI INTERACTION
  // ==========================================================
  
  async getAIResponse(question, hrKnowledgeBase, history, userName, thinkingDiv) {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const payload = {
      prompt: question,
      behavior_context: {
        conversation_history: history.slice(-10),
        user_name: userName,
        identity: { role: 'Company Assistant' }
      }
    };

    try {
      const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: this._getAuthHeaders(),
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('Maintenance Mode');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server Error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        answer: data.answer,
        accessed_documents: data.accessed_documents || [],
        accessed_tools: data.accessed_tools || [],
        source_categories: data.source_categories || {},
        meta: data.meta || null
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error("API Error:", error);
      throw error;
    }
  }

  async getThinkingPhrases(question, history, userName) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/thinking/phrases`, {
        method: "POST",
        headers: this._getAuthHeaders(),
        body: JSON.stringify({
          prompt: question,
          behavior_context: {
            conversation_history: history.slice(-10),
            user_name: userName
          }
        })
      });
      if (!response.ok) return { meta: null };
      const data = await response.json();
      return { meta: data.meta || null };
    } catch {
      return { meta: null };
    }
  }

  async getFollowUpSuggestions(conversationHistory, lastAnswer) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/follow-up`, {
        method: "POST",
        headers: this._getAuthHeaders(),
        body: JSON.stringify({
          conversation_history: conversationHistory,
          last_answer: lastAnswer
        })
      });
      
      if (!response.ok) return [];
      const data = await response.json();
      return data.questions || [];
    } catch (error) {
      console.error("Follow-up fetch error:", error);
      return [];
    }
  }

  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // ==========================================================
  // 📂 CHAT HISTORY
  // ==========================================================

  async loadChatHistory(userEmail) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/chats/load?email=${encodeURIComponent(userEmail)}`, {
        method: "GET",
        headers: this._getAuthHeaders()
      });

      if (!response.ok) throw new Error("Failed to load history");
      return await response.json();
    } catch (error) {
      console.error("Load History Error:", error);
      return { chats: [], currentConversation: [] };
    }
  }

  async saveChatHistory(data, userEmail) {
    try {
      const payload = {
        email: userEmail,
        chats: data.chats,
        currentConversation: data.currentConversation,
        activeChatIndex: data.activeChatIndex
      };

      await fetch(`${CONFIG.API_BASE}/chats/save`, {
        method: "POST",
        headers: this._getAuthHeaders(),
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error("Save History Error:", error);
    }
  }

  async deleteChatSession(userEmail, sessionId) {
    await fetch(`${CONFIG.API_BASE}/chats/delete`, {
      method: "DELETE",
      headers: this._getAuthHeaders(),
      body: JSON.stringify({ email: userEmail, sessionId })
    });
  }

  async renameChatSession(userEmail, sessionId, newTitle) {
    await fetch(`${CONFIG.API_BASE}/chats/rename`, {
      method: "PUT",
      headers: this._getAuthHeaders(),
      body: JSON.stringify({ email: userEmail, sessionId, newTitle })
    });
  }

  // ==========================================================
  // 🟢 KNOWLEDGE BASE (USER ACCESSIBLE)
  // ==========================================================

  async getDatabaseStats() {
      const res = await fetch(`${CONFIG.API_BASE}/database/stats`, { headers: this._getAuthHeaders() });
      return await res.json();
  }
  
  async hasKbSettingsAccess() {
      const res = await fetch(`${CONFIG.API_BASE}/features/kb-settings/access`, { headers: this._getAuthHeaders() });
      return await res.json();
  }
  
  async getDocuments() {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/documents`, { headers: this._getAuthHeaders() });
      return await res.json();
  }

  async getDocument(id) {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/documents/${id}`, { headers: this._getAuthHeaders() });
      return await res.json();
  }

  async createDocument(data) {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/documents`, {
          method: 'POST',
          headers: this._getAuthHeaders(),
          body: JSON.stringify(data)
      });
      return await res.json();
  }

  async updateDocument(id, data) {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/documents/${id}`, {
          method: 'PUT',
          headers: this._getAuthHeaders(),
          body: JSON.stringify(data)
      });
      return await res.json();
  }

  async deleteDocument(id) {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/documents/${id}`, {
          method: 'DELETE',
          headers: this._getAuthHeaders()
      });
      return await res.json();
  }
  
  async getCategories() {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/categories`, { headers: this._getAuthHeaders() });
      return await res.json();
  }
  
  // These use Admin endpoints but are mapped here for consistency
  async createCategory(name) {
      const res = await fetch(`${CONFIG.API_BASE}/admin/categories`, {
          method: 'POST',
          headers: this._getAuthHeaders(),
          body: JSON.stringify({ name })
      });
      return await res.json();
  }

  async updateCategory(id, name) {
      const res = await fetch(`${CONFIG.API_BASE}/admin/categories/${id}`, {
          method: 'PUT',
          headers: this._getAuthHeaders(),
          body: JSON.stringify({ name })
      });
      return await res.json();
  }
  
  async getSubcategories(catId) {
      const url = catId 
        ? `${CONFIG.API_BASE}/knowledge/subcategories/${catId}`
        : `${CONFIG.API_BASE}/knowledge/subcategories`;
      
      const res = await fetch(url, { headers: this._getAuthHeaders() });
      return await res.json();
  }

  async createSubcategory(name, category_id, description = '') {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/subcategories`, {
          method: 'POST',
          headers: this._getAuthHeaders(),
          body: JSON.stringify({ name, category_id, description })
      });
      return await res.json();
  }

  async updateSubcategory(id, name, category_id, description = '') {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/subcategories/${id}`, {
          method: 'PUT',
          headers: this._getAuthHeaders(),
          body: JSON.stringify({ name, category_id, description })
      });
      return await res.json();
  }

  async deleteSubcategory(id) {
      const res = await fetch(`${CONFIG.API_BASE}/knowledge/subcategories/${id}`, {
          method: 'DELETE',
          headers: this._getAuthHeaders()
      });
      return await res.json();
  }
  
  async regenerateCache() {
      const res = await fetch(`${CONFIG.API_BASE}/cache/regenerate`, { 
          method: 'POST',
          headers: this._getAuthHeaders() 
      });
      return await res.json();
  }

  async convertFileToJSON(file) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = this._getAuthHeaders();
    delete headers['Content-Type']; 

    const response = await fetch(`${CONFIG.API_BASE}/knowledge/convert-file`, {
      method: 'POST',
      headers: headers,
      body: formData
    });

    if (!response.ok) throw new Error("Conversion failed");
    return await response.json();
  }

  // ==========================================================
  // 🎙️ GEMINI TTS
  // ==========================================================

  async getTTS(text) {
      try {
          const allowedVoices = ['Puck','Charon','Kore','Fenrir','Aoede'];
          const voice = allowedVoices.includes(CONFIG.TTS_VOICE_NAME) ? CONFIG.TTS_VOICE_NAME : undefined;
          const response = await fetch(`${CONFIG.API_BASE}/tts/speak`, {
              method: 'POST',
              headers: this._getAuthHeaders(),
              body: JSON.stringify({ text, voice })
          });

          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || 'TTS generation failed');
          }

          return await response.blob();
      } catch (error) {
          console.error("API.getTTS Error:", error);
          throw error;
      }
  }

  // ==========================================================
  // ⚙️ SYSTEM & UTILS
  // ==========================================================

  async getSettings() {
      const res = await fetch(`${CONFIG.API_BASE}/admin/settings`, { headers: this._getAuthHeaders() });
      if (!res.ok) throw new Error("Unauthorized");
      return await res.json();
  }

  async updateSettings(data) {
      const res = await fetch(`${CONFIG.API_BASE}/admin/settings`, {
          method: 'PUT',
          headers: this._getAuthHeaders(),
          body: JSON.stringify(data)
      });
      return await res.json();
  }

  async getSystemHealth() {
      const res = await fetch(`${CONFIG.API_BASE}/admin/system/health`, { headers: this._getAuthHeaders() });
      return await res.json();
  }

  async updateUserName(email, newName) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: this._getAuthHeaders(),
        body: JSON.stringify({ email, name: newName })
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getUserProfile(email) {
    const url = `${CONFIG.API_BASE}/api/user/profile?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { headers: this._getAuthHeaders() });
    return await res.json();
  }

  async upsertUserProfile(profile) {
    const payload = {
      email: profile.email,
      name: profile.name,
      department: profile.department || null,
      position: profile.position || null,
      activate: profile.activate !== false
    };

    const res = await fetch(`${CONFIG.API_BASE}/api/user/profile`, {
      method: 'POST',
      headers: this._getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  async requestOtp(email) {
    const res = await fetch(`${CONFIG.API_BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await res.json();
  }

  async verifyOtp(email, code) {
    const res = await fetch(`${CONFIG.API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    return await res.json();
  }

  async deleteAccount(email) {
    const headers = this._getAuthHeaders();
    const payload = email ? { email } : null;
    const res = await fetch(`${CONFIG.API_BASE}/api/user/account`, {
      method: 'DELETE',
      headers: headers,
      body: payload ? JSON.stringify(payload) : undefined
    });
    return await res.json();
  }

  async initializeCDOCache() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/rag/status`, {
            headers: this._getAuthHeaders()
        });
        return await response.json();
    } catch (e) {
        return null;
    }
  }
}