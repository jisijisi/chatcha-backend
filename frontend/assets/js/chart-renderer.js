// Chart Rendering and Data Visualization - Enhanced Professional Version
export class ChartRenderer {
  constructor() {
    this.chartCounter = 0;
    this.colorPalettes = {
      primary: ['#4E5AF7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'],
      gradient: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0'],
      professional: ['#2E5090', '#5B8A72', '#D4A373', '#8E5572', '#4A7C7E', '#B87E5F', '#6B5B95', '#89A894']
    };
  }

  renderCharts(contentDiv) {
    if (!contentDiv) return;
    
    const chartTags = contentDiv.querySelectorAll('chart, [data-chart]');
    
    chartTags.forEach(chartTag => {
      try {
        const type = chartTag.getAttribute('type') || chartTag.getAttribute('data-type') || 'bar';
        const title = chartTag.getAttribute('title') || chartTag.getAttribute('data-title') || '';
        const data = chartTag.getAttribute('data') || chartTag.getAttribute('data-data') || '';
        const options = chartTag.getAttribute('options') || '{}';
        
        if (!data) {
          console.warn('Chart tag found but no data attribute');
          return;
        }
        
        const chartElement = this.createChart(type, title, data, options);
        if (chartElement) {
          chartTag.replaceWith(chartElement);
        }
      } catch (error) {
        console.error('Error rendering chart:', error);
      }
    });

    const textContent = contentDiv.innerHTML;
    if (textContent.includes('&lt;chart')) {
      const decodedContent = this.decodeChartTags(textContent);
      if (decodedContent !== textContent) {
        contentDiv.innerHTML = decodedContent;
        this.renderCharts(contentDiv);
      }
    }
  }

  decodeChartTags(html) {
    return html
      .replace(/&lt;chart/g, '<chart')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }

  parseChartData(dataString) {
    const pairs = dataString.split(',').map(pair => pair.trim());
    const labels = [];
    const values = [];
    
    pairs.forEach(pair => {
      const [label, value] = pair.split(':').map(s => s.trim());
      if (label && value) {
        labels.push(label);
        const numValue = parseFloat(value);
        values.push(isNaN(numValue) ? value : numValue);
      }
    });
    
    return { labels, values };
  }

  createChart(type, title, dataString, optionsString = '{}') {
    this.chartCounter++;
    const chartId = `chart-${this.chartCounter}-${Date.now()}`;
    
    const { labels, values } = this.parseChartData(dataString);
    
    if (labels.length === 0 || values.length === 0) {
      console.warn('No valid data for chart');
      return null;
    }
    
    let chartOptions = {};
    try {
      chartOptions = JSON.parse(optionsString);
    } catch (e) {
      console.warn('Invalid chart options:', e);
    }
    
    const container = document.createElement('div');
    container.className = 'chart-container';
    
    if (title) {
      const titleElement = document.createElement('h4');
      titleElement.className = 'chart-title';
      titleElement.textContent = title;
      container.appendChild(titleElement);
    }
    
    const canvas = document.createElement('canvas');
    canvas.id = chartId;
    canvas.className = 'data-chart';
    container.appendChild(canvas);
    
    canvas.chartData = {
      type: type,
      title: title,
      labels: labels,
      values: values,
      dataString: dataString,
      options: chartOptions
    };
    
    canvas.chartRenderer = this;
    
    setTimeout(() => {
      this.renderChartOnCanvas(canvas, type, labels, values, title, chartOptions);
    }, 100);
    
    return container;
  }

