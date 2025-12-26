// chart-renderer.js - Custom Canvas-Based Chart Renderer (No External Dependencies)
export class ChartRenderer {
  constructor() {
    this.colors = {
      primary: '#D71921',
      secondary: '#FFC700',
      success: '#4CAF50',
      info: '#2196F3',
      warning: '#FF9800',
      text: '#1f2937',
      grid: '#e5e7eb',
      background: '#ffffff'
    };
    
    this.chartCache = new Map();
  }

  // ENTRY POINT: Called by markdown.js
  renderChartFromJSON(jsonString, containerId) {
    try {
      const config = JSON.parse(jsonString);
      
      // Validate that we have actual data
      if (!config.data || !config.data.datasets || config.data.datasets.length === 0) {
        console.warn('Chart config missing data');
        return this.createErrorElement('No data available for visualization');
      }
      
      // Check if datasets have actual values
      const hasValidData = config.data.datasets.some(dataset => 
        dataset.data && dataset.data.length > 0 && dataset.data.some(val => val !== null && val !== undefined)
      );
      
      if (!hasValidData) {
        console.warn('Chart datasets contain no valid data');
        return this.createErrorElement('Chart data is empty or invalid');
      }
      
      const container = document.createElement('div');
      container.className = 'chart-container';
      container.id = containerId || `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add Title if present
      if (config.options?.plugins?.title?.text) {
        const title = document.createElement('h4');
        title.className = 'chart-title';
        title.textContent = config.options.plugins.title.text;
        container.appendChild(title);
      }

      const canvas = document.createElement('canvas');
      canvas.className = 'data-chart';
      canvas.width = 600;
      canvas.height = 350;
      container.appendChild(canvas);

      // Draw asynchronously to ensure canvas is in DOM
      requestAnimationFrame(() => {
        this.drawChart(canvas, config);
      });

      return container;
    } catch (e) {
      console.error('Error parsing chart JSON:', e);
      return this.createErrorElement('Chart rendering error - invalid data format');
    }
  }

  createErrorElement(message) {
    const err = document.createElement('div');
    err.className = 'chart-error';
    err.textContent = message;
    return err;
  }

  drawChart(canvas, config) {
    const ctx = canvas.getContext('2d');
    const type = config.type || 'bar';
    const data = config.data || {};
    const labels = data.labels || [];
    const datasets = data.datasets || [];
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Route to specific drawer based on chart type
    const chartType = type.toLowerCase();
    switch(chartType) {
      case 'pie':
      case 'doughnut':
        this.drawPieChart(ctx, canvas, labels, datasets);
        break;
      case 'line':
        this.drawLineChart(ctx, canvas, labels, datasets);
        break;
      case 'bar':
      default:
        this.drawBarChart(ctx, canvas, labels, datasets);
    }
  }

  // --- BAR CHART DRAWING LOGIC ---
  drawBarChart(ctx, canvas, labels, datasets) {
    const padding = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    // Calculate max value for scaling
    let maxValue = 1;
    datasets.forEach(dataset => {
      const datasetMax = Math.max(...dataset.data);
      if (datasetMax > maxValue) maxValue = datasetMax;
    });
    maxValue = maxValue * 1.1; // Add 10% padding

    // Draw grid
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i * chartHeight / gridLines);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();
      
      // Y-axis labels
      ctx.fillStyle = this.colors.text;
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxValue - (i * maxValue / gridLines)), padding.left - 10, y + 4);
    }

    // Vertical grid and bars
    const barWidth = (chartWidth / labels.length) * 0.6;
    const spacing = chartWidth / labels.length;
    
    datasets.forEach((dataset, datasetIndex) => {
      const backgroundColor = dataset.backgroundColor || this.getColor(datasetIndex);
      const borderColor = dataset.borderColor || backgroundColor;
      
      dataset.data.forEach((value, index) => {
        const x = padding.left + (index * spacing) + (spacing - barWidth) / 2;
        const barHeight = (value / maxValue) * chartHeight;
        const y = canvas.height - padding.bottom - barHeight;

        // Bar
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Border
        if (dataset.borderWidth > 0) {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = dataset.borderWidth || 2;
          ctx.strokeRect(x, y, barWidth, barHeight);
        }

        // Value label
        ctx.fillStyle = this.colors.text;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(value, x + barWidth/2, y - 8);

        // X-axis label
        if (datasetIndex === 0) {
          ctx.fillStyle = this.colors.text;
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          const label = labels[index] ? (labels[index].length > 10 ? labels[index].substr(0,8)+'...' : labels[index]) : '';
          ctx.fillText(label, x + barWidth/2, canvas.height - padding.bottom + 20);
        }
      });
    });

    // Y-axis label
    ctx.save();
    ctx.fillStyle = this.colors.text;
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.translate(20, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Values', 0, 0);
    ctx.restore();
  }

  // --- LINE CHART DRAWING LOGIC ---
  drawLineChart(ctx, canvas, labels, datasets) {
    const padding = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    // Calculate max and min values for scaling
    let maxValue = -Infinity;
    let minValue = Infinity;
    datasets.forEach(dataset => {
      const datasetMax = Math.max(...dataset.data);
      const datasetMin = Math.min(...dataset.data);
      if (datasetMax > maxValue) maxValue = datasetMax;
      if (datasetMin < minValue) minValue = datasetMin;
    });
    
    const valueRange = maxValue - minValue || 1;
    maxValue = maxValue + valueRange * 0.1;
    minValue = minValue - valueRange * 0.1;

    // Draw grid
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i * chartHeight / gridLines);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();
      
      // Y-axis labels
      ctx.fillStyle = this.colors.text;
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      const value = maxValue - (i * (maxValue - minValue) / gridLines);
      ctx.fillText(value.toFixed(1), padding.left - 10, y + 4);
    }

    datasets.forEach((dataset, datasetIndex) => {
      const points = dataset.data.map((val, i) => ({
        x: padding.left + (i * (chartWidth / (dataset.data.length - 1 || 1))),
        y: padding.top + chartHeight - ((val - minValue) / (maxValue - minValue)) * chartHeight
      }));

      // Line
      ctx.beginPath();
      ctx.strokeStyle = dataset.borderColor || this.getColor(datasetIndex);
      ctx.lineWidth = dataset.borderWidth || 3;
      ctx.lineJoin = 'round';
  if(points.length) {
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
  }
  ctx.stroke();

  // Points
  points.forEach((p, i) => {
    ctx.fillStyle = dataset.backgroundColor || this.colors.background;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = dataset.borderColor || this.getColor(datasetIndex);
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Value labels
    ctx.fillStyle = this.colors.text;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(dataset.data[i], p.x, p.y - 15);
  });

  // X-axis labels
  if (datasetIndex === 0) {
    points.forEach((p, i) => {
      ctx.fillStyle = this.colors.text;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      const label = labels[i] ? (labels[i].length > 8 ? labels[i].substr(0,6)+'...' : labels[i]) : '';
      ctx.fillText(label, p.x, canvas.height - padding.bottom + 20);
    });
  }
});

// Y-axis label
ctx.save();
ctx.fillStyle = this.colors.text;
ctx.font = '14px Arial';
ctx.textAlign = 'center';
ctx.translate(20, canvas.height / 2);
ctx.rotate(-Math.PI / 2);
ctx.fillText('Values', 0, 0);
ctx.restore();
}
// --- PIE CHART DRAWING LOGIC ---
drawPieChart(ctx, canvas, labels, datasets) {
const dataset = datasets[0] || { data: [] };
const values = dataset.data;
const total = values.reduce((a, b) => a + b, 0);
if (total === 0) return;
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radius = Math.min(centerX, centerY) - 60;

let startAngle = 0;

// Draw pie slices
values.forEach((val, i) => {
  const sliceAngle = (val / total) * 2 * Math.PI;
  const endAngle = startAngle + sliceAngle;
  
  // Slice
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.closePath();
  
  ctx.fillStyle = this.getColor(i);
  ctx.fill();
  
  // Border
  ctx.strokeStyle = this.colors.background;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Percentage labels on slices
  const midAngle = startAngle + sliceAngle / 2;
  const labelRadius = radius * 0.7;
  const labelX = centerX + Math.cos(midAngle) * labelRadius;
  const labelY = centerY + Math.sin(midAngle) * labelRadius;
  
  ctx.fillStyle = this.colors.background;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const percentage = Math.round((val/total)*100);
  if (percentage >= 5) { // Only show label if slice is big enough
    ctx.fillText(percentage + '%', labelX, labelY);
  }

  startAngle = endAngle;
});

// Legend
const legendX = canvas.width - 150;
const legendY = 40;

values.forEach((val, i) => {
  const y = legendY + (i * 25);
  
  // Color box
  ctx.fillStyle = this.getColor(i);
  ctx.fillRect(legendX, y, 15, 15);
  
  ctx.strokeStyle = this.colors.text;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, y, 15, 15);
  
  // Label text
  ctx.fillStyle = this.colors.text;
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  const percentage = Math.round((val/total)*100);
  const label = labels[i] ? (labels[i].length > 15 ? labels[i].substr(0,13)+'...' : labels[i]) : `Item ${i+1}`;
  ctx.fillText(`${label} (${percentage}%)`, legendX + 20, y + 12);
});

// Total in center for doughnut charts
if (canvas.dataset.type === 'doughnut') {
  ctx.fillStyle = this.colors.text;
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Total', centerX, centerY);
  ctx.font = '20px Arial';
  ctx.fillText(total.toString(), centerX, centerY + 25);
}
}
// --- UTILITY METHODS ---
getColor(index) {
const colors = [
'#D71921', '#FFC700', '#4CAF50', '#2196F3',
'#9C27B0', '#FF5722', '#607D8B', '#795548',
'#3F51B5', '#009688', '#FF9800', '#8BC34A'
];
return colors[index % colors.length];
}
// Clear all charts (for cleanup)
clearAllCharts() {
this.chartCache.clear();
}
// Responsive resize handler
handleResize() {
// Re-render all cached charts on window resize
this.chartCache.forEach((config, containerId) => {
const container = document.getElementById(containerId);
if (container) {
const canvas = container.querySelector('canvas');
if (canvas) {
this.drawChart(canvas, config);
}
}
});
}
}
// Initialize global resize handler
let globalChartRenderer = null;
export function initChartRenderer() {
if (!globalChartRenderer) {
globalChartRenderer = new ChartRenderer();
window.addEventListener('resize', () => {
globalChartRenderer.handleResize();
});
}
return globalChartRenderer;
}