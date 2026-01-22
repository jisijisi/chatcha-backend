I will implement a three-part optimization strategy to enhance AI response speed:

### 1. Smart Caching (Skip AI for repeats)
I will create a new `ResponseCacheService` to cache answers for common questions.
- **Action**: Create `backend/services/responseCacheService.js`.
- **Logic**: 
    - Store pairs of `{ "normalized_question": "cached_response" }` in a local JSON file.
    - Implement a 24-hour Expiration (TTL) to ensure answers stay fresh.
- **Integration**: Modify `ragController.js` to check this cache *before* triggering any AI logic. If a match is found, return the answer instantly (0ms latency).

### 2. Parallelize Requests (Concurrent Execution)
I will refactor `ragController.js` to run independent tasks simultaneously instead of one-by-one.
- **Current Flow**: `Get User Name` → `Classify Intent` → `Rewrite Query` → `Get Tools` → `Thinking Phrases`.
- **Optimized Flow**:
    - **Step 1**: Run `Get User Name` AND `Classify Intent` in parallel.
    - **Step 2**: Once Intent is known, run `Rewrite Query`, `Get Tools`, and `Thinking Phrases` in parallel.
- **Benefit**: This reduces the "dead time" where the server is just waiting for one task to finish before starting the next.

### 3. Optimize Prompt (Reduce Token Usage)
I will reduce the amount of data sent to Gemini to speed up processing time and save costs.
- **Reduce History**: Modify `backend/utils/aiBehavior.js` to lower `maxContextMessages` from **10** to **5**.
- **Reduce RAG Context**: Modify `ragController.js` to retrieve only the top **8** most relevant document chunks instead of **15**.
- **Benefit**: Processing 50% less text input results in significantly faster generation times.