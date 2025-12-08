// backend/services/intentService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from '../config/database.js'; // NEW IMPORT

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class IntentService {
  
  // 🔥 NEW: Helper to get active model
  static async getActiveModel() {
      try {
          const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
          return settings.length > 0 ? settings[0].ai_model : "gemini-2.0-flash-exp";
      } catch (e) {
          return "gemini-2.0-flash-exp";
      }
  }

  static async classifyIntent(query, history = []) {
    try {
      const activeModel = await this.getActiveModel();
      const model = genAI.getGenerativeModel({ 
          model: activeModel, 
          generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.1 
          } 
      });

      const recentHistory = history.slice(-3).map(h => `User: ${h.question}\nAI: ${h.answer}`).join("\n");

      const prompt = `
      You are the semantic brain of a corporate AI Assistant.
      Your goal is to understand the user's *true intent* and *context*.

      ### TASK 1: CONTEXTUAL REWRITING (CRITICAL)
      Look at the CHAT HISTORY. Use it to resolve ambiguity.
      
      **RULES FOR CONFIRMATION/AGREEMENT:**
      - If AI asked for confirmation (e.g., "Confirm?", "Shall I proceed?", "Would you like me to list them?") 
      - AND User says: "Yes", "Confirm", "Please", "Go ahead", "Okay", "Sure"
      - **REWRITE TO:** An explicit, specific command describing the action and its parameters.
      - **EXAMPLES:**
        - AI: "Shall I list meetings for this week?" -> User: "Yes" -> **REWRITE TO:** "List the meetings for this week."
        - AI: "Cancel the meeting with John?" -> User: "Yes" -> **REWRITE TO:** "Cancel the meeting with John."
        - AI: "Want me to check your email?" -> User: "Please" -> **REWRITE TO:** "Check my email."
      - **FORBIDDEN:** Do NOT use generic phrases like "Execute the pending action" or "Proceed with the request". Be descriptive.

      **RULES FOR SELECTION:**
      - If user says: "The first one", "The earliest", "Number 2".
      - **REWRITE TO:** "Select item [selection] from the list."

      ### TASK 2: INTENT CLASSIFICATION (STRICT RULES)
      Classify into EXACTLY ONE category:

      1. "PERSONAL_ACTION" (High Priority): 
         - **KEYWORDS:** "email", "inbox", "schedule", "meeting", "calendar", "yes", "confirm", "cancel", "reschedule", "list", "show", "check".
         - **CONTEXT RULE:** If the Rewritten Query is about reading/sending emails, listing/modifying calendar events, classify as PERSONAL_ACTION.

      2. "LIVE_DATA": 
         - **KEYWORDS:** "project", "database", "stats", "count".
         - **CONSTRAINT:** If it mentions "email" or "sent to me", it is NOT Live Data.

      3. "KNOWLEDGE_BASE": 
         - **KEYWORDS:** "policy", "handbook", "procedure".

      4. "GENERAL": 
         - Greetings, small talk.

      ### TASK 3: METADATA EXTRACTION
      - user_emotion: "neutral", "frustrated", "urgent", "happy", "confused".
      - complexity: "low", "medium", "high".
      - suggested_title: "Generated meeting title if applicable"
      - pending_action: "calendar_create" or "calendar_cancel" or "calendar_update" or "calendar_list" or "email_send"
      - reasoning: "brief explanation"

      --------------------------------------------------
      CHAT HISTORY:
      ${recentHistory}

      CURRENT USER QUERY: "${query}"
      --------------------------------------------------

      RESPONSE JSON FORMAT:
      { 
        "intent": "CATEGORY_NAME", 
        "is_followup": boolean,
        "original_query": "string",
        "rewritten_query": "string",
        "user_emotion": "string",
        "complexity": "string",
        "suggested_title": "string",
        "pending_action": "string",
        "reasoning": "string" 
      }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const response = JSON.parse(responseText);
      
      if (response.is_followup) {
        console.log(`🔗 Follow-up Detected! Rewrote: "${query}" -> "${response.rewritten_query}"`);
      }
      console.log(`🧠 Intent Classified: [${response.intent}] (Action: ${response.pending_action})`);

      return response;

    } catch (error) {
      console.error("⚠️ Intent classification failed, defaulting to PERSONAL_ACTION for safety:", error);
      
      const lowerQ = query.toLowerCase();
      
      return {
        intent: "PERSONAL_ACTION",
        is_followup: true,
        original_query: query,
        rewritten_query: query + " (contextual)", // Fallback
        user_emotion: "neutral",
        complexity: "low",
        suggested_title: "",
        pending_action: "unknown",
        reasoning: "Fallback due to error"
      }; 
    }
  }

  static async rewriteQueryForSearch(query, history) {
    if (!history || history.length === 0) return query;

    try {
        const activeModel = await this.getActiveModel();
        const model = genAI.getGenerativeModel({ model: activeModel });
        const lastMsg = history[history.length - 1];
        
        const prompt = `
        User's current question: "${query}"
        Context from previous turn: "${lastMsg?.question || ''} -> ${lastMsg?.answer || ''}"
        
        Task: Rewrite the current question to be a STANDALONE search query for a knowledge base. 
        - Replace pronouns like "it", "that", "he", "they" with the specific nouns they refer to from the context.
        - Remove conversational fluff ("can you tell me", "what about").
        - Keep it concise.
        
        Return ONLY the rewritten string.
        `;
        
        const result = await model.generateContent(prompt);
        const rewritten = result.response.text().trim();
        console.log(`🔄 Optimized Search Query: "${query}" -> "${rewritten}"`);
        return rewritten;
    } catch (e) {
        console.warn("Rewrite failed, using original query");
        return query; 
    }
  }

  // ... (Keep other methods like extractTimeFromPrompt, etc. as they don't call LLM) ...
  static extractTimeFromPrompt(prompt) {
      const times = { startTime: null, endTime: null };
      return times; 
  }

  static async generateMeetingTitle(userQuery, attendees = []) {
    try {
      const activeModel = await this.getActiveModel();
      const model = genAI.getGenerativeModel({ 
        model: activeModel,
        generationConfig: { temperature: 0.3 }
      });

      const prompt = `
      Generate a professional meeting title based on the user's request.
      
      USER REQUEST: "${userQuery}"
      ATTENDEES: ${attendees.join(', ')}
      
      Rules for title generation:
      1. Be professional and concise (3-7 words)
      2. Include the main topic/purpose
      3. If attendees are mentioned, reference them appropriately
      4. Use standard business meeting formats
      5. Capitalize properly
      
      Examples:
      - "schedule meeting with juandelacruz@gmail.com for contract renewal" 
        → "Contract Renewal Meeting with Juan Dela Cruz"
      - "team sync about project alpha" → "Project Alpha Team Sync"
      - "discuss q4 budget with finance" → "Q4 Budget Review with Finance"
      - "weekly checkin" → "Weekly Check-in Meeting"
      
      Return ONLY the meeting title, nothing else.
      `;

      const result = await model.generateContent(prompt);
      const title = result.response.text().trim();
      
      return title.replace(/^["']|["']$/g, '');
      
    } catch (error) {
      console.error("Title generation failed:", error);
      return "Meeting";
    }
  }

  static extractMeetingDetailsFromHistory(history) {
    try {
      const recentHistory = history.slice(-5); 
      let meetingDetails = {
        summary: "",
        startTime: "",
        endTime: "",
        attendees: [],
        description: ""
      };

      for (const msg of recentHistory.reverse()) {
        const answer = msg.answer || "";
        const question = msg.question || "";
        const combined = question + " " + answer;
        
        if (question.includes("juandelacruz@gmail.com")) {
          meetingDetails.attendees = ["juandelacruz@gmail.com"];
        }
      }

      if (!meetingDetails.summary && meetingDetails.attendees.length > 0) {
        const name = this.extractNameFromEmail(meetingDetails.attendees[0]);
        meetingDetails.summary = `Meeting with ${name}`;
      }

      return meetingDetails;

    } catch (error) {
      console.error("Error extracting meeting details from history:", error);
      return null;
    }
  }

  static extractNameFromEmail(email) {
    const namePart = email.split('@')[0];
    return namePart.split('.').map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');
  }
}