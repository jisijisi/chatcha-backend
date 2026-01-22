// login.js - Split Screen Design with Full Functionality
import { AuthManager } from './auth.js'; 
import { CONFIG } from './config.js';

class LoginManager {
  constructor() {
    this.elements = {
      // Main sections
      loginSection: document.getElementById('loginSection'),
      otpSection: document.getElementById('otpSection'),
      
      // Login form elements
      emailInput: document.getElementById('emailInput'),
      loginForm: document.getElementById('loginForm'),
      loginBtn: document.getElementById('loginBtn'),
      
      // OTP form elements
      otpForm: document.getElementById('otpForm'),
      otpInput: document.getElementById('otpInput'),
      otpEmailDisplay: document.getElementById('otpEmailDisplay'),
      verifyBtn: document.getElementById('verifyBtn'),
      resendBtn: document.getElementById('resendBtn'),
      backBtn: document.getElementById('backBtn'),
      
      // Alternative login buttons
      googleBtn: document.getElementById('googleBtn'),
      guestBtn: document.getElementById('guestBtn'),
      
      // Toast notification
      toast: document.getElementById('toast'),
      
      // Hidden Google sign-in container
      googleSigninContainer: document.getElementById('google-signin-container')
    };

    // Configuration
    this.config = {
      allowedDomains: ['cdo.com.ph'], // Replace with your company domains
      clientId: '45685664065-92lsvsnth8ork4g6nr0nvhsmuk63f961.apps.googleusercontent.com',
      resendTimer: 60 // Resend OTP timer in seconds
    };

    this.authManager = new AuthManager();
    this.googleScriptLoaded = false;
    this.googleInitialized = false;
    this.resendTimerInterval = null;
    this.resendTimeRemaining = 0;
    this.init();
  }

  init() {
    console.log('🔐 Initializing Login Manager...');
    
    // Check if user is already logged in
    this.checkExistingSession();

    // Setup event listeners
    this.setupEventListeners();

    // Load the Google GSI script dynamically
    this.loadGoogleScript();
  }

  checkExistingSession() {
    const sessionData = this.getSessionData();
    if (sessionData) {
      console.log('✅ Existing session found, redirecting...');
      window.location.href = 'index.html';
    }
  }

