// controllers/ragController.js - REVISED: Smart Personal Assistant Integration
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from "@google/generative-ai"; 
import { pool } from '../config/database.js';
import { ragSystem, databaseCacheManager, getUserPermissions } from '../services/ragService.js';
import { getEnhancedContext } from '../services/aiService.js';
import { ToolService } from '../services/toolService.js'; 
import { IntentService } from '../services/intentService.js';
import { SmartPersonalAssistant } from '../services/smartPersonalAssistant.js';  // NEW IMPORT
import { SmartDataAnalyst } from '../services/smartDataAnalyst.js'; // NEW IMPORT
import { notifyAdmins } from './notificationController.js';
import { PROMPT_TEMPLATES } from '../utils/prompts.js';
import { PromptService } from '../services/promptService.js';
import { AI_BEHAVIOR } from '../utils/aiBehavior.js';
import { responseCache } from '../services/responseCacheService.js';
import { cacheService } from '../services/cacheService.js';

// Initialize for dynamic conversational phrasing
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper to get active AI model from system settings
async function getActiveModel() {
    try {
        const [rows] = await pool.execute("SELECT ai_model FROM system_settings WHERE id = 1");
        return rows.length > 0 && rows[0].ai_model ? rows[0].ai_model : "gemini-flash-latest";
    } catch (error) {
        console.error('⚠️ Failed to fetch active model from settings:', error.message);
        return "gemini-flash-latest"; // Fallback
    }
}

async function getLLMThinkingPhrases(prompt, intent) {
    if (!process.env.GEMINI_API_KEY) return AI_BEHAVIOR.conversationalAssets?.transitions || [];
    try {
        const activeModel = await getActiveModel();
        const apiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        { role: "user", parts: [{ text: `
Return ONLY a JSON array of short status phrases (3-6 items) that describe the assistant's current thinking for the user's request.
Keep each phrase under 32 characters, no trailing ellipses.
Tailor to the intent: ${intent || 'GENERAL'} and the question: "${prompt}".
Example: ["Analyzing trends", "Checking HR policies", "Crunching numbers"]
`}]}
                    ],
                    generationConfig: { temperature: 0.2, topP: 0.9, topK: 40, maxOutputTokens: 1024 }
                })
            }
        );
        const data = await apiResponse.json();
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        let arr = [];
        try {
            arr = JSON.parse(text);
        } catch {
            const match = text.match(/\[([\s\S]*?)\]/);
            if (match) {
                arr = JSON.parse(match[0]);
            }
        }
        if (Array.isArray(arr) && arr.length > 0) {
            const cleaned = arr
                .map(x => String(x).trim())
                .filter(x => x.length > 0)
                .map(x => x.replace(/\.\.\.$/, ''));
            const unique = Array.from(new Set(cleaned.map(s => s.toLowerCase()))).map(
                lower => cleaned.find(c => c.toLowerCase() === lower)
            );
            return unique.slice(0, 6);
        }
        return AI_BEHAVIOR.conversationalAssets?.transitions || [];
    } catch {
        return AI_BEHAVIOR.conversationalAssets?.transitions || [];
    }
}

export const getRagStatus = (req, res) => {
    const stats = ragSystem.getFolderStats();
    res.json({ 
        status: ragSystem.isInitialized ? "ready" : "initializing",
        service: "LanceDB Vector Search RAG",
        database_schema: "new_relational_v1",
        embedding_model: "gemini-embedding-001",
        chunks: ragSystem.chunks.length,
        aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
        embeddings: ragSystem.chunks.length, // 1:1 mapping in Vector DB
        knowledge_files: Object.keys(ragSystem.knowledgeBase).length,
        folder_stats: stats,
        timestamp: new Date().toISOString()
    });
};

export const searchRag = async (req, res) => {
    try {
        const { question, top_k = 15 } = req.body;
        const userEmail = req.user ? req.user.email : req.header('X-User-Email');
        
        if (!question) {
            return res.status(400).json({ error: "Question required" });
        }
        if (!ragSystem.isInitialized) {
            return res.status(503).json({ 
                error: "RAG initializing",
                context: "Try again in a moment",
                success: false
            });
        }
        
        const { finalContext: context, documentIds } = await getEnhancedContext(question, ragSystem, top_k, userEmail);
        const results = await ragSystem.search(question, top_k);
        
        res.json({
            context,
            documentIds: documentIds,
            results_count: results.length,
            aggregate_results: results.filter(r => r.isAggregate).length,
            max_similarity: results[0]?.score || 0,
            success: true,
            query: question
        });
    } catch (error) {
        console.error("❌ RAG error:", error);
        res.status(500).json({ 
            error: "RAG system error",
            success: false
        });
    }
};

