// User Management Module
import { apiFetch } from '../core/api.js';
import { formatDateTime, escapeHtml, debounce } from '../core/utils.js';
import { showToast, setButtonLoading, openModal, closeModal, showConfirmationModal } from '../core/ui.js';

// State
let allUsers = [];
let editingUserId = null;
let pagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1
};
let currentSearch = '';
let currentDepartment = '';
let isInitialized = false;

// Initialize user management
function setupUserManagement() {
  if (isInitialized) return;
  console.log('Setting up User Management module...');
  
  const addUserBtn = document.getElementById('add-user-btn');
  const modalClose = document.getElementById('user-modal-close');
  const modalCancel = document.getElementById('user-modal-cancel');
  const modalSave = document.getElementById('user-modal-save');
  const searchInput = document.getElementById('user-search');
  const deptFilter = document.getElementById('user-dept-filter');

  // Bulk Upload Setup
  const bulkBtn = document.getElementById('bulk-user-btn');
  const bulkClose = document.getElementById('bulk-upload-close');
  const bulkCancel = document.getElementById('bulk-upload-cancel');
  const bulkSave = document.getElementById('bulk-upload-save');

  if (addUserBtn) addUserBtn.addEventListener('click', () => openUserModal());
  if (modalClose) modalClose.addEventListener('click', closeUserModal);
  if (modalCancel) modalCancel.addEventListener('click', closeUserModal);
  if (modalSave) modalSave.addEventListener('click', saveUser);
  
  if (searchInput) {
      searchInput.addEventListener('input', debounce(() => loadUsers(1), 500));
  }
  
  if (deptFilter) {
      deptFilter.addEventListener('change', () => loadUsers(1));
  }

  // Pagination Controls
  const prevBtn = document.getElementById('user-prev-btn');
  const nextBtn = document.getElementById('user-next-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (pagination.page > 1) {
        loadUsers(pagination.page - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (pagination.page < pagination.totalPages) {
        loadUsers(pagination.page + 1);
      }
    });
  }

  if (bulkBtn) bulkBtn.addEventListener('click', openBulkUploadModal);
  if (bulkClose) bulkClose.addEventListener('click', closeBulkUploadModal);
  if (bulkCancel) bulkCancel.addEventListener('click', closeBulkUploadModal);
  if (bulkSave) bulkSave.addEventListener('click', submitBulkUpload);

  isInitialized = true;
  
  // Initial load of departments
  loadDepartments();
}

// Load departments
async function loadDepartments() {
    try {
        const data = await apiFetch('/admin/departments');
        const departments = data.departments || [];
        
        const userDeptFilter = document.getElementById('user-dept-filter');
        if (userDeptFilter) {
            const currentVal = userDeptFilter.value;
            userDeptFilter.innerHTML = '<option value="">Department (All)</option>' + 
                departments.map(d => `<option value="${d}">${d}</option>`).join('');
            if (currentVal && departments.includes(currentVal)) {
                userDeptFilter.value = currentVal;
            }
        }
        
        // Also update chat filter
        const chatDeptFilter = document.getElementById('chat-dept-filter');
        if (chatDeptFilter) {
            const currentVal = chatDeptFilter.value;
            chatDeptFilter.innerHTML = '<option value="">Department (All)</option>' + 
                departments.map(d => `<option value="${d}">${d}</option>`).join('');
             if (currentVal && departments.includes(currentVal)) {
                chatDeptFilter.value = currentVal;
            }
        }
    } catch (e) {
        console.error('Failed to load departments', e);
    }
}

// Load users
async function loadUsers(page = 1) {
  try {
    const searchInput = document.getElementById('user-search');
    const deptFilter = document.getElementById('user-dept-filter');
    
    const search = searchInput?.value || '';
    const department = deptFilter?.value || '';
    
    currentSearch = search;
    currentDepartment = department;

    const queryParams = new URLSearchParams({
      page,
      limit: pagination.limit,
      search,
      department
    });

    const data = await apiFetch(`/admin/users?${queryParams}`);
    allUsers = data.users || [];
    
    if (data.pagination) {
      pagination = data.pagination;
    } else {
        pagination = {
            page: 1,
            limit: allUsers.length || 10,
            total: allUsers.length || 0,
            totalPages: 1
        };
    }
    
    renderUsersTable();
    renderPagination();
  } catch (error) {
    console.error('❌ Error loading users:', error);
    showToast('Failed to load users', 'error');
  }
}

