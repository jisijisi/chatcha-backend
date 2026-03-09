// Main Admin Panel Entry Point
import { checkAuth, handleLogout, API_BASE, getAuthToken } from './core/api.js';
import { showToast, hideGlobalLoader } from './core/ui.js';
import { setupNavigation, setupMobileMenu, switchView } from './core/navigation.js';

// Global state for modules
window.adminCharts = {};

// Initialize all modules
async function initializeModules() {
  try {
    console.log('Initializing admin modules...');

    // Import and setup all modules
    const modules = await Promise.all([
      import('./modules/dashboard.js').then(module => {
        console.log('Dashboard module loaded');
        module.setupDashboard();
        return module;
      }),
      import('./modules/knowledge-base.js').then(module => {
        console.log('Knowledge Base module loaded');
        module.setupKnowledgeBase();
        return module;
      }),
      import('./modules/user-management.js').then(module => {
        console.log('User Management module loaded');
        module.setupUserManagement();
        return module;
      }),
      import('./modules/permissions.js').then(module => {
        console.log('Permissions module loaded');
        module.setupPermissionsManagement();
        return module;
      }),
      import('./modules/chat-management.js').then(module => {
        console.log('Chat Management module loaded');
        module.setupChatManagement();
        return module;
      }),
      import('./modules/integrations.js').then(module => {
        console.log('Integrations module loaded');
        module.setupIntegrationsView();
        return module;
      }),
      import('./modules/settings.js').then(module => {
        console.log('Settings module loaded');
        module.setupSettingsManagement();
        return module;
      }),
      import('./modules/notifications.js').then(module => {
        console.log('Notifications module loaded');
        module.initNotifications();
        return module;
      })
    ]);

    console.log('All modules initialized successfully');

  } catch (error) {
    console.error('Error initializing modules:', error);
    showToast('Error initializing modules', 'error');
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Admin panel initializing...');
    
    // Determine if this is a fresh open or a refresh using sessionStorage
    // sessionStorage persists through refreshes but is cleared when the tab/window is closed
    const isRefresh = sessionStorage.getItem('adminSessionActive');
    let initialView = 'dashboard';

    if (!isRefresh) {
      // Freshly opened - Reset all session state to defaults
      console.log('Fresh session detected. Resetting state.');
      sessionStorage.setItem('adminSessionActive', 'true');
      
      localStorage.removeItem('adminCurrentView');
      localStorage.setItem('adminDashboardTimeframe', 'overall');
      localStorage.setItem('adminKBTab', 'documents');
      localStorage.setItem('adminIntTab', 'sources');
    } else {
      // Page refresh - Restore the last viewed page
      console.log('Refresh detected. Restoring last view.');
      const savedView = localStorage.getItem('adminCurrentView');
      if (savedView) {
        initialView = savedView;
      }
    }

    // Clear hash to prevent routing issues
    if (window.location.hash) {
      window.history.replaceState(null, null, window.location.pathname);
    }

    // Check authentication
    if (!checkAuth()) return;
    
    // Setup core functionality
    setupNavigation();
    setupMobileMenu();
    
    // Setup logout handler
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Initialize all modules
    await initializeModules();
    
    // Update active state in sidebar for the initial view
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.view === initialView) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    await switchView(initialView);

    console.log('Admin panel initialized successfully');

  } catch (error) {
    console.error("Initialization error:", error);
    showToast("Error initializing dashboard", "error");
  } finally {
    hideGlobalLoader();
  }
});

// Make core functions available globally for HTML onclick handlers
window.handleLogout = handleLogout;
window.API_BASE = API_BASE;
window.getAuthToken = getAuthToken;