  renderChartOnCanvas(canvas, type, labels, values, title, options = {}) {
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = type === 'sparkline' ? 80 : (type === 'kpi' ? 150 : 400);
    
    const colorPalette = options.palette || 'primary';
    const colors = this.colorPalettes[colorPalette] || this.colorPalettes.primary;
    
    switch (type.toLowerCase()) {
      case 'pie':
        this.drawPieChart(ctx, canvas, labels, values, colors);
        break;
      case 'donut':
        this.drawDonutChart(ctx, canvas, labels, values, colors);
        break;
      case 'bar':
        this.drawBarChart(ctx, canvas, labels, values, colors);
        break;
      case 'column':
        this.drawColumnChart(ctx, canvas, labels, values, colors);
        break;
      case 'line':
        this.drawLineChart(ctx, canvas, labels, values, options);
        break;
      case 'kpi':
        this.drawKPIChart(ctx, canvas, labels, values, options);
        break;
      case 'pareto':
        this.drawParetoChart(ctx, canvas, labels, values, colors);
        break;
      case 'waterfall':
        this.drawWaterfallChart(ctx, canvas, labels, values, colors);
        break;
      case 'scatter':
        this.drawScatterPlot(ctx, canvas, labels, values, options);
        break;
      case 'bubble':
        this.drawBubbleChart(ctx, canvas, labels, values, colors);
        break;
      case 'candlestick':
        this.drawCandlestickChart(ctx, canvas, labels, values, colors);
        break;
      case 'sparkline':
        this.drawSparkline(ctx, canvas, values, options);
        break;
      case 'scattermap':
        this.drawScatterMap(ctx, canvas, labels, values, options);
        break;
      case 'stats':
        this.drawStatsCard(ctx, canvas, labels, values);
        break;
      default:
        this.drawBarChart(ctx, canvas, labels, values, colors);
    }
  }

  rerenderChart(canvas) {
    if (!canvas || !canvas.chartData) {
      console.warn('Canvas or chart data not found for re-rendering');
      return;
    }

    const { type, labels, values, title, options } = canvas.chartData;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    this.renderChartOnCanvas(canvas, type, labels, values, title, options || {});
  }

  // Calculate maximum label width for better padding
  getMaxLabelWidth(ctx, labels, fontSize = 11) {
    ctx.font = `${fontSize}px sans-serif`;
    let maxWidth = 0;
    labels.forEach(label => {
      const width = ctx.measureText(label).width;
      if (width > maxWidth) maxWidth = width;
    });
    return maxWidth;
  }

  // Smart text rendering with automatic font size adjustment
  drawSmartText(ctx, text, x, y, maxWidth, options = {}) {
    const {
      minFontSize = 8,
      maxFontSize = options.fontSize || 11,
      fontWeight = 'normal',
      fontFamily = 'sans-serif',
      align = 'center',
      baseline = 'middle'
    } = options;

    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    // Start with the maximum font size
    let fontSize = maxFontSize;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    let textWidth = ctx.measureText(text).width;

    // Reduce font size until text fits or we reach minimum
    while (textWidth > maxWidth && fontSize > minFontSize) {
      fontSize -= 0.5;
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      textWidth = ctx.measureText(text).width;
    }

    // If still too long even at minimum size, truncate with ellipsis
    if (textWidth > maxWidth) {
      let truncated = text;
      while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      ctx.fillText(truncated + '...', x, y);
    } else {
      ctx.fillText(text, x, y);
    }

    return fontSize;
  }

  // Draw rotated label with smart sizing
  drawRotatedLabel(ctx, text, x, y, angle, maxWidth, options = {}) {
    const {
      minFontSize = 8,
      maxFontSize = options.fontSize || 11,
      fontWeight = 'normal',
      fontFamily = 'sans-serif',
      align = 'right'
    } = options;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Calculate appropriate font size
    let fontSize = maxFontSize;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    let textWidth = ctx.measureText(text).width;

    while (textWidth > maxWidth && fontSize > minFontSize) {
      fontSize -= 0.5;
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      textWidth = ctx.measureText(text).width;
    }

    ctx.textAlign = align;

    // If still too long, truncate
    if (textWidth > maxWidth) {
      let truncated = text;
      while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      ctx.fillText(truncated + '...', 0, 0);
    } else {
      ctx.fillText(text, 0, 0);
    }

    ctx.restore();
    return fontSize;
  }

  // ============ PIE CHART ============
  drawPieChart(ctx, canvas, labels, values, colors) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 80;
    
    const total = values.reduce((sum, val) => sum + val, 0);
    let currentAngle = -Math.PI / 2;
    
