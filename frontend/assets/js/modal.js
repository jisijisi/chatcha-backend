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
    const { currentName = '', isCompany = false } = options;

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
    this.elements.modalClose.style.display = 'none';
    this.elements.modalOverlay.style.pointerEvents = 'none';
    this.elements.modalOverlay.querySelector('.modal').style.pointerEvents = 'auto';
    
    const body = this.elements.modalOverlay.querySelector('.modal-body');
    const modal = this.elements.modalOverlay.querySelector('.modal');
    
    // Cleanup previous elements
    const cleanup = () => {
      ['welcome-avatar-section', 'employee-status-group', 'employee-number-group', 'profile-details-group', 'guest-name-group'].forEach(id => {
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

    // --- STEP 1 UI: Employee Status Question ---
    const statusGroup = document.createElement('div');
    statusGroup.id = 'employee-status-group';
    
    const yesChecked = isCompany ? 'checked' : '';
    
    statusGroup.innerHTML = `
      <label class="employee-status-label">Are you an employee of CDO Foodsphere?</label>
      <div class="radio-card-container">
        <label class="radio-card ${isCompany ? 'selected' : ''}" data-value="yes">
          <input type="radio" name="is_cdo_employee" value="yes" ${yesChecked}>
          <div class="radio-card-icon">✓</div>
          <div class="radio-card-label">Yes</div>
        </label>
        <label class="radio-card" data-value="no">
          <input type="radio" name="is_cdo_employee" value="no">
          <div class="radio-card-icon">✕</div>
          <div class="radio-card-label">No</div>
        </label>
      </div>
    `;

    // If company user, hide the question
    if (isCompany) {
      statusGroup.style.display = 'none';
    }

    const numberGroup = document.createElement('div');
    numberGroup.id = 'employee-number-group';
    numberGroup.style.display = 'none';
    numberGroup.innerHTML = `
      <label class="form-label" style="display:block; margin-bottom:8px; font-weight:600;">Employee Number *</label>
      <input type="text" id="employee-number-input" class="modal-input" placeholder="e.g. 123456" autocomplete="off" style="margin-bottom: 20px;">
    `;
    
    const guestNameGroup = document.createElement('div');
    guestNameGroup.id = 'guest-name-group';
    guestNameGroup.style.display = 'none';
    guestNameGroup.innerHTML = `
      <label class="form-label" style="display:block; margin-bottom:8px; font-weight:600;">What should I call you?</label>
      <input type="text" id="guest-name-input" class="modal-input" placeholder="Enter your name" value="${currentName || ''}" autocomplete="off" style="margin-bottom: 20px;">
    `;

    body.appendChild(statusGroup);
    body.appendChild(numberGroup);
    body.appendChild(guestNameGroup);

    const yesCard = statusGroup.querySelector('.radio-card[data-value="yes"]');
    const noCard = statusGroup.querySelector('.radio-card[data-value="no"]');
    const yesRadio = statusGroup.querySelector('input[value="yes"]');
    const noRadio = statusGroup.querySelector('input[value="no"]');
    const numberInput = numberGroup.querySelector('#employee-number-input');
    const guestInput = guestNameGroup.querySelector('#guest-name-input');

    const updateCardSelection = () => {
      yesCard.classList.toggle('selected', yesRadio.checked);
      noCard.classList.toggle('selected', noRadio.checked);
      
      if (yesRadio.checked) {
        numberGroup.style.display = 'block';
        guestNameGroup.style.display = 'none';
        setTimeout(() => numberInput.focus(), 100);
      } else if (noRadio.checked) {
        numberGroup.style.display = 'none';
        guestNameGroup.style.display = 'block';
        setTimeout(() => guestInput.focus(), 100);
      }
    };

    yesCard.addEventListener('click', () => {
      yesRadio.checked = true;
      updateCardSelection();
    });

    noCard.addEventListener('click', () => {
      noRadio.checked = true;
      updateCardSelection();
    });

    yesRadio.addEventListener('change', updateCardSelection);
    noRadio.addEventListener('change', updateCardSelection);

    // Initial state
    updateCardSelection();

    // Define the wrapper callback
    const wrapperCallback = async (val) => {
      console.log('📘 Modal Confirm Callback Triggered', { step: this.currentStep, val });
      
      if (this.currentStep === 1) {
        const isEmployee = yesRadio.checked;
        const isExternal = noRadio.checked;

        if (!isEmployee && !isExternal) {
          this.showToast('Please select if you are an employee or not.', 'warning');
          return false;
        }
        
        console.log('👤 Is Employee:', isEmployee);
        
        if (isEmployee) {
          const empNo = numberInput.value.trim();
          console.log('🔢 Employee Number:', empNo);
          
          if (!empNo) {
            this.showToast('Employee number is required', 'error', 3500);
            return false;
          }

          try {
            console.log('🚀 Sending validation request to:', `${CONFIG.API_BASE}/auth/validate-employee`);
            const response = await fetch(`${CONFIG.API_BASE}/auth/validate-employee`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ emp_id: empNo })
            });
            
            const data = await response.json();
            
            if (!data.valid) {
              this.showToast(data.message || 'Invalid Employee ID', 'error', 3500);
              return false;
            }

            // Valid Employee! Switch to Step 2
            this.currentStep = 2;
            this.tempEmployeeData = data.employee;

            // Update UI for Step 2
            cleanup();
            if (avatarSection) avatarSection.remove();
            
            this.elements.modalTitle.textContent = "Confirm Your Profile";
            this.elements.modalMessage.textContent = "Please review and confirm your employee details.";
            
            const profileGroup = document.createElement('div');
            profileGroup.id = 'profile-details-group';
            profileGroup.innerHTML = `
              <div style="margin-bottom:16px;">
                <label class="form-label" style="display:block; margin-bottom:6px; font-weight:600;">Display Name *</label>
                <input type="text" id="profile-name" class="modal-input" value="${data.employee.full_name || ''}" autocomplete="off">
              </div>
              <div style="margin-bottom:16px;">
                <label class="form-label" style="display:block; margin-bottom:6px; font-weight:600;">Department *</label>
                <input type="text" id="profile-dept" class="modal-input" value="${data.employee.department || ''}" readonly style="background:var(--bg-secondary);" autocomplete="off">
              </div>
              <div style="margin-bottom:16px;">
                <label class="form-label" style="display:block; margin-bottom:6px; font-weight:600;">Job Position *</label>
                <input type="text" id="profile-pos" class="modal-input" value="${data.employee.position || ''}" readonly style="background:var(--bg-secondary);" autocomplete="off">
              </div>
            `;
            body.appendChild(profileGroup);
            
            this.elements.modalConfirm.textContent = "Confirm & Continue 🎉";
            
            return false;

          } catch (err) {
            console.error("❌ Validation error:", err);
            this.showToast('Validation failed. Please try again.', 'error');
            return false;
          }

        } else {
          // Non-employee
          const guestName = guestInput.value.trim();
          if (!guestName) {
            this.showToast('Please enter a display name', 'error');
            return false;
          }
          
          try {
            const userEmail = this.getSessionEmail();
            if (userEmail) {
              await fetch(`${CONFIG.API_BASE}/api/user/profile`, {
                method: 'PUT',
                headers: { 
                  'Content-Type': 'application/json',
                  'X-User-Email': userEmail 
                },
                body: JSON.stringify({ 
                  email: userEmail,
                  name: guestName,
                  department: 'External',
                  position: 'External User'
                })
              });
            }
          } catch (e) {
            console.warn('Failed to save external profile', e);
          }
          
          localStorage.setItem('is_cdo_employee', 'no');
          localStorage.removeItem('employee_number');
          
          if (typeof onConfirm === 'function') return onConfirm(guestName);
          return true;
        }
      }

      if (this.currentStep === 2) {
        const profileName = document.getElementById('profile-name').value.trim();
        if (!profileName) {
          this.showToast('Display Name is required', 'error');
          return false;
        }

        try {
          const userEmail = this.getSessionEmail();
          const regResponse = await fetch(`${CONFIG.API_BASE}/auth/register-employee`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-User-Email': userEmail
            },
            body: JSON.stringify({ emp_id: this.tempEmployeeData.emp_id })
          });
          
          const regData = await regResponse.json();
          if (!regData.success) {
            this.showToast(regData.message || 'Registration failed', 'error');
            return false;
          }

          localStorage.setItem('is_cdo_employee', 'yes');
          localStorage.setItem('employee_number', this.tempEmployeeData.emp_id);
          
          if (typeof onConfirm === 'function') return onConfirm(profileName);
          return true;

        } catch (err) {
          console.error("❌ Registration error:", err);
          this.showToast('Failed to register employee. Try again.', 'error');
          return false;
        }
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
    
    this.elements.modalTitle.textContent = title;
    this.elements.modalMessage.textContent = message;
    this.elements.modalConfirm.textContent = confirmText;
    if (this.elements.modalConfirm) this.elements.modalConfirm.setAttribute('type', 'button');
    if (this.elements.modalCancel) this.elements.modalCancel.setAttribute('type', 'button');
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
    ['welcome-avatar-section', 'employee-status-group', 'employee-number-group', 'profile-details-group', 'guest-name-group'].forEach(id => {
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
    if (!element || window.innerWidth <= CONFIG.MOBILE_BREAKPOINT) return;
    let tooltip = null;
    let onDocPointerDown, onDocScroll, onWinResize, onWinBlur, onPointerMove, onDocMouseLeave;
    
    const showTooltip = () => {
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
        if (tooltip && tooltip.classList) {
          tooltip.classList.add('show');
          this.positionTooltip(tooltip, element, position);
        }
      });
      
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
    
    if (element) {
      element.addEventListener('mouseenter', showTooltip, { passive: true });
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
        if (left + tooltipRect.width > viewport.width - 10) { 
          left = elementRect.left - tooltipRect.width - 8; 
          tooltip.className = 'tooltip left show'; 
        }
        break;
      default:
        top = elementRect.top - tooltipRect.height - 8;
        left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        if (top < 10) { top = elementRect.bottom + 8; tooltip.className = 'tooltip bottom show'; }
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