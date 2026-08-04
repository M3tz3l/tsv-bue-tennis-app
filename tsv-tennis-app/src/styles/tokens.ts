// Single source of truth for button color/variant classes and shared layout
// rhythm. Add new UI here instead of inlining raw Tailwind color/spacing
// classes in components.

export const buttonVariants = {
  // Primary call-to-action. The inOpera red is the single accent — reserved
  // for primary actions.
  primary:
    'action-control rounded-md bg-[var(--primary)] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-active)] disabled:bg-[var(--muted-soft)]',
  // Secondary/neutral action (cancel, close, edit) — white card pill with a
  // hairline border, per the editorial "hairline-only depth" rule.
  secondary:
    'action-control rounded-md border border-[var(--hairline-strong)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--hairline-soft)]',
  // Destructive action (delete signup, remove event). Error red, muted.
  destructive:
    'action-control rounded-md border border-[var(--error)]/40 text-sm font-medium text-[var(--error)] hover:bg-[var(--error)]/5',
} as const;

export const cardShellClass = 'card-shell';
export const stackMdClass = 'stack-md';

// Shared form-control base: inputs, selects, and textareas. Callers append
// the border color explicitly (e.g. `border-[var(--hairline)]`, or
// `border-[var(--error)]` for an invalid field) so a field can switch to an
// error color without fighting the base class.
export const fieldControl =
  'w-full min-h-[44px] rounded-md border px-3 py-2 text-[var(--ink)] placeholder:text-[var(--muted-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]';
