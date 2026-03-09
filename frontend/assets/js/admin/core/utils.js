// Utility Functions

// Timezone function for Asia/Manila
function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  
  let date;
  if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
      // If it's a MySQL datetime string without timezone, treat it as UTC
      // This fixes the 8-hour offset issue (UTC vs Asia/Manila)
      date = new Date(dateString.replace(' ', 'T') + 'Z');
  } else {
      date = new Date(dateString);
  }

  if (isNaN(date.getTime())) return 'Invalid Date';
  
  return date.toLocaleString('en-PH', { 
    timeZone: 'Asia/Manila',
    month: 'short', 
    day: 'numeric', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true 
  });
}

function truncate(text, length) {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateColors(count) {
  const baseColors = ['rgba(231, 76, 60, 0.7)', 'rgba(52, 152, 219, 0.7)', 'rgba(46, 204, 113, 0.7)', 'rgba(243, 156, 18, 0.7)', 'rgba(155, 89, 182, 0.7)', 'rgba(26, 188, 156, 0.7)', 'rgba(52, 73, 94, 0.7)', 'rgba(241, 196, 15, 0.7)', 'rgba(230, 126, 34, 0.7)', 'rgba(149, 165, 166, 0.7)'];
  const colors = [];
  for (let i = 0; i < count; i++) colors.push(baseColors[i % baseColors.length]);
  return colors;
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export {
  formatDateTime,
  truncate,
  escapeHtml,
  generateColors,
  formatMarkdown,
  debounce
};