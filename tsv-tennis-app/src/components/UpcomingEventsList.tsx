import { CalendarIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import type { EventDetail } from '../types';
import { cardShellClass, stackMdClass } from '../styles/tokens';
import { eventTimestamp, formatDate, isFutureEvent } from '../utils/dates';

type UpcomingEventsListProps = {
    events?: EventDetail[];
    limit?: number;
    isLoading?: boolean;
    error?: unknown;
};

const EventRow = ({ detail }: { detail: EventDetail }) => {
    const event = detail.event;
    const ownSignup = detail.own_signup;

    return (
            <article className="relative border-t border-[var(--hairline)] py-4 pl-5 first:border-t-0 sm:pl-6">
            <span aria-hidden="true" className="absolute left-0 top-6 h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{event.type === 'work-duty' ? 'Arbeitsdienst' : 'Veranstaltung'}</p>
                    {event.allow_signups ? (
                      <Link className="mt-1 flex min-h-11 items-center text-base font-semibold text-[var(--ink)] underline decoration-[var(--hairline)] underline-offset-4 hover:decoration-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20" to={`/dashboard/veranstaltungen?eventId=${event.id}`}>{event.title}</Link>
                    ) : (
                      <span className="mt-1 block text-base font-semibold text-[var(--ink)]">{event.title}</span>
                    )}
                    <p className="mt-1 text-sm text-[var(--body)]">{formatDate(event.event_date)}{event.start_time ? `, ${event.start_time} Uhr` : ''}</p>
                    {(event.location || event.description) && <p className="mt-1 text-sm text-[var(--muted)]">{event.location || event.description}</p>}
                </div>
                {ownSignup && <p className="shrink-0 text-sm font-medium text-[var(--primary-active)]">Ihre Anmeldung: {ownSignup.people_count} Personen</p>}
            </div>
        </article>
    );
};

const UpcomingEventsList = ({ events, limit = 3, isLoading = false, error }: UpcomingEventsListProps) => {
    const upcomingEvents = (events ?? []).filter((detail) => isFutureEvent(detail.event)).sort((a, b) => eventTimestamp(a.event) - eventTimestamp(b.event)).slice(0, limit);

    if (isLoading) {
        return (
            <section aria-label="Nächste Veranstaltungen" className="min-h-56 rounded-xl border border-[var(--hairline)] bg-white p-4 sm:p-6">
                <h2 className="text-lg font-extrabold tracking-tight text-[var(--ink)]">Nächste Veranstaltungen</h2>
                <div className="mt-4 space-y-4">
                    <div data-testid="event-skeleton" className="bg-[var(--hairline-soft)] animate-pulse h-16 w-full rounded-md"></div>
                    <div data-testid="event-skeleton" className="bg-[var(--hairline-soft)] animate-pulse h-16 w-full rounded-md"></div>
                    <div data-testid="event-skeleton" className="bg-[var(--hairline-soft)] animate-pulse h-16 w-full rounded-md"></div>
                </div>
            </section>
        );
    }

    if (error) {
        return null;
    }

    return (
        <section aria-label="Nächste Veranstaltungen" className={`${cardShellClass} min-h-56`}>
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold tracking-tight text-[var(--ink)]">Nächste Veranstaltungen</h2>
                <Link
                    to="/dashboard/veranstaltungen"
                    aria-label="Alle Veranstaltungen anzeigen"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--hairline-strong)] text-[var(--body)] hover:bg-[var(--hairline-soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                >
                    <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
                </Link>
            </div>
            {upcomingEvents.length === 0 ? (
                <div className="mt-8 flex flex-col items-center text-center text-sm text-[var(--body)]">
                    <CalendarIcon data-testid="empty-events-icon" className="mb-3 text-[var(--hairline)] h-12 w-12" />
                    <p>Keine anstehenden Veranstaltungen veröffentlicht.</p>
                    <Link className="mt-2 inline-block font-medium text-[var(--primary-active)] underline underline-offset-4" to="/dashboard/veranstaltungen">Zu den Veranstaltungen</Link>
                </div>
            ) : <div className={`${stackMdClass} mt-4`}>{upcomingEvents.map((detail) => <EventRow key={detail.event.id} detail={detail} />)}</div>}
        </section>
    );
};

export default UpcomingEventsList;