  setupEventListeners() {
    // Login form submission
    if (this.elements.loginForm) {
      this.elements.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleStartLogin();
      });
    }

    // OTP form submission
    if (this.elements.otpForm) {
      this.elements.otpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleVerifyOtp();
      });
    }

    // Back button
    if (this.elements.backBtn) {
      this.elements.backBtn.addEventListener('click', () => this.resetOtpView());
    }

    // Resend OTP button
    if (this.elements.resendBtn) {
      this.elements.resendBtn.addEventListener('click', () => this.handleResendOtp());
    }

    // Google button - trigger Google Sign-In
    if (this.elements.googleBtn) {
      this.elements.googleBtn.addEventListener('click', () => {
        this.handleGoogleButtonClick();
      });
    }

    // Guest button
    if (this.elements.guestBtn) {
      this.elements.guestBtn.addEventListener('click', () => {
        this.handleGuestLogin();
      });
    }

    // OTP Input Enhancement
    if (this.elements.otpInput) {
      // Only allow numbers
      this.elements.otpInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
      
      // Prevent paste of non-numeric content
      this.elements.otpInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const numericOnly = pastedText.replace(/[^0-9]/g, '').slice(0, 6);
        e.target.value = numericOnly;
      });
    }
  }

  /**
   * Dynamically loads the Google GSI script
   */
  loadGoogleScript() {
    console.log('📦 Loading Google GSI script...');
    
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('✅ Google GSI script loaded successfully');
      this.googleScriptLoaded = true;
      this.initializeGoogleSignIn();
    };
    
    script.onerror = () => {
      console.error('❌ Failed to load Google GSI script');
      this.showToast('Could not load Google Sign-In. Please check your connection.', 'error');
      this.googleScriptLoaded = false;
    };
    
    document.body.appendChild(script);
  }

  /**
   * Handle email/OTP login start
   */
  async handleStartLogin() {
    try {
      const email = this.elements.emailInput?.value?.trim();
      
      if (!email) {
        this.showToast('Enter a valid email', 'error');
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.showToast('Please enter a valid email address', 'error');
        return;
      }

      // Disable button and show loading state
      this.elements.loginBtn.disabled = true;
      const originalText = this.elements.loginBtn.querySelector('span').textContent;
      this.elements.loginBtn.querySelector('span').textContent = 'Sending...';

      const res = await fetch(`${CONFIG.API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      
      // Re-enable button
      this.elements.loginBtn.disabled = false;
      this.elements.loginBtn.querySelector('span').textContent = originalText;
      
      if (data.success) {
        this.showToast('OTP sent to your email', 'success');
        this.showOtpView();
      } else {
        this.showToast(data.message || 'Failed to send OTP', 'error');
      }
    } catch (e) {
      // Re-enable button on error
      this.elements.loginBtn.disabled = false;
      this.elements.loginBtn.querySelector('span').textContent = 'Login';
      this.showToast('Network error. Try again.', 'error');
    }
  }

  /**
   * Handle OTP verification
   */
  async handleVerifyOtp() {
    try {
      const email = this.elements.emailInput?.value?.trim();
      const code = this.elements.otpInput?.value?.trim();
      
      if (!email || !code) {
        this.showToast('Enter email and OTP', 'error');
        return;
      }

      if (code.length !== 6) {
        this.showToast('OTP must be 6 digits', 'error');
        return;
      }

      // Disable button and show loading state
      this.elements.verifyBtn.disabled = true;
      const originalText = this.elements.verifyBtn.querySelector('span').textContent;
      this.elements.verifyBtn.querySelector('span').textContent = 'Verifying...';

      const res = await fetch(`${CONFIG.API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Stop timer on successful verification
        this.stopResendTimer();
        
        const user = data.user || {};
        const username = user.name || email.split('@')[0];
        let pendingAvatar = null;
        
        try {
          const key = `chatcdo_pending_avatar_${user.email || email}`;
          pendingAvatar = localStorage.getItem(key);
          if (pendingAvatar) localStorage.removeItem(key);
        } catch (e) {}
        
        this.saveSessionData({
          userType: user.type || 'employee',
          email: user.email || email,
          username: username,
          picture: pendingAvatar || null,
          authMethod: 'otp',
          userId: user.id,
          isNewUser: !!data.is_new_user,
          loginTime: new Date().toISOString()
        });
        
        const successMsg = data.is_new_user 
          ? 'Welcome! Setting up your profile...' 
          : 'Login successful! Redirecting...';
            
        this.showToast(successMsg, 'success');
        setTimeout(() => { window.location.href = 'index.html'; }, 800);
      } else {
        // Re-enable button on error
        this.elements.verifyBtn.disabled = false;
        this.elements.verifyBtn.querySelector('span').textContent = originalText;
        this.showToast(data.message || 'Verification failed', 'error');
      }
    } catch (e) {
      // Re-enable button on error
      this.elements.verifyBtn.disabled = false;
      this.elements.verifyBtn.querySelector('span').textContent = 'Verify';
      this.showToast('Network error. Try again.', 'error');
    }
  }

  /**
   * Handle resend OTP
   */
  async handleResendOtp() {
    const email = this.elements.emailInput?.value?.trim();
    if (!email) return;
    
    // Disable button during request
    this.elements.resendBtn.disabled = true;
    const originalText = this.elements.resendBtn.textContent;
    this.elements.resendBtn.textContent = 'Sending...';
    
    try {
      const res = await fetch(`${CONFIG.API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (data.success) {
        this.showToast('OTP resent', 'success');
        // Restart timer
        this.startResendTimer();
      } else {
        this.showToast(data.message || 'Failed to resend OTP', 'error');
        this.elements.resendBtn.disabled = false;
        this.elements.resendBtn.textContent = originalText;
      }
    } catch {
      this.showToast('Network error. Try again.', 'error');
      this.elements.resendBtn.disabled = false;
      this.elements.resendBtn.textContent = originalText;
    }
  }

  /**
   * Start the resend OTP timer
   */
  startResendTimer() {
    // Clear any existing timer
    if (this.resendTimerInterval) {
      clearInterval(this.resendTimerInterval);
    }

    // Set initial time
    this.resendTimeRemaining = this.config.resendTimer;
    
    // Disable button
    this.elements.resendBtn.disabled = true;
    
    // Update button text immediately
    this.updateResendButtonText();
    
    // Start countdown
    this.resendTimerInterval = setInterval(() => {
      this.resendTimeRemaining--;
      
      if (this.resendTimeRemaining <= 0) {
        // Timer finished
        this.stopResendTimer();
      } else {
        // Update button text
        this.updateResendButtonText();
      }
    }, 1000);
  }

  /**
   * Stop the resend timer
   */
  stopResendTimer() {
    if (this.resendTimerInterval) {
      clearInterval(this.resendTimerInterval);
      this.resendTimerInterval = null;
    }
    
    this.resendTimeRemaining = 0;
    this.elements.resendBtn.disabled = false;
    this.elements.resendBtn.textContent = 'Resend OTP';
  }

  /**
   * Update resend button text with remaining time
   */
  updateResendButtonText() {
    if (this.resendTimeRemaining > 0) {
      this.elements.resendBtn.textContent = `Resend OTP (${this.resendTimeRemaining}s)`;
    }
  }

  /**
   * Show OTP verification section
   */
  showOtpView() {
    const email = this.elements.emailInput?.value?.trim();
    
    // Hide login section
    if (this.elements.loginSection) {
      this.elements.loginSection.style.display = 'none';
    }
    
    // Show OTP section
    if (this.elements.otpSection) {
      this.elements.otpSection.classList.add('active');
    }
    
    // Display email in OTP header
    if (this.elements.otpEmailDisplay && email) {
      this.elements.otpEmailDisplay.textContent = email;
    }
    
    // Focus on OTP input after animation
    setTimeout(() => {
      if (this.elements.otpInput) {
        this.elements.otpInput.focus();
      }
    }, 300);
    
    // Start resend timer
    this.startResendTimer();
  }

  /**
   * Reset to login view
   */
  resetOtpView() {
    // Stop the resend timer
    this.stopResendTimer();
    
    // Hide OTP section
    if (this.elements.otpSection) {
      this.elements.otpSection.classList.remove('active');
    }
    
    // Show login section after animation
    setTimeout(() => {
      if (this.elements.loginSection) {
        this.elements.loginSection.style.display = 'block';
      }
      
      // Clear OTP input
      if (this.elements.otpInput) {
        this.elements.otpInput.value = '';
      }
    }, 300);
  }

  /**
   * Initialize Google Sign-In after script loads
   */
  initializeGoogleSignIn() {
    try {
      if (!window.google || !window.google.accounts) {
        throw new Error('Google accounts API not available');
      }

      console.log('🔧 Initializing Google Sign-In...');
      
      window.google.accounts.id.initialize({
        client_id: this.config.clientId,
        callback: this.handleGoogleSignIn.bind(this),
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: false
      });

      this.googleInitialized = true;
      console.log('✅ Google Sign-In initialized successfully');
      
      // Render the button in the hidden container
      if (this.elements.googleSigninContainer) {
        const buttonContainer = this.elements.googleSigninContainer.querySelector('.g_id_signin');
        if (buttonContainer) {
          window.google.accounts.id.renderButton(buttonContainer, { 
            theme: "filled_black",
            size: "large",
            type: "standard",
            shape: "rectangular",
            text: "signin_with",
            logo_alignment: "left"
          });
        }
      }

    } catch (error) {
      console.error('❌ Failed to initialize Google Sign-In:', error);
      this.showToast('Could not initialize Google Sign-In.', 'error');
      this.googleInitialized = false;
    }
  }

  /**
   * Handle Google button click
   */
  handleGoogleButtonClick() {
    if (!this.googleScriptLoaded) {
      this.showToast('Google Sign-In is still loading, please wait...', 'warning');
      return;
    }

    if (!this.googleInitialized) {
      this.showToast('Google Sign-In not ready. Please refresh the page.', 'error');
      return;
    }

    try {
      console.log('🔐 Triggering Google Sign-In...');
      
      // Disable button temporarily
      this.elements.googleBtn.disabled = true;
      const originalHTML = this.elements.googleBtn.innerHTML;
      this.elements.googleBtn.innerHTML = '<span>Opening Google Sign-In...</span>';
      
      // Use the hidden button to trigger sign-in
      const googleSignInButton = this.elements.googleSigninContainer?.querySelector('[role="button"]');
      
      if (googleSignInButton) {
        console.log('✅ Using rendered button for sign-in');
        googleSignInButton.click();
      } else {
        console.log('⚠️ Rendered button not found, using prompt()');
        window.google.accounts.id.prompt();
      }
      
      // Re-enable button after delay
      setTimeout(() => {
        this.elements.googleBtn.disabled = false;
        this.elements.googleBtn.innerHTML = originalHTML;
      }, 1000);

    } catch (error) {
      console.error('❌ Error triggering Google Sign-In:', error);
      this.elements.googleBtn.disabled = false;
      this.showToast('Could not open Google Sign-In. Please try again.', 'error');
    }
  }

  /**
   * Google Sign-In callback
   */
  async handleGoogleSignIn(response) {
    try {
      console.log('✅ Google Sign-In response received');
      
      if (!response.credential) {
        throw new Error('No credential received from Google');
      }

      // Decode the JWT credential
      const credential = response.credential;
      const payload = this.parseJwt(credential);
      
      console.log('📋 User info:', {
        email: payload.email,
        name: payload.name,
        verified: payload.email_verified
      });
      
      const email = payload.email;
      const name = payload.name;
      const picture = payload.picture;
      const emailVerified = payload.email_verified;

      // Verify email is verified
      if (!emailVerified) {
        this.showToast('Please verify your email with Google first', 'error');
        return;
      }

      // Extract username from email
      const username = email.split('@')[0];

      // Save session data
      this.saveSessionData({
        userType: 'external', // Default safe state
        email: email,
        username: username,
        name: name,
        picture: picture,
        authMethod: 'google',
        emailVerified: true,
        loginTime: new Date().toISOString()
      });
      
      this.showToast('✅ Login successful! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 1000);

    } catch (error) {
      console.error('❌ Google Sign-In error:', error);
      this.showToast('Sign-in failed. Please try again.', 'error');
    }
  }

  /**
   * Handle guest login
   */
  handleGuestLogin() {
    console.log('👤 Guest login initiated');
    
    // Disable button and show loading
    this.elements.guestBtn.disabled = true;
    const originalHTML = this.elements.guestBtn.innerHTML;
    this.elements.guestBtn.innerHTML = '<span>Loading...</span>';

    // Clear any existing guest data
    this.clearExistingGuestData();

    // Store guest session
    setTimeout(() => {
      this.saveSessionData({
        userType: 'guest',
        email: null,
        username: null,
        authMethod: 'guest',
        loginTime: new Date().toISOString()
      });

      this.showToast('Continuing as guest...', 'info');

      // Redirect to main app
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 800);
    }, 500);
  }

  /**
   * Parse JWT token
   */
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('❌ Failed to parse JWT:', error);
      throw error;
    }
  }

  /**
   * Check if email domain is allowed
   */
  isAllowedDomain(email) {
    if (this.config.allowedDomains.length === 0) {
      return true;
    }
    
    const domain = email.split('@')[1]?.toLowerCase();
    const isAllowed = this.config.allowedDomains.some(allowed => 
      domain === allowed.toLowerCase()
    );
    
    console.log(`🔍 Domain check: ${domain} - ${isAllowed ? 'Allowed' : 'Blocked'}`);
    return isAllowed;
  }

  /**
   * Clear existing guest data
   */
  clearExistingGuestData() {
    console.log('🧹 Cleaning up guest data...');
    this.authManager.clearGuestData();
    localStorage.removeItem(this.authManager.sessionKey);
  }

  /**
   * Save session data to localStorage
   */
  saveSessionData(data) {
    try {
      localStorage.setItem('chatcdo_session', JSON.stringify(data));
      console.log('💾 Session data saved:', data.userType);
    } catch (error) {
      console.error('❌ Failed to save session:', error);
    }
  }

  /**
   * Get session data from localStorage
   */
  getSessionData() {
    try {
      const data = localStorage.getItem('chatcdo_session');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Failed to get session:', error);
      return null;
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = this.elements.toastContainer;
    if (!container) return;
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icons
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    const icon = icons[type] || icons.info;

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <span class="toast-message"></span>
      </div>
      <button class="toast-close">&times;</button>
      <div class="toast-progress"><i></i></div>
    `;
    
    toast.querySelector('.toast-message').textContent = message;

    // Add to container
    container.appendChild(toast);

    // Animation: Show
    // Force reflow to ensure transition plays
    toast.offsetHeight;
    toast.classList.add('show');

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.onclick = () => {
      this.removeToast(toast);
    };

    // Auto remove
    const duration = 4000;
    const progress = toast.querySelector('.toast-progress i');
    if (progress) {
        progress.style.transition = `transform ${duration}ms linear`;
        // Small delay to ensure transition applies
        setTimeout(() => {
            progress.style.transform = 'scaleX(0)';
        }, 10);
    }

    setTimeout(() => {
      this.removeToast(toast);
    }, duration);
  }

  removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    
    toast.classList.remove('show');
    toast.classList.add('hiding');
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300); // Matches CSS transition duration
  }
}

// Initialize login manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.loginManager = new LoginManager();
  });
} else {
  window.loginManager = new LoginManager();
}