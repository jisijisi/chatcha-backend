// Chat Management Module
import { apiFetch } from '../core/api.js';
import { formatDateTime, escapeHtml, formatMarkdown, debounce } from '../core/utils.js';
import { showToast, openModal, closeModal, showConfirmationModal } from '../core/ui.js';

// State
let allChats = [];
let currentChatTab = 'history';
let viewingSessionId = null;

// Initialize chat management
function setupChatManagement() {
  console.log('Setting up Chat Management module...');
  
  // Chat tabs
  document.querySelectorAll('.kb-tab[data-chat-tab]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = tab.dataset.chatTab;
      console.log('Switching chat tab to:', tabName);
      switchChatTab(tabName);
    });
  });

  // Filters
  const searchInput = document.getElementById('chat-search');
  const deptFilter = document.getElementById('chat-dept-filter');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      loadChats();
    }, 500));
  }

  if (deptFilter) {
    deptFilter.addEventListener('change', () => {
      loadChats();
    });
  }

  // Chat viewer modal
  const closeBtn = document.getElementById('chat-view-close');
  const closeFooterBtn = document.getElementById('chat-view-close-btn');
  const deleteBtn = document.getElementById('chat-view-delete-btn');
  
  if (closeBtn) closeBtn.addEventListener('click', closeChatModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeChatModal);
  if (deleteBtn) deleteBtn.addEventListener('click', async () => {
    if (!viewingSessionId) return;
    showConfirmationModal({
      title: 'Delete Chat',
      message: 'Delete this entire chat session? This cannot be undone.',
      confirmText: 'Delete',
      confirmType: 'danger',
      onConfirm: async () => {
        await deleteChatSession(viewingSessionId);
        closeChatModal();
      }
    });
  });

  const exportBtn = document.getElementById('chat-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportChatHistory);
  }
}

// Tab management
function switchChatTab(tabName) {
  console.log('Switching chat tab to:', tabName);
  
  // Update tabs
  document.querySelectorAll('.kb-tab[data-chat-tab]').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.kb-tab[data-chat-tab="${tabName}"]`);
  if (activeTab) activeTab.classList.add('active');
  
  // Update content
  document.querySelectorAll('.chat-tab-content').forEach(c => c.classList.remove('active'));
  const activeContent = document.getElementById(`chat-${tabName}-tab`);
  if (activeContent) activeContent.classList.add('active');
  
  currentChatTab = tabName;
  
  // Load data for the tab
  if (tabName === 'history') loadChats();
  else if (tabName === 'analytics') loadChatAnalytics();
}

// Load chat data
async function loadChatData() {
  if (currentChatTab === 'history') await loadChats();
  else await loadChatAnalytics();
}

// Chat history management
async function loadChats() {
  const tbody = document.getElementById('chat-history-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Loading chats...</td></tr>';

  try {
    const search = document.getElementById('chat-search')?.value || '';
    const dept = document.getElementById('chat-dept-filter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (dept) params.append('department', dept);

    const data = await apiFetch(`/admin/chats?${params.toString()}`);
    allChats = data.chats || [];
    renderChatHistoryTable();
  } catch (error) {
    console.error('Error loading chats:', error);
    showToast('Failed to load chat history', 'error');
  }
}

function renderChatHistoryTable() {
  const tbody = document.getElementById('chat-history-table-body');
  
  if (!tbody) return;

  if (allChats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No chats found.</td></tr>';
    return;
  }

  tbody.innerHTML = allChats.map(chat => `
    <tr>
      <td>
        <div style="font-weight: 600;">${chat.user_name}</div>
        <div style="font-size: 0.8rem; color: #666;">${chat.department || 'No Dept'}</div>
      </td>
      <td>${chat.session_title}</td>
      <td>${chat.message_count}</td>
      <td>${formatDateTime(chat.last_activity)}</td>
      <td>
        <button class="action-btn action-btn-view" onclick="window.ChatManagement.viewChatSession('${chat.session_id}')">
          <span class="material-symbols-outlined" style="font-size: 14px;">visibility</span> View
        </button>
        <button class="action-btn action-btn-delete" onclick="window.ChatManagement.deleteChatSession('${chat.session_id}')">
          <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
        </button>
      </td>
    </tr>
  `).join('');
}

// Chat viewer modal
async function viewChatSession(sessionId) {
  const modal = document.getElementById('chat-view-modal');
  const container = document.getElementById('chat-viewer-container');
  const title = document.getElementById('chat-view-title');
  const meta = document.getElementById('chat-view-meta');
  
  viewingSessionId = sessionId;
  openModal('chat-view-modal');
  container.innerHTML = '<div class="loading-cell">Loading conversation...</div>';

  try {
    const data = await apiFetch(`/admin/chats/${sessionId}`);
    const { messages, session } = data;

    title.textContent = session.title;
    meta.textContent = `${session.name} (${session.email})`;
    
    if (messages.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 20px; color:#888;">No messages in this session.</div>';
      return;
    }

    container.innerHTML = messages.map(msg => `
      <div class="chat-bubble user">
        <div class="message-content">${escapeHtml(msg.user_message)}</div>
        <span class="chat-timestamp">${formatDateTime(msg.message_timestamp)}</span>
      </div>
      <div class="chat-bubble bot">
        <div class="message-content">${msg.ai_response ? formatMarkdown(msg.ai_response) : '<i>No response</i>'}</div>
        <span class="chat-timestamp">${formatDateTime(msg.message_timestamp)}</span>
      </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;

  } catch (error) {
    console.error(error);
    container.innerHTML = '<p style="color:red; text-align:center;">Failed to load chat details.</p>';
  }
}

