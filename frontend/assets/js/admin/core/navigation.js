// Navigation and View Management
import { showToast } from './ui.js';

let currentView = 'dashboard';

// View configurations with module setup
const VIEW_CONFIG = {
  dashboard: {
    title: 'Dashboard',
    loader: () => import('../modules/dashboard.js').then(module => {
      // Ensure dashboard is setup and loaded
      return module.loadDashboard();
    })
  },
  knowledge: {
    title: 'Knowledge Base',
    loader: () => import('../modules/knowledge-base.js').then(module => {
      // Ensure knowledge base is setup
      module.setupKnowledgeBase();
      return module.loadKnowledgeBaseData();
    })
  },
  users: {
    title: 'User Management',
    loader: () => import('../modules/user-management.js').then(module => {
      module.setupUserManagement();
      return module.loadUsers();
    })
  },
  permissions: {
    title: 'Access Control',
    loader: () => import('../modules/permissions.js').then(module => {
      module.setupPermissionsManagement();
      return module.loadPermissionUsers();
    })
  },
  chats: {
    title: 'Chat History & Analytics',
    loader: () => import('../modules/chat-management.js').then(module => {
      module.setupChatManagement();
      return module.loadChatData();
    })
  },
  integrations: {
    title: 'Integration Hub',
    loader: () => import('../modules/integrations.js').then(module => {
      module.setupIntegrationsView();
      return module.loadIntegrationData();
    })
  },
  settings: {
    title: 'Settings',
    loader: () => import('../modules/settings.js').then(module => {
      module.setupSettingsManagement();
      return module.loadSettingsData();
    })
  }
};

// Setup navigation
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // Update UI immediately for better responsiveness
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      if (window.innerWidth <= 768) {
        document.getElementById('adminSidebar').classList.remove('active');
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) overlay.classList.remove('active');
      }

      const view = item.dataset.view;
      await switchView(view);
    });
  });
}

// Switch between views
async function switchView(view) {
  if (!VIEW_CONFIG[view]) {
    console.error(`Unknown view: ${view}`);
    return;
  }

  // Hide all views
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Show target view
  const activeSection = document.getElementById(`${view}-view`);
  if (activeSection) {
    activeSection.classList.add('active');
  } else {
    console.error(`View section not found: ${view}-view`);
    return;
  }
  
  // Update page title
  document.getElementById('pageTitle').textContent = VIEW_CONFIG[view].title;
  currentView = view;
  
  // Load view-specific data
  try {
    await VIEW_CONFIG[view].loader();
  } catch (error) {
    console.error(`Error loading view ${view}:`, error);
    showToast(`Error loading ${VIEW_CONFIG[view].title}`, 'error');
  }
}

// Mobile menu setup
function setupMobileMenu() {
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('adminSidebar');

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      if (sidebar) {
        sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }
}

// Get current view
function getCurrentView() {
  return currentView;
}

export {
  setupNavigation,
  setupMobileMenu,
  switchView,
  getCurrentView,
  VIEW_CONFIG
};