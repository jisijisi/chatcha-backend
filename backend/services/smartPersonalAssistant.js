// backend/services/smartPersonalAssistant.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { UserGoogleService } from './userGoogleService.js';
import { ToolService } from './toolService.js';
import { IntentService } from './intentService.js';
import { pool } from '../config/database.js'; // Ensure database access

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// In-memory store for session states (Use Redis in production)
const userSessions = new Map();

export class SmartPersonalAssistant {
    
    // Session structure
    static SESSION_STRUCTURE = {
        userId: null,
        createdAt: null,
        pendingAction: null,
        extractedData: {},
        conversationPath: [],
        lastInteraction: null,
        lastToolData: null,
        confidenceScore: 0.8
    };
    
    // 🔥 NEW: Helper to get active model from DB
    static async getActiveModel() {
        try {
            const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
            return settings.length > 0 ? settings[0].ai_model : "gemini-2.0-flash-exp";
        } catch (e) {
            console.warn("Using default model in Smart Assistant (DB error):", e.message);
            return "gemini-2.0-flash-exp";
        }
    }

    /**
     * Main entry point - Process user request with LLM intelligence
     */
    static async processRequest(userEmail, prompt, conversationHistory = []) {
        try {
            console.log(`🧠 Smart Assistant processing request from ${userEmail}: "${prompt}"`);
            
            // 1. Get or create session
            let session = userSessions.get(userEmail) || this.createNewSession(userEmail);
            
            // 2. Get current calendar and email context
            const userContext = await this.gatherUserContext(userEmail);
            
            // 3. Analyze the request with LLM
            const analysis = await this.analyzeRequestWithLLM(
                userEmail,
                prompt,
                conversationHistory,
                session,
                userContext
            );
            
            // 4. Update session with analysis
            session = this.updateSession(session, analysis, prompt);
            userSessions.set(userEmail, session);
            
            // 5. Decide and execute action
            const result = await this.executeBasedOnAnalysis(
                userEmail,
                analysis,
                session,
                userContext
            );
            
            // 6. Update session after execution
            if (result.nextSessionState) {
                session = { ...session, ...result.nextSessionState };
                userSessions.set(userEmail, session);
            }
            
            // 7. Clean up completed sessions
            if (result.status === 'COMPLETED' || result.status === 'CANCELLED') {
                userSessions.delete(userEmail);
            }
            
            return {
                ...result,
                sessionId: session.sessionId
            };
            
        } catch (error) {
            console.error("❌ Smart Assistant error:", error);
            return this.createFallbackResponse(prompt, error);
        }
    }
    
    /**
     * Create a new user session
     */
    static createNewSession(userEmail) {
        return {
            ...this.SESSION_STRUCTURE,
            sessionId: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: userEmail,
            createdAt: new Date().toISOString(),
            conversationPath: [],
            extractedData: {} // Ensure this is initialized
        };
    }
    
    /**
     * Gather comprehensive user context
     */
    static async gatherUserContext(userEmail) {
        try {
            const context = {
                calendar: { upcomingEvents: [], nextEvent: null },
                emails: { recentEmails: [], unreadCount: 0 },
                time: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
                availability: 'unknown'
            };
            
            // Get calendar events
            try {
                const events = await UserGoogleService.listEvents(userEmail, null, 15);
                context.calendar.upcomingEvents = events;
                context.calendar.nextEvent = events.length > 0 ? events[0] : null;
                
                // Check for conflicts in next 2 hours
                const now = new Date();
                const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                const upcomingEvents = events.filter(event => {
                    const eventTime = new Date(event.start);
                    return eventTime >= now && eventTime <= twoHoursLater;
                });
                context.calendar.busyNextTwoHours = upcomingEvents.length > 0;
            } catch (calendarError) {
                console.warn("⚠️ Could not fetch calendar:", calendarError.message);
            }
            
            // Get email info
            try {
                const emails = await UserGoogleService.listEmails(userEmail, 10, 'in:inbox');
                context.emails.recentEmails = emails;
                context.emails.unreadCount = emails.filter(e => !e.labelIds?.includes('READ')).length;
            } catch (emailError) {
                console.warn("⚠️ Could not fetch emails:", emailError.message);
            }
            
            return context;
        } catch (error) {
            console.error("❌ Error gathering user context:", error);
            return { calendar: { upcomingEvents: [] }, emails: { recentEmails: [] } };
        }
    }
    
