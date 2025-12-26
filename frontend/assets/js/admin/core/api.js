// API Configuration and Helper Functions
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocal 
  ? 'http://localhost:3000' 
  : window.location.origin;

console.log(`[Admin] API_BASE set to: ${API_BASE}`);

let adminUser = null;

// Authentication
function checkAuth() {
  const session = localStorage.getItem('chatcdo_admin_session');
  if (!session) {
    window.location.href = 'admin-login.html';
    return false;
  }
  try {
    adminUser = JSON.parse(session);
    document.getElementById('adminUsername').textContent = adminUser.name || 'Admin';
    return true;
  } catch (e) {
    console.error('Invalid session data', e);
    localStorage.removeItem('chatcdo_admin_session');
    window.location.href = 'admin-login.html';
    return false;
  }
}

function getAuthToken() {
  return adminUser ? `Bearer ${adminUser.token}` : '';
}

// Updated logout with modal
function handleLogout() {
  openLogoutModal();
}

function openLogoutModal() {
  const modal = document.getElementById('logout-modal');
  if (modal) {
    modal.classList.add('active');
    
    // Setup event listeners if not already set
    const closeBtn = document.getElementById('logout-modal-close');
    const cancelBtn = document.getElementById('logout-cancel-btn');
    const confirmBtn = document.getElementById('logout-confirm-btn');
    
    if (closeBtn) {
      closeBtn.onclick = closeLogoutModal;
    }
    if (cancelBtn) {
      cancelBtn.onclick = closeLogoutModal;
    }
    if (confirmBtn) {
      confirmBtn.onclick = confirmLogout;
    }
  }
}

function closeLogoutModal() {
  const modal = document.getElementById('logout-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function confirmLogout() {
  localStorage.removeItem('chatcdo_admin_session');
  window.location.href = 'admin-login.html';
}

// API Fetch with error handling
async function apiFetch(endpoint, options = {}, timeout = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const defaultOptions = {
    headers: {
      'Authorization': getAuthToken(),
      'X-User-Email': adminUser ? adminUser.email : '',
      'Content-Type': 'application/json'
    },
    signal: controller.signal
  };
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...defaultOptions, ...options });
    clearTimeout(id);
    
    if (response.status === 401) {
      showToast('Session expired. Please log in again.', 'error');
      setTimeout(confirmLogout, 2000);
      throw new Error('Unauthorized');
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Server might be slow or down.');
    }
    throw error;
  }
}

// Make functions globally available
window.API_BASE = API_BASE;
window.getAuthToken = getAuthToken;
window.handleLogout = handleLogout;

export { 
  API_BASE, 
  adminUser, 
  checkAuth, 
  getAuthToken, 
  handleLogout, 
  apiFetch 
};