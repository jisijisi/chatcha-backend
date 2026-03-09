import { apiFetch } from '../core/api.js';
import { showConfirmationModal, showToast } from '../core/ui.js';

let currentTheme = {}; // Will hold the 'config' object
let hasChanges = false;

// Configuration of editable variables
const THEME_VARS = [
  { section: 'Brand Colors', vars: [
    { name: '--primary-color', label: 'Primary Color', type: 'color' },
    { name: '--primary-hover', label: 'Primary Hover', type: 'color' },
    { name: '--text-brand', label: 'Brand Text Color', type: 'color' }
  ]},
  { section: 'Backgrounds (Light)', vars: [
    { name: '--bg-body', label: 'Body Background', type: 'color' },
    { name: '--bg-card', label: 'Card Background', type: 'color' },
    { name: '--sidebar-bg', label: 'Sidebar Background', type: 'color' }
  ]},
  { section: 'Text Colors (Light)', vars: [
    { name: '--text-main', label: 'Main Text', type: 'color' },
    { name: '--text-muted', label: 'Muted Text', type: 'color' }
  ]},
  { section: 'Chat Bubbles', vars: [
    { name: '--user-msg-bg', label: 'User Bubble Bg', type: 'color' },
    { name: '--user-msg-text', label: 'User Bubble Text', type: 'color' },
    { name: '--bot-msg-bg', label: 'Bot Bubble Bg', type: 'color' },
    { name: '--bot-msg-text', label: 'Bot Bubble Text', type: 'color' }
  ]}
];

const EFFECTS = [
  { id: 'none', label: 'None' },
  { id: 'snow', label: 'Snowfall (Christmas)' },
  { id: 'lights', label: 'Christmas Lights (Header)' }
];

const AVATAR_VARIANTS = [
  { id: 'default', label: 'Default' },
  { id: 'christmas', label: 'Christmas (Santa Hat)' },
  { id: 'newyear', label: 'New Year (Party)' },
  { id: 'custom', label: 'Custom Upload' }
];

export async function loadThemeModule() {
  const container = document.getElementById('theme-content');
  container.innerHTML = `
    <div class="theme-container">
      <!-- Editor Panel -->
      <div class="theme-editor-panel">
        <div class="theme-settings-card">
          <div class="settings-scroll-area">
            <div id="theme-editor-form">
                <div style="display: flex; flex-direction: column; gap: 20px;">
                  <!-- AI Section Skeleton -->
                  <div class="skeleton" style="height: 140px; width: 100%; border-radius: 8px;"></div>
                  
                  <!-- CSS Section Skeleton -->
                  <div class="skeleton" style="height: 100px; width: 100%; border-radius: 8px;"></div>
                  
                  <!-- Colors Section Skeleton -->
                  <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div class="skeleton" style="height: 50px; width: 100%;"></div>
                    <div style="padding: 15px; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 15px;">
                      <div class="skeleton" style="height: 60px; width: 100%; border-radius: 4px;"></div>
                      <div class="skeleton" style="height: 60px; width: 100%; border-radius: 4px;"></div>
                      <div class="skeleton" style="height: 60px; width: 100%; border-radius: 4px;"></div>
                      <div class="skeleton" style="height: 60px; width: 100%; border-radius: 4px;"></div>
                    </div>
                  </div>
                </div>
            </div>
          </div>
          <div class="settings-footer">
             <button id="reset-theme-btn" class="btn btn-secondary btn-sm">Reset</button>
             <button id="save-theme-btn" class="btn btn-primary btn-sm" disabled>Save Changes</button>
          </div>
        </div>
      </div>
      
      <!-- Preview Panel -->
      <div class="theme-preview-panel">
        <div class="theme-preview-header">
          <span>Live Preview (User Chat)</span>
          <span id="preview-status" style="font-weight: normal; color: #666; font-size: 0.8rem;">Loading...</span>
        </div>
        <div class="preview-iframe-container">
            <iframe id="theme-preview-frame" src="index.html" class="preview-iframe"></iframe>
        </div>
      </div>
    </div>
  `;

  await fetchAndRenderTheme();

  // Setup Save Button
  document.getElementById('save-theme-btn').addEventListener('click', () => {
    showConfirmationModal({
      title: 'Save Theme Changes?',
      message: 'This will immediately apply the new theme for all users. Are you sure you want to proceed?',
      confirmText: 'Save Changes',
      confirmType: 'primary',
      onConfirm: async () => {
        await saveTheme();
      }
    });
  });

  document.getElementById('reset-theme-btn').addEventListener('click', () => {
    showConfirmationModal({
      title: 'Discard Changes?',
      message: 'This will discard all unsaved changes and revert to the currently active theme configuration. This action cannot be undone.',
      confirmText: 'Discard Changes',
      confirmType: 'danger',
      onConfirm: async () => {
        await resetTheme();
      }
    });
  });

  // Setup Iframe Loaded listener
  const iframe = document.getElementById('theme-preview-frame');
  iframe.onload = () => {
    document.getElementById('preview-status').textContent = 'Ready';
    updatePreview(); // Send current colors to iframe
  };
}