    /**
     * LLM analyzes the user request with full context
     */
    static async analyzeRequestWithLLM(userEmail, prompt, history, session, userContext) {
        // 🔥 USE DYNAMIC MODEL
        const activeModel = await this.getActiveModel();
        
        const model = genAI.getGenerativeModel({ 
            model: activeModel,
            generationConfig: { 
                responseMimeType: "application/json",
                temperature: 0.2
            }
        });
        
        // Format conversation history
        const formattedHistory = history.slice(-5).map((turn, idx) => 
            `Turn ${idx + 1}: User: "${turn.question}" | Assistant: "${turn.answer?.substring(0, 100)}..."`
        ).join('\n');
        
        // Get available tools
        const availableTools = await ToolService.getAvailableTools(userEmail, 'PERSONAL_ACTION');
        const toolDescriptions = availableTools[0]?.function_declarations?.map(tool => ({
            name: tool.name,
            purpose: tool.description.substring(0, 150),
            parameters: Object.keys(tool.parameters?.properties || {})
        })) || [];
        
        // Format Recent Tool Data for Context
        let lastToolContext = "None";
        if (session.lastToolData) {
            // Truncate to avoid token limits, focus on key fields
            const dataPreview = JSON.stringify(session.lastToolData).substring(0, 3000); 
            lastToolContext = `Previous Tool Output (${session.lastToolData.source}): ${dataPreview}`;
        }

        const promptText = `
        # SMART PERSONAL ASSISTANT ANALYSIS
        
        ## USER CONTEXT:
        - Current Time (Philippines): ${userContext.time}
        - Next Calendar Event: ${userContext.calendar.nextEvent ? `${userContext.calendar.nextEvent.summary} at ${userContext.calendar.nextEvent.start}` : 'None'}
        - Recent Emails: ${userContext.emails.recentEmails.length} emails in inbox
        - Busy Next 2 Hours: ${userContext.calendar.busyNextTwoHours ? 'Yes' : 'No'}
        
        ## RECENT TOOL DATA (MEMORY):
        ${lastToolContext}
        
        ## CURRENT SESSION STATE:
        ${JSON.stringify(session, null, 2)}
        
        ## CONVERSATION HISTORY:
        ${formattedHistory || 'No recent history'}
        
        ## USER'S NEW REQUEST:
        "${prompt}"
        
        ## AVAILABLE TOOLS:
        ${JSON.stringify(toolDescriptions, null, 2)}
        
        ## YOUR TASKS:

        **STRICT LANGUAGE RULE:**
        - **Scenario 1 (Full English):** If the user speaks in full English, you MUST respond in full English.
        - **Scenario 2 (Full Tagalog):** If the user speaks in full Tagalog, you MUST respond in full Tagalog (use correct Tagalog grammar, avoid English terms as much as possible).
          - **CRITICAL EXCEPTION:** Do NOT translate Proper Nouns (Names of People, Companies, Products, Places). Keep them as they appear in the source.
        - **Scenario 3 (Taglish):** If the user speaks in Taglish, you MUST respond in "Conyo Taglish" (a natural mix of English and Tagalog).
        - EXCEPTION: If the user explicitly asks to respond in a specific language, you MUST follow that instruction.
        
        1. **CHECK MEMORY FIRST**: 
           - Does the "RECENT TOOL DATA" above contain the answer to the user's question? 
           - (e.g., if user asks "who is attending?" and the previous calendar list has 'attendees', USE IT).
           - **IF YES:** Set "recommended_action" to "respond_only" and provide the answer in "natural_response". DO NOT call the tool again.
        
        2. **UNDERSTAND INTENT**: What does the user want to accomplish?
           - schedule: Create new meeting/event
           - view: Look at calendar/emails
           - modify: Update existing event
           - cancel: Delete event
           - check: Get status/info
           - send: Send email/message
           - clarify: Provide more info
           - confirm: Approve action
           - reject: Cancel action
        
        3. **EXTRACT DETAILS**: Pull out specific information:
           - Times/dates (convert to ISO format: YYYY-MM-DDTHH:mm:ss)
           - People (extract emails)
           - Topics/titles
           - Durations
           - Urgency level
           - References to previous events
        
        4. **ASSESS COMPLETENESS**: What information is missing?
           - For scheduling: Need time, attendees, topic
           - For modification: Need which event, what changes
           - For viewing: Need timeframe, filters
        
        5. **DETERMINE NEXT ACTION**:
           - If answer is in MEMORY → respond_only
           - If complete → Execute tool
           - If incomplete → Ask for missing info
           - If ambiguous → Ask clarifying question
           - If confirmation needed → Summarize and ask for confirmation
        
        ## OUTPUT FORMAT (JSON):
        {
            "intent": "schedule|view|modify|cancel|check|send|clarify|confirm|reject",
            "confidence": 0.0-1.0,
            "extracted_details": {
                "summary": "string or null",
                "start_time": "ISO string or null",
                "end_time": "ISO string or null",
                "attendees": ["email1@example.com"],
                "duration_minutes": number or null,
                "event_reference": "string or null",
                "email_recipient": "string or null",
                "email_subject": "string or null",
                "search_query": "string or null"
            },
            "missing_information": ["field1", "field2"],
            "ambiguous_aspects": ["aspect1", "aspect2"],
            "recommended_action": "execute_tool|ask_for_info|clarify|confirm_summary|respond_only",
            "suggested_tool": "tool_name or null",
            "tool_parameters": {},
            "natural_response": "How to respond to user conversationally",
            "reasoning": "Brief explanation of analysis"
        }
        `;
        
        try {
            const result = await model.generateContent(promptText);
            const responseText = result.response.text();
            
            // Clean JSON response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
            
            const analysis = JSON.parse(jsonStr);
            
            // Validate and enhance analysis
            return {
                ...analysis,
                timestamp: new Date().toISOString(),
                rawPrompt: prompt,
                hasCalendarConflict: this.checkForConflicts(analysis, userContext)
            };
            
        } catch (error) {
            console.error("❌ LLM analysis failed:", error);
            return this.createDefaultAnalysis(prompt);
        }
    }
    
