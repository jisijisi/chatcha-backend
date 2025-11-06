// Google Sheets Integration
import { CONFIG } from './config.js';

export class SheetsManager {
  constructor() {
    this.scriptURL = CONFIG.GOOGLE_SCRIPT_URL;
    this.isEnabled = !!CONFIG.GOOGLE_SCRIPT_URL;
  }

  async archiveMessage(messageData) {
    if (!this.isEnabled) {
      console.log('Sheets integration disabled - skipping archiving');
      return false;
    }

    try {
      // Use JSONP approach to avoid CORS
      const success = await this.jsonpRequest(messageData, 'message');
      console.log('Message archived to Google Sheets:', success);
      return success;
    } catch (error) {
      console.error('Failed to archive message to Google Sheets:', error);
      return false;
    }
  }

  // JSONP implementation to bypass CORS
  jsonpRequest(data, type) {
    return new Promise((resolve, reject) => {
      // Create a unique callback name
      const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
      
      // Create script element
      const script = document.createElement('script');
      
      // Construct URL with callback
      const url = new URL(this.scriptURL);
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('type', type);
      url.searchParams.set('data', JSON.stringify(data));
      
      script.src = url.toString();
      
      // Define the callback function
      window[callbackName] = (response) => {
        // Clean up
        delete window[callbackName];
        document.body.removeChild(script);
        
        if (response.result === 'success') {
          resolve(true);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      };
      
      // Add error handling
      script.onerror = () => {
        delete window[callbackName];
        document.body.removeChild(script);
        reject(new Error('JSONP request failed'));
      };
      
      // Add to document
      document.body.appendChild(script);
    });
  }

  isSheetsEnabled() {
    return this.isEnabled;
  }
}