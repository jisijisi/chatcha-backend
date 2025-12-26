// frontend/assets/js/charts.js

let charts = {};

export function initCharts() {
  const msgCtx = document.getElementById('messagesChart').getContext('2d');
  charts.messagesChart = new Chart(msgCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Messages', data: [], borderColor: '#EF4444', backgroundColor: null, fill: true, tension: 0.4, pointRadius: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { tooltip: { enabled: true } },
      scales: { x: { display: false }, y: { grid: { drawBorder: false } } },
      elements: { line: { borderWidth: 2 } },
      animation: { duration: 800 }
    }
  });

  const activeCtx = document.getElementById('activeUsersChart').getContext('2d');
  charts.activeUsersChart = new Chart(activeCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Active Users', data: [], borderColor: '#3B82F6', fill: false, tension: 0.4, pointRadius: 0 }] },
    options: { responsive:true, maintainAspectRatio:false, animation:{duration:800}, scales:{x:{display:false}} }
  });

  const catCtx = document.getElementById('categoriesChart').getContext('2d');
  charts.categoriesChart = new Chart(catCtx, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: ['#EF4444','#3B82F6','#10B981','#F59E0B','#8B5CF6','#14B8A6'] }] },
    options: { cutout: '60%', responsive:true, plugins:{legend:{display:false}}, animation:{duration:800} }
  });

  const subCtx = document.getElementById('subcategoriesChart').getContext('2d');
  charts.subcategoriesChart = new Chart(subCtx, {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: { indexAxis: 'y', responsive:true, maintainAspectRatio:false, scales:{x:{display:true}, y:{ticks:{color:'#0F172A'}}}, plugins:{legend:{display:false}}, animation:{duration:800} }
  });
}

export function updateMessagesChart(labels, values){
  const chart = charts.messagesChart;
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  // gradient fill
  const ctx = chart.ctx;
  const gradient = ctx.createLinearGradient(0,0,0,chart.height);
  gradient.addColorStop(0, 'rgba(239,68,68,0.4)');
  gradient.addColorStop(1, 'rgba(239,68,68,0.03)');
  chart.data.datasets[0].backgroundColor = gradient;
  chart.update();
}

export function updateActiveUsersChart(labels, values){
  const chart = charts.activeUsersChart;
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.update();
}

export function updateCategoriesChart(labels, values){
  const chart = charts.categoriesChart;
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.update();
}

export function updateSubcategoriesChart(categories){
  const chart = charts.subcategoriesChart;
  if (!chart) return;
  chart.data.labels = categories.map(c=>c.name);
  chart.data.datasets[0].data = categories.map(c=>c.value);
  // create gradient per bar from dark to light
  const baseColor = [99,102,241];
  chart.data.datasets[0].backgroundColor = categories.map((c,i)=>`rgba(${baseColor.join(',')},${0.9 - (i * 0.05)})`);
  chart.update();
}

export default charts;
