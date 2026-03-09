
import { google } from 'googleapis';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

async function getNewRefreshToken() {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SENDER_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SENDER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
        return;
    }

    const oAuth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost:3000/auth/google/callback' // Ensure this matches your Redirect URI in Google Console
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force refresh token generation
    });

    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter the code from that page here: ', async (code) => {
        rl.close();
        try {
            const { tokens } = await oAuth2Client.getToken(code);
            console.log('\n✅ Successfully retrieved tokens!');
            console.log('Update your .env file with this Refresh Token:');
            console.log(`GOOGLE_SENDER_REFRESH_TOKEN=${tokens.refresh_token}`);
        } catch (err) {
            console.error('Error retrieving access token', err);
        }
    });
}

getNewRefreshToken();
