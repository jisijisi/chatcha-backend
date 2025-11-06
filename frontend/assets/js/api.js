// api.js - Complete Server-Side RAG System
import { CONFIG } from './config.js';

export class APIManager {
  constructor() {
    this.abortController = null;
    this.currentMarkdownParser = null;
    this.cdoInfoCache = null;
    this.cacheTimestamp = null;
    this.CACHE_DURATION = 24 * 60 * 60 * 1000;
    this.conversationSummary = '';
  }
  
  setMarkdownParser(parser) {
    this.currentMarkdownParser = parser;
  }

  /**
   * Server-side RAG context retrieval
   */
  async getSmartContext(question, hrKnowledgeBase, currentConversation, userName) {
    try {
      // Get relevant context from server-side RAG
      const relevantContext = await this.getServerRAGContext(question);
      
      // Optimize conversation history
      const optimizedConversation = this.optimizeConversationHistory(currentConversation);
      
      // Update conversation summary
      this.updateConversationSummary(question, optimizedConversation);
      
      // Check if CDO info is needed
      const needsCDO = this.needsCDOInfo(question);
      const cdoCompanyInfo = needsCDO ? await this.getCDOInfo() : '';

      return {
        relevantContext,
        optimizedConversation,
        needsCDO,
        cdoCompanyInfo,
        queryType: this.analyzeQueryType(question)
      };
    } catch (error) {
      console.error('Server RAG failed:', error);
      // Fallback to basic context
      return this.getFallbackContext(question, currentConversation, userName);
    }
  }

