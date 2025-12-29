// frontend/assets/js/config.js

// 1. Determine if we are in production based on hostname
// If the hostname is NOT localhost or 127.0.0.1, we assume it's production.
const IS_PRODUCTION = window.location.hostname !== 'localhost' && 
                      window.location.hostname !== '127.0.0.1';

// 2. Define API Base URLs
const LOCAL_API_BASE = "http://localhost:3000";
const PROD_API_BASE = "https://chatcha-backend.onrender.com"; // Replace if you use a different domain

// 3. Select the correct base URL
const API_BASE = IS_PRODUCTION ? PROD_API_BASE : LOCAL_API_BASE;

console.log(`[Config] Running in ${IS_PRODUCTION ? 'Production' : 'Development'} mode.`);
console.log(`[Config] API Base URL: ${API_BASE}`);

export const CONFIG = {
  IS_PRODUCTION,
  API_BASE,
  // Core Endpoints
  API_URL: `${API_BASE}/ask`,
  HISTORY_API_URL_BASE: `${API_BASE}/chats`,
  TTS_VOICE_NAME: "leda",
  ENABLE_LIVE_TTS: false,
  LIVE_TTS_SAMPLE_RATE: 24000,
  LIVE_TTS_JITTER_MS: 50,
  
  // Storage Keys
  STORAGE_KEYS: {
    CHATS: "chats",
    CURRENT_CONVERSATION: "currentConversation",
    ACTIVE_CHAT_INDEX: "activeChatIndex",
    HISTORY_COLLAPSED: "historyCollapsed",
    USER_NAME: "userName",
    CDO_CACHE: "cdoInfoCache",
    CDO_CACHE_TIMESTAMP: "cdoCacheTimestamp"
  },
  
  // App Constants
  MAX_TITLE_LENGTH: 30,
  MOBILE_BREAKPOINT: 1024,
  
  // RAG Configuration
  RAG_CONFIG: {
    ENABLED: true,
    SEARCH_TOP_K: 12,
    TIMEOUT_MS: 30000 
  }
  ,
  // Microphone response behavior: 'thinking' = show thinking phrases (text response),
  // 'full-duplex' = use voice full-duplex streaming (audio + streaming text)
  MIC_RESPONSE_MODE: 'full-duplex'
};