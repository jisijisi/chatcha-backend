
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SystemEmailService } from "../services/systemEmailService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testEmail() {
    console.log("Starting test...");
    console.log("GOOGLE_SENDER_EMAIL:", process.env.GOOGLE_SENDER_EMAIL);
    
    if (!process.env.GOOGLE_SENDER_EMAIL) {
        console.error("Missing GOOGLE_SENDER_EMAIL in env");
        return;
    }

    try {
        console.log("Testing email sending...");
        const recipient = process.env.GOOGLE_SENDER_EMAIL; // Send to self for testing
        console.log(`Sending to ${recipient}...`);
        
        const result = await SystemEmailService.sendOtpEmail(recipient, "123456", 10);
        console.log("Email sent successfully:", result);
    } catch (error) {
        console.error("Failed to send email:", error);
        if (error.response) {
            console.error("Error response data:", error.response.data);
        }
        // Print full error object for debugging
        console.dir(error, { depth: null });
    }
}

testEmail();