export const askQuestion = async (req, res) => {
    const { prompt, use_rag = true, behavior_context, session_id, sessionId } = req.body; // Extract session_id
    const activeSessionId = session_id || sessionId; // Normalization
    
    const userEmail = req.user ? req.user.email : req.header('X-User-Email'); 
    
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "API key not set" });
    
    // ⚡ 1. SMART CACHE CHECK (0ms Latency) WITH KB VERSION VALIDATION
    // Get current KB signature to ensure we don't serve outdated answers
    const currentCacheInfo = cacheService.getCacheInfo();
    const currentSignature = currentCacheInfo ? currentCacheInfo.signature : null;

    // Fetch User Permissions for Secure Cache Access
    let userPermissions = null;
    if (userEmail) {
        try {
            userPermissions = await getUserPermissions(userEmail);
        } catch (err) {
            console.error("⚠️ Failed to fetch permissions for cache check:", err);
            // If permission fetch fails, treat as no permissions (safe default)
            userPermissions = [];
        }
    }

    // ⚡ CACHE DISABLED
    // const cachedResponse = responseCache.get(prompt, currentSignature, userPermissions);
    // if (cachedResponse) {
    //     return res.json({
    //         ...cachedResponse,
    //         meta: { 
    //             ...cachedResponse.meta, 
    //             cached: true,
    //             response_time: "0ms (Cached)"
    //         }
    //     });
    // }

    let finalAnswer = "";
    let missingKnowledge = false;
    let noAccessKnowledge = false;

    try {
        const history = behavior_context?.conversation_history || [];

        // ⚡ 2. PARALLEL EXECUTION: User Name & Intent Classification
        const userPromise = (async () => {
            let userName = "User";
            if (userEmail) {
                try {
                    const [rows] = await pool.execute("SELECT name FROM employees WHERE email = ?", [userEmail]);
                    if (rows.length > 0 && rows[0].name) userName = rows[0].name;
                } catch (e) { console.error("⚠️ Failed to fetch user name:", e.message); }
            }
            return userName;
        })();

        const intentPromise = IntentService.classifyIntent(prompt, history);

        // Await user and intent
        const [userName, intentData] = await Promise.all([userPromise, intentPromise]);

        // --- CALCULATE CURRENT DATE (MANILA TIME) ---
        const now = new Date();
        const currentDate = now.toLocaleDateString('en-US', { 
            timeZone: 'Asia/Manila', 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        const intent = intentData.intent || "GENERAL";

        // ⚡ 3. PARALLEL EXECUTION: Thinking Phrases & Query Rewrite
        const thinkingPhrasesPromise = getLLMThinkingPhrases(prompt, intent);
        
        const rewritePromise = (async () => {
            if (intent === 'KNOWLEDGE_BASE' && history.length > 0) {
                return await IntentService.rewriteQueryForSearch(prompt, history);
            }
            return intentData.rewritten_query || prompt; 
        })();

        const [thinkingPhrases, searchTerms] = await Promise.all([thinkingPhrasesPromise, rewritePromise]);
        
        console.log(`🔀 Intent: [${intent}] | Query: "${prompt}" | Search Terms: "${searchTerms}"`);

        // =========================================================================================
        // 🚨 NEW: SMART PERSONAL ASSISTANT (Replaces PersonalContextService)
        // =========================================================================================
        
        if (intent === 'PERSONAL_ACTION') {
            try {
                const smartResult = await SmartPersonalAssistant.processRequest(
                    userEmail, 
                    prompt, 
                    history,
                    searchTerms // Pass translated query
                );
                
                // Map smart assistant status to response format
                let accessedTools = [];
                if (smartResult.toolUsed) {
                    accessedTools = [{
                        id: smartResult.toolUsed.replace('user_', '').replace(/_/g, '-'),
                        name: smartResult.toolUsed.replace(/_/g, ' ').toUpperCase(),
                        category: "Personal Integration"
                    }];
                }
                
                return res.json({
                    answer: smartResult.response,
                    intent: intent,
                    analysis: {
                        emotion: intentData.user_emotion,
                        complexity: intentData.complexity,
                        is_followup: intentData.is_followup,
                        rewritten: searchTerms,
                        suggested_title: intentData.suggested_title || null,
                        pending_action: smartResult.status
                    },
                    accessed_documents: [], // Clear sources for personal actions
                    accessed_tools: accessedTools,
                    source_categories: {},
                    rag_used: false,
                    tool_used: smartResult.toolUsed ? true : false,
                    tool_query: smartResult.toolUsed || '',
                    result_count: smartResult.toolResult?.tool_output?.result_count || 0,
                    success: true,
                    session_id: smartResult.sessionId,
                    meta: { thinking_phrases: thinkingPhrases }
                });
                
            } catch (assistantError) {
                console.error("❌ Smart Assistant failed:", assistantError);
                
                // Fallback to simple tool-based approach
                const lowerPrompt = prompt.toLowerCase();
                let fallbackResponse = "I can help with your calendar or emails. Could you be more specific about what you'd like to do?";
                
                if (lowerPrompt.includes('meeting') || lowerPrompt.includes('schedule')) {
                    fallbackResponse = "To schedule a meeting, please include the time and who should attend.";
                } else if (lowerPrompt.includes('calendar') || lowerPrompt.includes('events')) {
                    fallbackResponse = "I can show your calendar events. Would you like to see your schedule for today or this week?";
                } else if (lowerPrompt.includes('email') || lowerPrompt.includes('mail')) {
                    fallbackResponse = "I can help with emails. Would you like to check your inbox or send an email?";
                }
                
                return res.json({
                    answer: fallbackResponse,
                    intent: intent,
                    analysis: { 
                        pending_action: "needs_clarification",
                        is_followup: intentData.is_followup 
                    },
                    accessed_documents: [],
                    accessed_tools: [],
                    success: true,
                    meta: { thinking_phrases: thinkingPhrases }
                });
            }
        }

        // =========================================================================================
        // 📊 NEW: SMART DATA ANALYST (For Live Data)
        // =========================================================================================
        
        if (intent === 'LIVE_DATA') {
            try {
                const dataAnalyst = new SmartDataAnalyst();

                // Extract last bot response for context merging
                const lastHistoryItem = history.length > 0 ? history[history.length - 1] : null;
                const lastBotResponse = lastHistoryItem ? (lastHistoryItem.answer || lastHistoryItem.content) : null;

                const analystResult = await dataAnalyst.processQuery(prompt, history, lastBotResponse, activeSessionId, userEmail, searchTerms);

                return res.json({
                    answer: analystResult.text,
                    intent: intent,
                    analysis: {
                        emotion: intentData.user_emotion,
                        complexity: intentData.complexity,
                        is_followup: intentData.is_followup,
                        rewritten: searchTerms,
                        pending_action: analystResult.status
                    },
                    accessed_documents: [], // Clear knowledge base sources
                    accessed_tools: [{
                        id: "smart-data-analyst",
                        name: analystResult.source ? `${analystResult.source} (${analystResult.category || 'Live Data Tools'})` : "Smart Data Analyst",
                        category: "Live Data",
                        source_name: analystResult.source,
                        source_category: analystResult.category
                    }],
                    source_categories: {},
                    rag_used: false, // Explicitly false to prevent KB usage
                    tool_used: true,
                    tool_query: "Smart Data Analysis",
                    result_count: analystResult.data ? analystResult.data.length : 0,
                    success: true,
                    meta: { thinking_phrases: thinkingPhrases }
                });

            } catch (analystError) {
                console.error("❌ Smart Data Analyst failed:", analystError);
                // Fallback to General/RAG if analysis fails
            }
        }

        // =========================================================================================
        // STANDARD AGENT FLOW (Knowledge Base / Generic)
        // =========================================================================================

        // 2. CONTEXT & TOOL PREPARATION
        let systemPromptTemplate = "";
        let ragContext = "";
        let activeTools = [];
        let sourceMap = {};
        let sourceCategories = {};

        switch (intent) {
            case 'PERSONAL_ACTION':
                // Should not reach here, handled above
                systemPromptTemplate = await PromptService.getPrompt('PERSONAL_ACTION');
                activeTools = await ToolService.getAvailableTools(userEmail, 'PERSONAL_ACTION');
                ragContext = "No knowledge base needed for personal tasks.";
                break;

            case 'LIVE_DATA':
                // Handled above by SmartDataAnalyst
                systemPromptTemplate = await PromptService.getPrompt('GENERAL'); 
                activeTools = [];
                ragContext = "";
                break;

            case 'KNOWLEDGE_BASE':
                systemPromptTemplate = await PromptService.getPrompt('KNOWLEDGE_BASE');
                activeTools = []; 
                if (use_rag && ragSystem.isInitialized) {
                    // ⚡ OPTIMIZED: Reduced top_k from 15 to 8 for speed
                    const ragResult = await getEnhancedContext(searchTerms, ragSystem, 8, userEmail);
                    
                    // Handle specific knowledge gap flags from RAG system
                    if (ragResult.isMissingKnowledge) missingKnowledge = true;
                    if (ragResult.isAccessDenied) noAccessKnowledge = true;

                    // 🚫 BLOCK ACCESS IF PERMISSIONS FAIL
                    if (ragResult.accessDenied) {
                        return res.json({
                            answer: ragResult.finalContext,
                            intent: intent,
                            analysis: {
                                emotion: intentData.user_emotion,
                                complexity: intentData.complexity,
                                is_followup: intentData.is_followup,
                                rewritten: searchTerms,
                                pending_action: null
                            },
                            accessed_documents: [],
                            accessed_tools: [],
                            source_categories: {},
                            rag_used: false,
                            tool_used: false,
                            success: true,
                            meta: { thinking_phrases: thinkingPhrases }
                        });
                    }
                    
                    ragContext = ragResult.finalContext;
                    sourceMap = ragResult.sourceMap || {};
                    sourceCategories = ragResult.categoryMap || {};
                }
                break;

            case 'GENERAL':
            default:
                systemPromptTemplate = await PromptService.getPrompt('GENERAL');
                activeTools = [];
                ragContext = "";
                break;
        }

        const hasTools = activeTools.length > 0 && activeTools[0].function_declarations && activeTools[0].function_declarations.length > 0;

        // 3. BUILD CONVERSATION HISTORY
        // ⚡ OPTIMIZED: Handled by AI_BEHAVIOR.conversationMemory.maxContextMessages (set to 5)
        const maxContextMessages = AI_BEHAVIOR.conversationMemory?.maxContextMessages || 5;
        const recentHistory = history.slice(-maxContextMessages);
        
        let historyText = "";
        if (recentHistory.length > 0) {
            historyText = "PREVIOUS CONVERSATION:\n\n";
            historyText += recentHistory.map((msg, idx) => {
                let entry = `[Turn ${idx + 1}]\nUser Question: ${msg.question}\n`;
                if (msg.tool_used && msg.tool_query) {
                    entry += `Tool Action: Searched for "${msg.tool_query}"\n`;
                }
                const answerPreview = msg.answer.substring(0, 400);
                entry += `CHA Response: ${answerPreview}${msg.answer.length > 400 ? '...' : ''}\n`;
                return entry;
            }).join('\n---\n\n');
        } else {
            historyText = "Start of conversation.";
        }

        // 4. CONSTRUCT SYSTEM PROMPT
        const identity = behavior_context?.identity || AI_BEHAVIOR.identity;
        const promptDateContext = `\n\nCURRENT DATE: ${currentDate}\nUse this date to calculate 'after:' queries correctly.`;

        let finalSystemPrompt = systemPromptTemplate
            .replace(/{name}/g, identity.name || 'CHA')
            .replace(/{role}/g, identity.role || 'Company AI Assistant')
            .replace(/{company}/g, identity.company || 'CDO Foodsphere')
            .replace(/{context}/g, ragContext)
            .replace(/{history}/g, historyText)
            .replace(/{question}/g, prompt)
            .replace(/{translated_question}/g, searchTerms)
            .replace(/{user_name}/g, userName) + promptDateContext;

        // --- NEW: KNOWLEDGE GAP SYSTEM ALERTS ---
        if (noAccessKnowledge) {
            finalSystemPrompt += "\n\n[SYSTEM ALERT: NO_ACCESS_KNOWLEDGE] Information related to the query was found in the database, but the user does not have permission to access it. You MUST inform the user about the restriction clearly and include <NO_ACCESS_KNOWLEDGE> at the very end of your response.";
        } else if (missingKnowledge) {
            finalSystemPrompt += "\n\n[SYSTEM ALERT: MISSING_KNOWLEDGE] No relevant information was found in the internal knowledge base. You MUST inform the user and include <MISSING_KNOWLEDGE> at the very end of your response.";
        }

        if (intentData.is_followup) {
            finalSystemPrompt += `\n\n═══════════════════════════════════════════════════════════════════════════
🚨 **CONTEXTUAL INTERPRETATION:**
The user asked: "${prompt}"
Based on conversation history, this interprets to: "${searchTerms}"
**ACTION REQUIRED:** Answer the INTERPRETED question ("${searchTerms}"), not just the literal one.
═══════════════════════════════════════════════════════════════════════════`;
        }

        // --- NEW: EMPATHY & SYNTHESIS INJECTION ---
        finalSystemPrompt += `\n\n
        **HUMAN INTERACTION GUIDELINES:**
        1. **Synthesize, don't just quote:** Connect the data points logically. Don't just list facts; explain what they mean for the user.
        2. **Be Conversational:** If the user is casual, you can be casual. If they are formal, be formal.
        3. **Admit Gaps Gracefully:** If the answer isn't in the context, say "I'm not seeing that specific detail in the documents I have right now," rather than "I don't know."
        
        **STRICT LANGUAGE RULE:**
        - **Scenario 1 (Full English):** If the user speaks in full English, you MUST respond in full English.
        - **Scenario 2 (Full Tagalog):** If the user speaks in full Tagalog, you MUST respond in full Tagalog (use correct Tagalog grammar, avoid English terms as much as possible).
          - **CRITICAL EXCEPTION:** Do NOT translate Proper Nouns (Names of People, Companies, Products, Places). Keep them as they appear in the source.
        - **Scenario 3 (Taglish):** If the user speaks in Taglish, you MUST respond in "Conyo Taglish" (a natural mix of English and Tagalog).
        - EXCEPTION: If the user explicitly asks to respond in a specific language, you MUST follow that instruction.
        `;

        if (intent === 'KNOWLEDGE_BASE') {
            finalSystemPrompt += `\n\nIMPORTANT: List the exact titles of sources used at the end, prefixed with "SOURCES_USED:".`;
        }

        // 5. THE AGENT LOOP
        const messages = [
            { role: "user", parts: [{ text: finalSystemPrompt }] }
        ];

        let toolUsed = false;
        let usedToolIds = [];
        let toolQuery = ""; 
        let toolResultCount = 0;

        const activeModel = await getActiveModel();

        for (let turn = 0; turn < 3; turn++) {
            const apiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: messages,
                        tools: hasTools ? activeTools : undefined,
                        generationConfig: { 
                            temperature: 0.4, // Slightly increased for more natural phrasing
                            topP: 0.95,
                            topK: 40,
                            maxOutputTokens: 8192
                        }
                    })
                }
            );

            const data = await apiResponse.json();
            if (!apiResponse.ok) throw new Error(data.error?.message || "Gemini API Error");

            const candidate = data.candidates?.[0];
            const content = candidate?.content;
            const parts = content?.parts || [];
            const functionCallPart = parts.find(p => p.functionCall);

            if (functionCallPart) {
                const fnName = functionCallPart.functionCall.name;
                let fnArgs = functionCallPart.functionCall.args;
                
                console.log(`🤖 Gemini calling: ${fnName} with args:`, fnArgs);
                
                // 🛑 BLOCK direct modification calls to enforce Smart Assistant flow
                if (['user_calendar_create', 'user_calendar_update', 'user_calendar_cancel'].includes(fnName)) {
                    finalAnswer = "I can help with calendar modifications. Please tell me what you'd like to schedule, update, or cancel, and I'll guide you through the process.";
                    break;
                }

                toolUsed = true;
                toolQuery = fnArgs.query || "Action"; 

                const toolResult = await ToolService.executeTool(fnName, fnArgs, userEmail);

                // Check for explicit missing knowledge tool call
                if (toolResult && toolResult.missing_knowledge_flag) {
                    missingKnowledge = true;
                }
                
                // NEW: Check for explicit no access knowledge tool call
                if (toolResult && toolResult.no_access_flag) {
                    noAccessKnowledge = true;
                }

                // Tracking Logic...
                if (toolResult.tool_output) {
                    if (toolResult.tool_output.source_info) {
                        const sInfo = toolResult.tool_output.source_info;
                        sourceMap[sInfo.title] = -1;
                        if (sInfo.id) usedToolIds.push(sInfo.id);
                        toolResultCount = toolResult.tool_output.result_count || 0;
                    } 
                    else if (toolResult.tool_output.source === "Google Calendar") {
                        sourceMap["Google Calendar"] = -1;
                        usedToolIds.push("calendar-tool"); 
                        toolResultCount = toolResult.tool_output.events ? toolResult.tool_output.events.length : 1;
                    }
                    else if (toolResult.tool_output.source === "Google Mail") {
                        sourceMap["Google Mail"] = -1;
                        usedToolIds.push("gmail-tool");
                        toolResultCount = toolResult.tool_output.result_count || 0;
                    }
                }

                messages.push({ role: "model", parts: [functionCallPart] });
                messages.push({
                    role: "function",
                    parts: [{
                        functionResponse: {
                            name: fnName,
                            response: { content: toolResult }
                        }
                    }]
                });
            } else {
                finalAnswer = parts.map(p => p.text).join('');
                break;
            }
        }

        // 6. PROCESS SOURCES & DETECT KNOWLEDGE GAPS
        let cleanAnswer = finalAnswer;
        let citedSourceNames = [];

        // ---Consolidated Knowledge Gap Detection ---
        // Robust regex to handle variations with/without underscores and tool name hallucinations
        const missingKnowledgeRegex = /<MISSING_?KNOWLEDGE>|signal_?missing_?knowledge|<MISS[ING_KNOWLEDGE]*$/gi;
        const noAccessKnowledgeRegex = /<NO_ACCESS_?KNOWLEDGE>|signal_?no_access_?knowledge|<NO_ACC[ESS_KNOWLEDGE]*$/gi;

        // 1. Tag-based Detection (highest confidence)
        if (missingKnowledgeRegex.test(cleanAnswer)) {
            console.log("🚩 Missing knowledge detected in response (tag/tool string).");
            missingKnowledge = true;
            cleanAnswer = cleanAnswer.replace(missingKnowledgeRegex, '').replace(/^:\s*/, '').trim();
        }
        
        if (noAccessKnowledgeRegex.test(cleanAnswer)) {
            console.log("🚩 No access to knowledge detected in response (tag/tool string).");
            noAccessKnowledge = true;
            cleanAnswer = cleanAnswer.replace(noAccessKnowledgeRegex, '').replace(/^:\s*/, '').trim();
        }

        // 2. Implicit Detection (Fallback if not already flagged)
        if (!missingKnowledge && !noAccessKnowledge) {
            const lowerAnswer = cleanAnswer.toLowerCase();
            
            // Implicit Missing Knowledge
            if (
                lowerAnswer.includes("not included in the information") ||
                lowerAnswer.includes("not available in the provided context") ||
                lowerAnswer.includes("don't have knowledge about this") ||
                lowerAnswer.includes("reach out directly to our human resources") ||
                lowerAnswer.includes("recommend checking with hr") ||
                lowerAnswer.includes("wala akong nakitang") || // Tagalog: "I haven't seen"
                lowerAnswer.includes("hindi ko mahanap")     // Tagalog: "I can't find"
            ) {
                console.log("🚩 Implicit missing knowledge detected.");
                missingKnowledge = true;
            }
            // Implicit No Access
            else if (
                lowerAnswer.includes("don't have permission to access") ||
                lowerAnswer.includes("restricted from viewing") ||
                lowerAnswer.includes("wala kang permiso") || // Tagalog: "You don't have permission"
                lowerAnswer.includes("limitado ang iyong access") // Tagalog: "Your access is limited"
            ) {
                console.log("🚩 Implicit no access knowledge detected.");
                noAccessKnowledge = true;
            }
        }

        // 3. ADMIN NOTIFICATION (Fire once, prioritize No Access)
        if (userEmail) {
            let notifyMessage = null;
            
            if (noAccessKnowledge) {
                notifyMessage = `No Access to Knowledge: User "${userName}" asked: "${prompt}". Relevant info exists but user lacks permissions.`;
            } else if (missingKnowledge) {
                notifyMessage = `Missing Knowledge: User "${userName}" asked: "${prompt}". AI could not find specific answer.`;
            }

            if (notifyMessage) {
                console.log(`🔔 Attempting to send admin notification for user ${userEmail}: ${notifyMessage}`);
                notifyAdmins(notifyMessage)
                    .then(success => {
                        if (success) console.log("✅ Admin notification sent successfully");
                        else console.warn("⚠️ Admin notification failed (no admins found or DB error)");
                    })
                    .catch(err => console.error('❌ Failed to notify admins:', err));
            }
        } else if (missingKnowledge || noAccessKnowledge) {
            console.log("🔔 Knowledge gap detected but user is GUEST (no email), skipping admin notification.");
        }

        if (finalAnswer.includes("SOURCES_USED:")) {
            const splitArr = finalAnswer.split("SOURCES_USED:");
            cleanAnswer = splitArr[0].trim();
            citedSourceNames = splitArr[1].split(/,|\n/).map(s => s.trim()).filter(s => s.length > 0);
        }

        let documentSources = [];
        let toolSources = [];
        const availableSourceNames = Object.keys(sourceMap);

        // ONLY process sources if knowledge is NOT missing AND NOT restricted
        if (!missingKnowledge && !noAccessKnowledge) {
            if (citedSourceNames.length > 0) {
                for (const citedName of citedSourceNames) {
                    const match = availableSourceNames.find(
                        name => name.toLowerCase().includes(citedName.toLowerCase()) || 
                                citedName.toLowerCase().includes(name.toLowerCase())
                    );
                    if (match) {
                        const docId = sourceMap[match];
                        if (typeof docId === 'number' && docId > 0) {
                            if (!documentSources.some(d => d.id === docId)) {
                                documentSources.push({ id: docId, name: match, category: sourceCategories[match] || 'General' });
                            }
                        } else if (docId !== -1) {
                            documentSources.push({ id: docId || 'ext', name: match, category: 'External' });
                        }
                    }
                }
            } 
            
            // Fallback: If no documents were matched (either no citations or citations failed matching),
            // but we have available sources and intent is KB, use the top source.
            if (documentSources.length === 0 && intent === 'KNOWLEDGE_BASE' && availableSourceNames.length > 0) {
                const topName = availableSourceNames[0];
                const topId = sourceMap[topName];
                if (topId !== -1) {
                    documentSources.push({ id: topId, name: topName, category: sourceCategories[topName] || 'General' });
                }
            }

            for (const toolId of usedToolIds) {
                if (toolId === "calendar-tool") {
                    toolSources.push({ id: "calendar", name: "Google Calendar", category: "Personal Integration" });
                } 
                else if (toolId === "gmail-tool") {
                    toolSources.push({ id: "gmail", name: "Google Mail", category: "Personal Integration" });
                }
                else {
                    const toolName = Object.keys(sourceMap).find(key => sourceMap[key] === -1 && key.includes('Live')) || 'Live Data Tool';
                    toolSources.push({ id: toolId, name: toolName, category: 'Live Data' });
                }
            }
        } else {
            console.log("🚫 Skipping source population due to missing knowledge or total access denial.");
        }

        const responsePayload = { 
            answer: cleanAnswer,
            intent: intent,
            missing_knowledge: missingKnowledge,
            no_access_knowledge: noAccessKnowledge,
            analysis: {
                emotion: intentData.user_emotion,
                complexity: intentData.complexity,
                is_followup: intentData.is_followup,
                rewritten: searchTerms,
                suggested_title: intentData.suggested_title || null,
                pending_action: intentData.pending_action || null
            },
            accessed_documents: documentSources,
            accessed_tools: toolSources,
            source_categories: sourceCategories,
            rag_used: intent === 'KNOWLEDGE_BASE',
            tool_used: toolUsed,
            tool_query: toolQuery,
            result_count: toolResultCount,
            success: true,
            meta: { thinking_phrases: thinkingPhrases }
        };

        // ⚡ CACHE THE RESPONSE (If it's a good response) - DISABLED
        // if (intent === 'GENERAL' || intent === 'KNOWLEDGE_BASE') {
        //     responseCache.set(prompt, responsePayload, currentSignature);
        // }

        res.json(responsePayload);

    } catch (error) {
        console.error("❌ Ask API Error:", error);
        res.status(500).json({ 
            error: "Failed to process request",
            details: error.message,
            success: false
        });
    }
};

