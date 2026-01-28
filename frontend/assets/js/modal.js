import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';

export class ModalManager {
  constructor(elements) {
    this.elements = elements;
    this.modalConfirmCallback = null;
  }

  showWelcomeModal(options = {}, onConfirm) {
    // Handle legacy call (if first arg is function)
    if (typeof options === 'function') {
      onConfirm = options;
      options = {};
    }
    const { currentName = '', isCompany = false, isGuest = false } = options;

    this.currentStep = 1;

    // Add special ID to modal overlay for styling
    this.elements.modalOverlay.id = 'welcome-modal-overlay';
    
    this.showModal({
      title: "Welcome to ChatCDO! ✨", 
      message: "I'm Cindy, your AI assistant for CDO Foodsphere! I'm here to help with questions about company policies, history, products, and more.",
      inputValue: null,
      confirmText: "Let's Get Started! 🚀",
      cancelText: null,
      confirmClass: "",
      onConfirm
    });
    
    // Hide default elements
    this.elements.modalInput.style.display = 'none';
    this.elements.modalCancel.style.display = 'none';
    this.elements.modalConfirm.style.display = 'none'; // Initially hide confirm button
    this.elements.modalClose.style.display = 'none';
    this.elements.modalOverlay.style.pointerEvents = 'none';
    this.elements.modalOverlay.querySelector('.modal').style.pointerEvents = 'auto';
    
    const body = this.elements.modalOverlay.querySelector('.modal-body');
    const modal = this.elements.modalOverlay.querySelector('.modal');
    
    // Cleanup previous elements
    const cleanup = () => {
      ['welcome-avatar-section', 'employee-status-group', 'profile-details-group', 'name-group'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
    cleanup();

    // --- Add Avatar Section (after header, before body content) ---
    const header = this.elements.modalOverlay.querySelector('.modal-header');
    let avatarSection = document.createElement('div');
    avatarSection.id = 'welcome-avatar-section';
    avatarSection.className = 'welcome-avatar-section';
    avatarSection.innerHTML = `
      <img src="assets/images/avatar-welcome.png" alt="Cindy Robot Avatar" class="welcome-avatar">
    `;
    
    // Insert after header
    if (header.nextSibling) {
      modal.insertBefore(avatarSection, header.nextSibling);
    } else {
      modal.appendChild(avatarSection);
    }

    // --- STEP 1 UI: Preferred Name Input ---
    const nameGroup = document.createElement('div');
    nameGroup.id = 'name-group';
    nameGroup.innerHTML = `
      <label class="form-label" style="display:block; margin-bottom:8px; font-weight:600;">What should I call you?</label>
      <input type="text" id="name-input" class="modal-input" placeholder="Enter your name" value="${currentName || ''}" autocomplete="off" style="margin-bottom: 20px;">
    `;

    body.appendChild(nameGroup);

    const nameInput = nameGroup.querySelector('#name-input');

    // Handle Guest Mode (Hide Avatar)
    if (isGuest) {
        if (avatarSection) avatarSection.style.display = 'none';
    }

    const updateModalState = () => {
      this.elements.modalConfirm.textContent = "Let's Get Started! 🚀";
      this.elements.modalConfirm.dataset.originalText = "Let's Get Started! 🚀";
      this.elements.modalConfirm.style.display = 'inline-block';
      
      // Disable button if input is empty
      this.elements.modalConfirm.disabled = !nameInput.value.trim();
      
      setTimeout(() => nameInput.focus(), 100);
    };

    // Input listeners to enable/disable button
    nameInput.addEventListener('input', () => {
      this.elements.modalConfirm.disabled = !nameInput.value.trim();
    });

    // Initial state
    updateModalState();

    // Define the wrapper callback
    const wrapperCallback = async (val) => {
      console.log('📘 Modal Confirm Callback Triggered', { step: this.currentStep, val });
      
      if (this.currentStep === 1) {
        const displayName = nameInput.value.trim();
        if (!displayName) {
          this.showToast('Please enter a display name', 'error');
          return false;
        }
        
        // Employee status is now determined by email domain (passed via options.isCompany)
        localStorage.setItem('is_cdo_employee', isCompany ? 'yes' : 'no');
        
        if (typeof onConfirm === 'function') return onConfirm(displayName);
        return true;
      }
    };

    this.modalConfirmCallback = wrapperCallback;
  }

  getSessionEmail() {
    try {
      const session = JSON.parse(localStorage.getItem('chatcdo_session') || '{}');
      return session.email;
    } catch (e) { return null; }
  }

  showModal(options) {
    const { 
      title, 
      message, 
      inputValue = "", 
      confirmText = "Confirm", 
      cancelText = "Cancel",
      confirmClass = "", 
      onConfirm 
    } = options;

    // --- Cleanup any existing onboarding elements ---
    ['welcome-avatar-section', 'employee-status-group', 'employee-number-group', 'profile-details-group', 'guest-name-group', 'name-group'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    
    this.elements.modalTitle.textContent = title;
    this.elements.modalMessage.textContent = message;
    this.elements.modalConfirm.textContent = confirmText;
    if (this.elements.modalConfirm) this.elements.modalConfirm.setAttribute('type', 'button');
    if (this.elements.modalCancel) {
      this.elements.modalCancel.setAttribute('type', 'button');
      // Clone modalCancel to reset listeners and ensure clean state
      const newCancelBtn = this.elements.modalCancel.cloneNode(true);
      this.elements.modalCancel.parentNode.replaceChild(newCancelBtn, this.elements.modalCancel);
      this.elements.modalCancel = newCancelBtn;
      this.elements.modalCancel.addEventListener("click", () => this.closeModal());
    }
    if (this.elements.modalClose) this.elements.modalClose.setAttribute('type', 'button');
    
    if (cancelText) {
      this.elements.modalCancel.textContent = cancelText;
      this.elements.modalCancel.style.display = 'inline-block';
    } else {
      this.elements.modalCancel.style.display = 'none';
    }
    
    this.elements.modalConfirm.dataset.originalText = confirmText;
    
    this.elements.modalConfirm.className = "modal-btn modal-btn-confirm";
    if (confirmClass) {
      this.elements.modalConfirm.classList.add(confirmClass);
    }
    
    if (inputValue !== null) {
      this.elements.modalInput.style.display = "block";
      this.elements.modalInput.value = inputValue;
      this.elements.modalInput.focus();
    } else {
      this.elements.modalInput.style.display = "none";
    }
    
    this.elements.modalOverlay.classList.add("active");
    this.elements.modalOverlay.setAttribute("aria-hidden", "false");
    this.elements.modalOverlay.style.zIndex = '10250';
    const innerModal = this.elements.modalOverlay.querySelector('.modal');
    if (innerModal) innerModal.style.zIndex = '10251';
    
    const newConfirmBtn = this.elements.modalConfirm.cloneNode(true);
    this.elements.modalConfirm.parentNode.replaceChild(newConfirmBtn, this.elements.modalConfirm);
    this.elements.modalConfirm = newConfirmBtn;
    
    this.elements.modalConfirm.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleModalConfirm(e);
    });

    this.modalConfirmCallback = onConfirm;
  }

  closeModal() {
    // Remove welcome modal ID
    if (this.elements.modalOverlay.id === 'welcome-modal-overlay') {
      this.elements.modalOverlay.removeAttribute('id');
    }
    
    this.elements.modalOverlay.classList.remove("active");
    this.elements.modalOverlay.setAttribute("aria-hidden", "true");
    this.elements.modalInput.value = "";
    this.modalConfirmCallback = null;
    
    const body = this.elements.modalOverlay.querySelector('.modal-body') || this.elements.modalMessage.parentNode;
    ['welcome-avatar-section', 'employee-status-group', 'employee-number-group', 'profile-details-group', 'guest-name-group', 'name-group'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    
    this.elements.modalConfirm.disabled = false;
    this.elements.modalConfirm.classList.remove('loading');
    
    this.elements.modalCancel.style.display = '';
    this.elements.modalClose.style.display = '';
    this.elements.modalOverlay.style.pointerEvents = '';
    this.elements.modalMessage.style.whiteSpace = '';
    this.elements.modalMessage.style.textAlign = '';
    this.elements.modalMessage.style.lineHeight = '';
  }

  async handleModalConfirm(e) {
    console.log('📘 handleModalConfirm triggered');
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    if (this.elements.modalConfirm.disabled || this.elements.modalConfirm.classList.contains('loading')) {
      console.warn('⚠️ Button disabled or loading, ignoring click');
      return;
    }

    if (this.modalConfirmCallback) {
      console.log('✅ this.modalConfirmCallback exists, executing...');
      const inputVisible = this.elements.modalInput.style.display !== "none";
      const value = inputVisible ? this.elements.modalInput.value.trim() : true;
      let shouldClose = true;
      try {
        const result = this.modalConfirmCallback(value);
        
        if (result instanceof Promise) {
          const btn = this.elements.modalConfirm;
          const originalText = btn.dataset.originalText || btn.textContent;
          
          const lang = localStorage.getItem('app_language') || 'en';
          const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
          const processingText = t.modals.processing || "Processing...";
          
          btn.disabled = true;
          btn.classList.add('loading');
          btn.innerHTML = `<span class="btn-spinner"></span> ${processingText}`;
          
          const awaited = await result;
          if (awaited === false) {
            shouldClose = false;
          }
          
          if (!shouldClose) {
            btn.disabled = false;
            btn.classList.remove('loading');
            // If the callback updated the originalText dataset (e.g., changing state/step), use that
            btn.textContent = btn.dataset.originalText || originalText;
          }
        } else {
          if (result === false) {
            shouldClose = false;
          }
        }
      } catch (error) {
        console.error("Modal action failed:", error);
      }
      if (shouldClose) {
        this.closeModal();
      }
      return;
    }
    console.warn('⚠️ No modalConfirmCallback defined, closing modal');
    this.closeModal();
  }

  showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const existingToasts = container.querySelectorAll('.toast');
    existingToasts.forEach(toast => {
      if (toast.textContent.includes(message)) {
        toast.remove();
      }
    });
    
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('data-toast-id', toastId);
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);
    
    const removeToast = () => {
      if (!toast.classList.contains('hiding')) {
        toast.classList.add('hiding');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
          if (container && container.children.length === 0) {
            container.remove();
          }
        }, 300);
      }
    };
    
    setTimeout(removeToast, duration);
    toast.addEventListener('click', removeToast);
    
    return toast;
  }

  initializeTooltips() {
    // Styles handled in CSS
  }

  addTooltip(element, text, position = 'top') {
    if (!element) return;
    
    // Disable custom tooltips to prevent "toast notification on every movement"
    // Instead, rely on native browser tooltips via title attribute
    if (!element.title) {
        element.title = text;
    }
    if (!element.getAttribute('aria-label')) {
        element.setAttribute('aria-label', text);
    }
    
    // Remove any existing custom tooltip logic/listeners if they were previously attached
    // (In a fresh reload this part isn't strictly necessary but good for cleanup if we were hot-swapping)
    if (element._tooltipHandlers) {
        element.removeEventListener('mouseenter', element._tooltipHandlers.showTooltip);
        element.removeEventListener('mouseleave', element._tooltipHandlers.hideTooltip);
        element.removeEventListener('pointerleave', element._tooltipHandlers.hideTooltip);
        element.removeEventListener('focus', element._tooltipHandlers.showTooltip);
        element.removeEventListener('blur', element._tooltipHandlers.hideTooltip);
        delete element._tooltipHandlers;
    }
  }

  positionTooltip(tooltip, element, position) {
    // Legacy method - disabled
  }

  removeSidebarTooltips() {
    // Legacy method - disabled
    const tooltips = document.querySelectorAll('.tooltip');
    tooltips.forEach(t => t.remove());
  }
}
