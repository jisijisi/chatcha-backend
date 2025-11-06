// config.js - Updated for new backend
export const CONFIG = {
  // Change this line - remove the port and use the Render domain
  API_URL: "https://chatcha-backend.onrender.com/ask",
  
  // Rest of your config...
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbz9lRRV1Yc9nUknapn4-gliWSU3BfmpSzBuca200hV2C8z0469rMpLfN4VcwZ7y6nJ6bQ/exec",
  
  STORAGE_KEYS: {
    CHATS: "chats",
    CURRENT_CONVERSATION: "currentConversation",
    ACTIVE_CHAT_INDEX: "activeChatIndex",
    HISTORY_COLLAPSED: "historyCollapsed",
    USER_NAME: "userName",
    CDO_CACHE: "cdoInfoCache",
    CDO_CACHE_TIMESTAMP: "cdoCacheTimestamp"
  },
  
  MAX_TITLE_LENGTH: 30,
  MOBILE_BREAKPOINT: 1024,
  
  RAG_CONFIG: {
    ENABLED: true,
    SEARCH_TOP_K: 12,
    TIMEOUT_MS: 10000
  }
};