// Add new endpoints for smart assistant
export const askQuestionStream = async (req, res) => {
    const { prompt, use_rag = true, behavior_context, session_id, sessionId } = req.body;
    const activeSessionId = session_id || sessionId;
    const userEmail = req.user ? req.user.email : req.header('X-User-Email');

    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "API key not set" });

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
        const history = behavior_context?.conversation_history || [];

        // 1. Parallel Execution: User Name & Intent
        const userPromise = (async () => {
            let userName = "User";
            if (userEmail) {
                try {
                    const [rows] = await pool.execute("SELECT name FROM employees WHERE email = ?", [userEmail]);
                    if (rows.length > 0 && rows[0].name) userName = rows[0].name;
                } catch (e) { console.error("⚠️ Failed to fetch user name:", e.message); }
            }
            return userName;
        })();

        const intentPromise = IntentService.classifyIntent(prompt, history);
        const [userName, intentData] = await Promise.all([userPromise, intentPromise]);
        
        const intent = intentData.intent || "GENERAL";
        const thinkingPhrasesPromise = getLLMThinkingPhrases(prompt, intent);
        
        const rewritePromise = (async () => {
            if (intent === 'KNOWLEDGE_BASE' && history.length > 0) {
                return await IntentService.rewriteQueryForSearch(prompt, history);
            }
            return intentData.rewritten_query || prompt; 
        })();

        const [thinkingPhrases, searchTerms] = await Promise.all([thinkingPhrasesPromise, rewritePromise]);

        // Send initial metadata
        sendEvent('meta', {
            intent,
            thinking_phrases: thinkingPhrases,
            analysis: {
                emotion: intentData.user_emotion,
                complexity: intentData.complexity,
                is_followup: intentData.is_followup,
                rewritten: searchTerms
            }
        });

        // 2. Handle Specific Intents (Personal/Live Data) - Non-streaming for tools (simulated)
        if (intent === 'PERSONAL_ACTION' || intent === 'LIVE_DATA') {
            // Re-use logic from askQuestion for these complex flows
            // For Phase 1, we won't fully stream these as they require tool execution
            // We'll just execute and send the result as a single chunk
            
            let resultPayload = {};
            
            if (intent === 'PERSONAL_ACTION') {
                const smartResult = await SmartPersonalAssistant.processRequest(userEmail, prompt, history, searchTerms);
                resultPayload = {
                    answer: smartResult.response,
                    accessed_tools: smartResult.toolUsed ? [{ id: 'personal', name: smartResult.toolUsed }] : []
                };
            } else {
                const dataAnalyst = new SmartDataAnalyst();
                const lastHistoryItem = history.length > 0 ? history[history.length - 1] : null;
                const lastBotResponse = lastHistoryItem ? (lastHistoryItem.answer || lastHistoryItem.content) : null;
                const analystResult = await dataAnalyst.processQuery(prompt, history, lastBotResponse, activeSessionId, userEmail, searchTerms);
                resultPayload = {
                    answer: analystResult.text,
                    accessed_tools: [{ id: 'data-analyst', name: analystResult.source }]
                };
            }

            // Stream the answer chunk by chunk (simulated) to keep frontend happy
            const words = resultPayload.answer.split(' ');
            for (let i = 0; i < words.length; i += 5) {
                const chunk = words.slice(i, i + 5).join(' ') + ' ';
                sendEvent('content', { text: chunk });
                await new Promise(r => setTimeout(r, 20)); // Tiny delay for effect
            }
            
            sendEvent('done', {
                accessed_tools: resultPayload.accessed_tools,
                accessed_documents: []
            });
            return res.end();
        }

        // 3. Handle RAG/General Intents - Real Streaming
        let systemPromptTemplate = await PromptService.getPrompt(intent === 'KNOWLEDGE_BASE' ? 'KNOWLEDGE_BASE' : 'GENERAL');
        let ragContext = "";
        let sourceMap = {};
        let sourceCategories = {};
        let missingKnowledge = false;
        let noAccessKnowledge = false;

        if (intent === 'KNOWLEDGE_BASE' && use_rag && ragSystem.isInitialized) {
            // Get user permissions
            let userPermissions = null;
            if (userEmail) {
                try { userPermissions = await getUserPermissions(userEmail); } catch (e) {}
            }

            const ragResult = await getEnhancedContext(searchTerms, ragSystem, 8, userEmail);
            
            if (ragResult.isMissingKnowledge) missingKnowledge = true;
            if (ragResult.isAccessDenied) noAccessKnowledge = true;

            if (ragResult.accessDenied) {
                sendEvent('content', { text: ragResult.finalContext });
                sendEvent('done', { accessed_documents: [] });
                return res.end();
            }
            
            ragContext = ragResult.finalContext;
            sourceMap = ragResult.sourceMap || {};
            sourceCategories = ragResult.categoryMap || {};
        }

        // Construct System Prompt
        const now = new Date();
        const currentDate = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const identity = behavior_context?.identity || AI_BEHAVIOR.identity;

        // Build history text
        const maxContextMessages = AI_BEHAVIOR.conversationMemory?.maxContextMessages || 5;
        const recentHistory = history.slice(-maxContextMessages);
        let historyText = recentHistory.length > 0 ? 
            recentHistory.map((msg, idx) => `[Turn ${idx+1}]\nUser: ${msg.question}\nCHA: ${msg.answer.substring(0, 400)}`).join('\n---\n') : 
            "Start of conversation.";

        let finalSystemPrompt = systemPromptTemplate
            .replace(/{name}/g, identity.name || 'CHA')
            .replace(/{role}/g, identity.role || 'Company AI Assistant')
            .replace(/{company}/g, identity.company || 'CDO Foodsphere')
            .replace(/{context}/g, ragContext)
            .replace(/{history}/g, historyText)
            .replace(/{question}/g, prompt)
            .replace(/{translated_question}/g, searchTerms)
            .replace(/{user_name}/g, userName) + `\n\nCURRENT DATE: ${currentDate}`;

        if (noAccessKnowledge) finalSystemPrompt += "\n\n[SYSTEM ALERT: NO_ACCESS_KNOWLEDGE]...";
        else if (missingKnowledge) finalSystemPrompt += "\n\n[SYSTEM ALERT: MISSING_KNOWLEDGE]...";

        if (intent === 'KNOWLEDGE_BASE') finalSystemPrompt += `\n\nIMPORTANT: List the exact titles of sources used at the end, prefixed with "SOURCES_USED:".`;

        // Start Streaming Generation
        const activeModel = await getActiveModel();
        const model = genAI.getGenerativeModel({ model: activeModel });
        
        const result = await model.generateContentStream({
            contents: [{ role: "user", parts: [{ text: finalSystemPrompt }] }],
            generationConfig: { temperature: 0.4, topP: 0.95, topK: 40, maxOutputTokens: 8192 }
        });

        let fullText = "";
        
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                fullText += chunkText;
                sendEvent('content', { text: chunkText });
            }
        }

        // Post-processing (Sources)
        let documentSources = [];
        if (!missingKnowledge && !noAccessKnowledge && intent === 'KNOWLEDGE_BASE') {
            let citedSourceNames = [];
            if (fullText.includes("SOURCES_USED:")) {
                const splitArr = fullText.split("SOURCES_USED:");
                citedSourceNames = splitArr[1].split(/,|\n/).map(s => s.trim()).filter(s => s.length > 0);
            }

            const availableSourceNames = Object.keys(sourceMap);
            // Match citations to sources
            if (citedSourceNames.length > 0) {
                for (const citedName of citedSourceNames) {
                    const match = availableSourceNames.find(name => name.toLowerCase().includes(citedName.toLowerCase()));
                    if (match) {
                        const docId = sourceMap[match];
                        documentSources.push({ id: docId, name: match, category: sourceCategories[match] || 'General' });
                    }
                }
            }
            // Fallback
            if (documentSources.length === 0 && availableSourceNames.length > 0) {
                 const topName = availableSourceNames[0];
                 const topId = sourceMap[topName];
                 documentSources.push({ id: topId, name: topName, category: sourceCategories[topName] || 'General' });
            }
        }

        sendEvent('done', {
            accessed_documents: documentSources,
            source_categories: sourceCategories,
            rag_used: intent === 'KNOWLEDGE_BASE'
        });
        
        res.end();

    } catch (error) {
        console.error("❌ Streaming Error:", error);
        sendEvent('error', { message: "Failed to stream response" });
        res.end();
    }
};

