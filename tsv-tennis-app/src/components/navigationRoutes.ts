export const routes = [
  { label: 'Übersicht', to: '/dashboard', end: true },
  { label: 'Arbeitsstunden', to: '/dashboard/arbeitsstunden', end: false },
  { label: 'Veranstaltungen', to: '/dashboard/veranstaltungen', end: false },
] as const;