async function fetchAndRenderTheme() {
  try {
    const theme = await apiFetch('/api/theme/active');
    
    // Support new 'config' object or legacy 'colors'
    if (theme.config) {
        currentTheme = theme.config;
    } else {
        // Fallback for transition
        currentTheme = {
            colors: theme.colors || {},
            custom_css: '',
            avatar_variant: 'default',
            custom_avatar: null
        };
    }
    
    renderEditor();
  } catch (error) {
    console.error('Error loading theme:', error);
    document.getElementById('theme-editor-form').innerHTML = `<p class="error">Failed to load theme.</p>`;
  }
}

function renderEditor() {
  const form = document.getElementById('theme-editor-form');
  let html = '';

  // 0. AI Generator Section
  html += `<div class="ai-section">
    <h4 class="ai-header">
      <span style="font-size: 1.1rem;">✨</span> AI Theme Generator
    </h4>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <textarea id="ai-theme-prompt" class="form-control ai-prompt-input" rows="3" placeholder="Describe your theme (e.g., 'Make the page to have a Christmas Theme, add a snow effect animation...')"></textarea>
      <button id="ai-generate-btn" class="btn btn-primary btn-sm ai-generate-btn" onclick="generateThemeFromAI()">
        Generate Theme
      </button>
    </div>
  </div>`;

  // 1.5 Custom CSS Section
  html += `<div class="custom-css-section">
    <h4 class="custom-css-header">Custom CSS (AI Generated)</h4>
    <textarea id="custom-css-editor" class="form-control custom-css-editor" rows="10" 
      placeholder="/* CSS generated by AI will appear here */"
      oninput="handleCustomCssChange(this.value)">${currentTheme.custom_css || ''}</textarea>
  </div>`;

  // 2. Colors Sections (Collapsible)
  THEME_VARS.forEach((section, index) => {
    const sectionId = `section-${index}`;
    html += `
    <div class="color-section-card">
      <button onclick="toggleSection('${sectionId}')" class="color-section-header">
        <span>${section.section}</span>
        <svg id="icon-${sectionId}" style="width: 16px; height: 16px; transition: transform 0.3s; ${index === 0 ? 'transform: rotate(180deg);' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div id="${sectionId}" class="color-section-content" style="display: ${index === 0 ? 'block' : 'none'};">
        <div class="color-grid">`;
    
    section.vars.forEach(v => {
      const value = (currentTheme.colors && currentTheme.colors[v.name]) || '#000000'; // Fallback
      html += `
        <div class="form-group" style="margin-bottom: 0;">
          <label class="color-label">${v.label}</label>
          <div class="color-input-group">
            <input type="color" 
              id="${v.name}" 
              value="${value}" 
              class="color-picker"
              onchange="handleColorChange('${v.name}', this.value)"
              oninput="handleColorChange('${v.name}', this.value)"
            >
            <input type="text" 
              value="${value}" 
              class="form-control color-text-input" 
              onchange="handleTextChange('${v.name}', this.value)"
            >
          </div>
        </div>
      `;
    });
    
    html += `</div></div></div>`;
  });

  form.innerHTML = html;
  
  // Helper functions for inline handlers
  window.toggleSection = (id) => {
      const el = document.getElementById(id);
      const icon = document.getElementById(`icon-${id}`);
      if (el.style.display === 'none') {
          el.style.display = 'block';
          icon.style.transform = 'rotate(180deg)';
      } else {
          el.style.display = 'none';
          icon.style.transform = 'rotate(0deg)';
      }
  };
  // (handleConfigChange and uploadCustomAvatar removed as UI controls are gone)


  window.handleColorChange = (name, value) => {
    if (!currentTheme.colors) currentTheme.colors = {};
    currentTheme.colors[name] = value;
    // Update text input
    const textInput = document.querySelector(`input[type="text"][onchange*="${name}"]`);
    if (textInput) textInput.value = value;
    
    onThemeChange();
  };

  window.handleTextChange = (name, value) => {
    if (!currentTheme.colors) currentTheme.colors = {};
    currentTheme.colors[name] = value;
    // Update color input
    const colorInput = document.getElementById(name);
    if (colorInput) colorInput.value = value;

    onThemeChange();
  };

  window.handleCustomCssChange = (value) => {
    currentTheme.custom_css = value;
    onThemeChange();
  };

  window.generateThemeFromAI = async () => {
    const promptInput = document.getElementById('ai-theme-prompt');
    const prompt = promptInput.value.trim();
    const btn = document.getElementById('ai-generate-btn');
    
    if (!prompt) {
      alert('Please describe the theme you want to generate.');
      return;
    }
    
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;
    
    try {
      // Use apiFetch helper which handles auth headers automatically
      const result = await apiFetch('/api/admin/themes/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt })
      });
      
      if (result.success && result.config) {
        // Merge generated config into currentTheme
        currentTheme = { 
            ...currentTheme, 
            ...result.config,
            colors: { ...currentTheme.colors, ...result.config.colors }
        };
        
        // Re-render editor to show new values
        renderEditor();
        
        // Restore prompt text so user can tweak it
        setTimeout(() => {
            const newPromptInput = document.getElementById('ai-theme-prompt');
            if (newPromptInput) newPromptInput.value = prompt;
        }, 100);

        // Update live preview
        onThemeChange();
        
        // Success toast or alert could be added here
      } else {
        alert('Failed to generate theme. Please try again.');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    } catch (error) {
      console.error(error);
      alert('Error: ' + error.message);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  };
}

function onThemeChange() {
  hasChanges = true;
  document.getElementById('save-theme-btn').disabled = false;
  document.getElementById('save-theme-btn').textContent = 'Save Changes';
  updatePreview();
}

function updatePreview() {
  const iframe = document.getElementById('theme-preview-frame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'UPDATE_THEME',
      config: currentTheme
    }, '*');
  }
}

