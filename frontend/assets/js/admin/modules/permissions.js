// Permissions Management Module
import { apiFetch } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';
import { showToast, setButtonLoading, openModal, closeModal } from '../core/ui.js';

// State
let permissionUsers = [];
let currentPermUserId = null;
let selectedPermUsers = new Set(); 
let isBulkMode = false;
let isAllExpanded = false;
let pendingExpandCollapse = null;

// Public API
const Permissions = {
  setupPermissionsManagement,
  loadPermissionUsers,
  openPermModal,
  openBulkPermModal,
  togglePermUserSelection,
  toggleSelectAllPerms,
  toggleCategory,
  toggleCategorySources,
  toggleCategoryCollapse,
  toggleSourceCollapse,
  expandAllPermCategories,
  collapseAllPermCategories
};

// Export for global access
window.Permissions = Permissions;

export {
  setupPermissionsManagement,
  loadPermissionUsers,
  Permissions
};

// Initialize permissions management
function setupPermissionsManagement() {
  console.log('Setting up Permissions module...');
  
  const searchInput = document.getElementById('perm-search');
  const deptFilter = document.getElementById('perm-dept-filter');
  const modalClose = document.getElementById('perm-modal-close');
  const modalCancel = document.getElementById('perm-modal-cancel');
  const modalSave = document.getElementById('perm-modal-save');
  const fullAccessCheck = document.getElementById('perm-full-access');
  const treeSearch = document.getElementById('perm-tree-search');
  const toggleAllBtn = document.getElementById('perm-toggle-all');

  if (searchInput) searchInput.addEventListener('input', renderPermissionsTable);
  if (deptFilter) deptFilter.addEventListener('change', renderPermissionsTable);
  
  if (modalClose) modalClose.addEventListener('click', closePermModal);
  if (modalCancel) modalCancel.addEventListener('click', closePermModal);
  if (modalSave) modalSave.addEventListener('click', savePermissions);
  
  if (fullAccessCheck) {
    fullAccessCheck.addEventListener('change', (e) => {
      const tree = document.getElementById('perm-tree-container');
      const toolbar = document.querySelector('.perm-toolbar');
      
      if (e.target.checked) {
        // Disable interactions but keep visual and functional elements
        tree.querySelectorAll('input[type="checkbox"]:not(#perm-full-access)').forEach(cb => {
          cb.checked = true;
          cb.disabled = true;
        });
        tree.querySelectorAll('.perm-toggle-btn').forEach(btn => {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
        });
        
        // Disable toolbar but keep it visible
        if (toolbar) {
          const searchInput = toolbar.querySelector('#perm-tree-search');
          const toggleBtn = toolbar.querySelector('#perm-toggle-all');
          
          if (searchInput) {
            searchInput.disabled = true;
            searchInput.style.opacity = '0.5';
          }
          if (toggleBtn) {
            toggleBtn.disabled = false;
            toggleBtn.style.opacity = '1';
          }
        }
        
        // Add visual overlay that covers entire scrollable area
        if (!tree.querySelector('.full-access-overlay')) {
          const overlay = document.createElement('div');
          overlay.className = 'full-access-overlay';
          overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(248, 250, 252, 0.75); pointer-events: none; z-index: 10;';
          tree.appendChild(overlay);
          
          // Position overlay relative to the tree container
          const treeRect = tree.getBoundingClientRect();
          overlay.style.top = treeRect.top + 'px';
          overlay.style.left = treeRect.left + 'px';
          overlay.style.width = treeRect.width + 'px';
          overlay.style.height = treeRect.height + 'px';
          overlay.style.position = 'absolute';
        }
      } else {
        // Re-enable interactions
        tree.querySelectorAll('input[type="checkbox"]:not(#perm-full-access)').forEach(cb => {
          cb.checked = false;
          cb.disabled = false;
        });
        tree.querySelectorAll('.perm-toggle-btn').forEach(btn => {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
        });
        
        // Re-enable toolbar
      if (toolbar) {
        const searchInput = toolbar.querySelector('#perm-tree-search');
        const toggleBtn = toolbar.querySelector('#perm-toggle-all');
        
        if (searchInput) {
          searchInput.disabled = false;
          searchInput.style.opacity = '1';
        }
        if (toggleBtn) {
          toggleBtn.disabled = false;
          toggleBtn.style.opacity = '1';
        }
      }
        
        // Remove overlay
        const overlay = tree.querySelector('.full-access-overlay');
        if (overlay) overlay.remove();
      }
    });
  }

  if (treeSearch) {
    treeSearch.addEventListener('input', () => {
      filterPermissionTree(treeSearch.value.trim().toLowerCase());
    });
  }

  // Setup select all checkbox
  const selectAllCheckbox = document.getElementById('perm-select-all');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      toggleSelectAllPerms(e.target);
    });
  }

  // Setup bulk actions button
  const bulkActions = document.getElementById('perm-bulk-actions');
  if (bulkActions) {
    const grantAccessBtn = bulkActions.querySelector('button');
    if (grantAccessBtn) {
      grantAccessBtn.addEventListener('click', openBulkPermModal);
    }
  }
}

