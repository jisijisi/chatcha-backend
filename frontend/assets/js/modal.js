// Modal and Toast Management
import { CONFIG } from './config.js';

export class ModalManager {
  constructor(elements) {
    this.elements = elements;
    this.modalConfirmCallback = null;
  }

  showWelcomeModal(onConfirm) {
    this.showModal({
      title: "Welcome to ChatCHA! ✨", // No change needed
      message: "I'm CHA, your AI assistant for CDO Foodsphere! I'm here to help with questions about company policies, history, products, and more.\n\nWhat should I call you?", // UPDATED
      inputValue: "",
      confirmText: "Let's Get Started! 🚀",
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
    const { title, message, inputValue = "", confirmText = "Confirm", confirmClass = "", onConfirm } = options;
    
    this.elements.modalTitle.textContent = title;
    this.elements.modalMessage.textContent = message;
    this.elements.modalConfirm.textContent = confirmText;
    
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
    
    this.modalConfirmCallback = onConfirm;
  }

  closeModal() {
    this.elements.modalOverlay.classList.remove("active");
    this.elements.modalOverlay.setAttribute("aria-hidden", "true");
    this.elements.modalInput.value = "";
    this.modalConfirmCallback = null;
    
    this.elements.modalCancel.style.display = '';
    this.elements.modalClose.style.display = '';
    this.elements.modalOverlay.style.pointerEvents = '';
    this.elements.modalMessage.style.whiteSpace = '';
    this.elements.modalMessage.style.textAlign = '';
    this.elements.modalMessage.style.lineHeight = '';
  }

  handleModalConfirm() {
    if (this.modalConfirmCallback) {
      const inputVisible = this.elements.modalInput.style.display !== "none";
      const value = inputVisible ? this.elements.modalInput.value.trim() : true;
      this.modalConfirmCallback(value);
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
    if (!document.getElementById('tooltip-styles')) {
      const style = document.createElement('style');
      style.id = 'tooltip-styles';
      style.textContent = `
        .tooltip-wrapper {
          position: relative;
          display: inline-flex;
        }
      `;
      document.head.appendChild(style);
    }
  }

  addTooltip(element, text, position = 'top') {
    if (!element || window.innerWidth <= CONFIG.MOBILE_BREAKPOINT) return;
    
    const existingTooltip = element.querySelector('.tooltip');
    if (existingTooltip && existingTooltip.textContent === text) {
      return;
    }
    
    const tooltip = document.createElement('div');
    tooltip.className = `tooltip ${position}`;
    tooltip.textContent = text;
    
    element.style.position = 'relative';
    element.appendChild(tooltip);
    
    let showTimeout;
    let hideTimeout;
    
    const showTooltip = () => {
      const isSidebarElement = element.closest('#sidebar');
      const sidebar = document.getElementById('sidebar');
      if (isSidebarElement && sidebar && !sidebar.classList.contains('minimized')) {
        return;
      }
      
      clearTimeout(hideTimeout);
      showTimeout = setTimeout(() => {
        tooltip.classList.add('show');
        this.positionTooltip(tooltip, element, position);
      }, 300);
    };
    
    const hideTooltip = () => {
      clearTimeout(showTimeout);
      hideTimeout = setTimeout(() => {
        tooltip.classList.remove('show');
      }, 100);
    };
    
    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('focus', showTooltip);
    element.addEventListener('blur', hideTooltip);
    
    element._tooltipHandlers = { showTooltip, hideTooltip };
  }

  positionTooltip(tooltip, element, position) {
    const elementRect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    let top, left;
    
    switch (position) {
      case 'top':
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        if (top < 10) {
          top = elementRect.bottom + 8;
          tooltip.className = 'tooltip bottom show';
        }
        break;
        
      case 'right':
        top = elementRect.top + (elementRect.height / 2) - (tooltipRect.height / 2);
        left = elementRect.right + 8;
        if (left + tooltipRect.width > viewport.width - 10) {
          left = elementRect.left - tooltipRect.width - 8;
          tooltip.className = 'tooltip left show';
        }
        break;
        
      default:
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
    }
    
    left = Math.max(10, Math.min(left, viewport.width - tooltipRect.width - 10));
    top = Math.max(10, Math.min(top, viewport.height - tooltipRect.height - 10));
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  removeSidebarTooltips() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    const sidebarElements = sidebar.querySelectorAll('[class*="tooltip"]');
    sidebarElements.forEach(element => {
      const tooltip = element.querySelector('.tooltip');
      if (tooltip) {
        tooltip.remove();
      }
    });
  }
}