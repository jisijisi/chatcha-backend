// Settings Management Module - DYNAMIC MODELS VERSION
import { apiFetch } from '../core/api.js';
import { showToast, setButtonLoading, showConfirmationModal, openModal, closeModal } from '../core/ui.js';

// SSE Store
let progressEventSource = null;

// Initialize settings management
function setupSettingsManagement() {
  const saveBtn = document.getElementById('settings-save-btn');
  const regenBtn = document.getElementById('set-cache-regen');
  const clearBtn = document.getElementById('set-cache-clear');

  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); 
      confirmSaveSettings();
    });
  }
  
  if (regenBtn) {
    regenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleRegenerateCache();
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleClearCache();
    });
  }

  // Setup cache progress modal handlers
  setupCacheProgressModal();

  // Poll health every 30 seconds if settings view is active
  setInterval(() => {
    const settingsView = document.getElementById('settings-view');
    if (settingsView && settingsView.classList.contains('active')) {
      loadSystemHealth();
    }
  }, 30000);
}

// Setup cache progress modal handlers
function setupCacheProgressModal() {
  const closeBtn = document.getElementById('cache-progress-close');
  const cancelBtn = document.getElementById('cache-progress-cancel');
  const finishBtn = document.getElementById('cache-progress-finish');

  if (closeBtn) {
    closeBtn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      // Only allow closing if operation is complete
      if (finishBtn && finishBtn.style.display !== 'none') {
        closeCacheProgressModal();
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      showToast('Cache regeneration cannot be cancelled once started', 'warning');
    };
  }

  if (finishBtn) {
    finishBtn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      closeCacheProgressModal();
      // Reload cache status without refreshing the page
      if (window.KnowledgeBase && window.KnowledgeBase.loadKnowledgeBaseData) {
        window.KnowledgeBase.loadKnowledgeBaseData().catch(err => {
          console.error('Failed to refresh knowledge base data:', err);
        });
      }
    };
  }
}

// Open cache progress modal
function openCacheProgressModal() {
  const modal = document.getElementById('cache-progress-modal');
  if (!modal) return;

  // Reset to loading state
  const title = document.getElementById('cache-modal-title');
  if (title) title.textContent = 'Regenerating Cache...';
  
  const loading = document.getElementById('cache-status-loading');
  if (loading) loading.style.display = 'block';
  
  const result = document.getElementById('cache-status-result');
  if (result) result.style.display = 'none';
  
  const closeBtn = document.getElementById('cache-progress-close');
  if (closeBtn) closeBtn.style.display = 'none';
  
  const cancelBtn = document.getElementById('cache-progress-cancel');
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
  
  const finishBtn = document.getElementById('cache-progress-finish');
  if (finishBtn) finishBtn.style.display = 'none';

  // Reset progress
  const fill = document.getElementById('cache-progress-fill-modal');
  if (fill) fill.style.width = '0%';
  
  const text = document.getElementById('cache-progress-text-modal');
  if (text) text.textContent = '0% Complete';
  
  const msg = document.getElementById('cache-status-message');
  if (msg) msg.textContent = 'Starting embedding process...';
  
  const sub = document.getElementById('cache-status-subtext');
  if (sub) sub.textContent = 'This operation may take several minutes depending on the volume of knowledge data.';

  openModal('cache-progress-modal');
}

// Close cache progress modal
function closeCacheProgressModal() {
  const modal = document.getElementById('cache-progress-modal');
  if (modal) {
    closeModal('cache-progress-modal');
  }
  
  // Close SSE connection if exists
  if (progressEventSource) {
    progressEventSource.close();
    progressEventSource = null;
  }
}

// Update progress during cache regeneration
function updateCacheProgress(stage, progress) {
  const progressFill = document.getElementById('cache-progress-fill-modal');
  const progressText = document.getElementById('cache-progress-text-modal');
  const statusMessage = document.getElementById('cache-status-message');

  if (progressFill) {
    progressFill.style.width = progress + '%';
  }

  if (progressText) {
    progressText.textContent = `${progress}% Complete`;
  }

  if (statusMessage && !statusMessage.textContent.includes('(')) {
    // Only update if not already updated by handleProgressUpdate
    const messages = {
      'starting': 'Initializing cache regeneration...',
      'clearing': 'Clearing old cache data...',
      'loading': 'Loading knowledge base documents...',
      'processing': 'Processing and chunking content...',
      'embedding': 'Generating AI embeddings...',
      'finalizing': 'Finalizing cache generation...',
      'complete': 'Cache regeneration complete!'
    };
    statusMessage.textContent = messages[stage] || 'Processing...';
  }
}