// Setup the toggle all button with fresh event listener
function setupToggleAllButton(btn) {
  // Remove any existing listeners by cloning and replacing
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  // Attach the click handler to the new button
  newBtn.addEventListener('click', handleToggleAllClick);
  
  console.log('Toggle All button handler attached');
}

// Handle the toggle all button click
function handleToggleAllClick() {
  const btn = document.getElementById('perm-toggle-all');
  if (!btn || btn.disabled) return;
  
  console.log('Toggle clicked, isAllExpanded:', isAllExpanded);
  
  const hasTree = document.querySelectorAll('.perm-subcats, .perm-sources').length > 0;
  console.log('Has tree items:', hasTree);
  
  if (!isAllExpanded) {
    if (hasTree) {
      expandAllPermCategories();
    } else {
      pendingExpandCollapse = 'expand';
      const freshBtn = document.getElementById('perm-toggle-all');
      if (freshBtn) freshBtn.textContent = 'Collapse All';
    }
  } else {
    if (hasTree) {
      collapseAllPermCategories();
    } else {
      pendingExpandCollapse = 'collapse';
      const freshBtn = document.getElementById('perm-toggle-all');
      if (freshBtn) freshBtn.textContent = 'Expand All';
    }
  }
}

// Load permission users
async function loadPermissionUsers() {
  try {
    const data = await apiFetch('/admin/users');
    permissionUsers = data.users || [];
    
    const departments = [...new Set(permissionUsers.map(u => u.department).filter(Boolean))];
    const deptSelect = document.getElementById('perm-dept-filter');
    
    if (deptSelect) {
      deptSelect.innerHTML = '<option value="">Department (All)</option>' + 
        departments.map(d => `<option value="${d}">${d}</option>`).join('');
    }

    renderPermissionsTable();
  } catch (error) {
    console.error('❌ Error loading users for permissions:', error);
    showToast('Failed to load users', 'error');
  }
}

// Render permissions table
function renderPermissionsTable() {
  const tbody = document.getElementById('permissions-table-body');
  const searchTerm = (document.getElementById('perm-search')?.value || '').toLowerCase();
  const deptFilter = document.getElementById('perm-dept-filter')?.value || '';
  const selectAllBox = document.getElementById('perm-select-all');

  if (!tbody) return;

  const filtered = permissionUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm);
    const matchesDept = !deptFilter || user.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  if (selectAllBox) selectAllBox.checked = false;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">No employees found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(user => {
    const isChecked = selectedPermUsers.has(user.id) ? 'checked' : '';
    return `
    <tr class="${isChecked ? 'row-selected' : ''}">
      <td>
        <input type="checkbox" class="perm-user-check" value="${user.id}" 
          ${isChecked} onchange="window.Permissions.togglePermUserSelection(${user.id}, this)">
      </td>
      <td>
        <div style="font-weight: 600;">${escapeHtml(user.name)}</div>
        <div style="font-size: 0.85rem; color: #666;">${escapeHtml(user.email)}</div>
      </td>
      <td>
        <div style="font-weight: 500;">${escapeHtml(user.department || '-')}</div>
        <div style="font-size: 0.8rem; color: #999;">${escapeHtml(user.position || '')}</div>
      </td>
      <td>
        <span class="badge badge-${user.is_active ? 'info' : 'secondary'}">
          ${user.is_active ? 'Configurable' : 'Inactive'}
        </span>
      </td>
      <td>
        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;" 
                onclick="window.Permissions.openPermModal(${user.id}, '${escapeHtml(user.name)}')">
          <span class="material-symbols-outlined" style="font-size: 14px;">settings</span>
          Manage
        </button>
      </td>
    </tr>
  `}).join('');
  
  updateBulkToolbar();
}

