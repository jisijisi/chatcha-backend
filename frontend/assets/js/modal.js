// frontend/assets/js/modal.js - Added Cancel Text Support
import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';

export class ModalManager {
  constructor(elements) {
    this.elements = elements;
    this.modalConfirmCallback = null;
  }

  showWelcomeModal(onConfirm) {
    this.showModal({
      title: "Welcome to ChatCDO! ✨", 
      message: "I'm Cindy, your AI assistant for CDO Foodsphere! I'm here to help with questions about company policies, history, products, and more.\n\nWhat should I call you?",
      inputValue: "",
      confirmText: "Let's Get Started! 🚀",
      cancelText: null, // No cancel option for welcome
      confirmClass: "",
      onConfirm
    });
    
    this.elements.modalMessage.style.whiteSpace = 'pre-line';
    this.elements.modalMessage.style.textAlign = 'left';
    this.elements.modalMessage.style.lineHeight = '1.6';
    
    this.elements.modalCancel.style.display = 'none';
    this.elements.modalClose.style.display = 'none';
    this.elements.modalOverlay.style.pointerEvents = 'none';
    this.elements.modalOverlay.querySelector('.modal').style.pointerEvents = 'auto';
  }

  showModal(options) {
    const { 
      title, 
      message, 
      inputValue = "", 
      confirmText = "Confirm", 
      cancelText = "Cancel", // Default fallback
      confirmClass = "", 
      onConfirm 
    } = options;
    
    this.elements.modalTitle.textContent = title;
    this.elements.modalMessage.textContent = message;
    this.elements.modalConfirm.textContent = confirmText;
    if (this.elements.modalConfirm) this.elements.modalConfirm.setAttribute('type', 'button');
    if (this.elements.modalCancel) this.elements.modalCancel.setAttribute('type', 'button');
    if (this.elements.modalClose) this.elements.modalClose.setAttribute('type', 'button');
    
    // Update Cancel Button Text
    if (cancelText) {
      this.elements.modalCancel.textContent = cancelText;
      this.elements.modalCancel.style.display = 'inline-block';
    } else {
      this.elements.modalCancel.style.display = 'none';
    }
    
    // Store original text for restoring after loading
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
    
    this.modalConfirmCallback = onConfirm;
  }