// Connect to Server-Sent Events stream
function connectToCacheProgressStream() {
  // Close existing connection if any
  if (progressEventSource) {
    progressEventSource.close();
    progressEventSource = null;
  }
  
  const streamUrl = `${window.API_BASE}/cache/progress-stream`;
  console.log('📡 Connecting to progress stream:', streamUrl);
  
  progressEventSource = new EventSource(streamUrl);
  
  // Handle incoming messages
  progressEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📊 Progress update:', data);
      
      handleProgressUpdate(data);
      
    } catch (error) {
      console.error('Failed to parse progress data:', error);
    }
  };
  
  // Handle connection opened
  progressEventSource.onopen = () => {
    console.log('✅ SSE connection established');
  };
  
  // Handle errors
  progressEventSource.onerror = (error) => {
    console.error('❌ SSE connection error:', error);
    
    // Don't show error immediately, wait to see if it reconnects
    setTimeout(() => {
      if (progressEventSource && progressEventSource.readyState === EventSource.CLOSED) {
        console.error('SSE connection closed unexpectedly');
        
        // Close connection
        if (progressEventSource) {
          progressEventSource.close();
          progressEventSource = null;
        }
        
        // Only show error if modal is still open and we haven't received completion
        const modal = document.getElementById('cache-progress-modal');
        const finishBtn = document.getElementById('cache-progress-finish');
        if (modal && modal.classList.contains('active') && finishBtn && finishBtn.style.display === 'none') {
          showCacheRegenerationError('Connection lost. Please check your network or try again.');
        }
      }
    }, 5000);
  };
}

// Handle different types of progress updates
function handleProgressUpdate(data) {
  const btn = document.getElementById('set-cache-regen');
  
  switch (data.type) {
    case 'connected':
      console.log('📡 Connected to progress stream');
      break;
      
    case 'heartbeat':
      // Just keep connection alive, no UI update needed
      break;
      
    case 'progress':
      // Update progress bar and message
      updateCacheProgress(data.stage, data.progress);
      
      // Update status message with detail if available
      const statusMessage = document.getElementById('cache-status-message');
      if (statusMessage) {
        let message = data.message;
        if (data.detail) {
          message += ` (${data.detail.current}/${data.detail.total} - ${data.detail.percentage}%)`;
        }
        statusMessage.textContent = message;
      }
      break;
      
    case 'complete':
      // Close SSE connection
      if (progressEventSource) {
        progressEventSource.close();
        progressEventSource = null;
      }
      
      // Show success
      showCacheRegenerationSuccess(data.data);
      showToast('Cache regenerated successfully');
      
      // Reset button
      if (btn) setButtonLoading(btn, false);
      
      // Update cache status in background
      if (window.KnowledgeBase && window.KnowledgeBase.loadKnowledgeBaseData) {
        window.KnowledgeBase.loadKnowledgeBaseData().catch(err => {
          console.error('Failed to refresh knowledge base data:', err);
        });
      }
      break;
      
    case 'error':
      // Close SSE connection
      if (progressEventSource) {
        progressEventSource.close();
        progressEventSource = null;
      }
      
      // Show error
      showCacheRegenerationError(data.message);
      showToast('Cache regeneration failed', 'error');
      
      // Reset button
      if (btn) setButtonLoading(btn, false);
      break;
  }
}

// Show cache regeneration success
function showCacheRegenerationSuccess(data) {
  // Update modal to success state
  const title = document.getElementById('cache-modal-title');
  if (title) title.textContent = 'Cache Regeneration Complete';
  
  const loading = document.getElementById('cache-status-loading');
  if (loading) loading.style.display = 'none';
  
  const result = document.getElementById('cache-status-result');
  if (result) result.style.display = 'block';
  
  const closeBtn = document.getElementById('cache-progress-close');
  if (closeBtn) closeBtn.style.display = 'block';
  
  const cancelBtn = document.getElementById('cache-progress-cancel');
  if (cancelBtn) cancelBtn.style.display = 'none';
  
  const finishBtn = document.getElementById('cache-progress-finish');
  if (finishBtn) finishBtn.style.display = 'inline-block';

  // Update result icon and text
  const resultIcon = document.getElementById('cache-result-icon');
  const resultTitle = document.getElementById('cache-result-title');
  const resultSubtext = document.getElementById('cache-result-subtext');

  if (resultIcon) {
    resultIcon.className = 'conversion-result-icon success';
    resultIcon.innerHTML = '<span style="font-size: 3rem;">✅</span>';
  }

  if (resultTitle) {
    resultTitle.textContent = 'Regeneration Successful!';
    resultTitle.style.color = '#10b981';
  }

  if (resultSubtext) {
    resultSubtext.textContent = 'The RAG system cache has been fully rebuilt and is now active.';
  }

  // Update stats
  if (data.files !== undefined) {
    const filesEl = document.getElementById('cache-result-files');
    if (filesEl) filesEl.textContent = data.files;
  }
  if (data.chunks !== undefined) {
    const chunksEl = document.getElementById('cache-result-chunks');
    if (chunksEl) chunksEl.textContent = data.chunks;
  }
}

