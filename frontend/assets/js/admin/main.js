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
    
    // Load initial view
    await switchView('dashboard');

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