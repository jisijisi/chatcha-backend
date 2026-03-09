// Settings Management Module - DYNAMIC MODELS VERSION
import { apiFetch } from '../core/api.js';
import { showToast, setButtonLoading, showConfirmationModal, openModal, closeModal } from '../core/ui.js';

// SSE Store
let progressEventSource = null;

// State for custom model dropdowns
let availableTextModels = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
];
let availableAudioModels = [
  { id: 'gemini-2.5-flash-tts', label: 'Gemini 2.5 Flash TTS' }
];

// Initialize settings management
function setupSettingsManagement() {
  const saveBtn = document.getElementById('settings-save-btn');
  const regenBtn = document.getElementById('set-cache-regen');
  const clearBtn = document.getElementById('set-cache-clear');
  const addAiModelBtn = document.getElementById('btn-add-ai-model');
  const addAudioModelBtn = document.getElementById('btn-add-audio-model');

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

  if (addAiModelBtn) {
    addAiModelBtn.onclick = (e) => {
      e.preventDefault();
      openAddModelModal('text');
    };
  }

  if (addAudioModelBtn) {
    addAudioModelBtn.onclick = (e) => {
      e.preventDefault();
      openAddModelModal('audio');
    };
  }

  // Setup dropdown triggers
  const aiTrigger = document.getElementById('ai-model-trigger');
  const audioTrigger = document.getElementById('audio-model-trigger');

  if (aiTrigger) {
    aiTrigger.onclick = (e) => {
      e.stopPropagation();
      document.getElementById('ai-model-options').classList.toggle('active');
      const audioOpts = document.getElementById('audio-model-options');
      if (audioOpts) audioOpts.classList.remove('active');
    };
  }

  if (audioTrigger) {
    audioTrigger.onclick = (e) => {
      e.stopPropagation();
      document.getElementById('audio-model-options').classList.toggle('active');
      const aiOpts = document.getElementById('ai-model-options');
      if (aiOpts) aiOpts.classList.remove('active');
    };
  }

  // Close dropdowns on outside click
  window.addEventListener('click', () => {
    const aiOpts = document.getElementById('ai-model-options');
    const audioOpts = document.getElementById('audio-model-options');
    if (aiOpts) aiOpts.classList.remove('active');
    if (audioOpts) audioOpts.classList.remove('active');
  });

  // Setup modals
  setupCacheProgressModal();
  setupAddModelModal();

  // Load available models from backend
  loadAvailableGeminiModels();

  // Poll health every 30 seconds if settings view is active
  setInterval(() => {
    const settingsView = document.getElementById('settings-view');
    if (settingsView && settingsView.classList.contains('active')) {
      loadSystemHealth();
    }
  }, 30000);
}

// Render Custom Dropdown
function renderCustomDropdown(type) {
  const optionsId = type === 'text' ? 'ai-model-options' : 'audio-model-options';
  const selectedTextId = type === 'text' ? 'ai-model-selected-text' : 'audio-model-selected-text';
  const inputId = type === 'text' ? 'set-ai-model' : 'set-audio-model';
  const models = type === 'text' ? availableTextModels : availableAudioModels;
  
  const optionsContainer = document.getElementById(optionsId);
  const selectedText = document.getElementById(selectedTextId);
  const hiddenInput = document.getElementById(inputId);
  
  if (!optionsContainer) return;
  
  optionsContainer.innerHTML = '';
  
  if (models.length === 0) {
    optionsContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 0.85rem;">No models added.</div>';
    return;
  }

  models.forEach(model => {
    const option = document.createElement('div');
    option.className = `custom-option ${hiddenInput.value === model.id ? 'selected' : ''}`;
    
    const label = document.createElement('span');
    label.textContent = model.label;
    label.style.flex = '1';
    
    const removeBtn = document.createElement('span');
    removeBtn.className = 'custom-option-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove model';
    
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      if (hiddenInput.value === model.id) {
        showToast('Cannot remove the currently selected model', 'warning');
        return;
      }
      
      if (type === 'text') {
        availableTextModels = availableTextModels.filter(m => m.id !== model.id);
      } else {
        availableAudioModels = availableAudioModels.filter(m => m.id !== model.id);
      }
      renderCustomDropdown(type);
      showToast('Model removed from list');
    };
    
    option.onclick = () => {
      hiddenInput.value = model.id;
      selectedText.textContent = model.label;
      optionsContainer.classList.remove('active');
      renderCustomDropdown(type); // Re-render to update selected class
    };
    
    option.appendChild(label);
    option.appendChild(removeBtn);
    optionsContainer.appendChild(option);
    
    // Update trigger text if this is selected
    if (hiddenInput.value === model.id) {
      selectedText.textContent = model.label;
    }
  });
}

