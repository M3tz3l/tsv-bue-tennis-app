import { CalendarDaysIcon, ClockIcon, HomeIcon } from '@heroicons/react/24/outline';

export const routes = [
  { label: 'Übersicht', to: '/dashboard', Icon: HomeIcon, end: true },
  { label: 'Arbeitsstunden', to: '/dashboard/arbeitsstunden', Icon: ClockIcon, end: false },
  { label: 'Veranstaltungen', to: '/dashboard/veranstaltungen', Icon: CalendarDaysIcon, end: false },
] as const;
