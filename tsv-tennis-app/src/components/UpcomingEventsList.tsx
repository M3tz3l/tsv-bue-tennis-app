import { CalendarIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../hooks/useEvents';
import { getApiErrorMessage } from '../services/backendService';
import type { EventSummary } from '../types';
import { cardShellClass, stackMdClass } from '../styles/tokens';

type UpcomingEventsListProps = {
    events?: EventSummary[];
    limit?: number;
    isLoading?: boolean;
    error?: unknown;
};

const eventTimestamp = (event: EventSummary) => {
    const value = `${event.event_date}T${event.start_time ?? '00:00'}`;
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

const isFutureEvent = (event: EventSummary) => {
    const endOfDay = new Date(`${event.event_date}T23:59:59`).getTime();
    return event.status === 'published' && !Number.isNaN(endOfDay) && endOfDay >= Date.now();
};

const formatDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date);
};

const EventRow = ({ event, userId }: { event: EventSummary; userId?: string }) => {
    const { data: detail } = useEvent(userId, event.id);
    const ownSignup = detail?.own_signup;

    return (
            <article className="relative border-t border-[var(--hairline)] py-4 pl-5 first:border-t-0 sm:pl-6">
            <span aria-hidden="true" className="absolute left-0 top-6 h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{event.type === 'work-duty' ? 'Arbeitsdienst' : 'Veranstaltung'}</p>
                    <Link className="mt-1 flex min-h-11 items-center text-base font-semibold text-[var(--ink)] underline decoration-[var(--hairline)] underline-offset-4 hover:decoration-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20" to={`/dashboard/veranstaltungen?eventId=${event.id}`}>{event.title}</Link>
                    <p className="mt-1 text-sm text-[var(--body)]">{formatDate(event.event_date)}{event.start_time ? `, ${event.start_time} Uhr` : ''}</p>
                    {(event.location || event.description) && <p className="mt-1 text-sm text-[var(--muted)]">{event.location ?? event.description}</p>}
                </div>
                {ownSignup && <p className="shrink-0 text-sm font-medium text-[var(--primary)]">Ihre Anmeldung: {ownSignup.people_count} Personen</p>}
            </div>
        </article>
    );
};

const UpcomingEventsList = ({ events, limit = 3, isLoading = false, error }: UpcomingEventsListProps) => {
    const { user } = useAuth();
    const upcomingEvents = (events ?? []).filter(isFutureEvent).sort((a, b) => eventTimestamp(a) - eventTimestamp(b)).slice(0, limit);

    if (isLoading) {
        return (
            <section aria-label="Als Nächstes" className="min-h-56 rounded-xl border border-[var(--hairline)] bg-white p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-[var(--ink)]">Als Nächstes</h2>
                <div className="mt-4 space-y-4">
                    <div data-testid="event-skeleton" className="bg-[var(--hairline-soft)] animate-pulse h-16 w-full rounded-md"></div>
                    <div data-testid="event-skeleton" className="bg-[var(--hairline-soft)] animate-pulse h-16 w-full rounded-md"></div>
                    <div data-testid="event-skeleton" className="bg-[var(--hairline-soft)] animate-pulse h-16 w-full rounded-md"></div>
                </div>
            </section>
        );
    }

    if (error) {
        return <section aria-label="Als Nächstes" className="min-h-56 rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/5 p-4 text-[var(--error)] sm:p-6"><h2 className="text-lg font-semibold">Als Nächstes</h2><p className="mt-4 text-sm">{getApiErrorMessage(error, 'Veranstaltungen konnten nicht geladen werden')}</p></section>;
    }

    return (
        <section aria-label="Als Nächstes" className={`${cardShellClass} min-h-56`}>
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--ink)]">Als Nächstes</h2>
                <Link className="text-sm font-medium text-[var(--primary)] underline underline-offset-4" to="/dashboard/veranstaltungen">Alle Veranstaltungen</Link>
            </div>
            {upcomingEvents.length === 0 ? (
                <div className="mt-8 flex flex-col items-center text-center text-sm text-[var(--body)]">
                    <CalendarIcon data-testid="empty-events-icon" className="mb-3 text-[var(--hairline)] h-12 w-12" />
                    <p>Keine anstehenden Veranstaltungen veröffentlicht.</p>
                    <Link className="mt-2 inline-block font-medium text-[var(--primary)] underline underline-offset-4" to="/dashboard/veranstaltungen">Zu den Veranstaltungen</Link>
                </div>
            ) : <div className={`${stackMdClass} mt-4`}>{upcomingEvents.map((event) => <EventRow key={event.id} event={event} userId={user?.id} />)}</div>}
        </section>
    );
};

export default UpcomingEventsList;
