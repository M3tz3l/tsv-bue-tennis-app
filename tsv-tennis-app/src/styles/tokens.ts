// Single source of truth for button color/variant classes and shared layout
// rhythm. Add new UI here instead of inlining raw Tailwind color/spacing
// classes in components.

export const buttonVariants = {
  // Primary call-to-action (submit, save, sign up). emerald-700 keeps text
  // white at >=4.5:1 contrast (WCAG AA), unlike emerald-600/green-600.
  primary:
    'action-control rounded-md bg-emerald-700 font-medium text-white hover:bg-emerald-800 disabled:bg-slate-400',
  // Secondary/neutral action (cancel, close, edit).
  secondary:
    'action-control rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50',
  // Destructive action (delete signup, remove event).
  destructive:
    'action-control rounded-md border border-red-300 text-sm text-red-700 hover:bg-red-50',
} as const;

export const cardShellClass = 'card-shell';
export const stackMdClass = 'stack-md';
