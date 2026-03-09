
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function checkToken() {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SENDER_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SENDER_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_SENDER_REFRESH_TOKEN;
        
        console.log("Checking credentials...");
        if (!clientId) console.error("Missing Client ID");
        if (!clientSecret) console.error("Missing Client Secret");
        if (!refreshToken) console.error("Missing Refresh Token");
        
        if (!clientId || !clientSecret || !refreshToken) {
            return;
        }

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        console.log("Refreshing access token...");
        const res = await oauth2Client.getAccessToken();
        if (res.token) {
            console.log("✅ Token Valid! Access Token obtained.");
        } else {
            console.error("❌ Failed to get access token (no token in response)");
        }
    } catch (error) {
        console.error("❌ Token Error:", error.message);
        if (error.response) {
            console.error("Details:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

checkToken();
