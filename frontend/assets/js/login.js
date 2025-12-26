// login.js - Fixed Google OAuth Implementation with Resend Timer
import { AuthManager } from './auth.js'; 
import { CONFIG } from './config.js';

class LoginManager {
  constructor() {
    this.elements = {
      googleBtn: document.getElementById('googleBtn'),
      guestBtn: document.getElementById('guestBtn'),
      toast: document.getElementById('toast'),
      googleSigninContainer: document.getElementById('google-signin-container'),
      emailInput: document.getElementById('login-email-input'),
      startLoginBtn: document.getElementById('login-start-btn'),
      otpGroup: document.getElementById('login-otp-group'),
      otpInput: document.getElementById('login-otp-code'),
      verifyOtpBtn: document.getElementById('login-verify-otp-btn'),
      resendOtpBtn: document.getElementById('login-resend-otp-btn'),
      cancelOtpBtn: document.getElementById('login-cancel-otp-btn'),
      verifyActions: document.getElementById('login-verify-actions'),
      backButton: document.getElementById('back-to-login-btn'),
      otpHeader: document.getElementById('otp-verification-header'),
      otpEmailDisplay: document.getElementById('otp-email-display'),
      divider: document.querySelector('.divider-inline'),
      bottomButtons: document.querySelector('.bottom-buttons-wrapper'),
      helpText: document.querySelector('.help-text')
    };

    // Configuration
    this.config = {
      // Add your allowed company domains here (leave empty to allow all)
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
    // Google button - trigger Google Sign-In
    this.elements.googleBtn.addEventListener('click', () => {
      this.handleGoogleButtonClick();
    });

    // Guest button
    this.elements.guestBtn.addEventListener('click', () => {
      this.handleGuestLogin();
    });

    if (this.elements.startLoginBtn) {
      this.elements.startLoginBtn.addEventListener('click', () => this.handleStartLogin());
    }
    if (this.elements.verifyOtpBtn) {
      this.elements.verifyOtpBtn.addEventListener('click', () => this.handleVerifyOtp());
    }
    if (this.elements.resendOtpBtn) {
      this.elements.resendOtpBtn.addEventListener('click', () => this.handleResendOtp());
    }
    if (this.elements.cancelOtpBtn) {
      this.elements.cancelOtpBtn.addEventListener('click', () => this.resetOtpView());
    }
    if (this.elements.backButton) {
      this.elements.backButton.addEventListener('click', () => this.resetOtpView());
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

    // Allow Enter key to submit email
    if (this.elements.emailInput) {
      this.elements.emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleStartLogin();
        }
      });
    }

    // Allow Enter key to submit OTP
    if (this.elements.otpInput) {
      this.elements.otpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleVerifyOtp();
        }
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
      this.elements.startLoginBtn.disabled = true;
      const originalText = this.elements.startLoginBtn.querySelector('span').textContent;
      this.elements.startLoginBtn.querySelector('span').textContent = 'Sending...';

