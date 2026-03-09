
import http from 'http';
import fs from 'fs';

const data = JSON.stringify({
  email: 'test@example.com'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/request-otp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log('Response:', body);
    fs.writeFileSync('backend/otp_response.json', body);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
  fs.writeFileSync('backend/otp_response.json', JSON.stringify({ error: error.message }));
});

req.write(data);
req.end();
