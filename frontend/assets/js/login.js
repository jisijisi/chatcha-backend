// login.js - Fixed Google OAuth Implementation
import { AuthManager } from './auth.js'; 
import { CONFIG } from './config.js';

class LoginManager {
  constructor() {
    this.elements = {
      googleBtn: document.getElementById('googleBtn'),
      guestBtn: document.getElementById('guestBtn'),
      toast: document.getElementById('toast'),
      googleSigninContainer: document.getElementById('google-signin-container')
    };

    // Configuration
    this.config = {
      // Add your allowed company domains here (leave empty to allow all)
      allowedDomains: ['cdo.com.ph'], // Replace with your company domains
      clientId: '45685664065-92lsvsnth8ork4g6nr0nvhsmuk63f961.apps.googleusercontent.com'
    };

    this.authManager = new AuthManager();
    this.googleScriptLoaded = false;
    this.googleInitialized = false;
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
      console.log('🔐 Triggering Google Sign-In...');
      
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
  handleGoogleSignIn(response) {
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

      // Check if email is from allowed domain
      if (!this.isAllowedDomain(email)) {
        const domain = email.split('@')[1];
        this.showToast(`Please use your company email (@${this.config.allowedDomains.join(', @')})`, 'error');
        return;
      }

      // Extract username from email
      const username = email.split('@')[0];

      // Store session data with Google authentication
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

      // Redirect to main app
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1000);

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