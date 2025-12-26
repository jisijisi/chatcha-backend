// frontend/assets/js/admin-login.js

// Configuration
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocal 
  ? 'http://localhost:3000' 
  : window.location.origin; // This assumes prod backend is at same origin

console.log(`[AdminLogin] API_BASE set to: ${API_BASE}`);

// Check if already logged in
const session = localStorage.getItem('chatcdo_admin_session');
if (session) {
  window.location.href = 'admin.html';
}

// Form submission
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('adminEmail').value;
  const password = document.getElementById('adminPassword').value;
  const submitBtn = document.getElementById('submitBtn');
  const errorMessage = document.getElementById('errorMessage');
  
  errorMessage.classList.remove('show');
  
  if (!email || !password) {
    showError('Please fill in all fields');
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';
  
  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      // Success - store session
      localStorage.setItem('chatcdo_admin_session', JSON.stringify(data.session));
      
      // Redirect to admin panel
      window.location.href = 'admin.html';
    } else {
      showError(data.message || 'Login failed');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
    
  } catch (error) {
    console.error('Login error:', error);
    showError('Connection error. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});

// Show error message
function showError(message) {
  const errorMessage = document.getElementById('errorMessage');
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
  
  setTimeout(() => {
    errorMessage.classList.remove('show');
  }, 5000);
}

// Toggle password visibility
// We attach it to window so the inline HTML onclick can find it
window.togglePassword = function() {
  const passwordInput = document.getElementById('adminPassword');
  const toggleBtn = event.target;
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.textContent = '🙈';
  } else {
    passwordInput.type = 'password';
    toggleBtn.textContent = '👁️';
  }
}

// Enter key support
document.querySelectorAll('.form-control').forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('adminLoginForm').dispatchEvent(new Event('submit'));
    }
  });
});