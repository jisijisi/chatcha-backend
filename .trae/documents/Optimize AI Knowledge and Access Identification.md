## Optimize Knowledge Identification and Access Denied Responses

To optimize how the AI distinguishes between missing knowledge and restricted access, I will implement a multi-layered approach across the backend services. This will ensure the AI is explicitly aware of why it might be missing information and can communicate this clearly to the user.

### **1. Backend Enhancements (ragService.js)**
- **Partial Access Detection**: Update `getContext` to detect when some relevant results are filtered out due to permissions, while others remain. A new `partialAccess` flag will be returned.
- **Detailed Context Metadata**: When access is denied or partially restricted, I will include the names of the restricted documents or categories in a hidden `[SYSTEM: META]` section within the context. This allows the AI to know *what* it can't see, without revealing the content.

### **2. Controller Improvements (ragController.js)**
- **Fix Reference Bugs**: Move `missingKnowledge` and `noAccessKnowledge` declarations to the top of the `askQuestion` function to resolve potential `ReferenceError` issues.
- **Explicit System Injection**: If a gap (missing, denied, or partial) is detected by the RAG system, I will inject a high-priority system alert at the end of the final prompt. This forces the LLM to acknowledge the gap and use the correct hidden tags (`<MISSING_KNOWLEDGE>`, `<NO_ACCESS_KNOWLEDGE>`, or a new `<PARTIAL_ACCESS_KNOWLEDGE>`).
- **Robust Detection**: Use the flags from the RAG system directly to set the final response status, making the system less dependent on the LLM's phrasing while still using the LLM's response as a fallback.

### **3. Prompt Refinement (prompts.js)**
- **Updated Instructions**: Enhance the `KNOWLEDGE_BASE` template with more forceful instructions on handling `[SYSTEM ALERT]` messages.
- **Tag Consistency**: Standardize the use of hidden tags to ensure the frontend and admin notification systems receive consistent signals.

### **4. Service Integration (aiService.js)**
- **Flag Pass-through**: Update `getEnhancedContext` to properly propagate the new `partialAccess` and metadata fields from the RAG service to the controller.

## **Key Benefits**
- **Clarity**: Users will receive more specific answers (e.g., "I found information about the Leave Policy, but your account is restricted from viewing it") instead of generic "I don't know" responses.
- **Reliability**: Admin notifications for missing knowledge or access requests will be 100% accurate because they will be triggered by system flags rather than fuzzy keyword matching.
- **Accuracy**: The AI will be less likely to "hallucinate" or guess when it knows exactly which documents are restricted.
