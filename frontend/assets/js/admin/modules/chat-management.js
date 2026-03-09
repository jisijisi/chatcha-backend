// Chat Management Module
import { apiFetch } from '../core/api.js';
import { formatDateTime, escapeHtml, formatMarkdown, debounce } from '../core/utils.js';
import { showToast, openModal, closeModal, showConfirmationModal } from '../core/ui.js';

// State
let allChats = [];
let currentChatTab = 'history';
let viewingSessionId = null;
let currentPage = 1;
let itemsPerPage = 10;
let totalRecords = 0;
let totalPages = 1;

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
      currentPage = 1; // Reset to first page on search
      loadChats();
    }, 500));
  }

  if (deptFilter) {
    deptFilter.addEventListener('change', () => {
      currentPage = 1; // Reset to first page on filter change
      loadChats();
    });
  }

  // Pagination Controls
  const prevBtn = document.getElementById('chat-prev-btn');
  const nextBtn = document.getElementById('chat-next-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadChats();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadChats();
      }
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

function setChatsLoading(isLoading) {
  const content = document.getElementById('chats-content');
  const skeleton = document.getElementById('chats-skeleton');

  if (!content || !skeleton) return;

  if (isLoading) {
    content.style.display = 'none';
    skeleton.style.display = 'block';
  } else {
    content.style.display = 'block';
    skeleton.style.display = 'none';
  }
}

function setAnalyticsLoading(isLoading) {
  const content = document.getElementById('chat-analytics-content');
  const skeleton = document.getElementById('chat-analytics-skeleton');

  if (!content || !skeleton) return;

  if (isLoading) {
    content.style.display = 'none';
    skeleton.style.display = 'block';
  } else {
    content.style.display = 'block';
    skeleton.style.display = 'none';
  }
}

// Tab management
function switchChatTab(tabName) {
  console.log('SwitchChatTab called for:', tabName);
  
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
  if (tabName === 'history') loadChats(true);
  else if (tabName === 'analytics') loadChatAnalytics(true);
}

// Load chat data
async function loadChatData(showSkeleton = true) {
  if (currentChatTab === 'history') await loadChats(showSkeleton);
  else await loadChatAnalytics(showSkeleton);
}

// Helper to generate skeleton rows
function getSkeletonRows(cols = 5, rows = 5) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `<tr class="skeleton-row">`;
    for (let j = 0; j < cols; j++) {
      html += `<td><div class="skeleton" style="width: 100%; height: 20px; border-radius: 4px;"></div></td>`;
    }
    html += `</tr>`;
  }
  return html;
}

