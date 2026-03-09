import { apiFetch, adminUser } from '../core/api.js';
import { showToast } from '../core/ui.js';
import { formatDateTime } from '../core/utils.js';

let isDropdownOpen = false;

// We need a way to get the current user ID reliably
function getCurrentUserId() {
    if (adminUser && adminUser.id) return adminUser.id;
    
    // Fallback to local storage
    const sessionStr = localStorage.getItem('chatcdo_admin_session');
    if (sessionStr) {
        try {
            const session = JSON.parse(sessionStr);
            if (session.id) return session.id;
            // Try to recover from token
            if (session.token) {
                const parts = session.token.split('_');
                const id = parts[parts.length - 1];
                if (id && !isNaN(id)) return parseInt(id);
            }
        } catch (e) { console.error(e); }
    }
    return null;
}

export function initNotifications() {
  const notificationBtn = document.getElementById('notificationBtn');
  const notificationDropdown = document.getElementById('notificationDropdown');
  const markAllReadBtn = document.getElementById('markAllReadBtn');
  const deleteAllBtn = document.getElementById('deleteAllNotificationsBtn');
  const refreshBtn = document.getElementById('refreshNotificationsBtn');
  const wrapper = document.getElementById('notificationWrapper');

  // Modal elements
  const detailModalClose = document.getElementById('notif-detail-close');
  const detailModalCloseBtn = document.getElementById('notif-detail-close-btn');
  const detailModalDeleteBtn = document.getElementById('notif-detail-delete-btn');
  
  if (detailModalClose) detailModalClose.onclick = closeDetailModal;
  if (detailModalCloseBtn) detailModalCloseBtn.onclick = closeDetailModal;

  if (!notificationBtn || !notificationDropdown) return;

  // Toggle Dropdown
  notificationBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isDropdownOpen = !isDropdownOpen;
    toggleDropdown(isDropdownOpen);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (isDropdownOpen && !wrapper.contains(e.target)) {
      isDropdownOpen = false;
      toggleDropdown(false);
    }
  });

  // Mark all as read
  if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await markAllAsRead();
      });
  }

  // Delete all
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteAllNotifications();
    });
  }

  // Refresh Button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchNotifications();
    });
  }

  // Initial Fetch
  fetchNotifications();

  // Poll for notifications every 10 seconds
  setInterval(fetchNotifications, 10000);
}

