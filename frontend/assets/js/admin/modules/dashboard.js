// Dashboard Module - COMPLETE FIXED VERSION
import { apiFetch, API_BASE, adminUser } from '../core/api.js';
import { formatDateTime, truncate, generateColors, debounce } from '../core/utils.js';
import { showToast } from '../core/ui.js';

let currentTimeframe = localStorage.getItem('adminDashboardTimeframe') || 'overall';
window.adminCharts = {};
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth() + 1; // 1-12
let dashboardEventSource = null;
const refreshDashboard = debounce(() => loadDashboard(false), 1000);

// Initialize dashboard
function setupDashboard() {
  setupTimeframeTabs();
  connectDashboardStream();
}

// Setup timeframe tabs
function setupTimeframeTabs() {
  const tabs = document.querySelectorAll('.kb-tab[data-timeframe]');
  
  // Set initial active tab from persisted state
  tabs.forEach(tab => {
    if (tab.dataset.timeframe === currentTimeframe) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTimeframe = tab.dataset.timeframe;
      localStorage.setItem('adminDashboardTimeframe', currentTimeframe);
      loadDashboard(true);
    });
  });
}

function connectDashboardStream() {
  if (dashboardEventSource) {
    try { dashboardEventSource.close(); } catch {}
    dashboardEventSource = null;
  }
  const token = adminUser ? adminUser.token : '';
  const url = `${API_BASE}/admin/dashboard/stream?token=${encodeURIComponent(token)}`;
  dashboardEventSource = new EventSource(url);
  dashboardEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'dashboard_update') {
        refreshDashboard();
      }
    } catch {}
  };
  dashboardEventSource.onerror = () => {
    try { dashboardEventSource.close(); } catch {}
    dashboardEventSource = null;
    setTimeout(connectDashboardStream, 5000);
  };
}

// Main dashboard loader
async function loadDashboard(showSkeleton = true) {
  try {
    ensureTimeframeControls();
    if (showSkeleton) {
      setDashboardLoading(true);
    }

    const params = new URLSearchParams({ timeframe: currentTimeframe });
    if (currentTimeframe === 'yearly' || currentTimeframe === 'monthly') {
      params.set('year', String(selectedYear));
    }
    if (currentTimeframe === 'monthly') {
      params.set('month', String(selectedMonth));
    }

    const [stats, employees, charts, activity, knowledgeUsage, deptUsage] = await Promise.all([
      apiFetch(`/admin/dashboard-stats-filtered?${params.toString()}`),
      apiFetch('/admin/dashboard-employees'),
      apiFetch(`/admin/dashboard-charts-filtered?${params.toString()}`),
      apiFetch(`/admin/dashboard-activity-filtered?${params.toString()}`),
      apiFetch(`/admin/dashboard-knowledge-usage?${params.toString()}`),
      apiFetch(`/admin/dashboard-department-usage-filtered?${params.toString()}`)
    ]);
    
    console.log('📊 Dashboard Data Loaded:', { 
      timeframe: currentTimeframe, 
      stats,
      chartData: charts.messagesOverTime,
      chartCount: charts.messagesOverTime ? charts.messagesOverTime.length : 0,
      knowledgeUsage: knowledgeUsage // Add this to debug category data
    });
    
    document.getElementById('totalMessages').textContent = stats.messages || 0;
    document.getElementById('activeUsers').textContent = stats.activeUsers || 0;
    document.getElementById('newSessions').textContent = stats.newSessions || 0;
    document.getElementById('totalEmployees').textContent = employees.totalEmployees || 0;
    
    // PASS TIMEFRAME TO CHART RENDERER
    renderMessagesChart(charts.messagesOverTime, currentTimeframe);
    renderCategoryUsageChart(knowledgeUsage.categoryUsage);
    renderSubcategoryUsageChart(knowledgeUsage.subcategoryUsage);
    renderTopDocuments(knowledgeUsage.topDocuments);
    renderActiveUsersChart(charts.activeUsersOverTime, currentTimeframe);
    renderDepartmentUsageChart(deptUsage.departmentUsage);
    renderActivityTable(activity.recentActivity);
    renderUsersTableSmall(activity.mostActiveUsers);

  } catch (error) {
    console.error('Dashboard load error:', error);
    showToast(`Error loading dashboard: ${error.message}`, 'error');
  } finally {
    setDashboardLoading(false);
  }
}