function closeChatModal() {
  closeModal('chat-view-modal');
  viewingSessionId = null;
}

async function deleteChatSession(sessionId) {
  showConfirmationModal({
    title: 'Delete Chat',
    message: 'Delete this chat session permanently?',
    confirmText: 'Delete',
    confirmType: 'danger',
    onConfirm: async () => {
      try {
        await apiFetch(`/admin/chats/${sessionId}`, { method: 'DELETE' });
        showToast('Chat session deleted');
        loadChats();
      } catch (e) {
        showToast('Failed to delete chat', 'error');
      }
    }
  });
}

// Chat analytics
async function loadChatAnalytics() {
  try {
    const data = await apiFetch('/admin/chats/analytics');
    
    document.getElementById('ana-total-sessions').textContent = data.totalSessions;
    document.getElementById('ana-total-messages').textContent = data.totalMessages;
    document.getElementById('ana-avg-msg').textContent = data.avgMessagesPerSession;

    renderActivityHeatmap(data.hourlyActivity);
    renderEmployeeSessionsChart(data.sessionsByEmployee);

  } catch (error) {
    console.error('Analytics load error:', error);
    showToast('Failed to load analytics', 'error');
  }
}

function renderActivityHeatmap(data) {
  const ctx = document.getElementById('activityHeatmapChart');
  if (!ctx) return;
  
  // Create array for all 24 hours (0-23)
  const hourlyData = new Array(24).fill(0);
  
  // Fill in actual data
  data.forEach(item => {
    if (item.hour_of_day >= 0 && item.hour_of_day <= 23) {
      hourlyData[item.hour_of_day] = item.count;
    }
  });

  // Create labels in 12-hour format
  const labels = [];
  for (let i = 0; i < 24; i++) {
    if (i === 0) labels.push('12 AM');
    else if (i < 12) labels.push(`${i} AM`);
    else if (i === 12) labels.push('12 PM');
    else labels.push(`${i - 12} PM`);
  }

  if (window.adminCharts.heatmap) {
    window.adminCharts.heatmap.destroy();
  }

  window.adminCharts.heatmap = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Messages Sent',
        data: hourlyData,
        backgroundColor: hourlyData.map(count => 
          count > 0 ? 'rgba(215, 25, 33, 0.6)' : 'rgba(215, 25, 33, 0.1)'
        ),
        borderColor: '#D71921',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0
      },
      scales: {
        y: { 
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            precision: 0,
            callback: function(value) {
              return Number.isInteger(value) ? value : null;
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: {
              size: 11
            }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            label: function(context) {
              const count = context.parsed.y;
              return `Messages: ${count}`;
            }
          }
        }
      }
    }
  });
}

function renderEmployeeSessionsChart(data) {
  const ctx = document.getElementById('employeeSessionsChart').getContext('2d');
  
  if (window.adminCharts.empSessions) window.adminCharts.empSessions.destroy();

  window.adminCharts.empSessions = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        label: 'Total Sessions',
        data: data.map(d => d.session_count),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: '#3b82f6',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// Export functionality
async function exportChatHistory() {
  const btn = document.getElementById('chat-export-btn');
  btn.disabled = true;
  btn.innerHTML = '<span><span class="material-symbols-outlined spin" style="font-size: 14px;">progress_activity</span></span> Exporting...';

  try {
    const response = await apiFetch('/admin/chats/export');
    const data = response.data; 

    if (!data || data.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','), 
      ...data.map(row => headers.map(fieldName => {
        let val = row[fieldName] ? row[fieldName].toString() : '';
        val = val.replace(/"/g, '""'); 
        if (val.search(/("|,|\n)/g) >= 0) val = `"${val}"`;
        return val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chat_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Export successful!', 'success');

  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span><span class="material-symbols-outlined" style="font-size: 14px;">download</span></span> Export CSV';
  }
}

// Public API
const ChatManagement = {
  setupChatManagement,
  loadChatData,
  switchChatTab,
  viewChatSession,
  deleteChatSession,
  closeChatModal
};

// Export for global access
window.ChatManagement = ChatManagement;

export {
  setupChatManagement,
  loadChatData,
  switchChatTab,
  ChatManagement
};
