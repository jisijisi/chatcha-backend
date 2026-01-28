I have analyzed the codebase and found that most of the logic for "Speech Normalization" (custom pronunciation) is already implemented in the backend but is currently dormant/disconnected. I will connect these pieces and add the necessary UI.

### 1. Backend: Enable Speech Routes
The speech controller and routes already exist but are not registered in the main server file. There is also a small import error in the routes file.
- **Fix `backend/routes/speech.routes.js`**: Remove the `verifyToken` import (which doesn't exist) and rely solely on `adminAuthMiddleware` for security.
- **Update `backend/server.js`**: Register the speech routes to handle requests at `/api/speech`.

### 2. Frontend: Add Admin UI
I will add a new "Pronunciation" section to the admin panel.
- **Update `frontend/admin.html`**:
  - Add a "Pronunciation" link to the sidebar.
  - Add the HTML structure for the `speech-view` section, including a table to list rules and a modal to add/edit them.
- **Update `frontend/assets/js/admin/main.js`**:
  - Import and initialize the existing `speech.js` module so the new UI becomes functional.

### 3. Verification
- The system will automatically create the `speech_normalization` database table if it doesn't exist.
- Admin users will be able to add rules (e.g., "AI" -> "A.I.", "Mekeni" -> "Meh-keh-nee").
- The Text-to-Speech engine will automatically pick up these rules (cache invalidation is already handled).