export const clearPersonalSession = async (req, res) => {
    try {
        const userEmail = req.user ? req.user.email : req.header('X-User-Email');
        if (!userEmail) {
            return res.status(400).json({ error: "User email required" });
        }
        
        const cleared = SmartPersonalAssistant.clearSession(userEmail);
        res.json({
            success: cleared,
            message: cleared ? "Personal session cleared" : "No active session found"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getSessionInfo = async (req, res) => {
    try {
        const userEmail = req.header('X-User-Email');
        if (!userEmail) {
            return res.status(400).json({ error: "User email required" });
        }
        
        const sessionInfo = SmartPersonalAssistant.getSessionInfo(userEmail);
        res.json({
            success: true,
            hasSession: !!sessionInfo,
            sessionInfo: sessionInfo
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getDatabaseStats = async (req, res) => {
    try {
        const stats = await databaseCacheManager.getDatabaseStats();
        res.json({
            success: true,
            database_stats: stats,
            rag_initialized: ragSystem.isInitialized,
            knowledge_base_files: Object.keys(ragSystem.knowledgeBase).length,
            chunks_count: ragSystem.chunks.length,
            schema: 'new_relational_v1'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getDatabaseDocuments = async (req, res) => {
    try {
        const documents = await databaseCacheManager.loadKnowledgeDocuments();
        res.json({
            success: true,
            document_count: documents.length,
            documents: documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                category: doc.category_name,
                subcategory: doc.subcategory_name,
                slug: doc.slug,
                updated_at: doc.updated_at,
                content_preview: typeof doc.content === 'object' ? 
                    JSON.stringify(doc.content).substring(0, 200) + '...' : 
                    doc.content.substring(0, 200) + '...'
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const debugFolders = (req, res) => {
    const stats = ragSystem.getFolderStats();
    res.json({
        folderStructure: stats,
        knowledgeBaseFiles: Object.keys(ragSystem.knowledgeBase),
        totalChunks: ragSystem.chunks.length,
        aggregateChunks: ragSystem.chunks.filter(c => c.isAggregate).length
    });
};

export const debugFiles = (req, res) => {
    res.json({
        files: Object.keys(ragSystem.knowledgeBase),
        fileCount: Object.keys(ragSystem.knowledgeBase).length,
        chunksCount: ragSystem.chunks.length,
        aggregateChunksCount: ragSystem.chunks.filter(c => c.isAggregate).length
    });
};

export const debugChunks = (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const chunks = ragSystem.chunks.slice(0, limit);
    res.json({
        total_chunks: ragSystem.chunks.length,
        aggregate_chunks: ragSystem.chunks.filter(c => c.isAggregate).length,
        sample_chunks: chunks.map(chunk => ({
            text: chunk.text.substring(0, 100) + '...',
            path: chunk.path,
            context: chunk.context,
            isAggregate: chunk.isAggregate,
            categoryId: chunk.categoryId,
            subcategoryId: chunk.subcategoryId
        }))
    });
};

export const debugPrompt = async (req, res) => {
    try {
        const { question } = req.body;
        const userEmail = req.user ? req.user.email : req.header('X-User-Email');
        
        if (!question) {
            return res.status(400).json({ error: "Question required" });
        }
        
        const { finalContext: context } = await getEnhancedContext(question, ragSystem, 20, userEmail);
        const finalPrompt = PROMPT_TEMPLATES.KNOWLEDGE_BASE
            .replace(/{name}/g, AI_BEHAVIOR.identity.name)
            .replace(/{role}/g, AI_BEHAVIOR.identity.role)
            .replace(/{company}/g, AI_BEHAVIOR.identity.company)
            .replace(/{context}/g, context)
            .replace(/{history}/g, 'No history')
            .replace(/{question}/g, question);
        
        res.json({
            question,
            userEmail: userEmail || 'guest',
            context_length: context.length,
            prompt_length: finalPrompt.length,
            context_preview: context.substring(0, 1000) + '...',
            prompt_preview: finalPrompt.substring(0, 1500) + '...'
        });
    } catch (error) {
        console.error("Debug error:", error);
        res.status(500).json({ error: error.message });
    }
};

export const debugSearchChunks = (req, res) => {
    const searchTerm = req.query.q || "policy";
    const matchingChunks = ragSystem.chunks.filter(chunk => 
        chunk.text.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
    res.json({
        searchTerm,
        totalMatches: matchingChunks.length,
        chunks: matchingChunks.map(chunk => ({
            text: chunk.text.substring(0, 200) + '...',
            path: chunk.path,
            context: chunk.context,
            isAggregate: chunk.isAggregate,
            categoryId: chunk.categoryId,
            subcategoryId: chunk.subcategoryId,
            documentId: chunk.documentId
        }))
    });
};

export const getThinkingPhrases = async (req, res) => {
    try {
        const { prompt } = req.body || {};
        const history = req.body?.behavior_context?.conversation_history || [];
        const intentData = await IntentService.classifyIntent(prompt || '', history);
        const intent = intentData.intent || 'GENERAL';
        const phrases = await getLLMThinkingPhrases(prompt || '', intent);
        res.json({ success: true, intent, meta: { thinking_phrases: phrases } });
    } catch (error) {
        res.status(200).json({
            success: true,
            intent: 'GENERAL',
            meta: { thinking_phrases: AI_BEHAVIOR.conversationalAssets?.transitions || [] }
        });
    }
};

export const getFollowUpQuestions = async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
        return res.json({ questions: [] });
    }

    try {
        const { conversation_history, last_answer } = req.body;
        
        // Prepare context: take the last few turns
        const recentHistory = (conversation_history || []).slice(-3).map(m => 
            `User: ${m.question}\nAssistant: ${m.answer}`
        ).join('\n\n');

        const prompt = `
        You are to propose 1–3 follow-up questions strictly related to the assistant’s last answer.
        
        CONTEXT:
        ${recentHistory}
        
        LAST ASSISTANT ANSWER:
        ${last_answer}
        
        INSTRUCTIONS:
        1. Check if the last user message was a topical query and the assistant produced a substantive answer.
        2. If the last user message is a short acknowledgment (e.g. "Thanks", "Okay", "Got it") or clarification with no new topic, return an empty array [].
        3. If valid, generate 1-3 short, grammatically correct follow-up questions.
        4. Avoid repeating entities verbatim if possible (use pronouns like "it", "they" where clear).
        5. Do not introduce completely new topics unrelated to the context.
        6. Return ONLY a raw JSON array of strings. Example: ["What are their best-selling products?", "How do I apply?"]
        `;

        const activeModel = await getActiveModel();
        const model = genAI.getGenerativeModel({ model: activeModel });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
                responseMimeType: "application/json"
            }
        });

        const responseText = result.response.text();
        let questions = [];
        try {
            questions = JSON.parse(responseText);
        } catch (e) {
            // Fallback parsing if not pure JSON
            const match = responseText.match(/\[.*\]/s);
            if (match) {
                try { questions = JSON.parse(match[0]); } catch {}
            }
        }

        // Ensure it's an array of strings
        if (!Array.isArray(questions)) questions = [];
        questions = questions.filter(q => typeof q === 'string').slice(0, 3);

        res.json({ questions });

    } catch (error) {
        console.error("Follow-up generation error:", error);
        res.json({ questions: [] }); // Fail gracefully
    }
};
