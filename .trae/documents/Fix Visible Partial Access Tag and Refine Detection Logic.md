## Implement Robust Tag Cleanup and Refined Partial Access Logic

The issue where the bot displays `<PARTIALACCESSKNOWLEDGE>` is caused by two factors:
1. **Regex Mismatch**: The backend expects tags with underscores (e.g., `<PARTIAL_ACCESS_KNOWLEDGE>`), but the AI sometimes outputs them without underscores. This prevents the backend from hiding the tag before showing the response to you.
2. **False Positive Detection**: The system currently flags "partial access" if *any* document in the search results is restricted, even if those documents are irrelevant to your specific question.

### Technical Implementation:

**1. Refine Detection Logic in [ragService.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/services/ragService.js)**
- Modify the `partialAccess` detection to only trigger if restricted documents are within the top `topK` search results (the ones actually used for context).
- This will prevent unnecessary "partial access" warnings for company-wide information (like the founder's name) when the restricted info is buried deep in the search results.

**2. Improve Tag Cleanup in [ragController.js](file:///c:/Users/jmacaraeg/Documents/JC%20FILES/ChatCHA/backend/controllers/ragController.js)**
- Update the cleaning regexes for `MISSING_KNOWLEDGE`, `NO_ACCESS_KNOWLEDGE`, and `PARTIAL_ACCESS_KNOWLEDGE` to handle variations with or without underscores.
- Ensure the regex is flexible enough to catch common AI formatting inconsistencies.

**3. Verification**
- Test with the "Who is the founder of CDO?" query to ensure the tag is properly hidden and the response no longer incorrectly flags partial access when the full answer is available from Wikipedia or unrestricted sources.

Does this plan look good to you?