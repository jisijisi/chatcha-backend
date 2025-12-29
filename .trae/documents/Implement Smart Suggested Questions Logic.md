I will implement the requested "smart suggested questions" feature by modifying the backend logic to generate questions based on permissions and regenerate them upon permission updates.

### 1. Update Suggestion Generation Logic
**File:** `backend/controllers/suggestionsController.js`
- Modify `generateSuggestionWithLLM` to support generating multiple questions (3) in a single request.
- Update the prompt to request "3 specific, practical questions" instead of one.
- Update the response parsing to handle a list of questions (e.g., splitting by newlines or parsing JSON).
- In `getSuggestedQuestion`, update the loop over subcategories to request 3 questions for each subcategory.
- Ensure the questions are flattened into a single array before storing.

### 2. Trigger Regeneration on Permission Update
**File:** `backend/controllers/adminController.js`
- Import `clearSuggestedQuestion` and `clearSuggestedQuestionsForEmployees` from `../controllers/suggestionsController.js`.
- In `updateUserPermissions`: Call `clearSuggestedQuestion(userId)` after successfully updating permissions. This forces the system to regenerate questions on the next login.
- In `bulkUpdatePermissions`: Call `clearSuggestedQuestionsForEmployees(userIds)` after the bulk update transaction.

### 3. Verify Login Flow
- The existing `getSuggestedQuestion` controller already implements the "check if empty, then generate" logic.
- When the user logs in (or the frontend loads), it calls this endpoint.
- If the `suggested_question` column is `NULL` (which we ensure it is after a permission update), the controller will trigger the generation process.
- If it is not `NULL`, it returns the cached questions.
- This satisfies the requirement "When a user logs in, it checks... When empty... generate... When user already has it... fetch it".

### Summary of Changes
- **Backend**:
    - `backend/controllers/suggestionsController.js`: Enhance generation logic to produce 3 questions per subcategory.
    - `backend/controllers/adminController.js`: Add triggers to clear stored questions when permissions change.
