import type { EventSummary } from '../types';

export const parseEventDate = (value: string, endOfDay = false): Date | null => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: string): string => {
  const date = parseEventDate(value);
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date) : value;
};

export const isPast = (value: string): boolean =>
  (parseEventDate(value, true)?.getTime() ?? 0) < Date.now();

export const isFutureEvent = (event: Pick<EventSummary, 'event_date' | 'status'>): boolean =>
  event.status === 'published' && !isPast(event.event_date);

export const eventTimestamp = (event: Pick<EventSummary, 'event_date' | 'start_time'>): number => {
  const value = `${event.event_date}T${event.start_time ?? '00:00'}`;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};