// User selection management
function togglePermUserSelection(userId, checkbox) {
  if (checkbox.checked) {
    selectedPermUsers.add(userId);
    checkbox.closest('tr').classList.add('row-selected');
  } else {
    selectedPermUsers.delete(userId);
    checkbox.closest('tr').classList.remove('row-selected');
  }
  updateBulkToolbar();
}

function toggleSelectAllPerms(source) {
  const checkboxes = document.querySelectorAll('.perm-user-check');
  checkboxes.forEach(cb => {
    cb.checked = source.checked;
    const userId = parseInt(cb.value);
    if (source.checked) {
      selectedPermUsers.add(userId);
      cb.closest('tr').classList.add('row-selected');
    } else {
      selectedPermUsers.delete(userId);
      cb.closest('tr').classList.remove('row-selected');
    }
  });
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('perm-bulk-actions');
  const countSpan = document.getElementById('perm-selected-count');
  
  if (toolbar && countSpan) {
    if (selectedPermUsers.size > 0) {
      toolbar.style.display = 'flex';
      countSpan.textContent = selectedPermUsers.size;
    } else {
      toolbar.style.display = 'none';
    }
  }
}

// Permission modal management
async function openPermModal(userId = null, userName = '') {
  const modal = document.getElementById('perm-modal');
  const title = document.getElementById('perm-modal-title');
  const subtitle = document.getElementById('perm-modal-subtitle');
  const container = document.getElementById('perm-tree-container');
  const fullAccessCheck = document.getElementById('perm-full-access');
  
  if (!modal || !title || !container) {
    console.error('Permission modal elements not found');
    return;
  }
  
  container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading permissions...</div>';
  if (fullAccessCheck) fullAccessCheck.checked = false;
  
  const treeContainer = document.getElementById('perm-tree-container');
  if (treeContainer) {
    treeContainer.style.opacity = '1';
    treeContainer.style.pointerEvents = 'auto';
  }
  
  openModal('perm-modal');
  
  // Reset expand/collapse state when opening modal
  isAllExpanded = false;
  const toggleAllBtn = document.getElementById('perm-toggle-all');
  if (toggleAllBtn) {
    toggleAllBtn.textContent = 'Expand All';
    toggleAllBtn.disabled = false;
    toggleAllBtn.style.opacity = '1';
    
    // Attach click handler to the button
    setupToggleAllButton(toggleAllBtn);
  }

  if (userId) {
    isBulkMode = false;
    currentPermUserId = userId;
    title.textContent = `Manage Access: ${userName}`;
    if (subtitle) {
      const user = permissionUsers.find(u => u.id === userId);
      subtitle.textContent = user ? `${user.email} • ${user.department || 'No Department'}` : '';
    }
    
    try {
      const [data, sourcesData] = await Promise.all([
          apiFetch(`/admin/permissions/${userId}`),
          apiFetch('/admin/integrations')
      ]);
      
      data.structure.sources = sourcesData.sources || [];
      
      renderPermissionTree(data.structure, data.permissions);
      const searchEl = document.getElementById('perm-tree-search');
      if (searchEl) filterPermissionTree(searchEl.value.trim().toLowerCase());
    } catch (error) {
      console.error(error);
      container.innerHTML = '<p style="color: red; text-align: center;">Failed to load permissions.</p>';
    }
  } else {
    isBulkMode = true;
    title.textContent = `Grant Access to ${selectedPermUsers.size} Users`;
    if (subtitle) {
      subtitle.textContent = `${selectedPermUsers.size} selected`;
    }
    
    try {
      const [cats, subcats, sourcesData] = await Promise.all([
        apiFetch('/admin/categories'),
        apiFetch('/admin/all-subcategories'),
        apiFetch('/admin/integrations') 
      ]);
      
      const structure = {
        categories: cats.categories || [],
        subcategories: subcats.subcategories || [],
        sources: sourcesData.sources || []
      };
      
      renderPermissionTree(structure, []);
      const searchEl = document.getElementById('perm-tree-search');
      if (searchEl) filterPermissionTree(searchEl.value.trim().toLowerCase());
      
      const note = document.createElement('div');
      note.className = 'alert alert-warning';
      note.style = 'background:#fff3cd; color:#856404; padding:10px; margin-bottom:15px; font-size:0.9rem; border-radius:4px; display:block;';
      note.textContent = '⚠️ Selected permissions will be ADDED to these users. Existing permissions will remain.';
      container.insertBefore(note, container.firstChild);
    } catch (error) {
      console.error(error);
      container.innerHTML = '<p style="color: red; text-align: center;">Failed to load permission structure.</p>';
    }
  }
}

