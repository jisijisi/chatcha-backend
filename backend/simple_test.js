
import { google } from 'googleapis';
console.log('Google API loaded successfully');
console.log('Env var check:', process.env.GOOGLE_SENDER_EMAIL);
import "dotenv/config";
console.log('Env var after dotenv:', process.env.GOOGLE_SENDER_EMAIL);