async function saveTheme() {
  const btn = document.getElementById('save-theme-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const active = await apiFetch('/api/theme/active');
    
    let result;
    if (active && active.id) {
       result = await apiFetch(`/api/admin/themes/${active.id}`, {
         method: 'PUT',
         body: JSON.stringify({ name: active.name, config: currentTheme })
       });
    } else {
       // Create new
       result = await apiFetch('/api/admin/themes', {
         method: 'POST',
         body: JSON.stringify({ name: 'Custom Theme', config: currentTheme })
       });
       if (result.id) {
         await apiFetch(`/api/admin/themes/${result.id}/activate`, { method: 'POST' });
       }
    }

    hasChanges = false;
    btn.textContent = 'Saved';
    setTimeout(() => {
      btn.textContent = 'Save Changes';
    }, 2000);
    
  } catch (error) {
    console.error('Error saving theme:', error);
    btn.textContent = 'Error';
    btn.disabled = false;
    alert('Failed to save theme: ' + error.message);
  }
}

async function resetTheme() {
  // Confirmation handled by modal
  
  await fetchAndRenderTheme();
  
  // Actually update the live preview iframe to revert changes
  const iframe = document.getElementById('theme-preview-frame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'UPDATE_THEME',
      config: currentTheme
    }, '*');
  }

  hasChanges = false;
  document.getElementById('save-theme-btn').disabled = true;
}
