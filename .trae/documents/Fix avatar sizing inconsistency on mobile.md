I will fix the mobile-specific avatar sizing issue by ensuring the `avatar-yellow` (default state) matches the size and position of `avatar-red` (hover state) on mobile devices.

The plan is to:
1.  Modify `frontend/assets/css/chat.css`.
2.  Add a CSS rule within the existing `@media (max-width: 768px)` block to target `#welcome-message .welcome-avatar`.
3.  Apply `transform: scale(0.82);` and `transform-origin: bottom center;` to `avatar-yellow` so it matches the existing scaling of `avatar-red`.

This will ensure that on mobile devices, both avatars have the same visual scale, eliminating the size jump during transition, while preserving the existing behavior on desktop.