// Render users table
function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  const paginationControls = document.getElementById('user-pagination');
  
  if (!tbody) return;
  
  const users = allUsers;
  
  if (users.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No users found.</td></tr>'; 
    if (paginationControls) paginationControls.style.display = 'none';
    return; 
  }
  
  if (paginationControls) paginationControls.style.display = 'flex';
  
  tbody.innerHTML = users.map(u => `
    <tr>
      <td data-label="Name / Email">
        <div>
          <div style="font-weight: 600;">${u.name}</div>
          <div style="font-size: 0.85rem; color: #666;">${u.email}</div>
        </div>
      </td>
      <td data-label="Department">
        <div>
          <div style="font-weight: 500;">${escapeHtml(u.department || '-')}</div>
          <div style="font-size: 0.8rem; color: #999;">${escapeHtml(u.position || '')}</div>
        </div>
      </td>
      <td data-label="Role">
        <span class="badge" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;">
          ${escapeHtml(u.role || '-')}
        </span>
      </td>
      <td data-label="Status">
        <span class="badge badge-${u.is_active ? 'success' : 'danger'}">
          ${u.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td data-label="Activity">
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
          <div style="font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined">chat_bubble_outline</span> 
            <strong>${u.total_messages || 0}</strong> msgs
          </div>
          <div style="font-size: 0.8rem; color: #999;">
            Last: ${u.last_active ? formatDateTime(u.last_active) : 'Never'}
          </div>
        </div>
      </td>
      <td data-label="Actions">
        <div class="action-buttons">
          <button class="action-btn action-btn-view" onclick="window.UserManagement.viewUserHistory(${u.id}, '${u.name}')">
            <span class="material-symbols-outlined">history</span> History
          </button>
          <button class="action-btn action-btn-edit" onclick="window.UserManagement.editUser(${u.id})">
            <span class="material-symbols-outlined">edit</span> Edit
          </button>
          ${u.is_active ? 
            `<button class="action-btn action-btn-delete" onclick="window.UserManagement.toggleUserStatus(${u.id}, false, '${u.name}')">
              <span class="material-symbols-outlined">block</span> Deactivate
            </button>` : 
            `<button class="action-btn action-btn-view" onclick="window.UserManagement.toggleUserStatus(${u.id}, true, '${u.name}')">
              <span class="material-symbols-outlined">check_circle</span> Activate
            </button>`
          }
        </div>
      </td>
    </tr>
  `).join('');
}

// Render pagination
function renderPagination() {
    const startRecord = (pagination.page - 1) * pagination.limit + 1;
    const endRecord = Math.min(startRecord + allUsers.length - 1, pagination.total);
    
    const startEl = document.getElementById('user-start-record');
    const endEl = document.getElementById('user-end-record');
    const totalEl = document.getElementById('user-total-records');
    
    if (startEl) startEl.textContent = pagination.total === 0 ? 0 : startRecord;
    if (endEl) endEl.textContent = endRecord;
    if (totalEl) totalEl.textContent = pagination.total;
  
    const prevBtn = document.getElementById('user-prev-btn');
    const nextBtn = document.getElementById('user-next-btn');
    
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;
  
    // Render page numbers
    const pageContainer = document.getElementById('user-page-numbers');
    if (!pageContainer) return;
    
    pageContainer.innerHTML = '';
    
    let pages = [];
    const maxVisible = 5;
    
    if (pagination.totalPages <= maxVisible) {
      for(let i=1; i<=pagination.totalPages; i++) pages.push(i);
    } else {
      if (pagination.page <= 3) {
        pages = [1, 2, 3, 4, '...', pagination.totalPages];
      } else if (pagination.page >= pagination.totalPages - 2) {
        pages = [1, '...', pagination.totalPages-3, pagination.totalPages-2, pagination.totalPages-1, pagination.totalPages];
      } else {
        pages = [1, '...', pagination.page-1, pagination.page, pagination.page+1, '...', pagination.totalPages];
      }
    }
  
    pages.forEach(p => {
      if (p === '...') {
        const span = document.createElement('span');
        span.textContent = '...';
        span.style.padding = '5px';
        span.style.color = '#666';
        pageContainer.appendChild(span);
      } else {
        const btn = document.createElement('button');
        btn.textContent = p;
        btn.className = `btn btn-sm ${p === pagination.page ? 'btn-primary' : 'btn-outline'}`;
        btn.style.padding = '5px 10px';
        btn.style.minWidth = '30px';
        if (p !== pagination.page) {
          btn.onclick = () => {
            loadUsers(p);
          };
        }
        pageContainer.appendChild(btn);
      }
    });
}

// User modal management
function openUserModal(id = null) {
  editingUserId = id;
  const title = document.getElementById('user-modal-title');
  
  if (id) {
    const u = allUsers.find(user => user.id === id);
    title.textContent = 'Edit User';
    document.getElementById('user-name').value = u.name;
    document.getElementById('user-email').value = u.email;
    document.getElementById('user-department').value = u.department || '';
    document.getElementById('user-position').value = u.position || '';
    document.getElementById('user-role').value = u.role || 'user';
    document.getElementById('user-status-group').style.display = 'block';
    document.getElementById('user-status').value = u.is_active ? '1' : '0';
  } else {
    title.textContent = 'Add User';
    document.getElementById('user-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-department').value = '';
    document.getElementById('user-position').value = '';
    document.getElementById('user-status-group').style.display = 'none';
    document.getElementById('user-status').value = '1';
    if (document.getElementById('user-type')) document.getElementById('user-type').value = 'Employee';
  }
  
  openModal('user-modal');
}