// Render permission tree
function renderPermissionTree(structure, userPerms) {
  const container = document.getElementById('perm-tree-container');
  const fullAccessCheck = document.getElementById('perm-full-access');
  
  if (!container) return;

  const isFullAccess = userPerms.some(p => p.category_id === null && p.subcategory_id === null && p.source_id === null);
  if (fullAccessCheck) {
    fullAccessCheck.checked = isFullAccess;
  }

  // Apply disabled state if full access is checked
  const applyFullAccessState = () => {
    const tree = document.getElementById('perm-tree-container');
    const toolbar = document.querySelector('.perm-toolbar');
    
    if (isFullAccess) {
      tree.querySelectorAll('input[type="checkbox"]:not(#perm-full-access)').forEach(cb => {
        cb.checked = true;
        cb.disabled = true;
      });
      tree.querySelectorAll('.perm-toggle-btn').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      });
      
      if (toolbar) {
        const searchInput = toolbar.querySelector('#perm-tree-search');
        const toggleBtn = toolbar.querySelector('#perm-toggle-all');
        
        if (searchInput) {
          searchInput.disabled = true;
          searchInput.style.opacity = '0.5';
        }
        if (toggleBtn) {
          toggleBtn.disabled = false;
          toggleBtn.style.opacity = '1';
        }
      }
      
      if (!tree.querySelector('.full-access-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'full-access-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(248, 250, 252, 0.75); pointer-events: none; z-index: 10;';
        tree.appendChild(overlay);
        
        // Position overlay relative to the tree container
        const treeRect = tree.getBoundingClientRect();
        overlay.style.top = treeRect.top + 'px';
        overlay.style.left = treeRect.left + 'px';
        overlay.style.width = treeRect.width + 'px';
        overlay.style.height = treeRect.height + 'px';
        overlay.style.position = 'absolute';
      }
    }
  };

  let html = '';
  
  // Knowledge Base Section
  html += `
    <div class="perm-section-wrapper" style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 8px 0; font-size: 1rem; font-weight: 600; color: #1e293b;">Knowledge Base</h4>
        <p style="margin: 0; font-size: 0.875rem; color: #64748b;">Manage access to knowledge categories and their subcategories.</p>
      </div>
      <div style="padding: 12px;">
  `;
  
  if (!structure.categories || structure.categories.length === 0) {
    html += '<p style="text-align: center; color: #999; padding: 20px;">No categories available.</p>';
  } else {
    structure.categories.forEach(cat => {
      // FIX: Ensure strict check for category-only permission (no source_id)
      const isCatAllowed = userPerms.some(p => p.category_id === cat.id && p.subcategory_id === null && p.source_id === null);
      const catSubcats = structure.subcategories ? structure.subcategories.filter(s => s.category_id === cat.id) : [];
      
      html += `
        <div class="perm-category-item" style="border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; overflow: hidden; background: white;">
          <div style="padding: 12px 16px; display: flex; align-items: center; gap: 12px; background: white;">
            <input type="checkbox" class="perm-cat-check" id="cat-${cat.id}" value="${cat.id}" 
                   ${isCatAllowed || isFullAccess ? 'checked' : ''} onchange="window.Permissions.toggleCategory(this)" 
                   style="width: 18px; height: 18px; cursor: pointer;">
            <label for="cat-${cat.id}" style="flex: 1; cursor: pointer; margin: 0; font-weight: 500; color: #1e293b; font-size: 0.938rem;">
              ${escapeHtml(cat.name)}
            </label>
            <button class="perm-toggle-btn" id="perm-toggle-${cat.id}" type="button" 
                    onclick="window.Permissions.toggleCategoryCollapse(${cat.id})"
                    style="background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; color: #64748b; transition: transform 0.2s ease;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
      `;
      
      if (catSubcats.length > 0) {
        html += `<div class="perm-subcats collapsed" id="subcats-${cat.id}" style="border-top: 1px solid #e2e8f0; padding: 12px 16px; background: #f8fafc; display: none;">`;
        html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">`;
        catSubcats.forEach(sub => {
          const isSubAllowed = userPerms.some(p => p.subcategory_id === sub.id) || isCatAllowed || isFullAccess;
          html += `
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" class="perm-sub-check cat-group-kb-${cat.id}" id="sub-${sub.id}" 
                     value="${sub.id}" data-cat="${cat.id}" ${isSubAllowed ? 'checked' : ''} 
                     style="width: 16px; height: 16px; cursor: pointer;">
              <label for="sub-${sub.id}" style="cursor: pointer; font-size: 0.875rem; color: #475569; margin: 0;">
                ${escapeHtml(sub.name)}
              </label>
            </div>
          `;
        });
        html += `</div></div>`;
      } else {
        html += `<div class="perm-subcats collapsed" id="subcats-${cat.id}" style="border-top: 1px solid #e2e8f0; padding: 12px 16px; background: #f8fafc; display: none; color: #94a3b8; font-size: 0.875rem;">No subcategories</div>`;
      }

      html += `</div>`;
    });
  }
  
  html += `</div></div>`;

  // Live Data Tools section
  if (structure.sources && structure.sources.length > 0) {
    const categorizedSources = structure.categories.filter(cat => 
      structure.sources.some(s => s.category_id === cat.id)
    );
    
    if (categorizedSources.length > 0) {
      html += `
        <div class="perm-section-wrapper" style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <h4 style="margin: 0 0 8px 0; font-size: 1rem; font-weight: 600; color: #1e293b;">Live Data Tools</h4>
            <p style="margin: 0; font-size: 0.875rem; color: #64748b;">Allow access to live tools connected to categories. Uncategorized tools appear under General.</p>
          </div>
          <div style="padding: 12px;">
      `;
      
      categorizedSources.forEach(cat => {
        const catSources = structure.sources.filter(s => s.category_id === cat.id);
        const isCatSourcesAllowed = catSources.every(src => 
            userPerms.some(p => Number(p.source_id) === Number(src.id)) || isFullAccess
        );
        
        html += `
          <div class="perm-category-item" style="border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; overflow: hidden; background: white;">
            <div style="padding: 12px 16px; display: flex; align-items: center; gap: 12px; background: white;">
              <input type="checkbox" class="perm-cat-source-check" id="cat-src-${cat.id}" value="${cat.id}" 
                     ${isCatSourcesAllowed ? 'checked' : ''} onchange="window.Permissions.toggleCategorySources(this)" 
                     style="width: 18px; height: 18px; cursor: pointer;">
              <label for="cat-src-${cat.id}" style="flex: 1; cursor: pointer; margin: 0; font-weight: 500; color: #1e293b; font-size: 0.938rem;">
                ${escapeHtml(cat.name)}
              </label>
              <button class="perm-toggle-btn" id="perm-toggle-src-${cat.id}" type="button" 
                      onclick="window.Permissions.toggleSourceCollapse(${cat.id})"
                      style="background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; color: #64748b; transition: transform 0.2s ease;">
                <span class="material-symbols-outlined" style="font-size: 20px;">expand_more</span>
              </button>
            </div>
            <div class="perm-sources collapsed" id="sources-${cat.id}" style="border-top: 1px solid #e2e8f0; padding: 12px 16px; background: #f8fafc; display: none;">
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
        `;
        
        catSources.forEach(src => {
          const isSrcAllowed = userPerms.some(p => Number(p.source_id) === Number(src.id)) || isFullAccess;
          html += `
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" class="perm-source-check cat-group-src-${cat.id}" id="src-${src.id}" 
                     value="${src.id}" ${isSrcAllowed ? 'checked' : ''} data-cat="${cat.id}"
                     style="width: 16px; height: 16px; cursor: pointer;">
              <label for="src-${src.id}" style="cursor: pointer; font-size: 0.875rem; color: #475569; margin: 0;">
                ${escapeHtml(src.name)}
              </label>
            </div>
          `;
        });
        
        html += `</div></div></div>`;
      });
      
      html += `</div></div>`;
    }
  }

  // General / Uncategorized Tools
  const orphanSources = structure.sources ? structure.sources.filter(s => !s.category_id) : [];
  if (orphanSources.length > 0) {
    html += `
      <div class="perm-section-wrapper" style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="material-symbols-outlined" style="font-size: 18px; color: #64748b;">build</span>
            <h4 style="margin: 0; font-size: 1rem; font-weight: 600; color: #1e293b;">General / Uncategorized Tools</h4>
          </div>
          <p style="margin: 0; font-size: 0.875rem; color: #64748b;">Users can view and manage the Knowledge Base in Settings.</p>
        </div>
        <div style="padding: 16px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
    `;
    
    orphanSources.forEach(src => {
      const isSrcAllowed = userPerms.some(p => Number(p.source_id) === Number(src.id)) || isFullAccess;
      html += `
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" class="perm-source-check" id="src-${src.id}" 
                 value="${src.id}" ${isSrcAllowed ? 'checked' : ''} 
                 style="width: 16px; height: 16px; cursor: pointer;">
          <label for="src-${src.id}" style="cursor: pointer; font-size: 0.875rem; color: #475569; margin: 0;">
            ${escapeHtml(src.name)}
          </label>
        </div>
      `;
    });
    
    html += `</div></div></div>`;
  }
  
  container.innerHTML = html;
  
  // Apply full access state after rendering
  setTimeout(applyFullAccessState, 50);
  
  const searchEl = document.getElementById('perm-tree-search');
  if (searchEl) {
    filterPermissionTree(searchEl.value.trim().toLowerCase());
  }

  if (pendingExpandCollapse === 'expand') {
    expandAllPermCategories();
    isAllExpanded = true;
    const toggleAllBtn = document.getElementById('perm-toggle-all');
    if (toggleAllBtn) toggleAllBtn.textContent = 'Collapse All';
    pendingExpandCollapse = null;
  } else if (pendingExpandCollapse === 'collapse') {
    collapseAllPermCategories();
    isAllExpanded = false;
    const toggleAllBtn = document.getElementById('perm-toggle-all');
    if (toggleAllBtn) toggleAllBtn.textContent = 'Expand All';
    pendingExpandCollapse = null;
  } else {
    updateExpandCollapseState();
  }
}

