// User Management Module
import { apiFetch } from '../core/api.js';
import { formatDateTime, escapeHtml } from '../core/utils.js';
import { showToast, setButtonLoading, openModal, closeModal, showConfirmationModal } from '../core/ui.js';

// State
let allUsers = [];
let editingUserId = null;

// Initialize user management
function setupUserManagement() {
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
  
  if (searchInput) searchInput.addEventListener('input', renderUsersTable);
  if (deptFilter) deptFilter.addEventListener('change', renderUsersTable);

  if (bulkBtn) bulkBtn.addEventListener('click', openBulkUploadModal);
  if (bulkClose) bulkClose.addEventListener('click', closeBulkUploadModal);
  if (bulkCancel) bulkCancel.addEventListener('click', closeBulkUploadModal);
  if (bulkSave) bulkSave.addEventListener('click', submitBulkUpload);
}

// Load users
async function loadUsers() {
  try {
    const data = await apiFetch('/admin/users');
    allUsers = data.users || [];
    
    const departments = [...new Set(allUsers.map(u => u.department).filter(Boolean))];
    
    const userDeptFilter = document.getElementById('user-dept-filter');
    if (userDeptFilter) {
      userDeptFilter.innerHTML = '<option value="">Department (All)</option>' + 
        departments.map(d => `<option value="${d}">${d}</option>`).join('');
    }
    
    const chatDeptFilter = document.getElementById('chat-dept-filter');
    if (chatDeptFilter) {
      chatDeptFilter.innerHTML = '<option value="">Department (All)</option>' + 
        departments.map(d => `<option value="${d}">${d}</option>`).join('');
    }
    
    renderUsersTable();
  } catch (error) {
    console.error('❌ Error loading users:', error);
    showToast('Failed to load users', 'error');
  }
}

// Render users table
function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  
  const search = (document.getElementById('user-search')?.value || '').toLowerCase();
  const dept = document.getElementById('user-dept-filter')?.value || '';
  
  const filtered = allUsers.filter(u => {
    const matchesSearch = (u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
    const matchesDept = !dept || u.department === dept;
    return matchesSearch && matchesDept;
  });
  
  if (filtered.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No users found.</td></tr>'; 
    return; 
  }
  
  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td>
        <div style="font-weight: 600;">${u.name}</div>
        <div style="font-size: 0.85rem; color: #666;">${u.email}</div>
      </td>
      <td>
        <div style="font-weight: 500;">${escapeHtml(u.department || '-')}</div>
        <div style="font-size: 0.8rem; color: #999;">${escapeHtml(u.position || '')}</div>
      </td>
      <td>
        <span class="badge badge-${u.is_active ? 'success' : 'danger'}">
          ${u.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 14px;">chat_bubble_outline</span> 
            <strong>${u.total_messages || 0}</strong> msgs
          </div>
          <div style="font-size: 0.8rem; color: #999;">
            Last: ${u.last_active ? formatDateTime(u.last_active) : 'Never'}
          </div>
        </div>
      </td>
      <td>
        <div class="action-buttons">
          <button class="action-btn action-btn-view" onclick="window.UserManagement.viewUserHistory(${u.id}, '${u.name}')">
            <span class="material-symbols-outlined" style="font-size: 14px;">history</span> History
          </button>
          <button class="action-btn action-btn-edit" onclick="window.UserManagement.editUser(${u.id})">
            <span class="material-symbols-outlined" style="font-size: 14px;">edit</span> Edit
          </button>
          ${u.is_active ? 
            `<button class="action-btn action-btn-delete" onclick="window.UserManagement.toggleUserStatus(${u.id}, false, '${u.name}')">
              <span class="material-symbols-outlined" style="font-size: 14px;">block</span> Deactivate
            </button>` : 
            `<button class="action-btn action-btn-view" onclick="window.UserManagement.toggleUserStatus(${u.id}, true, '${u.name}')">
              <span class="material-symbols-outlined" style="font-size: 14px;">check_circle</span> Activate
            </button>`
          }
        </div>
      </td>
    </tr>
  `).join('');
}
// User modal management
function openUserModal(id = null) {
  editingUserId = id;
  const title = document.getElementById('user-modal-title');
  
  if (id) {
    const u = allUsers.find(user => user.id === id);
    title.textContent = 'Edit Employee';
    document.getElementById('user-name').value = u.name;
    document.getElementById('user-email').value = u.email;
    document.getElementById('user-department').value = u.department || '';
    document.getElementById('user-position').value = u.position || '';
    document.getElementById('user-status-group').style.display = 'block';
    document.getElementById('user-status').value = u.is_active ? '1' : '0';
  } else {
    title.textContent = 'Add Employee';
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
  const is_active = document.getElementById('user-status').value === '1';
  const user_type = document.getElementById('user-type') ? document.getElementById('user-type').value : 'Employee';
  const saveBtn = document.getElementById('user-modal-save');
  
  if (!name || !email) {
    showToast('Name/Email required', 'error');
    return;
  }
  
  setButtonLoading(saveBtn, true);
  
  try {
    const payload = { name, email, department, position, is_active, user_type };
    
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
      title: status ? 'Activate Employee' : 'Deactivate Employee',
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
