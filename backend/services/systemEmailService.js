import { google } from 'googleapis';

export class SystemEmailService {
    static getOAuthClient() {
        const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SENDER_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SENDER_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_SENDER_REFRESH_TOKEN;
        const senderEmail = process.env.GOOGLE_SENDER_EMAIL;

        if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
            throw new Error('Missing Gmail OAuth configuration: set GOOGLE_SENDER_EMAIL, GOOGLE_SENDER_REFRESH_TOKEN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or their SENDER_ variants)');
        }

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        return { oauth2Client, senderEmail };
    }

    static async sendEmail(to, subject, body) {
        const { oauth2Client, senderEmail } = this.getOAuthClient();
        const senderName = process.env.GOOGLE_SENDER_NAME || 'ChatCDO';
        const replyTo = process.env.GOOGLE_REPLY_TO || senderEmail;
        const fromHeader = senderName ? `${senderName} <${senderEmail}>` : senderEmail;
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const lines = [
            `From: ${fromHeader}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            `Reply-To: ${replyTo}`,
            '',
            body
        ];

        const raw = Buffer.from(lines.join('\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw }
        });

        return { success: true };
    }
    
    static async sendEmailHtml(to, subject, htmlBody) {
        const { oauth2Client, senderEmail } = this.getOAuthClient();
        const senderName = process.env.GOOGLE_SENDER_NAME || 'ChatCDO';
        const replyTo = process.env.GOOGLE_REPLY_TO || senderEmail;
        const fromHeader = senderName ? `${senderName} <${senderEmail}>` : senderEmail;
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        const lines = [
            `From: ${fromHeader}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset="UTF-8"',
            `Reply-To: ${replyTo}`,
            '',
            htmlBody
        ];
        
        const raw = Buffer.from(lines.join('\n'))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw }
        });
        
        return { success: true };
    }

    static async sendOtpEmail(to, code, expiresMinutes = 5) {
        const subject = 'ChatCDO Login One-Time Verification Code';
        const html = `
<p><strong>LOGIN VERIFICATION</strong></p>
<p>Your verification code is:&nbsp;<br><br><strong><span style="color: rgb(209, 72, 65); font-size: 20px;">${code}</span></strong><br><br>⏳ This code will remain valid for&nbsp;<strong>${expiresMinutes} minutes</strong>.<br>⚠️ For your security, please do not share this code with anyone.</p>
<p>If you do not recognize this login attempt, we recommend <span style="color: rgb(209, 72, 65);">resetting your password</span> immediately and <span style="color: rgb(209, 72, 65);">contacting our support team</span>.</p>
<p><em>This is an automated message—please do not reply.</em></p>
        `.trim();
        return this.sendEmailHtml(to, subject, html);
    }
}