// Show cache regeneration error
function showCacheRegenerationError(errorMessage) {
  // Update modal to error state
  const title = document.getElementById('cache-modal-title');
  if (title) title.textContent = 'Cache Regeneration Failed';
  
  const loading = document.getElementById('cache-status-loading');
  if (loading) loading.style.display = 'none';
  
  const result = document.getElementById('cache-status-result');
  if (result) result.style.display = 'block';
  
  const closeBtn = document.getElementById('cache-progress-close');
  if (closeBtn) closeBtn.style.display = 'block';
  
  const cancelBtn = document.getElementById('cache-progress-cancel');
  if (cancelBtn) cancelBtn.style.display = 'none';
  
  const finishBtn = document.getElementById('cache-progress-finish');
  if (finishBtn) finishBtn.style.display = 'inline-block';

  // Update result icon and text
  const resultIcon = document.getElementById('cache-result-icon');
  const resultTitle = document.getElementById('cache-result-title');
  const resultSubtext = document.getElementById('cache-result-subtext');

  if (resultIcon) {
    resultIcon.className = 'conversion-result-icon error';
    resultIcon.innerHTML = '<span style="font-size: 3rem;">❌</span>';
  }

  if (resultTitle) {
    resultTitle.textContent = 'Regeneration Failed';
    resultTitle.style.color = '#ef4444';
  }

  if (resultSubtext) {
    resultSubtext.textContent = errorMessage || 'An error occurred during cache regeneration.';
  }

  // Hide stats on error
  const filesEl = document.getElementById('cache-result-files');
  if (filesEl) filesEl.textContent = '—';
  
  const chunksEl = document.getElementById('cache-result-chunks');
  if (chunksEl) chunksEl.textContent = '—';
}

// Load settings data
async function loadSettingsData() {
  await Promise.all([
    loadGeneralSettings(),
    loadSystemHealth()
  ]);
}

// === UPDATED: LOAD SETTINGS WITH TWO DROPDOWNS & SAFETY ===
async function loadGeneralSettings() {
  try {
    // 1. Fetch available models from backend
    let textModels = [];
    let audioModels = [];
    try {
      const modelsResponse = await apiFetch('/admin/system/gemini-models');
      if (modelsResponse) {
        textModels = modelsResponse.textModels || [];
        audioModels = modelsResponse.audioModels || [];
      }
    } catch (err) {
      console.warn('Could not fetch dynamic models, using fallback');
    }

    // 2. Populate Text Model Dropdown
    const aiModelSelect = document.getElementById('set-ai-model');
    if (aiModelSelect) {
      aiModelSelect.innerHTML = ''; 
      if (textModels.length > 0) {
        textModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.label;
          aiModelSelect.appendChild(option);
        });
      } else {
        // Fallback options if API fails completely
        aiModelSelect.innerHTML = `
          <option value="gemini-2.0-flash">Gemini 2.0 Flash (Offline)</option>
          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Offline)</option>
        `;
      }
    }

    // 3. Populate Audio Model Dropdown (New)
    const audioModelSelect = document.getElementById('set-audio-model');
    if (audioModelSelect) {
      audioModelSelect.innerHTML = '';
      if (audioModels.length > 0) {
        audioModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.label;
          audioModelSelect.appendChild(option);
        });
      } else {
        // Fallback options if API fails completely
        audioModelSelect.innerHTML = `
          <option value="gemini-2.5-flash-tts">Gemini 2.5 Flash TTS (Offline)</option>
        `;
      }
    }

    // 4. Load Saved Settings
    const settings = await apiFetch('/admin/settings');
    
    const sysName = document.getElementById('set-system-name');
    if (sysName) sysName.value = settings.systemName || '';
    
    // Set Text Model
    if (aiModelSelect) {
      const savedModel = settings.aiModel || 'gemini-2.0-flash';
      // Ensure saved option exists in dropdown
      const exists = Array.from(aiModelSelect.options).some(opt => opt.value === savedModel);
      if (!exists) {
        const option = document.createElement('option');
        option.value = savedModel;
        option.textContent = `${savedModel} (Saved)`;
        aiModelSelect.appendChild(option);
      }
      aiModelSelect.value = savedModel;
    }

    // Set Audio Model
    if (audioModelSelect) {
      const savedAudio = settings.audioModel || 'gemini-2.5-flash-tts';
      // Ensure saved option exists in dropdown
      const exists = Array.from(audioModelSelect.options).some(opt => opt.value === savedAudio);
      if (!exists) {
        const option = document.createElement('option');
        option.value = savedAudio;
        option.textContent = `${savedAudio} (Saved)`;
        audioModelSelect.appendChild(option);
      }
      audioModelSelect.value = savedAudio;
    }
    
    const maxContext = document.getElementById('set-max-context');
    if (maxContext) maxContext.value = settings.maxContext || 20;
    
    const webSearch = document.getElementById('set-web-search');
    if (webSearch) webSearch.checked = settings.enableWebSearch;
    
    const maint = document.getElementById('set-maintenance');
    if (maint) maint.checked = settings.maintenanceMode;
    
  } catch (error) {
    console.error('Settings Load Error:', error);
    showToast('Failed to load settings', 'error');
  }
}