function closeUserModal() { 
  closeModal('user-modal'); 
  editingUserId = null; 
}

async function saveUser() {
  const name = document.getElementById('user-name').value;
  const email = document.getElementById('user-email').value;
  const department = document.getElementById('user-department').value;
  const position = document.getElementById('user-position').value;
  const role = document.getElementById('user-role').value;
  const is_active = document.getElementById('user-status').value === '1';
  const saveBtn = document.getElementById('user-modal-save');
  
  if (!name || !email) {
    showToast('Name/Email required', 'error');
    return;
  }
  
  setButtonLoading(saveBtn, true);
  
  try {
    const payload = { name, email, department, position, role, is_active };
    
    if (editingUserId) {
      await apiFetch(`/admin/users/${editingUserId}`, { 
        method: 'PUT', 
        body: JSON.stringify(payload) 
      });
    } else {
      await apiFetch('/admin/users', { 
        method: 'POST', 
        body: JSON.stringify(payload) 
      });
    }
    
    closeUserModal();
    loadUsers();
    showToast('User saved');
  } catch (e) { 
    showToast(e.message, 'error'); 
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

// Bulk upload functionality
function openBulkUploadModal() {
  openModal('bulk-upload-modal');
  document.getElementById('bulk-excel-upload').value = '';
  document.getElementById('bulk-upload-status').innerHTML = '';
}

function closeBulkUploadModal() {
  closeModal('bulk-upload-modal');
}

async function submitBulkUpload() {
  const fileInput = document.getElementById('bulk-excel-upload');
  const file = fileInput.files[0];
  const btn = document.getElementById('bulk-upload-save');
  const statusDiv = document.getElementById('bulk-upload-status');

  if (!file) {
    showToast('Please select an Excel file', 'warning');
    return;
  }

  setButtonLoading(btn, true);
  statusDiv.innerHTML = '<p style="color: #666;">Uploading and processing...</p>';

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${window.API_BASE}/admin/users/bulk`, {
      method: 'POST',
      headers: {
        'Authorization': window.getAuthToken()
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok) throw new Error(result.error || 'Upload failed');

    statusDiv.innerHTML = `
      <div class="alert alert-success">
        <strong>Success!</strong> ${result.message}<br>
        <small>Added: ${result.stats.added}, Updated: ${result.stats.updated}, Failed: ${result.stats.failed}</small>
      </div>
    `;
    
    setTimeout(() => {
      closeBulkUploadModal();
      loadUsers();
      showToast('Bulk upload complete', 'success');
    }, 2000);

  } catch (error) {
    console.error(error);
    statusDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    showToast('Upload failed', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

// User History Functionality
async function viewUserHistory(userId, userName) {
  try {
    // Show loading
    showToast(`Loading chat history for ${userName}...`, 'info');
    
    // Fetch user's chat history
    const data = await apiFetch(`/admin/chats?user_id=${userId}`);
    
    if (data.chats && data.chats.length > 0) {
      // Create a modal or redirect to chat history filtered by user
      const userChats = data.chats;
      
      // For now, show a summary and option to view in chat history
      const message = `${userName} has ${userChats.length} chat sessions with ${userChats.reduce((sum, chat) => sum + chat.message_count, 0)} total messages. 
      Go to Chat History to view details.`;
      
      showToast(message, 'info', 5000);
      
      // Optionally, switch to chat history tab and filter by user
      setTimeout(() => {
        // This would require additional implementation to filter chat history by user
        console.log(`Would filter chat history for user ${userId}`);
      }, 1000);
      
    } else {
      showToast(`${userName} has no chat history`, 'info');
    }
  } catch (error) {
    console.error('Error loading user history:', error);
    showToast('Failed to load user history', 'error');
  }
}

// Public API
const UserManagement = {
  setupUserManagement,
  loadUsers,
  openUserModal,
  editUser: openUserModal,
  toggleUserStatus: async (id, status, name) => {
    showConfirmationModal({
      title: status ? 'Activate User' : 'Deactivate User',
      message: `Are you sure you want to ${status ? 'activate' : 'deactivate'} <strong>${escapeHtml(name)}</strong>?`,
      confirmText: status ? 'Activate' : 'Deactivate',
      confirmType: status ? 'primary' : 'danger',
      onConfirm: async () => {
        if (!status) {
          await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
        } else {
          const u = allUsers.find(user => user.id === id);
          if (u) {
            await apiFetch(`/admin/users/${id}`, { 
              method: 'PUT', 
              body: JSON.stringify({ ...u, is_active: true }) 
            });
          }
        }
        loadUsers();
        showToast(status ? 'User activated' : 'User deactivated');
      }
    });
  },
  viewUserHistory
};

// Export for global access
window.UserManagement = UserManagement;

export {
  setupUserManagement,
  loadUsers,
  UserManagement
};