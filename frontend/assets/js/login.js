// login.js - Simplified Login Logic
// Login Page Logic with Google OAuth

// Import AuthManager for cleanup logic
import { AuthManager } from './auth.js'; 
import { CONFIG } from './config.js'; // Import CONFIG for keys

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
      // Add your allowed company domains here
      allowedDomains: ['cdo.com.ph'], // Replace with your company domains
    };

    this.authManager = new AuthManager(); // Instantiate AuthManager
    this.init();
  }

  init() {
    // Check if user is already logged in
    this.checkExistingSession();

    // Setup event listeners
    this.setupEventListeners();

    // Make handleGoogleSignIn available globally
    window.handleGoogleSignIn = this.handleGoogleSignIn.bind(this);
  }

  checkExistingSession() {
    const sessionData = this.getSessionData();
    if (sessionData) {
      // User already logged in, redirect to main app
      window.location.href = 'index.html';
    }
  }

  setupEventListeners() {
    // Google button - trigger hidden Google Sign-In
    this.elements.googleBtn.addEventListener('click', () => {
      this.triggerGoogleSignIn();
    });

    // Guest button
    this.elements.guestBtn.addEventListener('click', () => {
      this.handleGuestLogin();
    });
  }

  // Trigger the hidden Google Sign-In button
  triggerGoogleSignIn() {
    const googleSignInButton = this.elements.googleSigninContainer.querySelector('[role="button"]');
    if (googleSignInButton) {
      googleSignInButton.click();
    } else {
      // Fallback: Initialize Google Sign-In programmatically
      if (window.google && window.google.accounts) {
        window.google.accounts.id.prompt();
      } else {
        this.showToast('Google Sign-In is loading, please try again', 'warning');
      }
    }
  }

  // Google Sign-In callback
  handleGoogleSignIn(response) {
    try {
      // Decode the JWT credential
      const credential = response.credential;
      const payload = this.parseJwt(credential);
      
      console.log('Google Sign-In successful:', payload);
      
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
        this.showToast('Please use your company email address', 'error');
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

      this.showToast('Login successful! Redirecting...', 'success');

      // Redirect to main app
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1000);

    } catch (error) {
      console.error('Google Sign-In error:', error);
      this.showToast('Sign-in failed. Please try again.', 'error');
    }
  }

  handleGuestLogin() {
    // Show loading state
    this.showLoading(this.elements.guestBtn, 'Loading...');

    // CRITICAL: Clear any existing guest data BEFORE creating new session
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

  // Helper: Parse JWT token
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Failed to parse JWT:', error);
      throw error;
    }
  }

  // Helper: Check if email domain is allowed
  isAllowedDomain(email) {
    if (this.config.allowedDomains.length === 0) {
      return true; // Allow all domains if none specified
    }
    
    const domain = email.split('@')[1]?.toLowerCase();
    return this.config.allowedDomains.some(allowed => 
      domain === allowed.toLowerCase()
    );
  }

  showLoading(button, text) {
    button.disabled = true;
    const originalContent = button.innerHTML;
    button.setAttribute('data-original-content', originalContent);
    button.innerHTML = `<span>${text}</span>`;
    return originalContent;
  }

  hideLoading(button) {
    button.disabled = false;
    const originalContent = button.getAttribute('data-original-content');
    if (originalContent) {
      button.innerHTML = originalContent;
    }
  }

  clearExistingGuestData() {
    console.log('🧹 Cleaning up guest data via AuthManager...');
    
    // Leverage the robust deletion logic we fixed in AuthManager
    this.authManager.clearGuestData(); 

    // Also manually delete the session key just in case it was missed
    localStorage.removeItem(this.authManager.sessionKey);
  }

  saveSessionData(data) {
    try {
      localStorage.setItem('chatcdo_session', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  getSessionData() {
    try {
      const data = localStorage.getItem('chatcdo_session');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

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
    new LoginManager();
  });
} else {
  new LoginManager();
}