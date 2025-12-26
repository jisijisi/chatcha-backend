// backend/controllers/dashboardController.js

export const getStats = (req, res) => {
  const period = req.query.period || 'overall';
  const data = {
    overall: { messages: 128430, activeUsers: 8421, newSessions: 4920, totalEmployees: 421 },
    yearly: { messages: 32430, activeUsers: 4200, newSessions: 1200, totalEmployees: 421 },
    monthly: { messages: 8420, activeUsers: 2200, newSessions: 420, totalEmployees: 421 },
    daily: { messages: 420, activeUsers: 320, newSessions: 120, totalEmployees: 421 }
  };
  res.json(data[period] || data.overall);
};

export const getMessages = (req, res) => {
  const period = req.query.period || 'overall';
  // Mock timeseries — length and labels vary by period
  const labels = [];
  const values = [];
  const now = Date.now();
  let points = 30;
  if (period === 'daily') points = 24;
  if (period === 'monthly') points = 30;
  if (period === 'yearly') points = 12;
  for (let i = 0; i < points; i++) {
    labels.push(`T-${points - i}`);
    values.push(Math.floor(100 + Math.random() * 900));
  }
  res.json({ labels, values });
};

export const getUsers = (req, res) => {
  const labels = [];
  const values = [];
  const points = 12;
  for (let i = 0; i < points; i++) {
    labels.push(`M-${i + 1}`);
    values.push(Math.floor(100 + Math.random() * 1000));
  }
  res.json({ labels, values });
};

export const getCategories = (req, res) => {
  const labels = ['Sales', 'Support', 'HR', 'Engineering', 'Legal', 'Marketing'];
  const values = [4200, 3200, 2100, 1800, 900, 600];
  const total = values.reduce((a, b) => a + b, 0);
  res.json({ labels, values, total });
};

export const getDocuments = (req, res) => {
  const docs = [
    { id: 'doc-1', name: 'Employee Handbook', accesses: 1420 },
    { id: 'doc-2', name: 'Sales Playbook', accesses: 1120 },
    { id: 'doc-3', name: 'API Integration Guide', accesses: 980 },
    { id: 'doc-4', name: 'Onboarding Checklist', accesses: 400 }
  ];
  res.json({ top: docs.slice(0, 3), all: docs });
};

export const getSubcategories = (req, res) => {
  const categories = [];
  for (let i = 1; i <= 10; i++) {
    categories.push({ name: `Category ${i}`, value: Math.floor(1000 - i * 60 + Math.random() * 80) });
  }
  res.json({ categories });
};

export const getActivity = (req, res) => {
  const now = Date.now();
  const items = [];
  const names = ['Alice Johnson', 'Bob Smith', 'Carla Diaz', 'Daniel Lee', 'Eva Patel'];
  for (let i = 0; i < 8; i++) {
    items.push({
      id: `act-${i}`,
      user: names[i % names.length],
      email: `${names[i % names.length].toLowerCase().replace(/\s+/g, '.')}@example.com`,
      message: `Sample message content #${i + 1} — lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      timestamp: new Date(now - Math.floor(Math.random() * 1000 * 60 * 60 * 24)).toISOString()
    });
  }
  res.json({ items });
};

export const getActiveUsers = (req, res) => {
  const users = [
    { name: 'Alice Johnson', email: 'alice.johnson@example.com', messages: 420 },
    { name: 'Bob Smith', email: 'bob.smith@example.com', messages: 380 },
    { name: 'Carla Diaz', email: 'carla.diaz@example.com', messages: 340 },
    { name: 'Daniel Lee', email: 'daniel.lee@example.com', messages: 300 },
    { name: 'Eva Patel', email: 'eva.patel@example.com', messages: 260 },
    { name: 'Frank Wu', email: 'frank.wu@example.com', messages: 220 }
  ];
  res.json({ users });
};