// Category toggle functionality
function toggleCategory(checkbox) {
  const catId = checkbox.value;
  const subCheckboxes = document.querySelectorAll(`.cat-group-kb-${catId}`);
  subCheckboxes.forEach(cb => cb.checked = checkbox.checked);
}

function toggleCategorySources(checkbox) {
  const catId = checkbox.value;
  const sourceCheckboxes = document.querySelectorAll(`.cat-group-src-${catId}`);
  sourceCheckboxes.forEach(cb => cb.checked = checkbox.checked);
}

function toggleCategoryCollapse(catId) {
  const subcats = document.getElementById(`subcats-${catId}`);
  const btn = document.getElementById(`perm-toggle-${catId}`);
  if (!subcats || !btn || btn.disabled) return;
  
  const isCollapsed = subcats.style.display === 'none' || subcats.classList.contains('collapsed');
  
  if (isCollapsed) {
    subcats.style.display = 'block';
    subcats.classList.remove('collapsed');
    btn.style.transform = 'rotate(180deg)';
  } else {
    subcats.style.display = 'none';
    subcats.classList.add('collapsed');
    btn.style.transform = 'rotate(0deg)';
  }
  
  // Update global expand/collapse state
  updateExpandCollapseState();
}

function toggleSourceCollapse(catId) {
  const sources = document.getElementById(`sources-${catId}`);
  const btn = document.getElementById(`perm-toggle-src-${catId}`);
  if (!sources || !btn || btn.disabled) return;
  
  const isCollapsed = sources.style.display === 'none' || sources.classList.contains('collapsed');
  
  if (isCollapsed) {
    sources.style.display = 'block';
    sources.classList.remove('collapsed');
    btn.style.transform = 'rotate(180deg)';
  } else {
    sources.style.display = 'none';
    sources.classList.add('collapsed');
    btn.style.transform = 'rotate(0deg)';
  }
  
  // Update global expand/collapse state
  updateExpandCollapseState();
}