// Loading state management
function setDashboardLoading(isLoading) {
  const dashboardContent = document.getElementById('dashboard-content');
  const dashboardSkeleton = document.getElementById('dashboard-skeleton');
  
  // Fallback for older HTML structure if IDs don't exist
  if (!dashboardContent || !dashboardSkeleton) {
    const statValues = document.querySelectorAll('.stat-value');
    const activityBody = document.getElementById('recentActivityTable');
    const usersBody = document.getElementById('mostActiveUsersTable');

    if (isLoading) {
      statValues.forEach(el => el.textContent = '...');
      if (activityBody) activityBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 40px;">Loading...</td></tr>`;
      if (usersBody) usersBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 40px;">Loading...</td></tr>`;
    }
    return;
  }

  if (isLoading) {
    dashboardContent.classList.remove('active');
    dashboardSkeleton.style.display = 'block';
  } else {
    dashboardContent.classList.add('active');
    dashboardSkeleton.style.display = 'none';
  }
}

// FIXED: Chart rendering for messages over time
function renderMessagesChart(data, timeframe) {
  const ctx = document.getElementById('messagesChart');
  if (!ctx) return;

  if (window.adminCharts.messagesChart) {
    window.adminCharts.messagesChart.destroy();
  }

  console.log('📈 Rendering Messages Chart:', { 
    timeframe, 
    data, 
    hasData: data && data.length > 0,
    totalCount: data ? data.reduce((sum, item) => sum + item.count, 0) : 0
  });

  // Handle empty data case - but check if we actually have data
  const hasValidData = data && data.some(item => item.count > 0);
  
  if (!data || data.length === 0 || !hasValidData) {
    const ctxContext = ctx.getContext('2d');
    ctxContext.clearRect(0, 0, ctx.width, ctx.height);
    ctxContext.font = '14px Inter';
    ctxContext.fillStyle = '#999';
    ctxContext.textAlign = 'center';
    ctxContext.fillText('No data available for selected period', ctx.width / 2, ctx.height / 2);
    return;
  }

  // Handle both Date objects and pre-formatted labels
  const labels = data.map(item => {
    if (item.label) return item.label; // For daily timeframe (hour labels)
    if (item.day) {
      return new Date(item.day).toLocaleDateString('en-PH', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
    return 'Unknown';
  });

  const values = data.map(item => item.count);
  
  // Check if we have any actual data
  const hasData = values.some(v => v > 0);
  const maxValue = Math.max(...values, 1); // Ensure at least 1 for empty charts
  
  console.log('📊 Chart Values:', { labels, values, hasData, maxValue, timeframe });
  
  const chartType = timeframe === 'yearly' ? 'bar' : 'line';
  window.adminCharts.messagesChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: labels,
      datasets: [{
        label: 'Messages',
        data: values,
        borderColor: '#D71921',
        backgroundColor: chartType === 'bar' ? 'rgba(215, 25, 33, 0.25)' : (hasData ? 'rgba(215, 25, 33, 0.1)' : 'rgba(215, 25, 33, 0)'),
        fill: chartType === 'line',
        tension: chartType === 'line' ? 0.4 : 0,
        borderWidth: chartType === 'line' ? 3 : 1,
        pointRadius: chartType === 'line' ? values.map(v => v > 0 ? 4 : 0) : 0,
        pointHoverRadius: chartType === 'line' ? values.map(v => v > 0 ? 6 : 0) : 0,
        pointBackgroundColor: '#D71921',
        pointBorderColor: '#fff',
        pointBorderWidth: chartType === 'line' ? 2 : 0
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      animation: {
        duration: 0
      },
      hover: {
        animationDuration: 0
      },
      responsiveAnimationDuration: 0,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: { 
        y: { 
          beginAtZero: true,
          suggestedMax: maxValue > 0 ? maxValue + Math.ceil(maxValue * 0.2) : 5,
          ticks: { 
            stepSize: 1,
            precision: 0,
            font: {
              size: 12
            },
            callback: function(value) {
              return Number.isInteger(value) ? value : null;
            }
          },
          grid: {
            drawBorder: false,
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              size: 11
            },
            maxRotation: chartType === 'bar' ? 0 : 45,
            minRotation: chartType === 'bar' ? 0 : 45
          }
        }
      }, 
      plugins: { 
        legend: { 
          display: false 
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 14,
            weight: 'bold'
          },
          bodyFont: {
            size: 13
          },
          callbacks: {
            label: function(context) {
              return `Messages: ${context.parsed.y}`;
            }
          }
        }
      }
    }
  });

  console.log('✅ Messages Chart Rendered for timeframe:', timeframe);
}

