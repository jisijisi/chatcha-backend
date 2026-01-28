I have identified the likely cause of the issue: the standard "word boundary" check (`\b`) in the regex fails when words are wrapped in certain characters, particularly underscores (`_siopao_`) which the AI often uses for italics.

I have verified a robust fix using Unicode Property Escapes that correctly handles these cases while respecting international characters (like "Piña").

### Plan:
1.  **Modify `backend/utils/speechNormalizer.js`**:
    *   Update the regex generation to use `(?<!\p{L}|\p{N})` and `(?!\p{L}|\p{N})` instead of `\b`.
    *   Enable the `u` (unicode) flag for the RegExp to support these properties.
    *   This ensures "Siopao" matches even if it appears as `_siopao_`, `*siopao*`, or `(siopao)`.

This change will make the pronunciation rules much more reliable across different AI response formats.