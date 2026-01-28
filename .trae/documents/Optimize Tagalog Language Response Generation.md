## **Optimizing Tagalog Response Logic**

### **1. Update backend/controllers/ragController.js**
*   **Refine Interaction Guidelines**: Modify the "HUMAN INTERACTION GUIDELINES" to include Tagalog equivalents for the examples (e.g., explaining how to "Admit Gaps Gracefully" in Tagalog).
*   **Strengthen Scenario 2**: Add a directive to Scenario 2 (Full Tagalog) that explicitly prohibits the use of English loanwords when a Tagalog equivalent exists (e.g., using "patakaran" instead of "policy").
*   **Enforce Language Consistency**: Add a "Negative Constraint" to the prompt injection to prevent the model from bleeding English into Tagalog responses.

### **2. Update backend/utils/prompts.js**
*   **Persona Synchronization**: Ensure all templates (LIVE_DATA, KNOWLEDGE_BASE, PERSONAL_ACTION, GENERAL) have the same high-standard language instructions.
*   **Better Examples**: Replace or supplement current examples in the templates to demonstrate "Pure Tagalog" vs. "Conyo Taglish" more clearly.

### **3. Verification**
*   I will verify the changes by checking the constructed prompts to ensure the instructions are clear and non-contradictory.
