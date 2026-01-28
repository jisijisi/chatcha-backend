I will implement the changes to automatically apply "(Filipino pronunciation)" to all speech replacement rules.

### **Plan of Action**

1.  **Migrate Existing Rules**
    *   Create and run a migration script (`backend/scripts/migrate_filipino_pronunciation.js`) to update all existing rules in the database that are missing the "(Filipino pronunciation)" tag.
    *   This ensures your current list (like `Tocino`, `Siopao`, `Dayro`) is standardized immediately.

2.  **Update Backend Logic (`backend/controllers/speechController.js`)**
    *   Modify `addRule` and `updateRule` to automatically append `(Filipino pronunciation)` to the replacement text if it's not already present.
    *   This ensures that whenever you add or edit a rule in the future, you only need to type the phonetic spelling (e.g., "To-see-no"), and the system will handle the rest.

3.  **Update Frontend Testing (`frontend/assets/js/admin/modules/speech.js`)**
    *   Modify the `testPronunciation` function to append `(Filipino pronunciation)` to the text being tested if it's missing.
    *   This ensures that when you click the "Test" button, you hear exactly how it will sound after saving (with the Filipino accent), providing an accurate preview.

### **Verification**
*   Run the migration script and verify database updates.
*   Add a new rule (e.g., "TestWord" -> "Test-word") and verify it saves as "Test-word (Filipino pronunciation)".
*   Test the pronunciation in the admin panel to confirm the audio generation uses the Filipino context.
