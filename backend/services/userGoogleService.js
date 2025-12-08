// backend/services/userGoogleService.js
import { google } from 'googleapis';
import { pool } from '../config/database.js';

export class UserGoogleService {
    
    /**
     * Exchanges auth code for tokens and saves them to the database.
     * This was the missing method causing your error.
     */
    static async connectUser(userEmail, code) {
        try {
            console.log(`🔄 Exchanging code for tokens for: ${userEmail}`);
            
            // Initialize OAuth2 client
            // IMPORTANT: 'postmessage' is required for the redirect_uri when using the frontend popup flow
            const auth = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                'postmessage' 
            );

            // Exchange the authorization code for tokens
            const { tokens } = await auth.getToken(code);
            
            // Store tokens in the database linked to the employee
            // We store it as a JSON string
            await pool.execute(
                "UPDATE employees SET google_tokens = ? WHERE email = ?", 
                [JSON.stringify(tokens), userEmail]
            );
            
            console.log(`✅ Tokens stored successfully for ${userEmail}`);
            return tokens;
        } catch (error) {
            console.error('❌ Token Exchange Error:', error);
            throw new Error('Failed to verify Google account: ' + error.message);
        }
    }

    static async getAuth(userEmail) {
        try {
            const [users] = await pool.execute(
                "SELECT google_tokens FROM employees WHERE email = ?", 
                [userEmail]
            );
            
            if (users.length === 0 || !users[0].google_tokens) {
                throw new Error('Google account not connected');
            }

            const tokens = typeof users[0].google_tokens === 'string' 
                ? JSON.parse(users[0].google_tokens) 
                : users[0].google_tokens;

            const auth = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            
            auth.setCredentials(tokens);
            return auth;
        } catch (error) {
            console.error('Auth error:', error);
            throw new Error('Failed to authenticate with Google: ' + error.message);
        }
    }

    // Convert to Philippines Time (Asia/Manila)
    static convertToPhilippinesTime(dateTimeStr) {
        try {
            // Handle various date formats
            let date = new Date(dateTimeStr);
            
            // If it's a valid date, convert to Philippines time
            if (!isNaN(date.getTime())) {
                return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
            }
            
            // Try parsing common formats
            const phTime = new Date(dateTimeStr + ' Asia/Manila');
            if (!isNaN(phTime.getTime())) {
                return phTime;
            }
            
            throw new Error(`Invalid date format: ${dateTimeStr}. Use ISO format (YYYY-MM-DDTHH:mm:ss) or specify timezone.`);
        } catch (error) {
            throw new Error(`Date conversion failed: ${error.message}`);
        }
    }

    static formatPhilippinesTime(date) {
        return date.toLocaleString("en-PH", {
            timeZone: "Asia/Manila",
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'long'
        });
    }

    // List events with Philippines time
    static async listEvents(userEmail, timeMin = null, maxResults = 10) {
        try {
            const auth = await this.getAuth(userEmail);
            const calendar = google.calendar({ version: 'v3', auth });

            const now = new Date();
            const phTimeMin = timeMin ? this.convertToPhilippinesTime(timeMin) : now;
            
            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin: phTimeMin.toISOString(),
                maxResults: maxResults,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items.map(event => ({
                id: event.id,
                summary: event.summary,
                description: event.description,
                start: event.start.dateTime 
                    ? this.formatPhilippinesTime(new Date(event.start.dateTime))
                    : event.start.date,
                end: event.end.dateTime 
                    ? this.formatPhilippinesTime(new Date(event.end.dateTime))
                    : event.end.date,
                attendees: event.attendees ? event.attendees.map(a => a.email) : [],
                location: event.location,
                status: event.status,
                hangoutLink: event.hangoutLink,
                created: event.created ? this.formatPhilippinesTime(new Date(event.created)) : null,
                organizer: event.organizer ? event.organizer.email : null
            }));

            return events;
        } catch (error) {
            console.error('Calendar list error:', error);
            throw new Error(`Failed to list events: ${error.message}`);
        }
    }

    // Create event with Philippines time
    static async createEvent(userEmail, eventData) {
        try {
            const auth = await this.getAuth(userEmail);
            const calendar = google.calendar({ version: 'v3', auth });

            const event = {
                summary: eventData.summary,
                location: eventData.location,
                description: eventData.description,
                start: {
                    dateTime: eventData.startTime,
                    timeZone: 'Asia/Manila',
                },
                end: {
                    dateTime: eventData.endTime,
                    timeZone: 'Asia/Manila',
                },
                attendees: eventData.attendees.map(email => ({ email })),
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 10 },
                    ],
                },
            };

            const response = await calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                sendUpdates: 'all',
            });

            return {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink,
                hangoutLink: response.data.hangoutLink,
                created: this.formatPhilippinesTime(new Date(response.data.created)),
                message: `Event created successfully for ${this.formatPhilippinesTime(new Date(eventData.startTime))}`
            };
        } catch (error) {
            console.error('Calendar create error:', error);
            throw new Error(`Failed to create event: ${error.message}`);
        }
    }

    // Cancel event
    static async cancelEvent(userEmail, eventId, reason = "Cancelled by user request") {
        try {
            const auth = await this.getAuth(userEmail);
            const calendar = google.calendar({ version: 'v3', auth });

            const response = await calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
                sendUpdates: 'all',
            });

            return {
                success: true,
                eventId: eventId,
                message: `Event cancelled successfully. Reason: ${reason}`
            };
        } catch (error) {
            console.error('Calendar cancel error:', error);
            throw new Error(`Failed to cancel event: ${error.message}`);
        }
    }

    // Update event
    static async updateEvent(userEmail, eventId, updates) {
        try {
            const auth = await this.getAuth(userEmail);
            const calendar = google.calendar({ version: 'v3', auth });

            // Get current event first
            const currentEvent = await calendar.events.get({
                calendarId: 'primary',
                eventId: eventId,
            });

            const event = {
                ...currentEvent.data,
                summary: updates.summary || currentEvent.data.summary,
                location: updates.location || currentEvent.data.location,
                description: updates.description || currentEvent.data.description,
                attendees: updates.attendees ? updates.attendees.map(email => ({ email })) : currentEvent.data.attendees,
            };

            // Update time if provided
            if (updates.startTime) {
                event.start = {
                    dateTime: updates.startTime,
                    timeZone: 'Asia/Manila',
                };
            }

            if (updates.endTime) {
                event.end = {
                    dateTime: updates.endTime,
                    timeZone: 'Asia/Manila',
                };
            }

            const response = await calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                resource: event,
                sendUpdates: 'all',
            });

            return {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink,
                updated: this.formatPhilippinesTime(new Date(response.data.updated)),
                message: `Event updated successfully`
            };
        } catch (error) {
            console.error('Calendar update error:', error);
            throw new Error(`Failed to update event: ${error.message}`);
        }
    }

    // Search events by criteria
    static async searchEvents(userEmail, query, maxResults = 10) {
        try {
            const auth = await this.getAuth(userEmail);
            const calendar = google.calendar({ version: 'v3', auth });

            const response = await calendar.events.list({
                calendarId: 'primary',
                q: query,
                maxResults: maxResults,
                singleEvents: true,
                orderBy: 'startTime',
            });

            return response.data.items.map(event => ({
                id: event.id,
                summary: event.summary,
                start: event.start.dateTime 
                    ? this.formatPhilippinesTime(new Date(event.start.dateTime))
                    : event.start.date,
                end: event.end.dateTime 
                    ? this.formatPhilippinesTime(new Date(event.end.dateTime))
                    : event.end.date,
            }));
        } catch (error) {
            console.error('Calendar search error:', error);
            throw new Error(`Failed to search events: ${error.message}`);
        }
    }

    // Gmail Methods (existing - keep these)
    static async listEmails(userEmail, maxResults = 10, query = '') {
        try {
            const auth = await this.getAuth(userEmail);
            const gmail = google.gmail({ version: 'v1', auth });

            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: maxResults,
                q: query
            });

            const messages = response.data.messages || [];
            const emailDetails = [];

            for (const message of messages) {
                const email = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'metadata',
                    metadataHeaders: ['Subject', 'From', 'Date']
                });

                const headers = email.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
                const date = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';

                emailDetails.push({
                    id: message.id,
                    subject: subject,
                    from: from,
                    date: date,
                    snippet: email.data.snippet
                });
            }

            return emailDetails;
        } catch (error) {
            console.error('Gmail list error:', error);
            throw new Error(`Failed to list emails: ${error.message}`);
        }
    }

    static async getEmailContent(userEmail, messageId) {
        try {
            const auth = await this.getAuth(userEmail);
            const gmail = google.gmail({ version: 'v1', auth });

            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            const headers = response.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
            const date = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';

            // Extract email body
            let body = '';
            if (response.data.payload.parts) {
                const textPart = response.data.payload.parts.find(part => part.mimeType === 'text/plain');
                if (textPart && textPart.body && textPart.body.data) {
                    body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
                }
            } else if (response.data.payload.body && response.data.payload.body.data) {
                body = Buffer.from(response.data.payload.body.data, 'base64').toString('utf-8');
            }

            return {
                id: messageId,
                subject: subject,
                from: from,
                date: date,
                body: body,
                snippet: response.data.snippet
            };
        } catch (error) {
            console.error('Gmail read error:', error);
            throw new Error(`Failed to read email: ${error.message}`);
        }
    }

    static async sendEmail(userEmail, to, subject, body) {
        try {
            const auth = await this.getAuth(userEmail);
            const gmail = google.gmail({ version: 'v1', auth });

            const message = [
                `To: ${to}`,
                `Subject: ${subject}`,
                '',
                body
            ].join('\n');

            const encodedMessage = Buffer.from(message)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            return {
                success: true,
                messageId: response.data.id,
                threadId: response.data.threadId
            };
        } catch (error) {
            console.error('Gmail send error:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }
}