// Chat history management
async function loadChats(showSkeleton = true) {
  const tbody = document.getElementById('chat-history-table-body');
  if (tbody && showSkeleton) tbody.innerHTML = getSkeletonRows(5);

  if (showSkeleton) {
    setChatsLoading(true);
  }
  try {
    const search = document.getElementById('chat-search')?.value || '';
    const dept = document.getElementById('chat-dept-filter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (dept) params.append('department', dept);
    params.append('page', currentPage);
    params.append('limit', itemsPerPage);

    const data = await apiFetch(`/admin/chats?${params.toString()}`);
    allChats = data.chats || [];
    
    if (data.pagination) {
      totalRecords = data.pagination.total;
      totalPages = data.pagination.totalPages;
      currentPage = data.pagination.page;
    } else {
      totalRecords = allChats.length;
      totalPages = 1;
    }

    renderChatHistoryTable();
    renderPagination();
  } catch (error) {
    console.error('Error loading chats:', error);
    showToast('Failed to load chat history', 'error');
  } finally {
    setChatsLoading(false);
  }
}

function renderChatHistoryTable() {
  const tbody = document.getElementById('chat-history-table-body');
  const paginationControls = document.getElementById('chat-pagination');
  
  if (!tbody) return;

  if (allChats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No chats found.</td></tr>';
    if (paginationControls) paginationControls.style.display = 'none';
    return;
  }
  
  if (paginationControls) paginationControls.style.display = 'flex';

  tbody.innerHTML = allChats.map(chat => `
    <tr>
      <td data-label="User">
        <div>
          <div style="font-weight: 600;">${chat.user_name}</div>
          <div style="font-size: 0.8rem; color: #666;">${chat.department || 'No Dept'}</div>
        </div>
      </td>
      <td data-label="Session Title">${chat.session_title}</td>
      <td data-label="Messages">${chat.message_count}</td>
      <td data-label="Last Activity">${formatDateTime(chat.last_activity)}</td>
      <td data-label="Actions">
        <div class="action-buttons">
          <button class="action-btn action-btn-view" onclick="window.ChatManagement.viewChatSession('${chat.session_id}')">
            <span class="material-symbols-outlined">visibility</span> View
          </button>
          <button class="action-btn action-btn-delete" onclick="window.ChatManagement.deleteChatSession('${chat.session_id}')">
            <span class="material-symbols-outlined">delete</span> Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPagination() {
  const startRecord = (currentPage - 1) * itemsPerPage + 1;
  const endRecord = Math.min(startRecord + allChats.length - 1, totalRecords);
  
  const startEl = document.getElementById('chat-start-record');
  const endEl = document.getElementById('chat-end-record');
  const totalEl = document.getElementById('chat-total-records');
  
  if (startEl) startEl.textContent = totalRecords === 0 ? 0 : startRecord;
  if (endEl) endEl.textContent = endRecord;
  if (totalEl) totalEl.textContent = totalRecords;

  const prevBtn = document.getElementById('chat-prev-btn');
  const nextBtn = document.getElementById('chat-next-btn');
  
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

  // Render page numbers
  const pageContainer = document.getElementById('chat-page-numbers');
  if (!pageContainer) return;
  
  pageContainer.innerHTML = '';
  
  let pages = [];
  const maxVisible = 5;
  
  if (totalPages <= maxVisible) {
    for(let i=1; i<=totalPages; i++) pages.push(i);
  } else {
    if (currentPage <= 3) {
      pages = [1, 2, 3, 4, '...', totalPages];
    } else if (currentPage >= totalPages - 2) {
      pages = [1, '...', totalPages-3, totalPages-2, totalPages-1, totalPages];
    } else {
      pages = [1, '...', currentPage-1, currentPage, currentPage+1, '...', totalPages];
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
      btn.className = `btn btn-sm ${p === currentPage ? 'btn-primary' : 'btn-outline'}`;
      btn.style.padding = '5px 10px';
      btn.style.minWidth = '30px';
      if (p !== currentPage) {
        btn.onclick = () => {
          currentPage = p;
          loadChats(true);
        };
      }
      pageContainer.appendChild(btn);
    }
  });
}

function renderChatSessionSkeleton() {
  const container = document.getElementById('chat-viewer-container');
  if (!container) return;
  
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
        <div class="skeleton" style="width: 60%; height: 60px; border-radius: 12px 12px 0 12px;"></div>
      </div>
      <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
        <div class="skeleton" style="width: 70%; height: 100px; border-radius: 12px 12px 12px 0;"></div>
      </div>
      <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
        <div class="skeleton" style="width: 40%; height: 40px; border-radius: 12px 12px 0 12px;"></div>
      </div>
      <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
        <div class="skeleton" style="width: 65%; height: 80px; border-radius: 12px 12px 12px 0;"></div>
      </div>
    </div>
  `;
}

// Chat viewer modal
async function viewChatSession(sessionId) {
  const modal = document.getElementById('chat-view-modal');
  const container = document.getElementById('chat-viewer-container');
  const title = document.getElementById('chat-view-title');
  const meta = document.getElementById('chat-view-meta');
  
  viewingSessionId = sessionId;
  openModal('chat-view-modal');
  
  renderChatSessionSkeleton();

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
        loadChats(true);
      } catch (e) {
        showToast('Failed to delete chat', 'error');
      }
    }
  });
}

// Chat analytics
async function loadChatAnalytics(showSkeleton = true) {
  if (showSkeleton) {
    setAnalyticsLoading(true);
  }
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
  } finally {
    setAnalyticsLoading(false);
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
    btn.innerHTML = '<span><span class="material-symbols-outlined">download</span></span> Export CSV';
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