// Setup Add Model Modal
function setupAddModelModal() {
  const closeBtn = document.getElementById('add-model-close');
  const cancelBtn = document.getElementById('add-model-cancel');
  const saveBtn = document.getElementById('add-model-save-btn');
  const testBtn = document.getElementById('add-model-test-btn');
  const statusDiv = document.getElementById('model-test-status');

  if (closeBtn) closeBtn.onclick = () => closeModal('add-model-modal');
  if (cancelBtn) cancelBtn.onclick = () => closeModal('add-model-modal');

  if (testBtn) {
    testBtn.onclick = async () => {
      const id = document.getElementById('new-model-id').value.trim();
      const type = document.getElementById('add-model-type').value;
      const prompt = document.getElementById('model-test-prompt').value.trim();

      if (!id) {
        showToast('Please enter a Model Identifier (ID)', 'error');
        return;
      }

      // Show testing status
      testBtn.disabled = true;
      testBtn.innerHTML = '<span>Processing...</span>';
      statusDiv.style.display = 'block';
      statusDiv.style.backgroundColor = '#f8fafc';
      statusDiv.style.color = '#64748b';
      statusDiv.style.border = '1px solid #e2e8f0';
      statusDiv.textContent = `Sending request to ${id}...`;

      try {
        const data = await apiFetch('/admin/test-model', {
          method: 'POST',
          body: JSON.stringify({ 
            modelId: id, 
            type,
            prompt: prompt || "Hello, reply with 'Connection successful!'" 
          })
        });

        if (data.success) {
          statusDiv.style.backgroundColor = '#f0fdf4';
          statusDiv.style.color = '#15803d';
          statusDiv.style.border = '1px solid #bcf0da';
          statusDiv.innerHTML = `<strong>✅ AI Response:</strong><br><div style="margin-top: 5px; white-space: pre-wrap;">${data.response}</div>`;
          showToast('Model connection successful', 'success');
        } else {
          statusDiv.style.backgroundColor = '#fef2f2';
          statusDiv.style.color = '#b91c1c';
          statusDiv.style.border = '1px solid #fecaca';
          statusDiv.innerHTML = `<strong>❌ Error</strong><br>${data.error || 'Unknown error'}`;
          showToast('Model test failed', 'error');
        }
      } catch (error) {
        console.error('Test error:', error);
        statusDiv.style.backgroundColor = '#fef2f2';
        statusDiv.style.color = '#b91c1c';
        statusDiv.style.border = '1px solid #fecaca';
        
        // Use the error message from the thrown Error if available
        const errorMsg = error.message || 'Error connecting to test server.';
        statusDiv.innerHTML = `<strong>❌ Connection Error</strong><br>${errorMsg}`;
        showToast('Server error during test', 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = '<span>Run Test</span>';
      }
    };
  }

  if (saveBtn) {
    saveBtn.onclick = () => {
      const id = document.getElementById('new-model-id').value.trim();
      const label = document.getElementById('new-model-label').value.trim();
      const type = document.getElementById('add-model-type').value;

      if (!id || !label) {
        showToast('Please fill in all fields', 'error');
        return;
      }

      if (type === 'text') {
        const exists = availableTextModels.some(m => m.id === id);
        if (!exists) availableTextModels.push({ id, label });
        document.getElementById('set-ai-model').value = id;
      } else {
        const exists = availableAudioModels.some(m => m.id === id);
        if (!exists) availableAudioModels.push({ id, label });
        document.getElementById('set-audio-model').value = id;
      }

      renderCustomDropdown(type);
      closeModal('add-model-modal');
      showToast(`${type === 'text' ? 'AI' : 'Audio'} model added and selected`);
    };
  }
}

// Render Model Management List (Deprecated)
function renderModelList(type) {
  renderCustomDropdown(type);
}

// Open Add Model Modal
function openAddModelModal(type) {
  const title = document.getElementById('add-model-title');
  const typeInput = document.getElementById('add-model-type');
  const statusDiv = document.getElementById('model-test-status');
  
  // Clear inputs
  document.getElementById('new-model-id').value = '';
  document.getElementById('new-model-label').value = '';
  const promptInput = document.getElementById('model-test-prompt');
  if (promptInput) promptInput.value = '';
  
  if (statusDiv) {
    statusDiv.style.display = 'none';
    statusDiv.textContent = '';
  }
  
  if (type === 'text') {
    if (title) title.textContent = 'Add AI Model (Chat/Text)';
    if (typeInput) typeInput.value = 'text';
  } else {
    if (title) title.textContent = 'Add Text to Speech Model';
    if (typeInput) typeInput.value = 'audio';
  }
  
  openModal('add-model-modal');
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
        // Removed redundant detail appending as per user request
        // if (data.detail) {
        //   message += ` (${data.detail.current}/${data.detail.total} - ${data.detail.percentage}%)`;
        // }
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
async function loadSettingsData(showSkeleton = true) {
  const skeleton = document.getElementById('settings-skeleton');
  const content = document.getElementById('settings-content');

  // Show Skeleton
  if (showSkeleton && skeleton && content) {
    content.style.display = 'none';
    skeleton.style.display = 'block';
  }

  try {
      await Promise.all([
        loadGeneralSettings(),
        loadSystemHealth()
      ]);
  } catch(error) {
      console.error('Failed to load settings data', error);
  } finally {
      // Hide Skeleton
      if (showSkeleton && skeleton && content) {
          content.style.display = 'block';
          skeleton.style.display = 'none';
      }
  }
}

// === UPDATED: LOAD SETTINGS WITH CUSTOM DROPDOWNS ===
async function loadGeneralSettings() {
  try {
    const aiInput = document.getElementById('set-ai-model');
    const audioInput = document.getElementById('set-audio-model');

    // 1. Load Saved Settings
    const settings = await apiFetch('/admin/settings');
    
    const sysName = document.getElementById('set-system-name');
    if (sysName) sysName.value = settings.systemName || '';
    
    // Set Text Model
    if (aiInput) {
      const savedModel = settings.aiModel || 'gemini-2.0-flash';
      aiInput.value = savedModel;
      
      // Ensure saved model exists in available list
      const exists = availableTextModels.some(m => m.id === savedModel);
      if (!exists) {
        availableTextModels.push({ id: savedModel, label: `${savedModel} (Saved)` });
      }
    }

    // Set Audio Model
    if (audioInput) {
      const savedAudio = settings.audioModel || 'gemini-2.5-flash-tts';
      audioInput.value = savedAudio;
      
      // Ensure saved model exists in available list
      const exists = availableAudioModels.some(m => m.id === savedAudio);
      if (!exists) {
        availableAudioModels.push({ id: savedAudio, label: `${savedAudio} (Saved)` });
      }
    }

    renderCustomDropdown('text');
    renderCustomDropdown('audio');
    
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

async function loadAvailableGeminiModels() {
  try {
    const data = await apiFetch('/admin/system/gemini-models');
    if (data && data.textModels && data.textModels.length > 0) {
      console.log('✅ Loaded available Gemini models from API');
      
      // Update our lists while keeping existing ones as fallbacks
      const newTextModels = data.textModels.map(m => ({ id: m.id, label: m.label }));
      const newAudioModels = data.audioModels ? data.audioModels.map(m => ({ id: m.id, label: m.label })) : [];
      
      // Merge: Add new models that aren't already in the list
      newTextModels.forEach(m => {
        if (!availableTextModels.some(existing => existing.id === m.id)) {
          availableTextModels.push(m);
        }
      });
      
      newAudioModels.forEach(m => {
        if (!availableAudioModels.some(existing => existing.id === m.id)) {
          availableAudioModels.push(m);
        }
      });

      // Sort lists
      availableTextModels.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' }));
      
      // Re-render dropdowns if they are active
      renderCustomDropdown('text');
      renderCustomDropdown('audio');
    }
  } catch (error) {
    console.warn('⚠️ Could not load dynamic Gemini models:', error);
    // We already have hardcoded fallbacks in availableTextModels
  }
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