// Update the global expand/collapse state based on actual DOM state
function updateExpandCollapseState() {
  const allCollapsibles = document.querySelectorAll('.perm-subcats, .perm-sources');
  const toggleAllBtn = document.getElementById('perm-toggle-all');
  
  if (!toggleAllBtn || allCollapsibles.length === 0) return;
  
  let allExpanded = true;
  let allCollapsed = true;
  
  allCollapsibles.forEach(el => {
    const isExpanded = el.style.display === 'block' && !el.classList.contains('collapsed');
    if (!isExpanded) allExpanded = false;
    if (isExpanded) allCollapsed = false;
  });
  
  if (allExpanded) {
    isAllExpanded = true;
    toggleAllBtn.textContent = 'Collapse All';
  } else if (allCollapsed) {
    isAllExpanded = false;
    toggleAllBtn.textContent = 'Expand All';
  }
  // If mixed state, keep current button text
}

function expandAllPermCategories() {
  document.querySelectorAll('.perm-subcats, .perm-sources').forEach(el => {
    el.style.display = 'block';
    el.classList.remove('collapsed');
  });
  document.querySelectorAll('.perm-toggle-btn').forEach(btn => {
    btn.style.transform = 'rotate(180deg)';
  });
  isAllExpanded = true;
  const toggleAllBtn = document.getElementById('perm-toggle-all');
  if (toggleAllBtn) {
    toggleAllBtn.textContent = 'Collapse All';
  }
}

