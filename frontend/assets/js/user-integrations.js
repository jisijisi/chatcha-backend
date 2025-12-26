// frontend/assets/js/user-integrations.js
import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';

export class UserIntegrationsManager {
    constructor(app) {
        this.app = app;
        this.client = null;
        this.allowedDomains = ['cdo.com.ph'];
        this.init();
    }

    init() {
        if (!window.google?.accounts) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => console.log('✅ Google Script Loaded'); 
            document.body.appendChild(script);
        }

        window.openUserIntegrations = () => this.openModal();
        this.bindIntegrationButtons();
        this.checkConnectionStatus();
    }

    /**
     * UNIFIED AUTH: Request permissions for ALL services at once
     */
    triggerAuth() {
        const CLIENT_ID = '45685664065-92lsvsnth8ork4g6nr0nvhsmuk63f961.apps.googleusercontent.com';
        
        // Combine scopes space-separated for unified access
        const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify';

        // Persist language before OAuth redirect
        const currentLang = localStorage.getItem('app_language') || 'en';
        localStorage.setItem('app_language', currentLang);
        
        // Store a flag to know we're returning from OAuth
        sessionStorage.setItem('returning_from_oauth', 'true');

        try {
            this.client = google.accounts.oauth2.initCodeClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                ux_mode: 'popup',
                callback: (response) => this.handleGoogleCallback(response)
            });
            
            // Trigger the popup
            this.client.requestCode();
        } catch (e) {
            console.error('❌ Google Client Error:', e);
            const lang = localStorage.getItem('app_language') || 'en';
            const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
            this.app.showToast(t.toasts.errorConnecting || 'Google Client Error. Refresh page.', 'error');
        }
    }

    bindIntegrationButtons() {
        // Target the unified buttons
        const connectBtn = document.getElementById('btn-google-connect');
        const disconnectBtn = document.getElementById('btn-google-disconnect');

        if (connectBtn) {
            // Clone to remove old listeners
            const newConnectBtn = connectBtn.cloneNode(true);
            connectBtn.parentNode.replaceChild(newConnectBtn, connectBtn);

            newConnectBtn.addEventListener('click', () => {
                const email = this.app.authManager.getUserEmail();
                if (!this.isAllowedDomain(email)) {
                    this.app.showToast('Company email required', 'error');
                    return;
                }
                if (!newConnectBtn.classList.contains('btn-connected-state')) {
                    this.triggerAuth();
                }
            });
        }

        if (disconnectBtn) {
            const newDisconnectBtn = disconnectBtn.cloneNode(true);
            disconnectBtn.parentNode.replaceChild(newDisconnectBtn, disconnectBtn);

            newDisconnectBtn.addEventListener('click', () => {
                this.handleDisconnectClick();
            });
        }
    }

    async checkConnectionStatus() {
        const userEmail = this.app.authManager.getUserEmail();
        const apiBase = CONFIG.API_BASE;
        
        if (!userEmail) return this.updateUI(false);
        if (!this.isAllowedDomain(userEmail)) {
            return this.updateUI(false);
        }

        try {
            const response = await fetch(`${apiBase}/auth/google-status`, {
                headers: { 'X-User-Email': userEmail }
            });
            
            if (response.ok) {
                const data = await response.json();
                // If connected is true, it means we have tokens (regardless of scope scope subsets)
                // For a unified card, any valid connection counts as "Connected"
                this.updateUI(data.connected);
            } else {
                this.updateUI(false);
            }
        } catch (error) {
            console.error(error);
            this.updateUI(false);
        }
    }

    updateUI(isConnected) {
        const connectBtn = document.getElementById('btn-google-connect');
        const disconnectBtn = document.getElementById('btn-google-disconnect');

        if (!connectBtn || !disconnectBtn) return;

        // Get current language for translations
        const lang = localStorage.getItem('app_language') || 'en';
        const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

        if (isConnected) {
            connectBtn.textContent = t.settings.integration.btnConnected;
            connectBtn.classList.add('btn-connected-state');
            
            disconnectBtn.disabled = false;
            disconnectBtn.textContent = t.settings.integration.btnDisconnect;
        } else {
            const email = this.app.authManager.getUserEmail();
            if (!this.isAllowedDomain(email)) {
                connectBtn.textContent = 'Company email required';
                connectBtn.disabled = true;
            } else {
                connectBtn.textContent = t.settings.integration.btnConnect;
                connectBtn.disabled = false;
            }
            connectBtn.classList.remove('btn-connected-state');
            
            disconnectBtn.disabled = true;
            disconnectBtn.textContent = t.settings.integration.btnDisconnect;
        }
        
        // Handle Legacy Modal Button if it still exists (fallback)
        const modalBtn = document.getElementById('btn-connect-user-calendar');
        if (modalBtn) {
            if (isConnected) {
                modalBtn.textContent = 'Connected ✅';
                modalBtn.classList.remove('btn-primary');
                modalBtn.style.background = '#e6fffa';
                modalBtn.style.color = '#047857';
            } else {
                modalBtn.textContent = 'Connect Google Services';
                modalBtn.classList.add('btn-primary');
                modalBtn.style.background = '';
                modalBtn.style.color = '';
            }
        }
    }

    async handleDisconnectClick() {
        // Get current language for translations
        const lang = localStorage.getItem('app_language') || 'en';
        const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

        // Show translated confirmation modal
        this.app.modalManager.showModal({
            title: t.modals.disconnectTitle || "Disconnect Google Services",
            message: t.modals.disconnectMessage || "Are you sure? This will disconnect Google Calendar and Gmail access.",
            inputValue: null,
            confirmText: t.modals.disconnectConfirm || "Disconnect",
            confirmClass: "delete",
            onConfirm: async () => {
                // UI Loading State
                const disconnectBtn = document.getElementById('btn-google-disconnect');
                const modalConfirmBtn = document.querySelector('.modal-btn-confirm');
                
                if (disconnectBtn) {
                    disconnectBtn.textContent = 'Disconnecting...';
                    disconnectBtn.disabled = true;
                }
                if (modalConfirmBtn) {
                    modalConfirmBtn.textContent = 'Disconnecting...';
                    modalConfirmBtn.disabled = true;
                }
                
                try {
                    const apiBase = CONFIG.API_BASE; 
                    const userEmail = this.app.authManager.getUserEmail();

                    const response = await fetch(`${apiBase}/auth/disconnect-google`, {
                        method: 'POST',
                        headers: { 'X-User-Email': userEmail }
                    });

                    if (response.ok) {
                        // Get current language for success toast
                        const currentLang = localStorage.getItem('app_language') || 'en';
                        const translations = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
                        
                        this.app.showToast(translations.toasts.disconnectedSuccess || 'Disconnected successfully.', 'success');
                        this.updateUI(false);
                        this.app.modalManager.closeModal();
                    } else {
                        throw new Error('Failed to disconnect');
                    }
                } catch (error) {
                    // Get current language for error toast
                    const currentLang = localStorage.getItem('app_language') || 'en';
                    const translations = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
                    
                    this.app.showToast(translations.toasts.disconnectFailed || 'Failed to disconnect.', 'error');
                    
                    // Reset UI on error
                    if (disconnectBtn) {
                        const resetLang = localStorage.getItem('app_language') || 'en';
                        const resetT = TRANSLATIONS[resetLang] || TRANSLATIONS.en;
                        disconnectBtn.textContent = resetT.settings.integration.btnDisconnect;
                        disconnectBtn.disabled = false;
                    }
                    this.app.modalManager.closeModal();
                }
            }
        });
    }

    async handleGoogleCallback(response) {
        if (response.code) {
            try {
                // Get current language for UI updates
                const lang = localStorage.getItem('app_language') || 'en';
                const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

                // UI Loading State
                const connectBtn = document.getElementById('btn-google-connect');
                if (connectBtn) connectBtn.textContent = 'Linking...';

                const userEmail = this.app.authManager.getUserEmail();
                const apiBase = CONFIG.API_BASE; 
                this.app.showToast('Linking Google Account...', 'info');

                const apiRes = await fetch(`${apiBase}/auth/connect-google`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Email': userEmail
                    },
                    body: JSON.stringify({ code: response.code })
                });

                if (apiRes.ok) {
                    // Get current language for success message
                    const currentLang = localStorage.getItem('app_language') || 'en';
                    const translations = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
                    
                    this.app.showToast(translations.toasts.disconnectedSuccess || 'Connected successfully!', 'success');
                    this.checkConnectionStatus();
                    
                    // Restore language after OAuth (in case popup caused issues)
                    this.handleOAuthReturn();
                } else {
                    throw new Error('Server returned error');
                }
            } catch (error) {
                // Get current language for error message
                const currentLang = localStorage.getItem('app_language') || 'en';
                const translations = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
                
                this.app.showToast(translations.toasts.errorConnecting || 'Connection failed: ' + error.message, 'error');
                this.updateUI(false); // Reset on failure
            }
        }
    }

    /**
     * Call this after OAuth redirect/popup to restore language
     */
    handleOAuthReturn() {
        const isReturningFromOAuth = sessionStorage.getItem('returning_from_oauth');
        if (isReturningFromOAuth) {
            sessionStorage.removeItem('returning_from_oauth');
            
            // Force language update
            const storedLang = localStorage.getItem('app_language') || 'en';
            if (this.app.uiManager) {
                this.app.uiManager.updateLanguage(storedLang);
            }
            
            // Re-check connection status and update UI with correct language
            this.checkConnectionStatus();
        }
    }

    isAllowedDomain(email) {
        if (!email) return false;
        const domain = String(email).split('@')[1]?.toLowerCase();
        return this.allowedDomains.some(d => d.toLowerCase() === domain);
    }
}
