// UI Helper Functions
import { escapeHtml } from './utils.js';

// Toast notifications
function showToast(message, type = 'success', duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.background = type === 'success' ? '#27ae60' : '#e74c3c';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Modal management
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// === NEW: Generic Confirmation Modal Logic ===
function showConfirmationModal(options) {
  const { 
    title, 
    message, 
    confirmText = 'Confirm', 
    confirmType = 'primary', // 'primary' or 'danger'
    onConfirm 
  } = options;

  const modal = document.getElementById('confirmation-modal');
  const modalTitle = document.getElementById('confirm-modal-title');
  const modalMessage = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-btn');
  const cancelBtn = document.getElementById('confirm-modal-cancel');
  const closeBtn = document.getElementById('confirm-modal-close');

  if (!modal || !confirmBtn) return;

  // Set Content
  modalTitle.textContent = title;
  modalMessage.innerHTML = message; // Allow HTML for bolding text
  
  // Set Button Style & Text
  const btnTextSpan = confirmBtn.querySelector('.btn-text');
  if (btnTextSpan) btnTextSpan.textContent = confirmText;
  
  // Reset classes and add specific type
  confirmBtn.className = `btn btn-${confirmType}`;

  // Handle Events
  // We use onclick to override previous listeners easily for this singleton modal
  const closeHandler = () => closeModal('confirmation-modal');
  
  cancelBtn.onclick = closeHandler;
  closeBtn.onclick = closeHandler;

  confirmBtn.onclick = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    closeModal('confirmation-modal');
    if (typeof onConfirm === 'function') {
      await onConfirm();
    }
  };

  openModal('confirmation-modal');
}

// Button loading states
function setButtonLoading(button, isLoading) {
  if (!button) return;
  
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');
  
  if (isLoading) {
    button.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoading) btnLoading.style.display = 'inline-block';
  } else {
    button.disabled = false;
    if (btnText) btnText.style.display = 'inline-block';
    if (btnLoading) btnLoading.style.display = 'none';
  }
}

// Form validation
function validateJSON(jsonString) {
  const validDiv = document.getElementById('json-validator');
  if (!validDiv) return false;
  
  // If empty, don't show validation message
  if (!jsonString || jsonString.trim() === '') {
    validDiv.textContent = "";
    validDiv.className = "json-validator";
    return false;
  }
  
  try {
    JSON.parse(jsonString);
    validDiv.textContent = "✅ Valid JSON";
    validDiv.className = "json-validator valid";
    return true;
  } catch (e) {
    validDiv.textContent = "❌ Invalid JSON: " + e.message;
    validDiv.className = "json-validator invalid";
    return false;
  }
}

// Initialize JSON validation for document editor
function setupJSONValidation() {
  const jsonInput = document.getElementById('doc-content-input');
  const validDiv = document.getElementById('json-validator');
  
  if (jsonInput && validDiv) {
    // Initial validation
    validateJSON(jsonInput.value);
    
    // Real-time validation on input
    jsonInput.addEventListener('input', () => {
      validateJSON(jsonInput.value);
    });
  }
}

// Status badge generation
function getStatusColor(status) {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  return 'info';
}

function createStatusBadge(status) {
  const color = getStatusColor(status);
  return `<span class="badge badge-${color}">${status}</span>`;
}

// Table row actions
function createActionButtons(actions) {
  return `
    <div class="action-buttons">
      ${actions.map(action => `
        <button class="action-btn action-btn-${action.type}" 
                onclick="${action.onclick}"
                ${action.disabled ? 'disabled' : ''}>
          ${action.icon} ${action.text}
        </button>
      `).join('')}
    </div>
  `;
}

// Hide global loader
function hideGlobalLoader() {
  const loader = document.getElementById('global-loader');
  const container = document.getElementById('adminContainer');
  
  if (container) {
    container.classList.add('loaded');
  }
  
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => {
      if (loader && loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
    }, 300);
  }
}

