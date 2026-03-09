import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000'; // Adjust port if needed

async function testSecurityFix() {
    console.log("🔒 Security Vulnerability Test: Bypass Authentication\n");

    // 1. Try to access chat history with just the header (The old vulnerability)
    console.log("TEST 1: Attempting to access chats with ONLY X-User-Email header...");
    try {
        const response = await fetch(`${API_URL}/chats/load`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Email': 'ceo@company.com' // Malicious attempt
            }
        });

        if (response.status === 401 || response.status === 403) {
            console.log(`✅ PASSED: Request rejected with status ${response.status}`);
            const data = await response.json();
            console.log(`   Server Message: ${data.error}`);
        } else {
            console.log(`❌ FAILED: Request accepted with status ${response.status}`);
            console.log("   CRITICAL: The vulnerability still exists!");
        }
    } catch (error) {
        console.log(`⚠️ Connection Error: ${error.message}`);
    }

    console.log("\n--------------------------------------------------\n");

    // 2. Try to access with a fake/invalid token
    console.log("TEST 2: Attempting to access with INVALID token...");
    try {
        const response = await fetch(`${API_URL}/chats/load`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Email': 'ceo@company.com',
                'Authorization': 'Bearer invalid_fake_token_123'
            }
        });

        if (response.status === 403) {
            console.log(`✅ PASSED: Request rejected with status ${response.status}`);
            const data = await response.json();
            console.log(`   Server Message: ${data.error}`);
        } else if (response.status === 401) {
             console.log(`✅ PASSED: Request rejected with status ${response.status}`);
        } else {
            console.log(`❌ FAILED: Request accepted with status ${response.status}`);
        }
    } catch (error) {
        console.log(`⚠️ Connection Error: ${error.message}`);
    }
}

testSecurityFix();
