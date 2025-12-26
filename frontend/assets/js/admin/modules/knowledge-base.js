// Knowledge Base Module - COMPLETE FIXED VERSION WITH SSE (PART 1)
import { apiFetch, API_BASE, getAuthToken } from '../core/api.js';
import { formatDateTime, escapeHtml } from '../core/utils.js';
import { showToast, setButtonLoading, validateJSON, openModal, closeModal, showConfirmationModal } from '../core/ui.js';

// State
let currentKBTab = 'documents';
let allDocuments = [];
let allCategories = [];
let allSubcategories = [];
let editingDocumentId = null;
let editingCategoryId = null;
let editingSubcategoryId = null;
let categoryModalMode = 'category';
let cacheNeedsRegeneration = false;

// SSE Store
let progressEventSource = null;

// Initialize knowledge base
function setupKnowledgeBase() {
  console.log('Setting up Knowledge Base module...');
  setupKBTabs();
  setupDocumentEditor();
  setupCategoryModal();
  setupPreviewModal();
  setupCacheRegenerationButton();
  setupKnowledgeCacheProgressModal();
  
  // Setup search and filter event listeners
  const docSearch = document.getElementById('doc-search');
  const docStatusFilter = document.getElementById('doc-status-filter');
  const subcatCategoryFilter = document.getElementById('subcat-category-filter');
  
  if (docSearch) docSearch.addEventListener('input', renderDocumentsTable);
  if (docStatusFilter) docStatusFilter.addEventListener('change', renderDocumentsTable);
  if (subcatCategoryFilter) subcatCategoryFilter.addEventListener('change', renderSubcategoriesTable);
}

// Setup cache progress modal handlers for Knowledge Base view
function setupKnowledgeCacheProgressModal() {
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
      // Reload data without refreshing page
      loadKnowledgeBaseData();
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

// Connect to Server-Sent Events stream
function connectToCacheProgressStream() {
  // Close existing connection if any
  if (progressEventSource) {
    progressEventSource.close();
    progressEventSource = null;
  }
  
  const streamUrl = `${API_BASE}/cache/progress-stream`;
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
  const btn = document.getElementById('regenerate-cache-btn');
  
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
      cacheNeedsRegeneration = false;
      updateCacheAlert();
      loadCacheStatus().catch(err => {
        console.error('Failed to refresh cache status:', err);
      });
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

// Tab management
function setupKBTabs() {
  console.log('Setting up KB tabs...');
  document.querySelectorAll('.kb-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = tab.dataset.kbTab;
      console.log('Switching to tab:', tabName);
      switchKBTab(tabName);
    });
  });
}

