## Bug Fix: Remove "<MISS" and "<MISSING_KNOWLEDGE>" fragments from bot responses

### Backend Changes
1. **Update HTTP Controller Cleanup**:
   - In `backend/controllers/ragController.js`, update the missing knowledge detection to use a regex that handles partial tags at the end of the string.
2. **Update WebSocket Streaming Cleanup**:
   - In `backend/ws/full_duplex_ws.js`, apply the same regex cleaning to the final text chunk before it is sent to the client and before it is sent to the TTS engine.

### Frontend Changes
1. **Update Response Sanitization**:
   - In `frontend/assets/js/chat.js`, modify `cleanAIResponse` to remove `<MISSING_KNOWLEDGE>` and its partial fragments (like `<MISS`) from the final rendered text.

### Verification
- Verify that bot responses no longer show "<MISS" or "<MISSING_KNOWLEDGE>" tags.
- Ensure that the "Missing Knowledge" metadata flag and admin notifications still work correctly.