## Bug Fix: Hide Sources when Knowledge is Missing

The issue is that the bot continues to display a "SOURCES" section even when it cannot find the answer in the provided documents. This happens because both the backend and frontend have fallback logic that populates sources even when a "missing knowledge" state is detected.

### Technical Implementation:

**1. Backend Enhancements:**
- **[ragController.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/controllers/ragController.js):** 
    - Update the missing knowledge detection logic to set a `missingKnowledge` flag.
    - If `missingKnowledge` is true, clear the `documentSources` and `toolSources` arrays to prevent irrelevant sources from being sent.
    - Include `missing_knowledge: true` in the JSON response payload.
- **[full_duplex_ws.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/ws/full_duplex_ws.js):**
    - Add logic to detect the `<MISSING_KNOWLEDGE>` tag in the streaming response.
    - If detected, clear the sources sent in the final `done` message and include a `missing_knowledge` flag in the metadata.

**2. Frontend Improvements:**
- **[chat.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/frontend/assets/js/chat.js):**
    - Modify `buildAnswerWithSources` to accept an optional `missingKnowledge` parameter.
    - If `missingKnowledge` is true, return the answer immediately without appending the "Sources" section.
    - Update `submitQuestion` and `finalizeFdSession` to pass the `missing_knowledge` flag from the backend response to `buildAnswerWithSources`.

### Verification Plan:
1. Ask a question that the bot clearly doesn't have knowledge of (e.g., "What is the salary of the supervisor here in the company?" as seen in the screenshot).
2. Verify that the response still states it doesn't have the information but **no longer** shows the "SOURCES" section.
3. Ask a valid question that is in the knowledge base and verify that sources are still displayed correctly.
4. Test both text input and voice input (Full Duplex) to ensure consistency across both modes.
