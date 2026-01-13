# Fix Lagging Nested Modals in Knowledge Base

## Problem Analysis
The "lag" when opening modals like "Regenerating Cache" or "File Conversion" is caused by a CSS conflict:
1.  **Heavy Full-Screen Animation**: These modals have the `.modal` class, which applies a `slideUp` animation. However, they are also styled as full-screen fixed overlays. This causes the *entire dark background overlay* to slide up, which is computationally expensive.
2.  **Backdrop Stacking**: These modals open on top of the Knowledge Base (which has a `backdrop-filter: blur`). Animating a large transparency over a blur effect causes significant GPU overhead.

## Implementation Plan
I will optimize `frontend/assets/css/modal.css` to separate the **overlay** from the **content box**.

### 1. Optimize Overlay Container
Target the nested modal IDs (`#kb-conversion-status-modal`, `#cache-progress-modal`, etc.) and:
-   **Disable Animations**: Remove `animation` and `transition` from the full-screen container.
-   **Remove Heavy Effects**: Force `backdrop-filter: none`, `box-shadow: none`, and `transform: none` on the overlay.
-   **Reset Box Styles**: Remove `border-radius` from the overlay.

### 2. Apply Box Styling to Content
Target the `.modal-content` inside these specific modals and:
-   **Restore Card Look**: Apply `background`, `border-radius`, and `box-shadow` here instead.
-   **Lightweight Animation**: Add a simple, fast `fadeIn` (opacity only) animation to the content box. This is much cheaper than moving pixels.

### 3. Scope
This fix will be applied to all Knowledge Base nested modals to ensure consistent smooth performance:
-   `kb-conversion-status-modal` (File to JSON)
-   `cache-progress-modal` (Regenerating Cache)
-   `kb-doc-modal` (Add Document)
-   `kb-subcat-modal` (Add Subcategory)
-   `kb-view-modal` (Preview)
-   `kb-delete-confirm-modal` (Delete)