  closeModal() {
    this.elements.modalOverlay.classList.remove("active");
    this.elements.modalOverlay.setAttribute("aria-hidden", "true");
    this.elements.modalInput.value = "";
    this.modalConfirmCallback = null;
    
    // Reset button state
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
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (this.modalConfirmCallback) {
      const inputVisible = this.elements.modalInput.style.display !== "none";
      const value = inputVisible ? this.elements.modalInput.value.trim() : true;
      let shouldClose = true;
      try {
        // Check if the callback returns a promise (is async)
        const result = this.modalConfirmCallback(value);
        
        if (result instanceof Promise) {
          // Show loading state
          const btn = this.elements.modalConfirm;
          const originalText = btn.dataset.originalText || btn.textContent;
          
          // Get current language for "Processing..." text
          const lang = localStorage.getItem('app_language') || 'en';
          const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
          const processingText = t.modals.processing || "Processing...";
          
          btn.disabled = true;
          btn.classList.add('loading');
          // Add spinner and localized processing text
          btn.innerHTML = `<span class="btn-spinner"></span> ${processingText}`;
          
          // Wait for completion
          const awaited = await result;
          if (awaited === false) {
            shouldClose = false;
          }
          // Restore button state if staying open
          if (!shouldClose) {
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = originalText;
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
    if (!element || window.innerWidth <= CONFIG.MOBILE_BREAKPOINT) return;
    let tooltip = null;
    // Global handlers to guarantee cleanup even on fast hover/scroll
    let onDocPointerDown, onDocScroll, onWinResize, onWinBlur, onPointerMove, onDocMouseLeave;
    const showTooltip = () => {
      // FIX: Check if element exists before accessing properties
      if (!element) return;
      
      const isSidebarElement = element.closest('#sidebar');
      const sidebar = document.getElementById('sidebar');
      if (isSidebarElement && sidebar && !sidebar.classList.contains('minimized')) {
        return;
      }
      const existing = document.querySelectorAll('.tooltip');
      existing.forEach(t => t.remove());
      tooltip = document.createElement('div');
      tooltip.className = `tooltip ${position}`;
      tooltip.textContent = text;
      document.body.appendChild(tooltip);
      requestAnimationFrame(() => {
        if (tooltip && tooltip.classList) { // Add safety check
            tooltip.classList.add('show');
            this.positionTooltip(tooltip, element, position);
        }
      });
      // Attach robust hide triggers
      onDocPointerDown = () => hideTooltip();
      onDocScroll = () => hideTooltip();
      onWinResize = () => hideTooltip();
      onWinBlur = () => hideTooltip();
      onPointerMove = () => {
        if (!element || !element.matches(':hover')) hideTooltip();
      };
      onDocMouseLeave = () => hideTooltip();
      document.addEventListener('pointerdown', onDocPointerDown, { passive: true });
      document.addEventListener('wheel', onDocScroll, { passive: true, capture: true });
      document.addEventListener('scroll', onDocScroll, { passive: true, capture: true });
      window.addEventListener('resize', onWinResize);
      window.addEventListener('blur', onWinBlur);
      document.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('mouseleave', onDocMouseLeave);
    };
    const hideTooltip = () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
      // Detach global listeners to avoid leaks
      if (onDocPointerDown) document.removeEventListener('pointerdown', onDocPointerDown);
      if (onDocScroll) {
        document.removeEventListener('wheel', onDocScroll, { capture: true });
        document.removeEventListener('scroll', onDocScroll, { capture: true });
      }
      if (onWinResize) window.removeEventListener('resize', onWinResize);
      if (onWinBlur) window.removeEventListener('blur', onWinBlur);
      if (onPointerMove) document.removeEventListener('pointermove', onPointerMove);
      if (onDocMouseLeave) document.removeEventListener('mouseleave', onDocMouseLeave);
      onDocPointerDown = onDocScroll = onWinResize = onWinBlur = onPointerMove = onDocMouseLeave = null;
    };
    // Ensure element exists before adding listeners
    if (element) {
        element.addEventListener('mouseenter', showTooltip, { passive: true });
        // Use both mouseleave and pointerleave to maximize reliability
        element.addEventListener('mouseleave', hideTooltip, { passive: true });
        element.addEventListener('pointerleave', hideTooltip, { passive: true });
        element.addEventListener('focus', showTooltip);
        element.addEventListener('blur', hideTooltip);
        element._tooltipHandlers = { showTooltip, hideTooltip };
    }
  }

  positionTooltip(tooltip, element, position) {
    if (!tooltip || !element) return;
    const elementRect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isInInputArea = !!element.closest('.input-area');
    let top, left;
    switch (position) {
      case 'top':
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        if (top < 10) { top = elementRect.bottom + 8; tooltip.className = 'tooltip bottom show'; }
        break;
      case 'bottom':
        top = elementRect.bottom + 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        if (!isInInputArea && (top + tooltipRect.height > viewport.height - 10)) {
          top = elementRect.top - tooltipRect.height - 8;
          tooltip.className = 'tooltip top show';
        } else {
          tooltip.className = 'tooltip bottom show';
        }
        break;
      case 'right':
        top = elementRect.top + (elementRect.height / 2) - (tooltipRect.height / 2);
        left = elementRect.right + 8;
        if (left + tooltipRect.width > viewport.width - 10) { left = elementRect.left - tooltipRect.width - 8; tooltip.className = 'tooltip left show'; }
        break;
      default:
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
    }
    left = Math.max(10, Math.min(left, viewport.width - tooltipRect.width - 10));
    if (position === 'bottom' && isInInputArea) {
      top = Math.max(10, top);
    } else {
      top = Math.max(10, Math.min(top, viewport.height - tooltipRect.height - 10));
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  removeSidebarTooltips() {
    const tooltips = document.querySelectorAll('.tooltip');
    tooltips.forEach(t => t.remove());
  }
}
