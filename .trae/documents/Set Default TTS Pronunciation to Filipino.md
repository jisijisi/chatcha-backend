I will modify the backend TTS service to default to a Filipino accent/pronunciation by updating the prompt sent to the Gemini model.

**1. Modify** **`backend/services/ttsService.js`**

* Update the `tryGenerateWithModel` function.

* Change the prompt construction from `Say: ${text}` to `Say the following text with a Filipino accent: ${text}`.

* This ensures that all TTS requests (including the "Test Pronunciation" feature in the Admin Panel) will be generated with a Filipino accent by default.

**2. Verify**

* Since I cannot hear the output, I will verify the code changes are correctly applied.

* You can verify the result by using the "Test" button in the Admin Panel's pronunciation modal after the changes are applied.