function switchKBTab(tabName) {
  console.log('Switching KB tab to:', tabName);
  
  // Update tabs
  document.querySelectorAll('.kb-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.kb-tab[data-kb-tab="${tabName}"]`);
  if (activeTab) activeTab.classList.add('active');
  
  // Update content
  document.querySelectorAll('.kb-tab-content').forEach(c => c.classList.remove('active'));
  const activeContent = document.getElementById(`${tabName}-tab`);
  if (activeContent) activeContent.classList.add('active');
  
  currentKBTab = tabName;
  
  // Load data for the tab
  if (tabName === 'documents') loadDocuments();
  else if (tabName === 'categories') loadCategories();
  else if (tabName === 'subcategories') loadSubcategories();
}

// Main data loader
async function loadKnowledgeBaseData() {
  try {
    const [docs, cats, allSubcats] = await Promise.all([
      apiFetch('/admin/documents'),
      apiFetch('/admin/categories'),
      apiFetch('/admin/all-subcategories')
    ]);
    
    allDocuments = docs.documents || [];
    allCategories = cats.categories || [];
    allSubcategories = allSubcats.subcategories || [];
    
    populateCategoryDropdowns();
    
    if (currentKBTab === 'documents') renderDocumentsTable();
    else if (currentKBTab === 'categories') renderCategoriesTable();
    else if (currentKBTab === 'subcategories') renderSubcategoriesTable();
    
    await loadCacheStatus();
  } catch (error) {
    console.error('❌ Error loading KB data:', error);
    showToast('Failed to load knowledge base data', 'error');
  }
}

// Document management
async function loadDocuments() {
  try {
    const data = await apiFetch('/admin/documents');
    allDocuments = data.documents || [];
    renderDocumentsTable();
  } catch (error) {
    console.error('❌ Error loading documents:', error);
  }
}

function renderDocumentsTable() {
  const tbody = document.getElementById('documents-table-body');
  if (!tbody) return;
  
  const searchTerm = (document.getElementById('doc-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('doc-status-filter')?.value || '';
  
  const filtered = allDocuments.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm);
    const matchesStatus = !statusFilter || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  
  if (filtered.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No documents found.</td></tr>'; 
    return; 
  }
  
  tbody.innerHTML = filtered.map(doc => `
    <tr>
      <td><strong>${doc.title}</strong></td>
      <td>${doc.category_name} → ${doc.subcategory_name}</td>
      <td><span class="badge badge-${getStatusColor(doc.status)}">${doc.status}</span></td>
      <td>${formatDateTime(doc.updated_at)}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn action-btn-view" onclick="window.KnowledgeBase.previewDocument(${doc.id})">
            <span class="material-symbols-outlined" style="font-size: 14px;">visibility</span> View
          </button>
          <button class="action-btn action-btn-edit" onclick="window.KnowledgeBase.editDocument(${doc.id})">
            <span class="material-symbols-outlined" style="font-size: 14px;">edit</span> Edit
          </button>
          <button class="action-btn action-btn-delete" onclick="window.KnowledgeBase.deleteDocument(${doc.id}, '${escapeHtml(doc.title)}')">
            <span class="material-symbols-outlined" style="font-size: 14px;">delete</span> Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Document editor
function setupDocumentEditor() {
  console.log('Setting up document editor...');
  
  const addBtn = document.getElementById('add-document-btn');
  const closeBtn = document.getElementById('editor-close-btn');
  const cancelBtn = document.getElementById('editor-cancel-btn');
  const saveBtn = document.getElementById('editor-save-btn');
  
  if (addBtn) {
    addBtn.addEventListener('click', () => openDocumentEditor());
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDocumentEditor);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeDocumentEditor);
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', saveDocument);
  }
  
  setupFileConversion();

  const categorySelect = document.getElementById('doc-category-select');
  if (categorySelect) {
    categorySelect.addEventListener('change', async (e) => {
      const subcategorySelect = document.getElementById('doc-subcategory-select');
      const categoryId = e.target.value;
      if (!categoryId) { 
        subcategorySelect.disabled = true; 
        subcategorySelect.innerHTML = '<option value="">Select category first...</option>';
        return; 
      }
      
      try {
        const data = await apiFetch(`/admin/subcategories/${categoryId}`);
        const subcats = data.subcategories || [];
        subcategorySelect.disabled = false;
        subcategorySelect.innerHTML = '<option value="">Select subcategory...</option>' + 
          subcats.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('');
      } catch (error) { 
        console.error(error); 
      }
    });
  }
  
  // Setup JSON validation
  const jsonInput = document.getElementById('doc-content-input');
  if (jsonInput) {
    jsonInput.addEventListener('input', () => {
      validateJSON(jsonInput.value);
    });
  }
}

// File conversion for AI processing
function setupFileConversion() {
  const convertBtn = document.getElementById('btn-convert-file');
  const fileInput = document.getElementById('ai-file-upload');

  if (!convertBtn) return;

  // Setup conversion status modal close handlers
  setupConversionStatusModal();

  convertBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      showToast('Please select a file first', 'warning');
      return;
    }

    // Open conversion status modal
    openConversionStatusModal();
    setButtonLoading(convertBtn, true);

    // Simulate progress
    simulateProgress();

    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log('📂 Uploading file:', file.name, 'Size:', file.size);

      // Use API_BASE and getAuthToken from imports
      const response = await fetch(`${API_BASE}/admin/convert-file`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthToken()
        },
        body: formData
      });

      if (!response.ok) {
        // IMPROVED ERROR HANDLING
        const errorText = await response.text();
        let errorMessage = `Server Error (${response.status})`;
        
        // Try to parse the backend JSON error
        try {
            const jsonError = JSON.parse(errorText);
            // Use specific error if provided
            if (jsonError.error) errorMessage = jsonError.error;
            // Remove the noisy "[GoogleGenerativeAI Error]" prefix if present
            if (errorMessage.includes('[GoogleGenerativeAI Error]')) {
                errorMessage = errorMessage.replace(/\[GoogleGenerativeAI Error\]:\s*/, '').trim();
            }
        } catch (e) {
            // Fallback for non-JSON errors
            errorMessage += `: ${errorText.substring(0, 100)}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success) {
        // Show success state
        showConversionSuccess(file.name, data.json);
        
        // Populate the form
        const jsonOutput = document.getElementById('doc-content-input');
        jsonOutput.value = data.json;
        
        try {
          const parsed = JSON.parse(data.json);
          if (parsed.title) {
            document.getElementById('doc-title-input').value = parsed.title;
          }
          validateJSON(data.json);
        } catch (e) {
          console.log("Returned text was not perfect JSON, let user fix it.");
          validateJSON(data.json);
        }
      } else {
        // Show logical error from API
        showConversionError(data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Conversion error:', error);
      showConversionError(error.message || 'Failed to connect to server');
    } finally {
      setButtonLoading(convertBtn, false);
    }
  });
}

// Setup conversion status modal handlers
function setupConversionStatusModal() {
  const closeBtn = document.getElementById('conversion-status-close');
  const footerBtn = document.getElementById('conversion-close-btn');
  
  if (closeBtn) {
    closeBtn.onclick = closeConversionStatusModal;
  }
  if (footerBtn) {
    footerBtn.onclick = closeConversionStatusModal;
  }
}

// Open conversion status modal
function openConversionStatusModal() {
  const modal = document.getElementById('conversion-status-modal');
  if (!modal) {
      console.warn('⚠️ conversion-status-modal not found in DOM!');
      return;
  }
  
  // Check if elements exist before modifying
  const title = document.getElementById('conversion-status-title');
  if (title) title.textContent = 'Converting File';
  
  const loading = document.getElementById('conversion-loading');
  if (loading) loading.style.display = 'block';
  
  const success = document.getElementById('conversion-success');
  if (success) success.style.display = 'none';
  
  const error = document.getElementById('conversion-error');
  if (error) error.style.display = 'none';
  
  const close = document.getElementById('conversion-status-close');
  if (close) close.style.display = 'none';
  
  const footer = document.getElementById('conversion-footer');
  if (footer) footer.style.display = 'none';
  
  // Reset progress
  const fill = document.getElementById('conversion-progress-fill');
  if (fill) fill.style.width = '0%';
  
  const text = document.getElementById('conversion-progress-text');
  if (text) text.textContent = 'Uploading file...';
  
  modal.classList.add('active');
}

// Close conversion status modal
function closeConversionStatusModal() {
  const modal = document.getElementById('conversion-status-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Simulate progress during conversion
function simulateProgress() {
  const progressFill = document.getElementById('conversion-progress-fill');
  const progressText = document.getElementById('conversion-progress-text');
  
  if (!progressFill || !progressText) return;

  const stages = [
    { progress: 20, text: 'Uploading file...' },
    { progress: 40, text: 'Analyzing content...' },
    { progress: 60, text: 'Extracting information...' },
    { progress: 80, text: 'Structuring data...' },
    { progress: 95, text: 'Finalizing...' }
  ];
  
  let currentStage = 0;
  
  const interval = setInterval(() => {
    // Re-check existence to prevent crashes if modal closes or elements vanish
    if (!progressFill || !progressText) {
        clearInterval(interval);
        return;
    }

    if (currentStage < stages.length) {
      progressFill.style.width = stages[currentStage].progress + '%';
      progressText.textContent = stages[currentStage].text;
      currentStage++;
    } else {
      clearInterval(interval);
    }
  }, 800);
  
  // Store interval ID to clear it if needed
  window.conversionProgressInterval = interval;
}

// Show conversion success
function showConversionSuccess(filename, jsonContent) {
  // Clear progress interval
  if (window.conversionProgressInterval) {
    clearInterval(window.conversionProgressInterval);
  }
  
  // Check existence
  const title = document.getElementById('conversion-status-title');
  if (!title) return;

  // Update modal
  title.textContent = 'Conversion Complete';
  document.getElementById('conversion-loading').style.display = 'none';
  document.getElementById('conversion-success').style.display = 'block';
  document.getElementById('conversion-status-close').style.display = 'block';
  document.getElementById('conversion-footer').style.display = 'flex';
  
  // Update stats
  document.getElementById('conversion-filename').textContent = filename;
  
  // Calculate size
  const size = new Blob([jsonContent]).size;
  const sizeKB = (size / 1024).toFixed(2);
  document.getElementById('conversion-size').textContent = `${sizeKB} KB`;
  
  // Show success toast
  setTimeout(() => {
    showToast('✨ File converted successfully!', 'success');
  }, 500);
}

// Show conversion error
function showConversionError(errorMessage) {
  // Clear progress interval
  if (window.conversionProgressInterval) {
    clearInterval(window.conversionProgressInterval);
  }
  
  const title = document.getElementById('conversion-status-title');
  if (!title) return;
  
  // Update modal
  title.textContent = 'Conversion Failed';
  document.getElementById('conversion-loading').style.display = 'none';
  document.getElementById('conversion-error').style.display = 'block';
  document.getElementById('conversion-status-close').style.display = 'block';
  document.getElementById('conversion-footer').style.display = 'flex';
  
  // Update error message
  document.getElementById('conversion-error-message').textContent = errorMessage;
}

// Document CRUD operations
async function openDocumentEditor(documentId = null) {
  const modal = document.getElementById('document-editor-modal');
  const title = document.getElementById('editor-title');
  editingDocumentId = documentId;
  
  document.getElementById('ai-file-upload').value = '';

  if (documentId) {
    title.textContent = 'Edit Document';
    try {
      const response = await apiFetch(`/admin/documents/${documentId}`);
      const doc = response.document;
      document.getElementById('doc-title-input').value = doc.title;
      document.getElementById('doc-status-select').value = doc.status;
      
      // Handle content - it might be a string or already parsed object
      let contentValue = doc.content;
      if (typeof contentValue === 'object') {
        contentValue = JSON.stringify(contentValue, null, 2);
      }
      document.getElementById('doc-content-input').value = contentValue;
      
      const category = allCategories.find(c => c.name === doc.category_name);
      if (category) {
        document.getElementById('doc-category-select').value = category.id;
        const subcatData = await apiFetch(`/admin/subcategories/${category.id}`);
        const subcats = subcatData.subcategories || [];
        const subSelect = document.getElementById('doc-subcategory-select');
        subSelect.disabled = false;
        subSelect.innerHTML = '<option value="">Select subcategory...</option>' + 
          subcats.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        const sub = subcats.find(s => s.name === doc.subcategory_name);
        if (sub) subSelect.value = sub.id;
      }
      // Validate the existing content after a short delay
      setTimeout(() => validateJSON(document.getElementById('doc-content-input').value), 100);
    } catch (error) { 
      showToast('Failed to load document', 'error'); 
    }
  } else {
    title.textContent = 'Add Document';
    document.getElementById('doc-title-input').value = '';
    document.getElementById('doc-category-select').value = '';
    document.getElementById('doc-subcategory-select').innerHTML = '<option value="">Select category first...</option>';
    document.getElementById('doc-subcategory-select').disabled = true;
    document.getElementById('doc-status-select').value = 'draft';
    
    // Set default valid JSON content
    const defaultContent = {
      "title": "Document Title",
      "sections": [
        {
          "heading": "Introduction",
          "content": "This is the introduction section."
        },
        {
          "heading": "Main Content", 
          "content": "This is the main content section."
        }
      ]
    };
    
    document.getElementById('doc-content-input').value = JSON.stringify(defaultContent, null, 2);
    
    // Validate after a short delay to ensure modal is fully rendered
    setTimeout(() => {
      validateJSON(document.getElementById('doc-content-input').value);
    }, 100);
  }
  
  openModal('document-editor-modal');
}

function closeDocumentEditor() {
  closeModal('document-editor-modal');
  editingDocumentId = null;
}

async function saveDocument() {
  const title = document.getElementById('doc-title-input').value;
  const subcatId = document.getElementById('doc-subcategory-select').value;
  const content = document.getElementById('doc-content-input').value;
  const status = document.getElementById('doc-status-select').value;
  const saveBtn = document.getElementById('editor-save-btn');
  
  if (!title || !subcatId) {
    showToast('Missing required fields', 'error');
    return;
  }
  
  // Validate JSON before saving
  if (!validateJSON(content)) {
    showToast('Invalid JSON content. Please fix syntax errors.', 'error');
    return;
  }
  
  setButtonLoading(saveBtn, true);
  
  try {
    const payload = { 
      title, 
      subcategory_id: subcatId, 
      content: JSON.parse(content), // Parse to ensure it's valid
      status 
    };
    
    if (editingDocumentId) {
      await apiFetch(`/admin/documents/${editingDocumentId}`, { 
        method: 'PUT', 
        body: JSON.stringify(payload) 
      });
    } else {
      await apiFetch('/admin/documents', { 
        method: 'POST', 
        body: JSON.stringify(payload) 
      });
    }
    
    showToast('Document saved');
    closeDocumentEditor();
    loadKnowledgeBaseData();
    markCacheForRegeneration();
  } catch (error) { 
    showToast(error.message, 'error'); 
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

// Preview modal
function setupPreviewModal() {
  document.getElementById('preview-close-btn').addEventListener('click', () => 
    closeModal('document-preview-modal'));
  document.getElementById('preview-close-footer-btn').addEventListener('click', () => 
    closeModal('document-preview-modal'));
}

async function previewDocument(id) {
  openModal('document-preview-modal');
  
  try {
    const res = await apiFetch(`/admin/documents/${id}`);
    const doc = res.document;
    document.getElementById('preview-title').textContent = doc.title;
    document.getElementById('preview-category').textContent = doc.category_name;
    document.getElementById('preview-content').textContent = typeof doc.content === 'string' ? 
      doc.content : JSON.stringify(doc.content, null, 2);
  } catch (error) {
    showToast('Failed to load document', 'error');
  }
}

// Categories and Subcategories management
async function loadCategories() {
  const data = await apiFetch('/admin/categories');
  allCategories = data.categories || [];
  renderCategoriesTable();
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categories-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = allCategories.map(cat => {
    const subCount = allSubcategories.filter(s => s.category_id === cat.id).length;
    const description = cat.description || '';

    return `<tr>
      <td><strong>${cat.name}</strong></td>
      <td>${subCount}</td>
      <td>${escapeHtml(description)}</td>
      <td>
        <button class="action-btn action-btn-edit" onclick="window.KnowledgeBase.editCategory(${cat.id})">Edit</button>
        <button class="action-btn action-btn-delete" onclick="window.KnowledgeBase.deleteCategory(${cat.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

async function loadSubcategories() {
  const data = await apiFetch('/admin/all-subcategories');
  allSubcategories = data.subcategories || [];
  renderSubcategoriesTable();
}

function renderSubcategoriesTable() {
  const tbody = document.getElementById('subcategories-table-body');
  if (!tbody) return;
  
  const filter = document.getElementById('subcat-category-filter')?.value || '';
  const filtered = allSubcategories.filter(s => !filter || s.category_id == filter);
  
  tbody.innerHTML = filtered.map(sub => {
    const description = sub.description || '';
    return `<tr>
      <td><strong>${sub.name}</strong></td>
      <td>${sub.category_name}</td>
      <td>${escapeHtml(description)}</td>
      <td>
        <button class="action-btn action-btn-edit" onclick="window.KnowledgeBase.editSubcategory(${sub.id})">Edit</button>
        <button class="action-btn action-btn-delete" onclick="window.KnowledgeBase.deleteSubcategory(${sub.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

// Category modal management
function setupCategoryModal() {
  console.log('Setting up category modal...');
  
  const addCategoryBtn = document.getElementById('add-category-btn');
  const addSubcategoryBtn = document.getElementById('add-subcategory-btn');
  const modalClose = document.getElementById('category-modal-close');
  const modalCancel = document.getElementById('category-modal-cancel');
  const modalSave = document.getElementById('category-modal-save');
  
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', () => openCategoryModal('category'));
  }
  if (addSubcategoryBtn) {
    addSubcategoryBtn.addEventListener('click', () => openCategoryModal('subcategory'));
  }
  if (modalClose) {
    modalClose.addEventListener('click', closeCategoryModal);
  }
  if (modalCancel) {
    modalCancel.addEventListener('click', closeCategoryModal);
  }
  if (modalSave) {
    modalSave.addEventListener('click', saveCategoryOrSubcategory);
  }
}

function openCategoryModal(mode, id = null, name = '', parentId = null, description = '') {
  categoryModalMode = mode;
  editingCategoryId = mode === 'category' ? id : null;
  editingSubcategoryId = mode === 'subcategory' ? id : null;
  
  document.getElementById('category-modal-title').textContent = mode === 'category' ? 
    (id ? 'Edit Category' : 'Add Category') : 
    (id ? 'Edit Subcategory' : 'Add Subcategory');
  
  document.getElementById('category-modal-input').value = name;
  const descInput = document.getElementById('category-modal-description');
  if (descInput) descInput.value = description || '';
  document.getElementById('category-modal-parent-group').style.display = mode === 'subcategory' ? 'block' : 'none';
  
  if (mode === 'subcategory') {
    document.getElementById('category-modal-parent-select').innerHTML = '<option value="">Select parent...</option>' + 
      allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (parentId) document.getElementById('category-modal-parent-select').value = parentId;
  }
  
  openModal('category-modal');
}

function closeCategoryModal() { 
  closeModal('category-modal'); 
}

async function saveCategoryOrSubcategory() {
  const name = document.getElementById('category-modal-input').value;
  const description = document.getElementById('category-modal-description')?.value || '';
  const saveBtn = document.getElementById('category-modal-save');
  
  if (!name) {
    showToast('Name is required', 'error');
    return;
  }
  
  setButtonLoading(saveBtn, true);
  
  try {
    if (categoryModalMode === 'category') {
      if (editingCategoryId) {
        await apiFetch(`/admin/categories/${editingCategoryId}`, { 
          method: 'PUT', 
          body: JSON.stringify({ name, description }) 
        });
      } else {
        await apiFetch('/admin/categories', { 
          method: 'POST', 
          body: JSON.stringify({ name, description }) 
        });
      }
    } else {
      const catId = document.getElementById('category-modal-parent-select').value;
      if (!catId) {
        showToast('Please select a parent category', 'error');
        return;
      }
      
      if (editingSubcategoryId) {
        await apiFetch(`/admin/subcategories/${editingSubcategoryId}`, { 
          method: 'PUT', 
          body: JSON.stringify({ name, category_id: catId, description }) 
        });
      } else {
        await apiFetch('/admin/subcategories', { 
          method: 'POST', 
          body: JSON.stringify({ name, category_id: catId, description }) 
        });
      }
    }
    
    closeCategoryModal();
    loadKnowledgeBaseData();
    markCacheForRegeneration();
    showToast('Saved successfully');
  } catch (error) {
    showToast('Failed to save', 'error');
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

// Cache management - WITH REAL-TIME SSE PROGRESS
function setupCacheRegenerationButton() {
  const btn = document.getElementById('regenerate-cache-btn');
  if (btn) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Use the confirmation modal
      window.showConfirmationModal({
        title: 'Regenerate Cache',
        message: 'Are you sure you want to regenerate the cache?<br>This might take a while depending on the size of your Knowledge Base.',
        confirmText: 'Regenerate',
        confirmType: 'primary',
        onConfirm: async () => {
          setButtonLoading(btn, true);
          
          // Open progress modal
          openCacheProgressModal();
          
          // Connect to SSE stream for real-time progress
          connectToCacheProgressStream();
          
          try {
            // Wait a moment to ensure SSE connection is established
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Trigger cache regeneration (returns immediately)
            const response = await apiFetch('/admin/cache/regenerate', { method: 'POST' });
            
            if (!response.success) {
              throw new Error(response.error || 'Failed to start cache regeneration');
            }
            
            console.log('✅ Cache regeneration started, listening for progress...');
            
          } catch (error) {
            console.error('❌ Failed to start cache regeneration:', error);
            
            // Disconnect SSE
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
    });
  }
}

async function loadCacheStatus() {
  try {
    const res = await apiFetch('/cache/status');
    
    const chunksEl = document.getElementById('cache-chunks-count');
    const filesEl = document.getElementById('cache-files-count');
    if (chunksEl) chunksEl.textContent = res.chunks_count || 0;
    if (filesEl) filesEl.textContent = res.knowledge_base_files || 0;
    
    const setChunks = document.getElementById('set-chunks-count');
    if (setChunks) setChunks.textContent = res.chunks_count || 0;
    
    const setCacheDot = document.getElementById('set-cache-dot');
    const setCacheStatus = document.getElementById('set-cache-status');
    
    if (setCacheDot && setCacheStatus) {
      setCacheDot.className = res.cache_valid ? 'health-status-dot dot-green' : 'health-status-dot dot-red';
      setCacheStatus.textContent = res.cache_valid ? 'Active' : 'Needs Update';
    }

    const lastUpdatedEl = document.getElementById('cache-last-updated');
    if (lastUpdatedEl && res.cache_info?.cacheGenerated) {
      lastUpdatedEl.textContent = formatDateTime(res.cache_info.cacheGenerated);
    } else if (lastUpdatedEl) {
      lastUpdatedEl.textContent = "Never";
    }
    
    updateCacheStatusIndicator(res.cache_valid);
  } catch (e) { 
    console.error(e); 
  }
}

function updateCacheStatusIndicator(valid) {
  const ind = document.getElementById('cache-status-indicator');
  if (!ind) return;
  ind.querySelector('.status-text').textContent = valid ? 'Cache is up to date' : 'Cache needs regeneration';
  ind.querySelector('.status-dot').style.background = valid ? '#27ae60' : '#e74c3c';
}

function updateCacheAlert() {
  const alert = document.getElementById('cache-alert');
  if (alert) {
    alert.style.display = cacheNeedsRegeneration ? 'block' : 'none';
  }
}

function markCacheForRegeneration() {
  cacheNeedsRegeneration = true;
  updateCacheAlert();
}

// Helper functions
function getStatusColor(status) {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  return 'info';
}

function populateCategoryDropdowns() {
  const opts = '<option value="">All Categories</option>' + 
    allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  
  const subcatFilter = document.getElementById('subcat-category-filter');
  if (subcatFilter) {
    subcatFilter.innerHTML = opts;
  }
  
  const docCategorySelect = document.getElementById('doc-category-select');
  if (docCategorySelect) {
    docCategorySelect.innerHTML = '<option value="">Select category...</option>' + 
      allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

// Public API
const KnowledgeBase = {
  setupKnowledgeBase,
  loadKnowledgeBaseData,
  switchKBTab,
  openDocumentEditor,
  closeDocumentEditor,
  previewDocument,
  editDocument: openDocumentEditor,
  deleteDocument: async (id, title) => {
    showConfirmationModal({
      title: 'Delete Document',
      message: `Delete "<strong>${escapeHtml(title)}</strong>"?`,
      confirmText: 'Delete',
      confirmType: 'danger',
      onConfirm: async () => {
        await apiFetch(`/admin/documents/${id}`, { method: 'DELETE' });
        loadKnowledgeBaseData();
        markCacheForRegeneration();
      }
    });
  },
  editCategory: (id) => {
    const cat = allCategories.find(c => c.id === id);
    openCategoryModal('category', id, cat?.name || '', null, cat?.description || '');
  },
  deleteCategory: async (id) => {
    showConfirmationModal({
      title: 'Delete Category',
      message: 'Delete this category?',
      confirmText: 'Delete',
      confirmType: 'danger',
      onConfirm: async () => {
        await apiFetch(`/admin/categories/${id}`, { method: 'DELETE' }); 
        loadKnowledgeBaseData(); 
        markCacheForRegeneration(); 
      }
    });
  },
  editSubcategory: (id) => {
    const sub = allSubcategories.find(s => s.id === id);
    openCategoryModal('subcategory', id, sub?.name || '', sub?.category_id || null, sub?.description || '');
  },
  deleteSubcategory: async (id) => {
    showConfirmationModal({
      title: 'Delete Subcategory',
      message: 'Delete this subcategory?',
      confirmText: 'Delete',
      confirmType: 'danger',
      onConfirm: async () => {
        await apiFetch(`/admin/subcategories/${id}`, { method: 'DELETE' }); 
        loadKnowledgeBaseData(); 
        markCacheForRegeneration(); 
      }
    });
  }
};

// Export for global access
window.KnowledgeBase = KnowledgeBase;

export {
  setupKnowledgeBase,
  loadKnowledgeBaseData,
  switchKBTab,
  currentKBTab,
  KnowledgeBase
};