function ensureTimeframeControls() {
  const yearSelect = document.getElementById('dashboardYearSelect');
  const monthSelect = document.getElementById('dashboardMonthSelect');
  if (!yearSelect || !monthSelect) return;

  const now = new Date();
  const currentYearLocal = now.getFullYear();

  if (yearSelect.options.length === 0) {
    const years = [currentYearLocal, currentYearLocal - 1, currentYearLocal - 2];
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = String(selectedYear);
    yearSelect.onchange = () => {
      selectedYear = parseInt(yearSelect.value, 10);
      loadDashboard(true);
    };
  } else {
    yearSelect.value = String(selectedYear);
  }

  if (monthSelect.options.length === 0) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    monthSelect.innerHTML = monthNames.map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');
    monthSelect.value = String(selectedMonth);
    monthSelect.onchange = () => {
      selectedMonth = parseInt(monthSelect.value, 10);
      loadDashboard(true);
    };
  } else {
    monthSelect.value = String(selectedMonth);
  }

  if (currentTimeframe === 'yearly') {
    yearSelect.style.display = '';
    monthSelect.style.display = 'none';
  } else if (currentTimeframe === 'monthly') {
    yearSelect.style.display = '';
    monthSelect.style.display = '';
  } else {
    yearSelect.style.display = 'none';
    monthSelect.style.display = 'none';
  }
}

// FIXED: Category usage chart with circular aspect ratio
function renderCategoryUsageChart(data) {
  const ctx = document.getElementById('categoryUsageChart');
  const tableContainer = document.getElementById('categoryUsageTable');
  
  if (!ctx) return;
  
  if (window.adminCharts.categoryUsageChart) {
    window.adminCharts.categoryUsageChart.destroy();
  }
  
  if (tableContainer) tableContainer.innerHTML = '';

  const filteredData = data ? data.filter(item => item.access_count > 0) : [];

  if (!filteredData || filteredData.length === 0) {
    const ctxContext = ctx.getContext('2d');
    ctxContext.clearRect(0, 0, ctx.width, ctx.height);
    ctxContext.font = '14px Inter';
    ctxContext.fillStyle = '#999';
    ctxContext.textAlign = 'center';
    ctxContext.fillText('No category data available', ctx.width / 2, ctx.height / 2);
    if (tableContainer) {
      tableContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No data available</p>';
    }
    return;
  }

  const labels = filteredData.map(item => item.category_name);
  const values = filteredData.map(item => item.access_count);
  const colors = generateColors(filteredData.length);

  window.adminCharts.categoryUsageChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ 
        label: 'Access Count', 
        data: values, 
        backgroundColor: colors, 
        borderColor: '#ffffff', 
        borderWidth: 2 
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      animation: {
        duration: 0
      },
      hover: {
        animationDuration: 0
      },
      plugins: { 
        legend: { 
          display: false 
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8
        }
      }
    }
  });

  const container = ctx.parentElement;
  if (container) {
    container.style.position = 'relative';
    container.style.minHeight = '300px';
  }

  if (tableContainer) {
    const table = document.createElement('table');
    table.className = 'legend-table';
    table.innerHTML = `
      <thead>
        <tr><th>CATEGORY</th><th>ACCESS</th></tr>
      </thead>
      <tbody>
        ${filteredData.map((item, index) => `
          <tr>
            <td><span class="legend-color-box" style="background-color: ${colors[index]};"></span>${item.category_name}</td>
            <td>${item.access_count}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    tableContainer.appendChild(table);
  }
}