    /**
     * Update session based on analysis
     */
    static updateSession(session, analysis, prompt) {
        const updatedSession = { ...session };
        
        updatedSession.lastInteraction = new Date().toISOString();
        updatedSession.conversationPath.push({
            timestamp: new Date().toISOString(),
            prompt: prompt,
            intent: analysis.intent,
            confidence: analysis.confidence
        });
        
        // Update extracted data
        if (analysis.extracted_details) {
            Object.entries(analysis.extracted_details).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    updatedSession.extractedData[key] = value;
                }
            });
        }
        
        // Set pending action if needed
        if (analysis.recommended_action === 'execute_tool' && analysis.confidence > 0.7) {
            updatedSession.pendingAction = {
                tool: analysis.suggested_tool,
                parameters: analysis.tool_parameters,
                requiresConfirmation: analysis.confidence < 0.9
            };
        }
        
        return updatedSession;
    }
    
    /**
     * Execute action based on LLM analysis
     */
    static async executeBasedOnAnalysis(userEmail, analysis, session, userContext) {
        switch (analysis.recommended_action) {
            case 'execute_tool':
                return await this.executeTool(userEmail, analysis, session);
                
            case 'ask_for_info':
                return this.askForInformation(analysis, session);
                
            case 'clarify':
                return this.askForClarification(analysis, session);
                
            case 'confirm_summary':
                return this.requestConfirmation(analysis, session, userContext);
                
            case 'respond_only':
                return this.respondOnly(analysis, session);
                
            default:
                return this.handleUnknownAction(analysis);
        }
    }
    
    /**
     * Execute a tool with LLM-determined parameters
     */
    static async executeTool(userEmail, analysis, session) {
        try {
            console.log(`🛠️ Executing tool: ${analysis.suggested_tool}`, analysis.tool_parameters);
            
            // Enhance parameters with session data
            const enhancedParams = {
                ...analysis.tool_parameters,
                ...session.extractedData
            };
            
            // Clean up parameters
            Object.keys(enhancedParams).forEach(key => {
                if (enhancedParams[key] === null || enhancedParams[key] === undefined) {
                    delete enhancedParams[key];
                }
            });
            
            const toolResult = await ToolService.executeTool(
                analysis.suggested_tool,
                enhancedParams,
                userEmail
            );
            
            if (toolResult.error) {
                return {
                    status: 'ERROR',
                    response: `I tried to ${analysis.intent}, but encountered an issue: ${toolResult.error}. Could you check the details and try again?`,
                    toolUsed: analysis.suggested_tool,
                    shouldRetry: true,
                    nextSessionState: { pendingAction: null }
                };
            }
            
            // Save raw tool data to session for context memory
            const nextSessionState = { 
                pendingAction: null,
                lastSuccessfulAction: {
                    tool: analysis.suggested_tool,
                    timestamp: new Date().toISOString(),
                    result: 'success'
                }
            };

            // Only save data-heavy results (lists, reads) to memory
            if (toolResult.tool_output && (toolResult.tool_output.events || toolResult.tool_output.emails || toolResult.tool_output.result)) {
                nextSessionState.lastToolData = toolResult.tool_output;
            }
            
            // Format success response
            const successResponse = this.formatSuccessResponse(
                analysis.suggested_tool,
                toolResult,
                enhancedParams,
                analysis.natural_response
            );
            
            return {
                status: 'SUCCESS',
                response: successResponse,
                toolUsed: analysis.suggested_tool,
                toolResult: toolResult,
                nextSessionState: nextSessionState
            };
            
        } catch (error) {
            console.error("❌ Tool execution error:", error);
            return {
                status: 'ERROR',
                response: `I encountered an unexpected error: ${error.message}. Let's try a different approach.`,
                toolUsed: analysis.suggested_tool,
                shouldRetry: false,
                nextSessionState: { pendingAction: null }
            };
        }
    }
    
    /**
     * Ask user for missing information
     */
    static askForInformation(analysis, session) {
        const missingFields = analysis.missing_information || [];
        
        let question = analysis.natural_response;
        
        if (!question || question.length < 10) {
            // Generate smart question based on missing fields
            if (missingFields.includes('start_time') && missingFields.includes('summary')) {
                question = "I can help schedule that. What's the meeting about and when would you like it?";
            } else if (missingFields.includes('start_time')) {
                question = "When would you like to schedule this?";
            } else if (missingFields.includes('summary')) {
                question = "What should I title this meeting?";
            } else if (missingFields.includes('attendees')) {
                question = "Who should be invited to this meeting?";
            } else if (missingFields.length > 0) {
                question = `To proceed, I need: ${missingFields.join(', ')}.`;
            } else {
                question = "Could you provide more details about what you'd like to do?";
            }
        }
        
        return {
            status: 'NEEDS_INFO',
            response: question,
            missingFields: missingFields,
            nextSessionState: {
                pendingAction: session.pendingAction,
                waitingFor: missingFields
            }
        };
    }
    
    /**
     * Ask for clarification on ambiguous aspects
     */
    static askForClarification(analysis, session) {
        const ambiguousPoints = analysis.ambiguous_aspects || [];
        
        let clarificationQuestion = analysis.natural_response;
        
        if (!clarificationQuestion || clarificationQuestion.length < 10) {
            if (ambiguousPoints.includes('event_reference')) {
                clarificationQuestion = "I found a few meetings that might match. Could you specify which one you're referring to?";
            } else if (ambiguousPoints.includes('time')) {
                clarificationQuestion = "Just to confirm, did you mean today or a different day?";
            } else if (ambiguousPoints.length > 0) {
                clarificationQuestion = `I want to make sure I understand correctly. Could you clarify: ${ambiguousPoints.join(' and ')}?`;
            } else {
                clarificationQuestion = "Could you clarify what you'd like me to do?";
            }
        }
        
        return {
            status: 'NEEDS_CLARIFICATION',
            response: clarificationQuestion,
            ambiguousPoints: ambiguousPoints,
            nextSessionState: {
                pendingAction: session.pendingAction,
                needsClarificationOn: ambiguousPoints
            }
        };
    }
    
    /**
     * Request confirmation before executing
     */
    static requestConfirmation(analysis, session, userContext) {
        const summary = this.createActionSummary(analysis, session, userContext);
        
        const confirmationQuestion = analysis.natural_response || 
            `Just to confirm, would you like me to:\n\n${summary}\n\nPlease confirm with "yes" or provide any corrections.`;
        
        return {
            status: 'NEEDS_CONFIRMATION',
            response: confirmationQuestion,
            summary: summary,
            nextSessionState: {
                pendingAction: {
                    tool: analysis.suggested_tool,
                    parameters: { ...analysis.tool_parameters, ...session.extractedData },
                    requiresConfirmation: true
                }
            }
        };
    }
    
    /**
     * Just respond conversationally without action
     */
    static respondOnly(analysis, session) {
        return {
            status: 'RESPONSE_ONLY',
            response: analysis.natural_response || "I understand. Is there anything specific you'd like me to help with?",
            nextSessionState: {
                pendingAction: null
            }
        };
    }
    
    /**
     * Handle unknown/unsupported actions
     */
    static handleUnknownAction(analysis) {
        return {
            status: 'UNSUPPORTED',
            response: analysis.natural_response || 
                "I'm not sure how to help with that yet. I can help with scheduling, checking your calendar, or managing emails. What would you like to do?",
            nextSessionState: {
                pendingAction: null
            }
        };
    }
    
    /**
     * Helper: Format success responses conversationally
     */
    static formatSuccessResponse(toolName, toolResult, params, naturalResponse) {
        // 1. Define how to format the DATA for each tool
        const dataFormatters = {
            'user_calendar_list': () => {
                const rawEvents = toolResult.tool_output?.events || [];
                
                // Filter out "Working Location" events
                const events = rawEvents.filter(e => e.eventType !== 'workingLocation');

                if (events.length === 0) {
                    return "📅 *Your calendar is clear for this timeframe.*";
                }
                
                const eventList = events.slice(0, 5).map((e, i) => {
                    const start = e.start || {};
                    const end = e.end || {};
                    const details = [];

                    // 1. Time/Date Formatting
                    if (start.date) {
                        details.push(`📅 Date: ${start.date} (All Day)`);
                    } else if (start.dateTime) {
                        const startDate = new Date(start.dateTime);
                        const endDate = end.dateTime ? new Date(end.dateTime) : null;
                        
                        const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        const endTime = endDate ? endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                        
                        details.push(`🕒 Time: ${dateStr} • ${startTime} - ${endTime}`);
                    }

                    // 🚨 CLEAN: We removed Location, Attendees, and Description from this list view
                    // to keep it clean. Users can ask for "full details" if needed.

                    let item = `> ${i+1}. **${e.summary || 'No Title'}**`;
                    if (details.length > 0) {
                        item += `\n>    ${details.join('\n>    ')}`;
                    }
                    return item;
                }).join('\n\n');
                
                return `**📅 Upcoming Events:**\n${eventList}`;
            },

            // Search results stay detailed
            'user_calendar_search': () => {
                const rawEvents = toolResult.tool_output?.events || [];
                const events = rawEvents.filter(e => e.eventType !== 'workingLocation');

                if (events.length === 0) {
                    return "📅 *No matching events found.*";
                }
                
                const eventList = events.slice(0, 5).map((e, i) => {
                    const start = e.start || {};
                    const end = e.end || {};
                    const details = [];

                    if (start.date) {
                        details.push(`📅 Date: ${start.date} (All Day)`);
                    } else if (start.dateTime) {
                        const startDate = new Date(start.dateTime);
                        const endDate = end.dateTime ? new Date(end.dateTime) : null;
                        
                        const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        const endTime = endDate ? endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                        
                        details.push(`🕒 Time: ${dateStr} • ${startTime} - ${endTime}`);
                    }

                    if (e.location) details.push(`📍 Loc: ${e.location}`);

                    if (e.attendees && e.attendees.length > 0) {
                        const names = e.attendees
                            .map(a => a.displayName || (a.email ? a.email.split('@')[0] : 'Guest'))
                            .slice(0, 2)
                            .join(', ');
                        const remaining = e.attendees.length - 2;
                        const extraText = remaining > 0 ? ` +${remaining} others` : '';
                        details.push(`👥 With: ${names}${extraText}`);
                    }

                    if (e.description) {
                        const snippet = e.description.replace(/<[^>]*>?/gm, '').substring(0, 50).trim();
                        if (snippet) details.push(`📝 "${snippet}..."`);
                    }

                    let item = `> ${i+1}. **${e.summary || 'No Title'}**`;
                    if (details.length > 0) {
                        item += `\n>    ${details.join('\n>    ')}`;
                    }
                    return item;
                }).join('\n\n');
                
                return `**🔍 Search Results:**\n${eventList}`;
            },
            
            'user_calendar_create': () => {
                const summary = params.summary || "Meeting";
                const time = params.start_time ? 
                    new Date(params.start_time).toLocaleString('en-US', { 
                        timeZone: 'Asia/Manila',
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : "the scheduled time";
                return `✅ **Success!** Scheduled "${summary}" for ${time}.`;
            },
            
            'user_calendar_cancel': () => {
                return `🗑️ **Cancelled.** The meeting has been removed.`;
            },
            
            'user_calendar_update': () => {
                return `✏️ **Updated.** The meeting details have been changed.`;
            },
            
            'user_gmail_list': () => {
                const emails = toolResult.tool_output?.emails || [];
                if (emails.length === 0) {
                    return "📧 *No new emails found.*";
                }
                const emailList = emails.slice(0, 3).map((e, i) => 
                    `> ${i+1}. **${e.subject}**\n>    From: ${e.from}`
                ).join('\n\n');
                return `**📧 Recent Emails:**\n${emailList}`;
            },
            
            'user_gmail_send': () => {
                return `📤 **Sent.** Email delivered to ${params.to}.`;
            },
            
            'default': () => {
                return toolResult.tool_output?.message || "✅ Action completed.";
            }
        };
        
        // 2. Generate the Data Output
        const formatter = dataFormatters[toolName] || dataFormatters.default;
        const dataOutput = formatter();

        // 3. COMBINE: Natural Response (The "Thinking" text) + Data Output
        // If LLM gave a natural response, put it first. Then add the data below it.
        if (naturalResponse && naturalResponse.length > 5) {
            return `${naturalResponse}\n\n${dataOutput}`;
        }
        
        return dataOutput;
    }
    
    /**
     * Create a summary of the proposed action
     */
    static createActionSummary(analysis, session, userContext) {
        const details = { ...analysis.extracted_details, ...session.extractedData };
        
        const parts = [];
        
        if (details.summary) parts.push(`• **Event:** ${details.summary}`);
        if (details.start_time) {
            const time = new Date(details.start_time).toLocaleString('en-US', {
                timeZone: 'Asia/Manila',
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            parts.push(`• **Time:** ${time} (Philippine Time)`);
        }
        if (details.attendees && details.attendees.length > 0) {
            parts.push(`• **Attendees:** ${details.attendees.join(', ')}`);
        }
        if (details.duration_minutes) {
            parts.push(`• **Duration:** ${details.duration_minutes} minutes`);
        }
        
        // Check for conflicts
        if (analysis.hasCalendarConflict) {
            parts.push(`\n⚠️ **Note:** This conflicts with an existing event.`);
        }
        
        return parts.join('\n');
    }
    
    /**
     * Check for scheduling conflicts
     */
    static checkForConflicts(analysis, userContext) {
        if (!analysis.extracted_details?.start_time || !userContext.calendar.upcomingEvents) {
            return false;
        }
        
        const proposedStart = new Date(analysis.extracted_details.start_time);
        const proposedEnd = new Date(proposedStart.getTime() + 
            (analysis.extracted_details.duration_minutes || 30) * 60000);
        
        return userContext.calendar.upcomingEvents.some(event => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end || eventStart.getTime() + 3600000); // Default 1 hour
            
            return (proposedStart < eventEnd && proposedEnd > eventStart);
        });
    }
    
    /**
     * Create default analysis when LLM fails
     */
    static createDefaultAnalysis(prompt) {
        return {
            intent: 'check',
            confidence: 0.3,
            extracted_details: {},
            missing_information: ['specific_details'],
            ambiguous_aspects: ['intent'],
            recommended_action: 'ask_for_info',
            suggested_tool: null,
            tool_parameters: {},
            natural_response: `I want to help with "${prompt}", but I need a bit more detail. Could you clarify what you'd like me to do?`,
            reasoning: 'LLM analysis failed, using fallback'
        };
    }
    
    /**
     * Create fallback response
     */
    static createFallbackResponse(prompt, error) {
        return {
            status: 'ERROR',
            response: `I'm having trouble processing "${prompt}". ` +
                     `Could you try rephrasing or ask about something else? ` +
                     `(Error: ${error.message})`,
            shouldRetry: false,
            sessionId: null
        };
    }
    
    /**
     * Clear a user's session
     */
    static clearSession(userEmail) {
        userSessions.delete(userEmail);
        return true;
    }
    
    /**
     * Get session info (for debugging)
     */
    static getSessionInfo(userEmail) {
        const session = userSessions.get(userEmail);
        if (!session) return null;
        
        return {
            sessionId: session.sessionId,
            createdAt: session.createdAt,
            lastInteraction: session.lastInteraction,
            pendingAction: session.pendingAction,
            conversationLength: session.conversationPath.length,
            extractedDataKeys: Object.keys(session.extractedData)
        };
    }
}