// backend/services/intentService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from '../config/database.js'; // NEW IMPORT

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class IntentService {
  
  // 🔥 NEW: Helper to get active model
  static async getActiveModel() {
      try {
          const [settings] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
          return settings.length > 0 ? settings[0].ai_model : "gemini-flash-latest";
      } catch (e) {
          return "gemini-flash-latest";
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

      // ---------------------------------------------------------
      // 🔍 DYNAMICALLY FETCH ACTIVE DATA SOURCES FOR CONTEXT
      // ---------------------------------------------------------
      let liveDataSourcesList = "";
      try {
        const [rows] = await pool.execute("SELECT name FROM live_data_sources WHERE is_active = TRUE");
        if (rows.length > 0) {
            const names = rows.map(r => `"${r.name}"`).join(", ");
            liveDataSourcesList = `ACTIVE DATA SOURCES: [${names}]`;
        }
      } catch (dbError) {
        console.warn("⚠️ Failed to fetch live data sources for intent context:", dbError.message);
      }
      // ---------------------------------------------------------

      const prompt = `
      You are the semantic brain of a corporate AI Assistant.
      Your goal is to understand the user's *true intent* and *context*.

      ### TASK 1: CONTEXTUAL REWRITING & TRANSLATION (CRITICAL)
      1. **RESOLVE AMBIGUITY:** Use CHAT HISTORY.
         - "The first one" -> "Select item 1"
         - "Yes" -> "Confirm [action]"
      2. **SEARCH OPTIMIZATION & REASONING (CRITICAL):** 
         - **TRANSLATE TO ENGLISH:** If the query is in Tagalog, Taglish, or any other language, the rewritten_query **MUST** be a high-quality, standalone English translation.
         - **PRESERVE INTENT:** Do not just translate words; translate the *intent* and *entities*.
         - **Example:** "Sino ang nagtatag?" -> "Who is the founder of the company?"
         - **Example:** "Paano mag-apply ng leave?" -> "What is the procedure to apply for leave?"
         - This English translation will be used for both RAG search and for the model's internal reasoning to prevent hallucinations.

      ### TASK 2: INTENT CLASSIFICATION (STRICT RULES)
      Classify into EXACTLY ONE category:

      1. "PERSONAL_ACTION" (High Priority): 
         - **KEYWORDS:** "email", "inbox", "schedule", "meeting", "calendar", "yes", "confirm", "cancel", "reschedule", "list", "show", "check".
         - **CONTEXT RULE:** If the Rewritten Query is about reading/sending emails, listing/modifying calendar events, classify as PERSONAL_ACTION.

      2. "LIVE_DATA": 
         - **KEYWORDS:** "project", "database", "stats", "count", "list", "report", "tracker".
         - **CONTEXT:** ${liveDataSourcesList}
         - **RULE:** If the query mentions any of the **ACTIVE DATA SOURCES** (e.g., "RPA Projects", "Inventory", "Roster") or asks for specific data points/statistics from them, classify as LIVE_DATA.
         - **CONSTRAINT:** If it mentions "email" or "sent to me" or "my schedule", it is NOT Live Data (it is Personal Action).

      3. "KNOWLEDGE_BASE": 
         - **KEYWORDS:** "policy", "handbook", "procedure", "guidelines", "company info", "history".
         - **RULE:** Use this for static documents, manuals, and general inquiries.

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
        
        Task: Rewrite the current question to be a STANDALONE English search query for a knowledge base. 
        - If the user's question is in Tagalog, Taglish, or any other language, TRANSLATE it to English.
        - Replace pronouns like "it", "that", "he", "they" with the specific nouns they refer to from the context.
        - Remove conversational fluff ("can you tell me", "what about").
        - Keep it concise and optimized for keyword search.
        
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