// === SKELETON LOADING SYSTEM ===
const SkeletonLoader = {
  // Skeleton Templates
  templates: {
    dashboard: `
      <div class="skeleton-dashboard-stats">
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
      </div>
      <div class="skeleton-chart-grid">
        <div class="skeleton-chart">
          <div class="skeleton skeleton-title" style="width: 30%;"></div>
          <div class="skeleton skeleton-rect" style="height: 250px;"></div>
        </div>
        <div class="skeleton-chart">
          <div class="skeleton skeleton-title" style="width: 50%;"></div>
          <div class="skeleton skeleton-avatar" style="width: 150px; height: 150px; margin: 40px auto; display:block;"></div>
        </div>
      </div>
      <div class="skeleton-chart" style="height: 400px;">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-rect" style="height: 40px; margin-bottom: 20px;"></div>
        <div class="skeleton-table-row">
          <div class="skeleton skeleton-table-cell"></div>
          <div class="skeleton skeleton-table-cell"></div>
          <div class="skeleton skeleton-table-cell"></div>
        </div>
        <div class="skeleton-table-row">
          <div class="skeleton skeleton-table-cell"></div>
          <div class="skeleton skeleton-table-cell"></div>
          <div class="skeleton skeleton-table-cell"></div>
        </div>
        <div class="skeleton-table-row">
          <div class="skeleton skeleton-table-cell"></div>
          <div class="skeleton skeleton-table-cell"></div>
          <div class="skeleton skeleton-table-cell"></div>
        </div>
      </div>
    `,
    table: `
      <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
        <div style="display:flex; justify-content:space-between; margin-bottom: 20px;">
          <div class="skeleton skeleton-button"></div>
          <div class="skeleton skeleton-button"></div>
        </div>
        <div class="skeleton-table-row" style="border-bottom: 2px solid #e5e7eb; margin-bottom: 10px;">
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton skeleton-text medium"></div>
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton skeleton-text short"></div>
        </div>
        ${Array(5).fill(`
          <div class="skeleton-table-row">
            <div class="skeleton skeleton-table-cell"></div>
            <div class="skeleton skeleton-table-cell"></div>
            <div class="skeleton skeleton-table-cell"></div>
            <div class="skeleton skeleton-table-cell"></div>
          </div>
        `).join('')}
      </div>
    `,
    cards: `
      <div style="margin-bottom: 20px;">
        <div class="skeleton skeleton-title"></div>
      </div>
      <div class="skeleton-card-grid">
        ${Array(4).fill(`
          <div class="skeleton-card">
            <div style="display:flex; align-items:center; gap: 10px;">
              <div class="skeleton skeleton-avatar"></div>
              <div style="flex:1;">
                <div class="skeleton skeleton-text short"></div>
                <div class="skeleton skeleton-text medium"></div>
              </div>
            </div>
            <div class="skeleton skeleton-rect" style="height: 60px;"></div>
          </div>
        `).join('')}
      </div>
    `,
    chat: `
      <div style="display:flex; height: 70vh; gap: 20px;">
        <div style="width: 300px; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div class="skeleton skeleton-text medium" style="margin-bottom: 20px;"></div>
          ${Array(5).fill(`
            <div style="display:flex; gap: 10px; margin-bottom: 15px;">
              <div class="skeleton skeleton-avatar"></div>
              <div style="flex:1;">
                <div class="skeleton skeleton-text short"></div>
                <div class="skeleton skeleton-text medium"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="flex:1; background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
           <div class="skeleton skeleton-title" style="width: 30%;"></div>
           <div style="margin-top: 40px; display: flex; flex-direction: column; gap: 20px;">
             <div class="skeleton skeleton-text medium" style="align-self: flex-end; width: 40%; height: 40px; border-radius: 12px 12px 0 12px;"></div>
             <div class="skeleton skeleton-text long" style="align-self: flex-start; width: 60%; height: 60px; border-radius: 12px 12px 12px 0;"></div>
             <div class="skeleton skeleton-text medium" style="align-self: flex-end; width: 30%; height: 40px; border-radius: 12px 12px 0 12px;"></div>
           </div>
        </div>
      </div>
    `
  },

  render(container, type) {
    if (!container) return;
    
    // Determine template based on type or use default
    let template = this.templates.table; // Default
    
    if (type === 'dashboard') template = this.templates.dashboard;
    else if (type === 'knowledge' || type === 'integrations') template = this.templates.cards;
    else if (type === 'chats') template = this.templates.chat;
    else if (type === 'users' || type === 'permissions') template = this.templates.table;
    
    container.innerHTML = `<div class="fade-in">${template}</div>`;
  }
};

// Make functions globally available for HTML onclick handlers
window.showToast = showToast;
window.validateJSON = validateJSON;
window.setupJSONValidation = setupJSONValidation;
window.SkeletonLoader = SkeletonLoader;
// Expose showConfirmationModal if needed by inline scripts
window.showConfirmationModal = showConfirmationModal;

export {
  showToast,
  openModal,
  closeModal,
  showConfirmationModal, // Exported for modules
  setButtonLoading,
  validateJSON,
  setupJSONValidation,
  getStatusColor,
  createStatusBadge,
  createActionButtons,
  hideGlobalLoader,
  SkeletonLoader
};
