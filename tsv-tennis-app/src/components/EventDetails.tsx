import type { EventSummary } from '../types';
import { formatDate, formatTimeRange } from '../utils/dates';

type EventDetailsProps = {
  event: EventSummary;
  className?: string;
};

/** Shared event metadata block (date, time, location, capacity, deadline).
 * Used by the event card and the signup modal so the fields stay in sync. */
const EventDetails = ({ event, className = 'mt-3 space-y-1 text-sm' }: EventDetailsProps) => {
  const timeRange = formatTimeRange(event.start_time, event.end_time);

  return (
    <dl className={className}>
      <div><dt className="inline text-[var(--muted)]">Datum: </dt><dd className="inline font-medium text-[var(--ink)]">{formatDate(event.event_date)}</dd></div>
      {timeRange && <div><dt className="inline text-[var(--muted)]">Zeit: </dt><dd className="inline font-medium text-[var(--ink)]">{timeRange}</dd></div>}
      {event.location && <div><dt className="inline text-[var(--muted)]">Ort: </dt><dd className="inline font-medium text-[var(--ink)]">{event.location}</dd></div>}
      {event.capacity !== null && <div><dt className="inline text-[var(--muted)]">Belegt: </dt><dd className="inline font-medium text-[var(--ink)]">{event.signup_people_count} von {event.capacity}</dd></div>}
      {event.signup_deadline && <div><dt className="inline text-[var(--muted)]">Anmeldung bis: </dt><dd className="inline font-medium text-[var(--ink)]">{formatDate(event.signup_deadline)}</dd></div>}
    </dl>
  );
};

export default EventDetails;