// Wrapper for Save Confirmation
function confirmSaveSettings() {
  showConfirmationModal({
    title: 'Save Changes',
    message: 'Are you sure you want to apply these system configuration changes?',
    confirmText: 'Save Settings',
    confirmType: 'primary',
    onConfirm: saveSettings 
  });
}

// Save settings (Logic)
async function saveSettings() {
  const btn = document.getElementById('settings-save-btn');
  setButtonLoading(btn, true);

  try {
    const payload = {
      systemName: document.getElementById('set-system-name').value,
      aiModel: document.getElementById('set-ai-model').value,
      audioModel: document.getElementById('set-audio-model').value, // New Field
      maxContext: parseInt(document.getElementById('set-max-context').value),
      enableWebSearch: document.getElementById('set-web-search').checked,
      maintenanceMode: document.getElementById('set-maintenance').checked
    };

    await apiFetch('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    showToast('Settings saved successfully');
  } catch (error) {
    showToast('Failed to save settings', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// Load system health
async function loadSystemHealth() {
  try {
    const health = await apiFetch('/admin/system/health');
    
    const dbLatency = document.getElementById('health-db-latency');
    if (dbLatency) dbLatency.textContent = health.database.latency;
    
    const mem = document.getElementById('health-memory');
    if (mem) mem.textContent = health.system.memory.rss;
    
    const uptime = document.getElementById('health-uptime');
    if (uptime) uptime.textContent = health.system.uptime;
    
    const platform = document.getElementById('health-platform');
    if (platform) platform.textContent = `${health.system.platform} (${health.system.nodeVersion})`;

  } catch (error) {
    console.error('Health check failed', error);
  }
}

// Cache management functions
function handleRegenerateCache() {
  showConfirmationModal({
    title: 'Regenerate Cache',
    message: 'Are you sure you want to regenerate the cache?<br>This might take a while depending on the size of your Knowledge Base.',
    confirmText: 'Regenerate',
    confirmType: 'primary',
    onConfirm: async () => {
        const btn = document.getElementById('set-cache-regen');
        setButtonLoading(btn, true);
        
        openCacheProgressModal();
        connectToCacheProgressStream();
        
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          const response = await apiFetch('/admin/cache/regenerate', { method: 'POST' });
          
          if (!response.success) {
            throw new Error(response.error || 'Failed to start cache regeneration');
          }
          console.log('✅ Cache regeneration started, listening for progress...');
        } catch (error) {
          console.error('❌ Failed to start cache regeneration:', error);
          if (progressEventSource) {
            progressEventSource.close();
            progressEventSource = null;
          }
          showCacheRegenerationError(error.message);
          showToast('Failed to start cache regeneration', 'error');
          setButtonLoading(btn, false);
        }
    }
  });
}

function handleClearCache() {
  showConfirmationModal({
    title: 'Clear RAG Cache',
    message: '<strong>WARNING:</strong> This will clear the entire RAG cache. The AI will not have context until regenerated. Continue?',
    confirmText: 'Clear Cache',
    confirmType: 'danger',
    onConfirm: async () => {
        const btn = document.getElementById('set-cache-clear');
        setButtonLoading(btn, true);
        try {
          await apiFetch('/admin/cache/clear', { method: 'POST' });
          showToast('Cache cleared successfully');
          if (window.KnowledgeBase && window.KnowledgeBase.loadKnowledgeBaseData) {
            window.KnowledgeBase.loadKnowledgeBaseData().catch(err => {
              console.error('Failed to refresh knowledge base data:', err);
            });
          }
        } catch (error) {
          showToast('Failed to clear cache', 'error');
        } finally {
          setButtonLoading(btn, false);
        }
    }
  });
}

// Public API
const Settings = {
  setupSettingsManagement,
  loadSettingsData
};

// Export for global access
window.Settings = Settings;

export {
  setupSettingsManagement,
  loadSettingsData,
  Settings
};