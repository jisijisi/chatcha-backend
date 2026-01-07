#!/usr/bin/env node
// Simple warmup ping script. Usage: NODE_ENV=production WARMUP_URL="https://app.example/warmup" node warmup-ping.js
const url = process.env.WARMUP_URL || process.argv[2] || 'http://localhost:3000/warmup';
const timeout = parseInt(process.env.WARMUP_TIMEOUT || '10000', 10);

async function ping() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      console.error(`WARMUP: non-OK response ${res.status} from ${url}`);
      process.exitCode = 2;
      return;
    }
    const data = await res.text();
    console.log(`WARMUP OK: ${url} -> ${data.slice(0, 200)}`);
  } catch (err) {
    console.error('WARMUP ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

ping();
