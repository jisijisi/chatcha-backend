// config.js - Updated to handle local testing and production environments

// --- Environment Flag ---
// Set to 'false' for local development, 'true' for production builds/deployment
const IS_PRODUCTION = true; // <<< CHANGE THIS TO TRUE FOR THE RENDER DEPLOYMENT

// --- Dynamic URLs ---
const LOCAL_API_BASE = "http://localhost:3000";
const PROD_API_BASE = "https://chatcha-backend.onrender.com";

const API_BASE = IS_PRODUCTION ? PROD_API_BASE : LOCAL_API_BASE;

export const CONFIG = {
  // Core AI Endpoint
  API_URL: `${API_BASE}/ask`,
  
  // History Persistence Endpoints
  HISTORY_API_URL_BASE: `${API_BASE}/chats`, // Use this base URL for /load and /save
  
  // Rest of your config...
  GOOGLE_SCRIPT_URL: "",
  
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