    values.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      currentAngle += sliceAngle;
    });
    
    this.drawLegend(ctx, canvas, labels, values, colors, total);
  }

  // ============ DONUT CHART ============
  drawDonutChart(ctx, canvas, labels, values, colors) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const outerRadius = Math.min(centerX, centerY) - 80;
    const innerRadius = outerRadius * 0.6;
    
    const total = values.reduce((sum, val) => sum + val, 0);
    let currentAngle = -Math.PI / 2;
    
    values.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      currentAngle += sliceAngle;
    });
    
    // Draw center text
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Total', centerX, centerY - 10);
    ctx.font = '20px sans-serif';
    ctx.fillText(this.formatValue(total), centerX, centerY + 15);
    
    this.drawLegend(ctx, canvas, labels, values, colors, total);
  }

  // ============ BAR CHART (Horizontal) ============
  drawBarChart(ctx, canvas, labels, values, colors) {
    const maxLabelWidth = this.getMaxLabelWidth(ctx, labels, 12);
    const leftPadding = Math.max(60, Math.min(maxLabelWidth + 20, canvas.width * 0.3));
    const padding = { top: 40, right: 60, bottom: 40, left: leftPadding };
    
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    const maxValue = Math.max(...values);
    const barHeight = (chartHeight / labels.length) * 0.7;
    const spacing = chartHeight / labels.length;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();
    
    // Draw bars
    values.forEach((value, index) => {
      const barWidth = (value / maxValue) * chartWidth;
      const y = padding.top + index * spacing + (spacing - barHeight) / 2;
      
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(padding.left, y, barWidth, barHeight);
      
      // Draw value
      ctx.fillStyle = '#1f2937';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(this.formatValue(value), padding.left + barWidth + 5, y + barHeight / 2 + 4);
      
      // Draw label with smart sizing
      ctx.fillStyle = '#374151';
      this.drawSmartText(ctx, labels[index], padding.left - 10, y + barHeight / 2 + 4, padding.left - 20, {
        fontSize: 12,
        minFontSize: 8,
        align: 'right',
        baseline: 'middle'
      });
    });
  }

  // ============ COLUMN CHART (Vertical) - FIXED ============
  drawColumnChart(ctx, canvas, labels, values, colors) {
    // Calculate dynamic bottom padding based on longest label
    const maxLabelWidth = this.getMaxLabelWidth(ctx, labels, 11);
    // For rotated text at -30 degrees, we need more space
    const bottomPadding = Math.max(80, Math.ceil(maxLabelWidth * Math.sin(Math.PI / 6)) + 40);
    
    const padding = { top: 40, right: 40, bottom: bottomPadding, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    const maxValue = Math.max(...values);
    const columnWidth = (chartWidth / labels.length) * 0.7;
    const spacing = chartWidth / labels.length;
    
    // Calculate max width available for each rotated label
    const maxRotatedLabelWidth = spacing * 2; // Give some buffer space
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();
    
    // Draw columns
    values.forEach((value, index) => {
      const columnHeight = (value / maxValue) * chartHeight;
      const x = padding.left + index * spacing + (spacing - columnWidth) / 2;
      const y = canvas.height - padding.bottom - columnHeight;
      
      // Gradient effect
      const gradient = ctx.createLinearGradient(x, y, x, y + columnHeight);
      gradient.addColorStop(0, colors[index % colors.length]);
      gradient.addColorStop(1, this.lightenColor(colors[index % colors.length], 20));
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, columnWidth, columnHeight);
      
      // Draw value on top with smart sizing
      ctx.fillStyle = '#1f2937';
      this.drawSmartText(ctx, this.formatValue(value), x + columnWidth / 2, y - 5, columnWidth + 20, {
        fontSize: 12,
        minFontSize: 8,
        fontWeight: 'bold',
        align: 'center',
        baseline: 'bottom'
      });
      
      // Draw label - rotated at -30 degrees with smart sizing
      ctx.fillStyle = '#374151';
      this.drawRotatedLabel(ctx, labels[index], x + columnWidth / 2, canvas.height - padding.bottom + 15, 
        -Math.PI / 6, maxRotatedLabelWidth, {
        fontSize: 11,
        minFontSize: 7,
        align: 'right'
      });
    });
    
    // Draw Y-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = (maxValue / 5) * i;
      const y = canvas.height - padding.bottom - (chartHeight / 5) * i;
      ctx.fillText(this.formatValue(value), padding.left - 10, y + 4);
    }
  }

  // ============ LINE CHART ============
  drawLineChart(ctx, canvas, labels, values, options = {}) {
    const padding = 60;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue || 1;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Calculate points
    const points = values.map((value, index) => {
      const x = padding + (index / (labels.length - 1 || 1)) * chartWidth;
      const y = canvas.height - padding - ((value - minValue) / range) * chartHeight;
      return { x, y, value };
    });
    
    // Draw area fill
    if (options.fill !== false) {
      ctx.fillStyle = 'rgba(78, 90, 247, 0.1)';
      ctx.beginPath();
      ctx.moveTo(points[0].x, canvas.height - padding);
      points.forEach(point => ctx.lineTo(point.x, point.y));
      ctx.lineTo(points[points.length - 1].x, canvas.height - padding);
      ctx.closePath();
      ctx.fill();
    }
    
    // Draw line
    ctx.strokeStyle = options.color || '#4E5AF7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    
    // Draw points
    points.forEach((point, index) => {
      ctx.fillStyle = options.color || '#4E5AF7';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw value
      ctx.fillStyle = '#1f2937';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.formatValue(point.value), point.x, point.y - 10);
      
      // Draw label
      ctx.fillStyle = '#64748b';
      ctx.fillText(labels[index], point.x, canvas.height - padding + 20);
    });
  }

  // ============ KPI CHART ============
  drawKPIChart(ctx, canvas, labels, values, options = {}) {
    canvas.height = 150;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const value = values[0];
    const target = values[1] || value * 1.2;
    const percentage = ((value / target) * 100).toFixed(1);
    const isPositive = value >= target;
    
    // Draw main value
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.formatValue(value), canvas.width / 2, 60);
    
    // Draw label
    ctx.fillStyle = '#64748b';
    ctx.font = '16px sans-serif';
    ctx.fillText(labels[0] || 'KPI', canvas.width / 2, 90);
    
    // Draw percentage change
    const changeColor = isPositive ? '#10B981' : '#EF4444';
    ctx.fillStyle = changeColor;
    ctx.font = 'bold 20px sans-serif';
    const arrow = isPositive ? '▲' : '▼';
    ctx.fillText(`${arrow} ${percentage}%`, canvas.width / 2, 120);
    
    // Draw target line
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(20, 130);
    ctx.lineTo(canvas.width - 20, 130);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Target: ${this.formatValue(target)}`, canvas.width / 2, 145);
  }

  // ============ PARETO CHART ============
  drawParetoChart(ctx, canvas, labels, values, colors) {
    const maxLabelWidth = this.getMaxLabelWidth(ctx, labels, 11);
    const bottomPadding = Math.max(80, Math.ceil(maxLabelWidth * Math.sin(Math.PI / 6)) + 40);
    
    const padding = { top: 40, right: 60, bottom: bottomPadding, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    // Sort values in descending order
    const sorted = labels.map((label, i) => ({ label, value: values[i] }))
      .sort((a, b) => b.value - a.value);
    
    const sortedLabels = sorted.map(s => s.label);
    const sortedValues = sorted.map(s => s.value);
    
    const total = sortedValues.reduce((sum, val) => sum + val, 0);
    const cumulative = [];
    let sum = 0;
    sortedValues.forEach(val => {
      sum += val;
      cumulative.push((sum / total) * 100);
    });
    
    const maxValue = Math.max(...sortedValues);
    const columnWidth = (chartWidth / sortedLabels.length) * 0.7;
    const spacing = chartWidth / sortedLabels.length;
    const maxRotatedLabelWidth = spacing * 2;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();
    
    // Draw columns
    sortedValues.forEach((value, index) => {
      const columnHeight = (value / maxValue) * chartHeight;
      const x = padding.left + index * spacing + (spacing - columnWidth) / 2;
      const y = canvas.height - padding.bottom - columnHeight;
      
      ctx.fillStyle = colors[0];
      ctx.fillRect(x, y, columnWidth, columnHeight);
      
      // Draw label with smart sizing
      ctx.fillStyle = '#374151';
      this.drawRotatedLabel(ctx, sortedLabels[index], x + columnWidth / 2, canvas.height - padding.bottom + 15, 
        -Math.PI / 6, maxRotatedLabelWidth, {
        fontSize: 11,
        minFontSize: 7,
        align: 'right'
      });
    });
    
    // Draw cumulative line
    const cumulativePoints = cumulative.map((cum, index) => ({
      x: padding.left + index * spacing + spacing / 2,
      y: canvas.height - padding.bottom - (cum / 100) * chartHeight
    }));
    
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cumulativePoints[0].x, cumulativePoints[0].y);
    cumulativePoints.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    
    // Draw 80% line
    const eightyPercent = canvas.height - padding.bottom - 0.8 * chartHeight;
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, eightyPercent);
    ctx.lineTo(canvas.width - padding.right, eightyPercent);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#10B981';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('80%', padding.left - 5, eightyPercent + 4);
  }

  // ============ WATERFALL CHART ============
  drawWaterfallChart(ctx, canvas, labels, values, colors) {
    const maxLabelWidth = this.getMaxLabelWidth(ctx, labels, 11);
    const bottomPadding = Math.max(80, Math.ceil(maxLabelWidth * Math.sin(Math.PI / 6)) + 40);
    
    const padding = { top: 40, right: 40, bottom: bottomPadding, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    let cumulative = 0;
    const bars = values.map((value, index) => {
      const start = cumulative;
      cumulative += value;
      return { start, end: cumulative, value, label: labels[index] };
    });
    
    const maxValue = Math.max(...bars.map(b => Math.max(Math.abs(b.start), Math.abs(b.end))));
    const zeroY = canvas.height - padding.bottom - (chartHeight / 2);
    const columnWidth = (chartWidth / labels.length) * 0.7;
    const spacing = chartWidth / labels.length;
    const maxRotatedLabelWidth = spacing * 2;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();
    
    // Draw zero line
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(canvas.width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw bars
    bars.forEach((bar, index) => {
      const x = padding.left + index * spacing + (spacing - columnWidth) / 2;
      const barStart = zeroY - (bar.start / maxValue) * (chartHeight / 2);
      const barEnd = zeroY - (bar.end / maxValue) * (chartHeight / 2);
      const barHeight = Math.abs(barEnd - barStart);
      const barY = Math.min(barStart, barEnd);
      
      const isPositive = bar.value >= 0;
      ctx.fillStyle = isPositive ? '#10B981' : '#EF4444';
      ctx.fillRect(x, barY, columnWidth, barHeight);
      
      // Draw connector
      if (index < bars.length - 1) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x + columnWidth, barEnd);
        ctx.lineTo(x + columnWidth + (spacing - columnWidth), barEnd);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw value with smart sizing
      ctx.fillStyle = '#1f2937';
      this.drawSmartText(ctx, this.formatValue(bar.value), x + columnWidth / 2, barY - 5, columnWidth + 20, {
        fontSize: 11,
        minFontSize: 7,
        align: 'center',
        baseline: 'bottom'
      });
      
      // Draw label with smart sizing
      ctx.fillStyle = '#374151';
      this.drawRotatedLabel(ctx, labels[index], x + columnWidth / 2, canvas.height - padding.bottom + 15, 
        -Math.PI / 6, maxRotatedLabelWidth, {
        fontSize: 11,
        minFontSize: 7,
        align: 'right'
      });
    });
  }

  // ============ SCATTER PLOT ============
  drawScatterPlot(ctx, canvas, labels, values, options = {}) {
    const padding = 60;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Parse values as x,y pairs
    const points = [];
    for (let i = 0; i < values.length; i += 2) {
      if (i + 1 < values.length) {
        points.push({ x: values[i], y: values[i + 1], label: labels[Math.floor(i / 2)] });
      }
    }
    
    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw points
    points.forEach((point, index) => {
      const x = padding + ((point.x - xMin) / xRange) * chartWidth;
      const y = canvas.height - padding - ((point.y - yMin) / yRange) * chartHeight;
      
      ctx.fillStyle = options.color || '#4E5AF7';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Draw axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const yValue = yMin + (yRange / 5) * i;
      const y = canvas.height - padding - (chartHeight / 5) * i;
      ctx.fillText(this.formatValue(yValue), padding - 10, y + 4);
    }
  }

  // ============ BUBBLE CHART ============
  drawBubbleChart(ctx, canvas, labels, values, colors) {
    const padding = 60;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Parse values as x,y,size triplets
    const bubbles = [];
    for (let i = 0; i < values.length; i += 3) {
      if (i + 2 < values.length) {
        bubbles.push({ 
          x: values[i], 
          y: values[i + 1], 
          size: values[i + 2],
          label: labels[Math.floor(i / 3)] 
        });
      }
    }
    
    const xValues = bubbles.map(b => b.x);
    const yValues = bubbles.map(b => b.y);
    const sizeValues = bubbles.map(b => b.size);
    
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const sizeMax = Math.max(...sizeValues);
    
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw bubbles
    bubbles.forEach((bubble, index) => {
      const x = padding + ((bubble.x - xMin) / xRange) * chartWidth;
      const y = canvas.height - padding - ((bubble.y - yMin) / yRange) * chartHeight;
      const radius = (bubble.size / sizeMax) * 30 + 5;
      
      ctx.fillStyle = this.addAlpha(colors[index % colors.length], 0.6);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = colors[index % colors.length];
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw label
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(bubble.label, x, y + 4);
    });
  }

  // ============ CANDLESTICK CHART ============
  drawCandlestickChart(ctx, canvas, labels, values, colors) {
    const maxLabelWidth = this.getMaxLabelWidth(ctx, labels, 10);
    const bottomPadding = Math.max(80, Math.ceil(maxLabelWidth * Math.sin(Math.PI / 6)) + 40);
    
    const padding = { top: 40, right: 60, bottom: bottomPadding, left: 60 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    
    // Parse values as open,high,low,close quadruplets
    const candles = [];
    for (let i = 0; i < values.length; i += 4) {
      if (i + 3 < values.length) {
        candles.push({
          open: values[i],
          high: values[i + 1],
          low: values[i + 2],
          close: values[i + 3],
          label: labels[Math.floor(i / 4)]
        });
      }
    }
    
    const allValues = values.flat();
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue || 1;
    
    const candleWidth = (chartWidth / candles.length) * 0.6;
    const spacing = chartWidth / candles.length;
    const maxRotatedLabelWidth = spacing * 2;
    
    // Draw axes
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();
    
    // Draw candles
    candles.forEach((candle, index) => {
      const x = padding.left + index * spacing + spacing / 2;
      
      const highY = canvas.height - padding.bottom - ((candle.high - minValue) / range) * chartHeight;
      const lowY = canvas.height - padding.bottom - ((candle.low - minValue) / range) * chartHeight;
      const openY = canvas.height - padding.bottom - ((candle.open - minValue) / range) * chartHeight;
      const closeY = canvas.height - padding.bottom - ((candle.close - minValue) / range) * chartHeight;
      
      const isBullish = candle.close >= candle.open;
      const color = isBullish ? '#10B981' : '#EF4444';
      
      // Draw wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // Draw body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 1;
      
      ctx.fillStyle = isBullish ? color : '#fff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      
      // Draw label with smart sizing
      if (candle.label) {
        ctx.fillStyle = '#374151';
        this.drawRotatedLabel(ctx, candle.label, x, canvas.height - padding.bottom + 15, 
          -Math.PI / 6, maxRotatedLabelWidth, {
          fontSize: 10,
          minFontSize: 7,
          align: 'right'
        });
      }
    });
    
    // Draw Y-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = minValue + (range / 5) * i;
      const y = canvas.height - padding.bottom - (chartHeight / 5) * i;
      ctx.fillText(this.formatValue(value), padding.left - 10, y + 4);
    }
  }

  // ============ SPARKLINE ============
  drawSparkline(ctx, canvas, values, options = {}) {
    canvas.height = 80;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const padding = 10;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue || 1;
    
    // Calculate points
    const points = values.map((value, index) => {
      const x = padding + (index / (values.length - 1 || 1)) * chartWidth;
      const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
      return { x, y, value };
    });
    
    // Draw area fill
    ctx.fillStyle = 'rgba(78, 90, 247, 0.2)';
    ctx.beginPath();
    ctx.moveTo(points[0].x, canvas.height - padding);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, canvas.height - padding);
    ctx.closePath();
    ctx.fill();
    
    // Draw line
    ctx.strokeStyle = options.color || '#4E5AF7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    
    // Highlight last point
    const lastPoint = points[points.length - 1];
    ctx.fillStyle = options.color || '#4E5AF7';
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw current value
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(this.formatValue(lastPoint.value), canvas.width - padding, 20);
  }

  // ============ SCATTER MAP ============
  drawScatterMap(ctx, canvas, labels, values, options = {}) {
    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Parse values as lat,lng pairs
    const points = [];
    for (let i = 0; i < values.length; i += 2) {
      if (i + 1 < values.length) {
        points.push({ 
          lat: values[i], 
          lng: values[i + 1], 
          label: labels[Math.floor(i / 2)] 
        });
      }
    }
    
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lngMin = Math.min(...lngs);
    const lngMax = Math.max(...lngs);
    
    const latRange = latMax - latMin || 1;
    const lngRange = lngMax - lngMin || 1;
    
    // Draw map background
    ctx.fillStyle = '#f0f9ff';
    ctx.fillRect(padding, padding, chartWidth, chartHeight);
    
    // Draw border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, chartWidth, chartHeight);
    
    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const x = padding + (chartWidth / 5) * i;
      const y = padding + (chartHeight / 5) * i;
      
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, canvas.height - padding);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();
    }
    
    // Draw points
    points.forEach((point, index) => {
      const x = padding + ((point.lng - lngMin) / lngRange) * chartWidth;
      const y = canvas.height - padding - ((point.lat - latMin) / latRange) * chartHeight;
      
      // Draw point shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.beginPath();
      ctx.arc(x + 2, y + 2, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw point
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw label
      if (point.label) {
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.label, x, y - 12);
      }
    });
  }

  // ============ STATS CARD ============
  drawStatsCard(ctx, canvas, labels, values) {
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cols = Math.min(labels.length, 3);
    const rows = Math.ceil(labels.length / cols);
    const cellWidth = canvas.width / cols;
    const cellHeight = canvas.height / rows;
    
    labels.forEach((label, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * cellWidth;
      const y = row * cellHeight;
      
      // Draw card background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x + 10, y + 10, cellWidth - 20, cellHeight - 20);
      
      // Draw border
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 10, y + 10, cellWidth - 20, cellHeight - 20);
      
      // Draw value
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.formatValue(values[index]), x + cellWidth / 2, y + cellHeight / 2);
      
      // Draw label
      ctx.fillStyle = '#64748b';
      ctx.font = '13px sans-serif';
      ctx.fillText(label, x + cellWidth / 2, y + cellHeight / 2 + 30);
    });
  }

  // ============ HELPER METHODS ============
  drawLegend(ctx, canvas, labels, values, colors, total) {
    const legendX = 20;
    let legendY = canvas.height - 100;
    const boxSize = 15;
    const lineHeight = 25;
    
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    
    labels.forEach((label, index) => {
      if (legendY > canvas.height - 20) return;
      
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(legendX, legendY, boxSize, boxSize);
      
      const percentage = ((values[index] / total) * 100).toFixed(1);
      ctx.fillStyle = '#1f2937';
      ctx.fillText(`${label}: ${this.formatValue(values[index])} (${percentage}%)`, 
                   legendX + boxSize + 8, legendY + boxSize - 2);
      
      legendY += lineHeight;
    });
  }

  formatValue(value) {
    if (typeof value !== 'number') return value;
    
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (value % 1 !== 0) {
      return value.toFixed(2);
    }
    
    return value.toString();
  }

  lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255))
      .toString(16).slice(1);
  }

  addAlpha(color, alpha) {
    const num = parseInt(color.replace('#', ''), 16);
    const R = num >> 16;
    const G = num >> 8 & 0x00FF;
    const B = num & 0x0000FF;
    return `rgba(${R}, ${G}, ${B}, ${alpha})`;
  }

  renderAllCharts(container) {
    if (!container) return;
    
    const contentDivs = container.querySelectorAll('.message-content');
    contentDivs.forEach(contentDiv => {
      this.renderCharts(contentDiv);
    });
  }
}