      const res = await fetch(`${CONFIG.API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      
      // Re-enable button
      this.elements.startLoginBtn.disabled = false;
      this.elements.startLoginBtn.querySelector('span').textContent = originalText;
      
      if (data.success) {
        this.showToast('OTP sent to your email', 'success');
        this.showOtpView();
      } else {
        this.showToast(data.message || 'Failed to send OTP', 'error');
      }
    } catch (e) {
      // Re-enable button on error
      this.elements.startLoginBtn.disabled = false;
      this.elements.startLoginBtn.querySelector('span').textContent = 'Send OTP';
      this.showToast('Network error. Try again.', 'error');
    }
  }

  async handleResendOtp() {
    const email = this.elements.emailInput?.value?.trim();
    if (!email) return;
    
    // Disable button during request
    this.elements.resendOtpBtn.disabled = true;
    const originalText = this.elements.resendOtpBtn.textContent;
    this.elements.resendOtpBtn.textContent = 'Sending...';
    
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
        this.elements.resendOtpBtn.disabled = false;
        this.elements.resendOtpBtn.textContent = originalText;
      }
    } catch {
      this.showToast('Network error. Try again.', 'error');
      this.elements.resendOtpBtn.disabled = false;
      this.elements.resendOtpBtn.textContent = originalText;
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
    this.elements.resendOtpBtn.disabled = true;
    
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
    this.elements.resendOtpBtn.disabled = false;
    this.elements.resendOtpBtn.textContent = 'Resend OTP';
  }

  /**
   * Update resend button text with remaining time
   */
  updateResendButtonText() {
    if (this.resendTimeRemaining > 0) {
      this.elements.resendOtpBtn.textContent = `Resend OTP (${this.resendTimeRemaining}s)`;
    }
  }

  showOtpView() {
    const formContainer = document.getElementById('email-otp-form');
    const email = this.elements.emailInput?.value?.trim();
    
    // Add class to hide login form
    if (formContainer) {
      formContainer.classList.add('otp-active');
    }
    
    // Hide OR divider, bottom buttons, and help text during OTP
    if (this.elements.divider) this.elements.divider.classList.add('hidden');
    if (this.elements.bottomButtons) this.elements.bottomButtons.classList.add('hidden');
    if (this.elements.helpText) this.elements.helpText.classList.add('hidden');
    
    // Show back button and OTP header
    if (this.elements.backButton) {
      this.elements.backButton.style.display = 'inline-flex';
      setTimeout(() => this.elements.backButton.classList.add('active'), 50);
    }
    
    if (this.elements.otpHeader) {
      this.elements.otpHeader.style.display = 'block';
      setTimeout(() => this.elements.otpHeader.classList.add('active'), 100);
    }
    
    // Display email in OTP header
    if (this.elements.otpEmailDisplay && email) {
      this.elements.otpEmailDisplay.textContent = email;
    }
    
    // Disable email input (but keep it visible until fade out)
    setTimeout(() => {
      if (this.elements.emailInput) this.elements.emailInput.disabled = true;
      if (this.elements.startLoginBtn) this.elements.startLoginBtn.disabled = true;
    }, 200);
    
    // Show OTP group with animation
    if (this.elements.otpGroup) {
      this.elements.otpGroup.style.display = 'block';
      setTimeout(() => {
        this.elements.otpGroup.classList.add('active');
        // Focus on OTP input after animation
        setTimeout(() => {
          if (this.elements.otpInput) this.elements.otpInput.focus();
        }, 200);
      }, 300);
    }
    
    // Show verify actions with delay
    if (this.elements.verifyActions) {
      setTimeout(() => {
        this.elements.verifyActions.style.display = 'flex';
        this.elements.verifyActions.classList.add('active');
        
        // Start resend timer after showing actions
        this.startResendTimer();
      }, 500);
    }
  }

  resetOtpView() {
    const formContainer = document.getElementById('email-otp-form');
    
    // Stop the resend timer
    this.stopResendTimer();
    
    // Remove active classes
    if (this.elements.otpGroup) this.elements.otpGroup.classList.remove('active');
    if (this.elements.verifyActions) this.elements.verifyActions.classList.remove('active');
    if (this.elements.backButton) this.elements.backButton.classList.remove('active');
    if (this.elements.otpHeader) this.elements.otpHeader.classList.remove('active');
    
    // Hide OTP elements after animation
    setTimeout(() => {
      if (this.elements.otpGroup) this.elements.otpGroup.style.display = 'none';
      if (this.elements.verifyActions) this.elements.verifyActions.style.display = 'none';
      if (this.elements.backButton) this.elements.backButton.style.display = 'none';
      if (this.elements.otpHeader) this.elements.otpHeader.style.display = 'none';
      
      // Show login elements
      if (this.elements.divider) this.elements.divider.classList.remove('hidden');
      if (this.elements.bottomButtons) this.elements.bottomButtons.classList.remove('hidden');
      if (this.elements.helpText) this.elements.helpText.classList.remove('hidden');
      
      // Remove OTP active class from form
      if (formContainer) {
        formContainer.classList.remove('otp-active');
      }
      
      // Re-enable fields
      if (this.elements.emailInput) this.elements.emailInput.disabled = false;
      if (this.elements.startLoginBtn) this.elements.startLoginBtn.disabled = false;
      
      // Clear OTP input
      if (this.elements.otpInput) this.elements.otpInput.value = '';
    }, 300);
  }

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
      this.elements.verifyOtpBtn.disabled = true;
      const originalText = this.elements.verifyOtpBtn.querySelector('span').textContent;
      this.elements.verifyOtpBtn.querySelector('span').textContent = 'Verifying...';

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
        this.elements.verifyOtpBtn.disabled = false;
        this.elements.verifyOtpBtn.querySelector('span').textContent = originalText;
        this.showToast(data.message || 'Verification failed', 'error');
      }
    } catch (e) {
      // Re-enable button on error
      this.elements.verifyOtpBtn.disabled = false;
      this.elements.verifyOtpBtn.querySelector('span').textContent = 'Verify';
      this.showToast('Network error. Try again.', 'error');
    }
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
        // Disable FedCM to avoid CORS issues
        use_fedcm_for_prompt: false
      });

      this.googleInitialized = true;
      console.log('✅ Google Sign-In initialized successfully');
      
      // Render the button in the hidden container
      window.google.accounts.id.renderButton(
        this.elements.googleSigninContainer.querySelector('.g_id_signin'),
        { 
          theme: "filled_black",
          size: "large",
          type: "standard",
          shape: "rectangular",
          text: "signin_with",
          logo_alignment: "left"
        }
      );

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
      console.log('🔔 Triggering Google Sign-In...');
      
      // Show loading state
      this.showLoading(this.elements.googleBtn, 'Opening Google Sign-In...');
      
      // Use the hidden button to trigger sign-in (most reliable method)
      const googleSignInButton = this.elements.googleSigninContainer.querySelector('[role="button"]');
      
      if (googleSignInButton) {
        console.log('✅ Using rendered button for sign-in');
        googleSignInButton.click();
        
        // Hide loading after a short delay
        setTimeout(() => {
          this.hideLoading(this.elements.googleBtn);
        }, 1000);
      } else {
        console.log('⚠️ Rendered button not found, using prompt()');
        // Fallback to prompt if button not found
        window.google.accounts.id.prompt();
        
        setTimeout(() => {
          this.hideLoading(this.elements.googleBtn);
        }, 1000);
      }

    } catch (error) {
      console.error('❌ Error triggering Google Sign-In:', error);
      this.hideLoading(this.elements.googleBtn);
      this.showToast('Could not open Google Sign-In. Please try again.', 'error');
    }
  }

  /**
   * Google Sign-In callback (called after successful authentication)
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

      const isCompany = this.isAllowedDomain(email);

      // Extract username from email
      const username = email.split('@')[0];

      if (isCompany) {
        this.saveSessionData({
          userType: 'employee',
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
      } else {
        if (this.elements.emailInput) this.elements.emailInput.value = email;
        try {
          if (picture) {
            localStorage.setItem(`chatcdo_pending_avatar_${email}`, picture);
          }
        } catch (e) {}
        this.showToast('Please verify via OTP to continue', 'info');
        const res = await fetch(`${CONFIG.API_BASE}/auth/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        await res.json();
        this.showOtpView();
      }

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
    
    // Show loading state
    this.showLoading(this.elements.guestBtn, 'Loading...');

    // Clear any existing guest data BEFORE creating new session
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
      return true; // Allow all domains if none specified
    }
    
    const domain = email.split('@')[1]?.toLowerCase();
    const isAllowed = this.config.allowedDomains.some(allowed => 
      domain === allowed.toLowerCase()
    );
    
    console.log(`🔍 Domain check: ${domain} - ${isAllowed ? 'Allowed' : 'Blocked'}`);
    return isAllowed;
  }

  /**
   * Show loading state on button
   */
  showLoading(button, text) {
    button.disabled = true;
    const originalContent = button.innerHTML;
    button.setAttribute('data-original-content', originalContent);
    button.innerHTML = `<span>${text}</span>`;
    return originalContent;
  }

  /**
   * Hide loading state on button
   */
  hideLoading(button) {
    button.disabled = false;
    const originalContent = button.getAttribute('data-original-content');
    if (originalContent) {
      button.innerHTML = originalContent;
    }
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
    const toast = this.elements.toast;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
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