function collapseAllPermCategories() {
  document.querySelectorAll('.perm-subcats, .perm-sources').forEach(el => {
    el.style.display = 'none';
    el.classList.add('collapsed');
  });
  document.querySelectorAll('.perm-toggle-btn').forEach(btn => {
    btn.style.transform = 'rotate(0deg)';
  });
  isAllExpanded = false;
  const toggleAllBtn = document.getElementById('perm-toggle-all');
  if (toggleAllBtn) {
    toggleAllBtn.textContent = 'Expand All';
  }
}

function filterPermissionTree(term) {
  // Check if search is disabled (full access mode)
  const searchInput = document.getElementById('perm-tree-search');
  if (searchInput && searchInput.disabled) return;
  
  const sections = document.querySelectorAll('.perm-section-wrapper');
  
  sections.forEach(section => {
    const items = section.querySelectorAll('.perm-category-item');
    let sectionHasMatch = false;
    
    items.forEach(item => {
      const label = item.querySelector('label, span[style*="font-weight: 500"]');
      const categoryName = label ? label.textContent.toLowerCase() : '';
      const categoryMatches = categoryName.includes(term);
      
      const subLabels = item.querySelectorAll('label[for^="sub-"], label[for^="src-"]');
      let hasSubMatch = false;
      
      subLabels.forEach(subLabel => {
        const subText = subLabel.textContent.toLowerCase();
        const matches = subText.includes(term) || term === '';
        const parent = subLabel.parentElement;
        
        if (parent) {
          parent.style.display = matches || categoryMatches ? '' : 'none';
          if (matches) hasSubMatch = true;
        }
      });
      
      const shouldShow = categoryMatches || hasSubMatch || term === '';
      item.style.display = shouldShow ? '' : 'none';
      
      if (shouldShow) sectionHasMatch = true;
      
      // Auto-expand if there's a match
      if (term && (categoryMatches || hasSubMatch)) {
        const subcatsDiv = item.querySelector('.perm-subcats, .perm-sources');
        const toggleBtn = item.querySelector('.perm-toggle-btn');
        if (subcatsDiv) {
          subcatsDiv.style.display = 'block';
          subcatsDiv.classList.remove('collapsed');
        }
        if (toggleBtn && !toggleBtn.disabled) {
          toggleBtn.style.transform = 'rotate(180deg)';
        }
      }
    });
    
    section.style.display = sectionHasMatch || term === '' ? '' : 'none';
  });
  
  // Handle General/Uncategorized section separately
  const generalSection = Array.from(sections).find(s => 
    s.querySelector('h4')?.textContent.includes('General / Uncategorized')
  );
  
  if (generalSection) {
    const labels = generalSection.querySelectorAll('label[for^="src-"]');
    let hasMatch = false;
    
    labels.forEach(label => {
      const text = label.textContent.toLowerCase();
      const matches = text.includes(term) || term === '';
      const parent = label.parentElement;
      
      if (parent) {
        parent.style.display = matches ? '' : 'none';
        if (matches) hasMatch = true;
      }
    });
    
    generalSection.style.display = hasMatch || term === '' ? '' : 'none';
  }
  
  // Update expand/collapse state after filtering
  if (term === '') {
    updateExpandCollapseState();
  }
}