  /**
   * Server-side RAG search
   */
  async getServerRAGContext(question, topK = 12) {
    try {
      const ragSearchUrl = CONFIG.API_URL.replace('/ask', '/rag/search');
      
      console.log(`🔍 Calling server RAG: ${ragSearchUrl}`);
      
      const response = await fetch(ragSearchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question,
          top_k: topK
        })
      });

      if (!response.ok) {
        throw new Error(`RAG search failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.context && data.success) {
        console.log(`✅ Server RAG found ${data.results_count} results`);
        return data.context;
      } else {
        throw new Error('No relevant context found');
      }
    } catch (error) {
      console.error('❌ Server RAG error:', error);
      throw error;
    }
  }

  /**
   * Fallback context if RAG fails
   */
  async getFallbackContext(question, currentConversation, userName) {
    console.log('🔄 Using fallback context');
    
    const optimizedConversation = this.optimizeConversationHistory(currentConversation);
    const needsCDO = this.needsCDOInfo(question);
    const cdoCompanyInfo = needsCDO ? await this.getCDOInfo() : '';
    
    return {
      relevantContext: "HR knowledge base is currently unavailable. For accurate information, please contact your HR Business Partner directly.",
      optimizedConversation,
      needsCDO,
      cdoCompanyInfo,
      queryType: this.analyzeQueryType(question)
    };
  }

  /**
   * Analyze query type for better context selection
   */
  analyzeQueryType(question) {
    const lowerQuestion = question.toLowerCase();
    
    const queryTypes = {
      'recruitment': ['interview', 'hire', 'recruit', 'hiring', 'candidate', 'applicant', 'selection', 'screening'],
      'policy': ['policy', 'procedure', 'guideline', 'rule', 'regulation', 'compliance'],
      'process': ['process', 'step', 'stage', 'phase', 'workflow', 'pipeline', 'how to'],
      'benefits': ['benefit', 'reward', 'compensation', 'salary', 'bonus', 'recognition'],
      'performance': ['performance', 'review', 'evaluation', 'appraisal', 'kpi', 'assessment'],
      'training': ['training', 'development', 'learning', 'course', 'workshop', 'skill'],
      'disciplinary': ['disciplinary', 'violation', 'termination', 'warning', 'conduct', 'code'],
      'internal': ['internal', 'transfer', 'promotion', 'letter of intent', 'loi', 'interapply'],
      'general': ['what', 'how', 'when', 'where', 'why', 'explain', 'tell me about']
    };
    
    for (const [type, keywords] of Object.entries(queryTypes)) {
      if (keywords.some(keyword => lowerQuestion.includes(keyword))) {
        return type;
      }
    }
    
    return 'general';
  }

  /**
   * Enhanced conversation optimization
   */
  optimizeConversationHistory(conversation, currentQuestion) {
    if (conversation.length <= 4) {
      return conversation;
    }
    
    // Keep recent exchanges but also include semantically relevant ones
    const recentExchanges = conversation.slice(-3);
    
    // If we have a conversation summary, use it to find relevant past exchanges
    if (this.conversationSummary) {
      const relevantPast = this.findRelevantPastExchanges(conversation.slice(0, -3), currentQuestion);
      return [...relevantPast, ...recentExchanges].slice(-4);
    }
    
    return conversation.slice(-4);
  }

  findRelevantPastExchanges(pastConversations, currentQuestion) {
    if (pastConversations.length === 0) return [];
    
    // Simple keyword matching to find relevant past exchanges
    const questionWords = currentQuestion.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const relevantExchanges = [];
    
    pastConversations.forEach(exchange => {
      const exchangeText = (exchange.question + ' ' + exchange.answer).toLowerCase();
      const matchCount = questionWords.filter(word => exchangeText.includes(word)).length;
      
      if (matchCount >= 2) { // At least 2 matching keywords
        relevantExchanges.push(exchange);
      }
    });
    
    return relevantExchanges.slice(-2); // Return up to 2 relevant past exchanges
  }

  updateConversationSummary(currentQuestion, conversation) {
    if (conversation.length >= 3) {
      const recentTopics = conversation.slice(-3).map(msg => 
        msg.question.toLowerCase().split(/\s+/).slice(0, 5).join(' ')
      ).join(', ');
      
      this.conversationSummary = `Recent topics: ${recentTopics}`;
    }
  }

  /**
   * Enhanced system prompt with query-type awareness
   */
  createEnhancedSystemPrompt(userName, contextSummary, queryType) {
    const userContext = userName && userName !== 'You' 
      ? `The user's name is ${userName}. Address them naturally when appropriate.` 
      : '';

    const queryTypeGuidance = this.getQueryTypeGuidance(queryType);

    return `You are Jisi, a professional AI HR and Recruitment Assistant for CDO Foodsphere, Inc.

${userContext}

## YOUR ROLE:
You provide accurate HR information based EXCLUSIVELY on the provided context from CDO Foodsphere's HR Knowledge Base.

## QUERY TYPE: ${queryType.toUpperCase()}
${queryTypeGuidance}

## AVAILABLE CONTEXT:
${contextSummary}

## RESPONSE GUIDELINES:
1. **Base answers ONLY on the provided context** - do not use external knowledge
2. **Be specific and practical** - reference exact processes, forms, and policies
3. **Use markdown formatting** for clarity with headings, bullet points, and bold text
4. **If information is missing**, clearly state this and suggest contacting HR
5. **For company history questions**, use only the provided CDO company information
6. **Provide complete information** - include all relevant details from the context
7. **Keep responses comprehensive but focused** on the user's question

## IMPORTANT:
- Do not make up information or processes
- Do not reference parts of the knowledge base not provided in context
- If unsure, recommend contacting the HR Business Partner
- Always provide the most complete answer possible based on the available context`;
  }

  getQueryTypeGuidance(queryType) {
    const guidance = {
      'recruitment': 'Focus on hiring processes, interview techniques, candidate assessment, and selection criteria. Reference specific stages of the hiring process and behavioral interviewing methods.',
      'policy': 'Provide exact policy details, procedures, and guidelines. Reference specific policy sections and compliance requirements.',
      'process': 'Explain step-by-step processes, stages, and workflows. Include any required forms, tools, or approvals.',
      'benefits': 'Detail employee benefits, rewards, compensation structures, and eligibility criteria.',
      'performance': 'Cover performance management, evaluation processes, review cycles, and improvement plans.',
      'training': 'Discuss training programs, development opportunities, learning resources, and skill enhancement.',
      'disciplinary': 'Explain disciplinary procedures, code of conduct violations, and corrective actions.',
      'internal': 'Focus on internal transfers, promotions, internal hiring processes, and employee mobility.',
      'general': 'Provide comprehensive information covering all relevant aspects of the question from the available context.'
    };
    
    return guidance[queryType] || guidance.general;
  }

  /**
   * Create a detailed summary of the available context
   */
  createContextSummary(context, queryType) {
    if (context.length > 1000) {
      const contextIndicators = this.analyzeContextContent(context);
      return `Comprehensive HR knowledge base context available covering: ${contextIndicators.join(', ')}. Specifically relevant to ${queryType} queries.`;
    } else if (context.length > 300) {
      return `Moderate HR knowledge base context available. Focused information relevant to ${queryType} queries.`;
    } else {
      return `Limited context available. Please contact HR for more detailed information about ${queryType} topics.`;
    }
  }

  analyzeContextContent(context) {
    const indicators = [];
    const lowerContext = context.toLowerCase();
    
    if (lowerContext.includes('interview') || lowerContext.includes('behavioral')) {
      indicators.push('interview techniques');
    }
    if (lowerContext.includes('stage') || lowerContext.includes('process')) {
      indicators.push('process stages');
    }
    if (lowerContext.includes('policy') || lowerContext.includes('procedure')) {
      indicators.push('policies & procedures');
    }
    if (lowerContext.includes('tool') || lowerContext.includes('form')) {
      indicators.push('HR tools & forms');
    }
    if (lowerContext.includes('framework') || lowerContext.includes('principle')) {
      indicators.push('HR frameworks');
    }
    if (lowerContext.includes('internal') || lowerContext.includes('transfer')) {
      indicators.push('internal processes');
    }
    
    return indicators.length > 0 ? indicators : ['multiple HR topics'];
  }

  /**
   * Enhanced conversation history formatting
   */
  formatConversationHistory(conversation) {
    if (conversation.length === 0) return '';
    
    let history = '\n## RECENT CONVERSATION CONTEXT:\n';
    conversation.forEach((msg, index) => {
      history += `\n**Exchange ${index + 1}:**\n`;
      history += `User: ${msg.question}\n`;
      history += `Assistant: ${msg.answer.substring(0, 150)}${msg.answer.length > 150 ? '...' : ''}\n`;
    });
    
    if (this.conversationSummary) {
      history += `\n**Conversation Summary:** ${this.conversationSummary}\n`;
    }
    
    return history;
  }

  /**
   * MAIN METHOD - Enhanced RAG with query analysis
   */
  async getAIResponse(question, hrKnowledgeBase, currentConversation, userName, messageElement = null) {
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    try {
      // Get smart context using server-side RAG
      const context = await this.getSmartContext(question, hrKnowledgeBase, currentConversation, userName);
      
      // Create context summary with query type awareness
      const contextSummary = this.createContextSummary(context.relevantContext, context.queryType);
      
      // Build conversation history
      const conversationHistory = this.formatConversationHistory(context.optimizedConversation);
      
      // Create enhanced system prompt
      const systemPrompt = this.createEnhancedSystemPrompt(userName, contextSummary, context.queryType);
      
      // Build CDO section if needed
      const cdoSection = context.needsCDO ? 
        `\n## CDO COMPANY BACKGROUND:\n${context.cdoCompanyInfo.substring(0, 1500)}\n` : '';

      // Build final prompt with structured context
      const prompt = `${systemPrompt}

## CURRENT DATE AND TIME:
${currentDateTime}
${cdoSection}
${conversationHistory}

## DETAILED CONTEXT FROM HR KNOWLEDGE BASE:
${context.relevantContext}

## USER QUESTION:
${question}

## YOUR RESPONSE:
Based on the context provided, please provide a comprehensive and accurate answer focusing on ${context.queryType} aspects:`;

      console.log('📝 Server RAG prompt length:', prompt.length, 'characters');
      console.log('🎯 Query type:', context.queryType);
      
      // Call AI API
      return await this.callAIAPI(prompt, messageElement);

    } catch (error) {
      console.error('❌ Error in server RAG getAIResponse:', error);
      throw new Error(`Failed to get AI response: ${error.message}`);
    }
  }

  /**
   * Unified API call method
   */
  async callAIAPI(prompt, messageElement = null) {
    this.abortController = new AbortController();
    
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        mode: "cors",
        body: JSON.stringify({ 
          prompt: prompt,
          stream: true 
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Request too large. Please try a more specific question.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        return await this.handleStreamingResponse(response, messageElement);
      } else {
        const data = await response.json();
        return data.answer || "I couldn't find specific information about this in the knowledge base. Please contact your HR Business Partner for detailed assistance.";
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request aborted by user');
        throw error;
      }
      
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
      } else if (error.message.includes('413') || error.message.includes('too large')) {
        throw new Error('Your request is too large. Please try starting a new chat to reduce context size.');
      } else {
        console.error('API Error:', error);
        throw new Error(`Failed to get response: ${error.message}`);
      }
    }
  }

  async handleStreamingResponse(response, messageElement) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullAnswer = '';
    
    if (!messageElement) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.token) {
                  fullAnswer += parsed.token;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Streaming cancelled by user');
        } else {
          throw error;
        }
      }
      return fullAnswer || "I'm not sure how to answer that. Could you try asking differently?";
    }
    
    const contentDiv = messageElement.querySelector('.message-content');
    if (!contentDiv) {
      console.error('No message-content div found in message element');
      return fullAnswer;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                fullAnswer += parsed.token;
                const event = new CustomEvent('streamingUpdate', { 
                  detail: { fullAnswer, contentDiv, messageElement } 
                });
                document.dispatchEvent(event);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Streaming cancelled by user');
        throw error;
      } else {
        console.error('Streaming error:', error);
        throw error;
      }
    }
    
    return fullAnswer || "I'm not sure how to answer that. Could you try asking differently?";
  }

  /**
   * CDO Cache Methods
   */
  async initializeCDOCache() {
    try {
      const cachedData = localStorage.getItem('cdoInfoCache');
      const timestamp = localStorage.getItem('cdoCacheTimestamp');
      
      if (cachedData && timestamp) {
        this.cdoInfoCache = cachedData;
        this.cacheTimestamp = parseInt(timestamp);
        console.log('Initialized CDO cache from localStorage');
        
        if (!this.isCacheValid()) {
          console.log('Cache expired, fetching fresh data in background...');
          this.getCDOInfo(true).catch(err => {
            console.warn('Background refresh failed:', err);
          });
        }
      } else {
        console.log('No cache found, fetching CDO info...');
        await this.getCDOInfo();
      }
    } catch (error) {
      console.error('Error initializing CDO cache:', error);
      this.cdoInfoCache = this.getFallbackCDOInfo();
      this.cacheTimestamp = Date.now();
    }
  }

  isCacheValid() {
    if (!this.cdoInfoCache || !this.cacheTimestamp) {
      return false;
    }
    
    const now = Date.now();
    return (now - this.cacheTimestamp) < this.CACHE_DURATION;
  }

  async getCDOInfo(forceRefresh = false) {
    if (!forceRefresh && this.isCacheValid()) {
      console.log('Using cached CDO Foodsphere data');
      return this.cdoInfoCache;
    }
    
    try {
      const freshData = await this.fetchCDOCompanyInfo();
      this.cdoInfoCache = freshData;
      this.cacheTimestamp = Date.now();
      
      try {
        localStorage.setItem('cdoInfoCache', freshData);
        localStorage.setItem('cdoCacheTimestamp', this.cacheTimestamp.toString());
      } catch (e) {
        console.warn('Could not store CDO info in localStorage:', e);
      }
      
      return freshData;
    } catch (error) {
      console.error('Error fetching fresh CDO info:', error);
      
      if (this.cdoInfoCache) {
        console.log('Using expired cache due to fetch error');
        return this.cdoInfoCache;
      }
      
      try {
        const cachedData = localStorage.getItem('cdoInfoCache');
        if (cachedData) {
          console.log('Using localStorage backup for CDO info');
          this.cdoInfoCache = cachedData;
          this.cacheTimestamp = parseInt(localStorage.getItem('cdoCacheTimestamp') || '0');
          return cachedData;
        }
      } catch (e) {
        console.warn('Could not retrieve from localStorage:', e);
      }
      
      console.log('Using fallback CDO info');
      const fallbackData = this.getFallbackCDOInfo();
      this.cdoInfoCache = fallbackData;
      this.cacheTimestamp = Date.now();
      return fallbackData;
    }
  }

  async fetchCDOCompanyInfo() {
    try {
      console.log('Fetching fresh CDO Foodsphere data from Wikipedia...');
      
      const apiUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&titles=CDO_Foodsphere&explaintext=1&origin=*';
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}`);
      }
      
      const data = await response.json();
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId === '-1') {
        console.warn('CDO Foodsphere Wikipedia page not found');
        throw new Error('Wikipedia page not found');
      }
      
      const extract = pages[pageId].extract;
      
      if (!extract || extract.trim().length === 0) {
        console.warn('Wikipedia returned empty content');
        throw new Error('Empty Wikipedia content');
      }
      
      console.log('Successfully fetched CDO Foodsphere data from Wikipedia');
      
      return `CDO Foodsphere, Inc. - Company Information:\n\n${extract}`;
      
    } catch (error) {
      console.error('Error fetching CDO info from Wikipedia:', error);
      throw error;
    }
  }

  getFallbackCDOInfo() {
    return `CDO Foodsphere, Inc. is a leading Philippine meat processing company based in Valenzuela, Metro Manila.

Company History:
- Founded: June 25, 1975 by Corazon Dayro Ong and Jose Ong
- Started as small home-based business in Valenzuela
- "CDO" from founder's initials: Corazon Dayro Ong
- Initial products: Siopao with longanisa filling, longanisa, tocino
- 1981: Registered as CDO Foodsphere Inc.
- 1990: First modern factory in Canumay, Valenzuela
- 1997: Second factory and launched CDO Karne Norte
- 2009: 9-hectare factory in Batangas

Products: CDO brand, longanisa, tocino, siopao, Karne Norte canned goods

Note: This is fallback information. Refer to official sources for current data.`;
  }

  /**
   * Dummy methods for compatibility
   */
  enablePhaseOptimization() {
    console.log('Phase optimization not needed with server-side RAG');
  }

  disablePhaseOptimization() {
    console.log('Phase optimization not needed with server-side RAG');
  }

  /**
   * Analyzes the question to determine if CDO company info is needed
   */
  needsCDOInfo(question) {
    const lowerQuestion = question.toLowerCase();
    
    const cdoKeywords = [
      'cdo', 'foodsphere', 'company', 'history', 'founder', 'founded',
      'corazon dayro ong', 'jose ong', 'valenzuela', 'batangas',
      'factory', 'establishment', 'origin', 'started', 'began',
      'karne norte', 'product', 'brand', 'meat processing',
      'about us', 'about the company', 'who are we', 'organization',
      'business', 'corporation', 'manufacturing', 'food industry',
      'million meats', 'corporate'
    ];
    
    return cdoKeywords.some(keyword => lowerQuestion.includes(keyword));
  }
  
  clearCache() {
    this.cdoInfoCache = null;
    this.cacheTimestamp = null;
    this.conversationSummary = '';
    try {
      localStorage.removeItem('cdoInfoCache');
      localStorage.removeItem('cdoCacheTimestamp');
      console.log('CDO cache cleared');
    } catch (e) {
      console.warn('Could not clear localStorage cache:', e);
    }
  }

  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  isLoading() {
    return this.abortController !== null;
  }
}