// Subcategory usage chart
function renderSubcategoryUsageChart(data) {
  const ctx = document.getElementById('subcategoryUsageChart');
  if (!ctx) return;
  
  if (window.adminCharts.subcategoryUsageChart) {
    window.adminCharts.subcategoryUsageChart.destroy();
  }

  const filteredData = data ? data.filter(item => item.access_count > 0) : [];

  if (!filteredData || filteredData.length === 0) {
    const ctxContext = ctx.getContext('2d');
    ctxContext.clearRect(0, 0, ctx.width, ctx.height);
    ctxContext.font = '14px Inter';
    ctxContext.fillStyle = '#999';
    ctxContext.textAlign = 'center';
    ctxContext.fillText('No subcategory data available', ctx.width / 2, ctx.height / 2);
    return;
  }

  const labels = filteredData.map(item => item.subcategory_name);
  const values = filteredData.map(item => item.access_count);
  const colors = generateColors(filteredData.length);

  window.adminCharts.subcategoryUsageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ 
        label: 'Access Count', 
        data: values, 
        backgroundColor: colors, 
        borderColor: colors.map(c => c.replace('0.7', '1')), 
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      animation: {
        duration: 0
      },
      hover: {
        animationDuration: 0
      },
      responsiveAnimationDuration: 0,
      transitions: {
        active: {
          animation: {
            duration: 0
          }
        }
      },
      scales: { 
        x: { 
          beginAtZero: true, 
          ticks: { 
            stepSize: 1,
            font: {
              size: 11
            }
          },
          grid: {
            drawBorder: false,
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              size: 11
            },
            callback: function(value) {
              return truncate(value, 35);
            }
          }
        }
      }, 
      plugins: { 
        legend: { 
          display: false 
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8,
          position: 'nearest',
          intersect: true
        }
      },
      elements: {
        bar: {
          borderWidth: 0,
          hoverBorderWidth: 0
        }
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    }
  });

  const container = ctx.parentElement;
  if (container) {
    container.style.minHeight = '300px';
    container.style.position = 'relative';
  }
}

// Table rendering functions
function renderActivityTable(activity) {
  const activityBody = document.getElementById('recentActivityTable');
  if (!activityBody) return;
  
  if (activity.length > 0) {
    activityBody.innerHTML = activity.map(item => `
      <tr>
        <td style="max-width: 200px; word-wrap: break-word;">${item.email}</td>
        <td style="max-width: 300px; word-wrap: break-word;">${truncate(item.user_message, 40)}</td>
        <td style="white-space: nowrap;">${formatDateTime(item.message_timestamp)}</td>
      </tr>
    `).join('');
  } else {
    activityBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">No recent activity.</td></tr>`;
  }
}

function renderUsersTableSmall(users) {
  const usersBody = document.getElementById('mostActiveUsersTable');
  if (!usersBody) return;
  
  if (users.length > 0) {
    usersBody.innerHTML = users.map(user => `
      <tr>
        <td style="max-width: 150px; word-wrap: break-word;">${user.name}</td>
        <td style="max-width: 200px; word-wrap: break-word;">${user.email}</td>
        <td>${user.message_count}</td>
      </tr>
    `).join('');
  } else {
    usersBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">No active users in this period.</td></tr>`;
  }
}

