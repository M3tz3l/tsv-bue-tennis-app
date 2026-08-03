import { CalendarIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvent } from '../hooks/useEvents';
import { getApiErrorMessage } from '../services/backendService';
import type { EventSummary } from '../types';

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
            <article className="relative border-t border-slate-200 py-4 pl-5 first:border-t-0 sm:pl-6">
            <span aria-hidden="true" className="absolute left-0 top-6 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{event.type === 'work-duty' ? 'Arbeitsdienst' : 'Veranstaltung'}</p>
                    <Link className="mt-1 flex min-h-11 items-center text-base font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-200" to={`/dashboard/veranstaltungen?eventId=${event.id}`}>{event.title}</Link>
                    <p className="mt-1 text-sm text-slate-600">{formatDate(event.event_date)}{event.start_time ? `, ${event.start_time} Uhr` : ''}</p>
                    {(event.location || event.description) && <p className="mt-1 text-sm text-slate-500">{event.location ?? event.description}</p>}
                </div>
                {ownSignup && <p className="shrink-0 text-sm font-medium text-emerald-700">Ihre Anmeldung: {ownSignup.people_count} Personen</p>}
            </div>
        </article>
    );
};

const UpcomingEventsList = ({ events, limit = 3, isLoading = false, error }: UpcomingEventsListProps) => {
    const { user } = useAuth();
    const upcomingEvents = (events ?? []).filter(isFutureEvent).sort((a, b) => eventTimestamp(a) - eventTimestamp(b)).slice(0, limit);

    if (isLoading) {
        return (
            <section aria-label="Als Nächstes" className="min-h-56 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold text-slate-900">Als Nächstes</h2>
                <div className="mt-4 space-y-4">
                    <div data-testid="event-skeleton" className="bg-slate-200 animate-pulse h-16 w-full rounded-md"></div>
                    <div data-testid="event-skeleton" className="bg-slate-200 animate-pulse h-16 w-full rounded-md"></div>
                    <div data-testid="event-skeleton" className="bg-slate-200 animate-pulse h-16 w-full rounded-md"></div>
                </div>
            </section>
        );
    }

    if (error) {
        return <section aria-label="Als Nächstes" className="min-h-56 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">Als Nächstes</h2><p className="mt-4 text-sm">{getApiErrorMessage(error, 'Veranstaltungen konnten nicht geladen werden')}</p></section>;
    }

    return (
        <section aria-label="Als Nächstes" className="min-h-56 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Als Nächstes</h2>
                <Link className="text-sm font-medium text-emerald-700 underline underline-offset-4" to="/dashboard/veranstaltungen">Alle Veranstaltungen</Link>
            </div>
            {upcomingEvents.length === 0 ? (
                <div className="mt-8 flex flex-col items-center text-center text-sm text-slate-600">
                    <CalendarIcon data-testid="empty-events-icon" className="mb-3 text-slate-200 h-12 w-12" />
                    <p>Keine anstehenden Veranstaltungen veröffentlicht.</p>
                    <Link className="mt-2 inline-block font-medium text-emerald-700 underline underline-offset-4" to="/dashboard/veranstaltungen">Zu den Veranstaltungen</Link>
                </div>
            ) : <div className="mt-4">{upcomingEvents.map((event) => <EventRow key={event.id} event={event} userId={user?.id} />)}</div>}
        </section>
    );
};

export default UpcomingEventsList;