function toggleDropdown(show) {
  const dropdown = document.getElementById('notificationDropdown');
  if (show) {
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

async function fetchNotifications() {
  const userId = getCurrentUserId();

  if (!userId) {
    console.error('❌ Admin user ID missing');
    return;
  }

  try {
    const data = await apiFetch(`/api/notifications?userId=${userId}`);
    renderNotifications(data.notifications);
    updateBadge(data.unreadCount);
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notificationList');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = `
        <div class="empty-notifications">
            <span class="material-symbols-outlined">notifications_off</span>
            <p>No new notifications</p>
        </div>
    `;
    return;
  }

  list.innerHTML = '';
  
  notifications.forEach(n => {
      const item = document.createElement('div');
      item.className = `notification-item ${n.is_read ? '' : 'unread'}`;
      item.dataset.id = n.id;
      
      item.innerHTML = `
        <div class="notification-content-wrapper">
            <div class="notification-content">${escapeHtml(n.message)}</div>
            <div class="notification-time">${formatTime(n.created_at)}</div>
        </div>
        <div class="notification-actions">
            <div class="action-icon view" title="View">
                <span class="material-symbols-outlined">visibility</span>
            </div>
            <div class="action-icon delete" title="Delete">
                <span class="material-symbols-outlined">delete</span>
            </div>
        </div>
      `;

      // Click on item -> Mark as read & View
      item.addEventListener('click', (e) => {
          // If clicked on actions, don't trigger main click
          if (e.target.closest('.notification-actions')) return;
          viewNotification(n);
      });

      // View Button
      const viewBtn = item.querySelector('.action-icon.view');
      viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          viewNotification(n);
      });

      // Delete Button
      const deleteBtn = item.querySelector('.action-icon.delete');
      deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteNotification(n.id);
      });

      list.appendChild(item);
  });
}

function updateBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Actions

async function viewNotification(notif) {
    // Show modal
    const modal = document.getElementById('notification-detail-modal');
    const msgEl = document.getElementById('notif-detail-message');
    const timeEl = document.getElementById('notif-detail-time');
    
    if (modal && msgEl && timeEl) {
        msgEl.textContent = notif.message;
        
        // Use the centralized formatDateTime utility for consistency with other pages
        timeEl.textContent = formatDateTime(notif.created_at);
        
        // Setup delete button in modal
        const deleteBtn = document.getElementById('notif-detail-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                closeDetailModal();
                deleteNotification(notif.id);
            };
        }
        
        modal.classList.add('active');
    } else {
        // Fallback
        alert(notif.message);
    }

    // Mark as read
    if (!notif.is_read) {
        markNotificationRead(notif.id);
    }
}

function closeDetailModal() {
    const modal = document.getElementById('notification-detail-modal');
    if (modal) modal.classList.remove('active');
}

async function deleteNotification(id) {
    showConfirmationModal('Are you sure you want to delete this notification?', async () => {
        try {
            const response = await apiFetch(`/api/notifications/${id}`, {
                method: 'DELETE'
            });
            
            if (response.success) {
                fetchNotifications();
                showToast('Notification deleted', 'success');
            }
        } catch (error) {
            console.error('Failed to delete notification:', error);
            showToast('Failed to delete notification', 'error');
        }
    });
}

async function deleteAllNotifications() {
    const userId = getCurrentUserId();
    if (!userId) return;

    showConfirmationModal('Are you sure you want to delete ALL notifications? This cannot be undone.', async () => {
        try {
            const response = await apiFetch(`/api/notifications`, {
                method: 'DELETE',
                body: JSON.stringify({ userId: userId })
            });
            
            if (response.success) {
                fetchNotifications();
                showToast('All notifications deleted', 'success');
            }
        } catch (error) {
            console.error('Failed to delete all notifications:', error);
            showToast('Failed to delete notifications', 'error');
        }
    });
}

async function markAllAsRead() {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    await apiFetch('/api/notifications/read-all', {
      method: 'PUT',
      body: JSON.stringify({ userId: userId })
    });
    fetchNotifications();
    showToast('All notifications marked as read', 'success');
  } catch (error) {
    showToast('Failed to mark all as read', 'error');
  }
}

async function markNotificationRead(id) {
    try {
        await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
        // Optimistically update UI
        const item = document.querySelector(`.notification-item[data-id="${id}"]`);
        if (item) item.classList.remove('unread');
        
        // Update badge (simple decrement for better UX)
        const badge = document.getElementById('notificationBadge');
        if (badge && !badge.classList.contains('hidden')) {
            let count = parseInt(badge.textContent);
            if (count > 0) {
                count--;
                badge.textContent = count > 99 ? '99+' : count;
                if (count === 0) badge.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Failed to mark as read', error);
    }
}

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  
  let date;
  if (typeof timestamp === 'string' && !timestamp.includes('Z') && !timestamp.includes('+')) {
      // If it's a MySQL datetime string without timezone, treat it as UTC
      // This fixes the 8-hour offset issue (UTC vs Asia/Manila)
      date = new Date(timestamp.replace(' ', 'T') + 'Z');
  } else {
      date = new Date(timestamp);
  }

  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

// Re-use the existing confirmation modal from admin.html
function showConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    const msgEl = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('confirm-modal-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    const closeBtn = document.getElementById('confirm-modal-close');

    if (!modal) {
        if (confirm(message)) onConfirm();
        return;
    }

    msgEl.textContent = message;
    
    const handleConfirm = () => {
        onConfirm();
        closeModal();
    };

    const closeModal = () => {
        modal.classList.remove('active');
        confirmBtn.removeEventListener('click', handleConfirm);
    };

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;

    modal.classList.add('active');
}