// Save permissions with proper debugging and validation
async function savePermissions() {
  const fullAccessCheck = document.getElementById('perm-full-access');
  const btn = document.getElementById('perm-modal-save');
  
  if (!btn) {
    console.error('❌ Save button not found');
    return;
  }
  
  const fullAccess = fullAccessCheck ? fullAccessCheck.checked : false;
  
  let permissions = [];
  
  if (fullAccess) {
    permissions.push({ category_id: null, subcategory_id: null, source_id: null, access_level: 'read' });
  } else {
    // Track checked categories to avoid redundancy
    const checkedCatIds = new Set();

    // 1. Collect Checked Categories (ONLY if ALL children are checked)
    // We iterate through ALL category checkboxes, not just checked ones, to handle logic correctly
    const allCatChecks = document.querySelectorAll('.perm-cat-check');
    
    allCatChecks.forEach(catCk => {
      const catId = parseInt(catCk.value);
      
      // Get children for Knowledge Base only (subcategories)
      const allChildren = document.querySelectorAll(`.cat-group-kb-${catId}`);
      const checkedChildren = document.querySelectorAll(`.cat-group-kb-${catId}:checked`);
      
      // Implicit Access Rule: 
      // Only grant full category access if:
      // 1. The Category Checkbox is checked AND
      // 2. Either there are no KB subcategories OR ALL KB subcategories are checked
      const isCompleteAccess = catCk.checked && (allChildren.length === 0 || allChildren.length === checkedChildren.length);
      
      if (isCompleteAccess) {
        permissions.push({ category_id: catId, subcategory_id: null, source_id: null, access_level: 'read' });
        checkedCatIds.add(catId);
      }
    });

    // 2. Collect Checked Subcategories
    const subChecks = document.querySelectorAll('.perm-sub-check:checked');
    subChecks.forEach(subCk => {
      const catId = parseInt(subCk.getAttribute('data-cat'));
      // If parent category is fully checked, skip specific subcategory permission (implicit access)
      if (checkedCatIds.has(catId)) return;
      
      const subId = parseInt(subCk.value);
      permissions.push({ category_id: catId, subcategory_id: subId, source_id: null, access_level: 'read' });
    });

    // 3. Collect ALL Checked Sources (Categorized & Orphan)
    const allSrcChecks = document.querySelectorAll('.perm-source-check:checked');
    allSrcChecks.forEach(srcCk => {
      const catAttr = srcCk.getAttribute('data-cat');
      const catId = catAttr ? parseInt(catAttr) : null;

      const srcId = parseInt(srcCk.value);
      permissions.push({ category_id: catId, subcategory_id: null, source_id: srcId, access_level: 'read' });
    });
  }

  // Validation for bulk mode
  if (permissions.length === 0 && !fullAccess && isBulkMode) {
    showToast('Please select at least one permission to grant', 'warning');
    return;
  }

  // Validation for bulk mode - check if users are selected
  if (isBulkMode && selectedPermUsers.size === 0) {
    showToast('No users selected for bulk permission update', 'warning');
    return;
  }

  setButtonLoading(btn, true);

  try {
    if (isBulkMode) {
      const payload = { 
        userIds: Array.from(selectedPermUsers),
        permissions: permissions 
      };
      
      await apiFetch('/admin/permissions/bulk', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      showToast(`Permissions granted to ${selectedPermUsers.size} users`, 'success');
      
      // Clear selection and refresh
      selectedPermUsers.clear();
      renderPermissionsTable();
    } else {
      if (!currentPermUserId) {
        showToast('No user selected for permission update', 'error');
        return;
      }
      
      await apiFetch(`/admin/permissions/${currentPermUserId}`, {
        method: 'POST',
        body: JSON.stringify({ permissions })
      });
      
      showToast('Permissions updated successfully', 'success');
    }
    closePermModal();
  } catch (error) {
    console.error('❌ Error saving permissions:', error);
    showToast(`Failed to save permissions: ${error.message}`, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function closePermModal() {
  closeModal('perm-modal');
  currentPermUserId = null;
  isBulkMode = false;
  // Reset expand/collapse state when closing modal
  isAllExpanded = false;
  pendingExpandCollapse = null;
}

// Bulk permission modal
function openBulkPermModal() {
  if (selectedPermUsers.size === 0) {
    showToast('Please select at least one user to grant permissions', 'warning');
    return;
  }
  openPermModal(null);
}
