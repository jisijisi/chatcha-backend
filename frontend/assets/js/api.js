// api.js - Fixed to properly return full server response
import { CONFIG } from './config.js';
import { AI_BEHAVIOR, PROMPT_TEMPLATES } from './ai-behavior.js';
import { ResponseQuality } from './response-quality.js';

export class APIManager {
  constructor() {
    this.abortController = null;
    this.currentMarkdownParser = null;
  }
  
  setMarkdownParser(parser) {
    this.currentMarkdownParser = parser;
  }

  /**
   * MAIN METHOD - Direct server RAG call with proper response handling
   */
  async getAIResponse(question, hrKnowledgeBase, currentConversation, userName, messageElement = null) {
    this.abortController = new AbortController();
    
    try {
        console.log("🔍 Calling server RAG for company-wide knowledge...");
        
        // Enhanced request with behavior context
        const requestBody = {
            prompt: question,
            use_rag: true,
            behavior_context: {
                identity: AI_BEHAVIOR.identity,
                is_follow_up: currentConversation.length > 0,
                conversation_history: currentConversation.slice(-3) // Last 3 exchanges for context
            }
        };

        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(requestBody),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            if (response.status === 413) {
                throw new Error('Request too large. Please try a more specific question.');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        console.log("=== API RESPONSE DEBUG ===");
        console.log("Success:", data.success);
        console.log("Answer length:", data.answer?.length);
        console.log("Answer preview:", data.answer?.substring(0, 200));
        console.log("=== END DEBUG ===");
        
        if (data.success && data.answer) {
            console.log("✅ Server RAG response successful");
            
            // Optional: Log response quality for debugging
            const quality = ResponseQuality.checkResponseQuality(data.answer, question);
            console.log('Response Quality Score:', quality.score, 'Issues:', quality.issues);
            
            // Return the FULL answer without any modification
            return data.answer;
        } else {
            throw new Error(data.error || "Server returned no answer");
        }

    } catch (error) {
        console.error('❌ Error in getAIResponse:', error);
        
        if (error.name === 'AbortError') {
            console.log('Request aborted by user');
            throw error;
        }
        
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
        } else if (error.message.includes('413') || error.message.includes('too large')) {
            throw new Error('Your request is too large. Please try starting a new chat to reduce context size.');
        } else {
            throw new Error(`Failed to get response: ${error.message}`);
        }
    } finally {
        this.abortController = null;
    }
  }

  /**
   * Streaming response handler (if needed in future)
   */
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
   * Unified API call method (for compatibility)
   */
  async callAIAPI(prompt, messageElement = null) {
    // Redirect to main method for simplicity
    return await this.getAIResponse(prompt, null, [], null, messageElement);
  }

  /**
   * Essential methods only
   */
  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  isLoading() {
    return this.abortController !== null;
  }
  
  /**
   * Simple company info check (minimal implementation)
   */
  needsCDOInfo(question) {
    const lowerQuestion = question.toLowerCase();
    const companyKeywords = ['cdo', 'foodsphere', 'company', 'history', 'founder', 'about us'];
    return companyKeywords.some(keyword => lowerQuestion.includes(keyword));
  }

  /**
   * Simple conversation optimization (keep recent messages only)
   */
  optimizeConversationHistory(conversation, currentQuestion) {
    // Just keep the last 3 exchanges for context
    return conversation.slice(-3);
  }

  /**
   * Dummy methods for compatibility - do nothing
   */
  enablePhaseOptimization() {
    console.log('Phase optimization handled by server RAG');
  }

  disablePhaseOptimization() {
    console.log('Phase optimization handled by server RAG');
  }

  clearCache() {
    console.log('Cache clearing handled by server');
  }

  async initializeCDOCache() {
    console.log('Company info cache handled by server RAG');
  }

  async getCDOInfo() {
    return ''; // Let server handle company info through RAG
  }
}