function renderTopDocuments(topDocuments) {
  const topDocsContainer = document.getElementById('topDocumentsList');
  if (!topDocsContainer) return;
  topDocsContainer.innerHTML = '';
  
  if (!topDocuments || topDocuments.length === 0) {
    topDocsContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No top documents data available</p>';
    return;
  }
  
  const top3Documents = topDocuments
    .filter(doc => doc.access_count > 0)
    .slice(0, 3);
  
  if (top3Documents.length === 0) {
    topDocsContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No documents accessed yet</p>';
    return;
  }
  
  const heading = document.createElement('h4');
  heading.textContent = 'Top 3 Most Accessed Documents';
  topDocsContainer.appendChild(heading);
  
  const list = document.createElement('ol');
  list.style.paddingLeft = '20px';
  list.style.margin = '0';
  
  top3Documents.forEach(doc => {
    const listItem = document.createElement('li');
    listItem.style.marginBottom = '8px';
    listItem.innerHTML = `<strong>${doc.document_title}</strong><span style="color: #999; margin-left: 10px;">(${doc.access_count} access${doc.access_count !== 1 ? 'es' : ''})</span>`;
    list.appendChild(listItem);
  });
  
  topDocsContainer.appendChild(list);
}

export {
  setupDashboard,
  loadDashboard,
  currentTimeframe
};

function renderActiveUsersChart(data, timeframe) {
  const ctx = document.getElementById('activeUsersChart');
  if (!ctx) return;
  if (window.adminCharts.activeUsersChart) {
    window.adminCharts.activeUsersChart.destroy();
  }
  const hasValidData = data && data.some(item => item.count > 0);
  if (!data || data.length === 0 || !hasValidData) {
    const c = ctx.getContext('2d');
    c.clearRect(0, 0, ctx.width, ctx.height);
    c.font = '14px Inter';
    c.fillStyle = '#999';
    c.textAlign = 'center';
    c.fillText('No data available for selected period', ctx.width / 2, ctx.height / 2);
    return;
  }
  const labels = data.map(item => {
    if (item.label) return item.label;
    if (item.day) {
      return new Date(item.day).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    }
    return 'Unknown';
  });
  const values = data.map(item => item.count);
  const hasData = values.some(v => v > 0);
  const maxValue = Math.max(...values, 1);
  const chartType = timeframe === 'yearly' ? 'bar' : 'line';
  window.adminCharts.activeUsersChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels,
      datasets: [{
        label: 'Active Users',
        data: values,
        borderColor: '#2563eb',
        backgroundColor: chartType === 'bar' ? 'rgba(37, 99, 235, 0.25)' : (hasData ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0)'),
        fill: chartType === 'line',
        tension: chartType === 'line' ? 0.4 : 0,
        borderWidth: chartType === 'line' ? 3 : 1,
        pointRadius: chartType === 'line' ? values.map(v => v > 0 ? 4 : 0) : 0,
        pointHoverRadius: chartType === 'line' ? values.map(v => v > 0 ? 6 : 0) : 0,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#fff',
        pointBorderWidth: chartType === 'line' ? 2 : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      hover: { animationDuration: 0 },
      responsiveAnimationDuration: 0,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: maxValue > 0 ? maxValue + Math.ceil(maxValue * 0.2) : 5,
          ticks: {
            stepSize: 1,
            precision: 0
          },
          grid: { drawBorder: false, color: 'rgba(0, 0, 0, 0.05)' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, maxRotation: chartType === 'bar' ? 0 : 45, minRotation: chartType === 'bar' ? 0 : 45 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8
        }
      }
    }
  });
}

function renderDepartmentUsageChart(data) {
  const ctx = document.getElementById('departmentUsageChart');
  if (!ctx) return;
  if (window.adminCharts.departmentUsageChart) {
    window.adminCharts.departmentUsageChart.destroy();
  }
  const filtered = (data || []).filter(d => d.count > 0);
  if (filtered.length === 0) {
    const c = ctx.getContext('2d');
    c.clearRect(0, 0, ctx.width, ctx.height);
    c.font = '14px Inter';
    c.fillStyle = '#999';
    c.textAlign = 'center';
    c.fillText('No department data available', ctx.width / 2, ctx.height / 2);
    return;
  }
  const labels = filtered.map(d => d.department);
  const values = filtered.map(d => d.count);
  const colors = generateColors(filtered.length);
  window.adminCharts.departmentUsageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Messages',
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.7', '1')),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      animation: { duration: 0 },
      hover: { animationDuration: 0 },
      responsiveAnimationDuration: 0,
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { drawBorder: false, color: 'rgba(0, 0, 0, 0.05)' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          cornerRadius: 8
        }
      }
    }
  });
}
