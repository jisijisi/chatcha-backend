## **Problem Analysis**
The "Not Found (404)" error occurs because the model identifier `gemini-2.0-flash-exp` is not available for your current API key. My research confirms that while the experimental version is unavailable, the stable `gemini-2.0-flash` model is fully functional. Additionally, the system currently shows a generic "Error connecting to test server" instead of the specific error from Google, which makes troubleshooting difficult.

## **Proposed Implementation**

### **1. Backend: Enhance Model Testing Logic**
- Update [adminController.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/controllers/adminController.js) to:
    - Improve error capturing in the model test fallback logic (v1beta -> v1).
    - Ensure that if both attempts fail, the most relevant error message is returned to the frontend.

### **2. Frontend: Improve Error Reporting & Model Selection**
- Update [settings.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/frontend/assets/js/admin/modules/settings.js) to:
    - Display the actual error message from the backend in the "Add Model" modal instead of a generic connection error.
    - Update the default model list to include modern models like **Gemini 2.0 Flash** and **Gemini 2.5 Flash**.
    - Implement dynamic model loading to fetch all available models supported by your API key directly from the Google API via our backend.

### **3. Verification**
- I will verify the fix by testing the "Run Test" feature with `gemini-2.0-flash` and ensuring the error message is clear if an invalid model is entered.

## **Next Steps**
I will proceed with these changes to ensure the "Add AI Model" feature is robust and provides clear feedback. You should use `gemini-2.0-flash` instead of the experimental version for stable performance.

Does this plan look good to you?
