I will implement a comprehensive set of fixes to ensure the microphone functionality is robust and "mobile compatible," specifically addressing the "stuck" issue and preventing common mobile pitfalls.

### **The Problem: Mobile Instability**
Mobile browsers often have touch sensitivity issues (accidental double-taps) and slower processing for the microphone service. This leads to:
1.  **Race Conditions**: Tapping twice quickly confuses the app (Start -> Stop -> Start), causing the "InvalidStateError" loop where you can't cancel.
2.  **State Mismatches**: The app thinks it's stopped, but the mobile browser keeps the microphone open.

### **The Solution: Mobile Compatibility Upgrade**
I will apply a two-part fix in `frontend/assets/js/app.js`:

1.  **Fix the "Stuck" Loop (Error Handling)**:
    *   If the browser says "I'm already recording" (`InvalidStateError`), the app will now **acknowledge this** and set the button to "Active/Red".
    *   This ensures that your next tap will **successfully stop** the recording, instead of failing silently.

2.  **Add "Debounce" Protection (Double-Tap Prevention)**:
    *   I will add a **500ms safety delay** between microphone toggles.
    *   This prevents accidental double-taps or rapid-fire clicks from crashing the speech service, which is a very common cause of issues on mobile devices.

### **Plan**
1.  **Modify `frontend/assets/js/app.js`**:
    *   Insert a `lastToggleTime` variable to track interaction timing.
    *   Add the debounce check at the start of `toggleMic`.
    *   Update the `catch` block to handle `InvalidStateError` by syncing the state to `true` (Active).

**Shall I proceed with these mobile compatibility improvements?**