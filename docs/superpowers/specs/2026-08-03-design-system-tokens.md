# Design System Tokens

This reference defines the shared design tokens introduced for the frontend.
Use these tokens before adding ad-hoc color or spacing classes.

## Colors

- **Primary actions:** `emerald-700`, with `emerald-800` on hover.
- **Secondary actions:** neutral gray border and text.
- **Destructive actions:** `red-300` border and `red-700` text.
- **Informational links:** `emerald-700` with an underline.
- **Rundmail:** purple is reserved for the Orga-only mail action.
- **Logout:** `red-600` is reserved for destructive/logout actions.

The primary button token includes the shared `.action-control` touch target and
uses `emerald-700` to maintain the required contrast for white text.

## Spacing

- **`card-shell`:** shared card/modal-body container with `1.25rem` padding,
  increasing to `1.5rem` at the `sm` breakpoint.
- **`stack-md`:** stacked form/content groups with `1rem` vertical rhythm.

## Modals

All modals render through `ModalShell`. Footer buttons use a consistent order:
secondary actions on the left and the primary action on the right. When a
destructive action is present, it is pinned to the far left, matching the
current `EventSignupModal` "Abmelden" placement.
