## Enhance Admin Notifications for Knowledge Gaps and Access Restrictions

I will implement a dual-layered detection system to distinguish between cases where information is missing from the knowledge base and cases where the user simply lacks the necessary permissions to see it.

### **1. Backend: RAG Service Enhancement**
- **Update [ragService.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/services/ragService.js)**:
    - Modify the `getContext` method to return two new boolean flags: `isMissingKnowledge` (true if no relevant chunks are found at all) and `isAccessDenied` (true if relevant chunks exist but were all filtered out due to permissions).
    - Update the `contextString` returned in the "No Access" case to include a machine-readable prefix (e.g., `[SYSTEM: NO_ACCESS]`) to help the AI identify this scenario.

### **2. Backend: AI Service Integration**
- **Update [aiService.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/services/aiService.js)**:
    - Update `getEnhancedContext` to propagate the `isMissingKnowledge` and `isAccessDenied` flags from the RAG system back to the controller.

### **3. Backend: Tool Service Expansion**
- **Update [toolService.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/services/toolService.js)**:
    - Create a new system tool definition: `signal_no_access_knowledge`.
    - Implement the execution logic for this tool to return a `no_access_flag`.
    - Register the tool in `getAvailableTools` so the AI can use it when it detects a permission barrier.

### **4. AI Prompting: Better Detection Instructions**
- **Update [prompts.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA%2Fbackend%2Futils%2Fprompts.js)**:
    - Add a new section **"NO ACCESS TO KNOWLEDGE DETECTION"** to the `KNOWLEDGE_BASE` prompt.
    - Instruct the AI to call `signal_no_access_knowledge` or append a `<NO_ACCESS_KNOWLEDGE>` tag if the retrieved context indicates access restrictions (using the new `[SYSTEM: NO_ACCESS]` prefix as a trigger).

### **5. Backend: Controller & Notification Logic**
- **Update [ragController.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/controllers/ragController.js)**:
    - In the `askQuestion` endpoint, capture the new flags and tool results.
    - Implement specific admin notification logic for both scenarios:
        - **Missing Knowledge**: `Missing Knowledge: User "[Name]" asked: "[Prompt]". AI could not find specific answer.`
        - **No Access**: `No Access to Knowledge: User "[Name]" asked: "[Prompt]". Relevant info exists but user lacks permissions.`
    - Add regex detection for the new `<NO_ACCESS_KNOWLEDGE>` tag in the final AI response.

## Milestone
- Distinguish between "I don't know" and "You don't have access".
- Automatically notify admins with the specific reason for the failure.
- Help admins identify which documents need to be added or which permissions need to be granted.
