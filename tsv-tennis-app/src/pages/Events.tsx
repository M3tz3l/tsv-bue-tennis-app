import { useState } from 'react';
import { CalendarIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../hooks/useEvents';
import useModalRoute from '../hooks/useModalRoute';
import type { EventDetail, EventSummary } from '../types';
import EventSignupModal from '../components/EventSignupModal';
import EventFormModal from '../components/EventFormModal';
import EventSignupsModal from '../components/EventSignupsModal';
import DashboardShell from '../components/DashboardShell';
import Spinner from '../components/Spinner';
import { getApiErrorMessage } from '../services/backendService';
import type { EventScope } from '../services/backendService';
import { isOrgaRole } from '../utils/roles';
import { buttonVariants, cardShellClass } from '../styles/tokens';
import { isPast } from '../utils/dates';
import EventDetails from '../components/EventDetails';

const EventCard = ({ detail, isOrga, onSelect, onEdit, onSignups }: { detail: EventDetail; isOrga: boolean; onSelect: (id: number) => void; onEdit: (event: EventSummary) => void; onSignups: (id: number) => void }) => {
  const event = detail.event;
  const ownSignup = detail.own_signup;
  const full = event.capacity !== null && event.signup_people_count >= event.capacity;
  const deadlinePassed = event.signup_deadline !== null && isPast(event.signup_deadline);
  const unavailable = full || deadlinePassed;
  const published = event.status === 'published';
  const eventPast = isPast(event.event_date);

  return <article className={`flex flex-col ${cardShellClass}`}>
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{event.type === 'work-duty' ? 'Arbeitsdienst' : 'Veranstaltung'}</p>
      {isOrga && event.status === 'draft' && <span className="rounded bg-[var(--hairline-strong)] px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]">Entwurf</span>}
    </div>
    <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--ink)]">{event.title}</h2>
    {event.description && <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{event.description}</p>}
    <EventDetails event={event} />
    {ownSignup && <p className="mt-3 text-sm font-medium text-[var(--primary-active)]">Ihre Anmeldung: {ownSignup.people_count} Personen</p>}
    {!event.allow_signups && ownSignup && !deadlinePassed && !eventPast && (
      <div className="mt-3">
        <button onClick={() => onSelect(event.id)} className={`${buttonVariants.secondary} w-full`}>Anmeldung stornieren</button>
      </div>
    )}
    <div className="mt-4 flex-1" />
    {isOrga && (
      <div className="flex gap-2">
        <button onClick={() => onEdit(event)} className={`${buttonVariants.secondary} flex-1`}>Bearbeiten</button>
        <button onClick={() => onSignups(event.id)} className={`${buttonVariants.secondary} flex-1`}>Anmeldungen</button>
      </div>
    )}
    {event.allow_signups && published && !eventPast && (
      <div className="mt-3 border-t border-[var(--hairline-soft)] pt-3">
        {ownSignup ? (
          deadlinePassed
            ? <p className="rounded-md bg-[var(--canvas-soft)] px-3 py-2 text-center text-sm font-medium text-[var(--muted)]">Anmeldeschluss erreicht – Änderung nicht mehr möglich</p>
            : <button onClick={() => onSelect(event.id)} className={`${buttonVariants.primary} w-full`}>Anmeldung bearbeiten</button>
        ) : unavailable ? (
          <p className="rounded-md bg-[var(--canvas-soft)] px-3 py-2 text-center text-sm font-medium text-[var(--muted)]">{full ? 'Ausgebucht' : 'Anmeldeschluss erreicht'}</p>
        ) : (
          <button onClick={() => onSelect(event.id)} className={`${buttonVariants.primary} w-full`}>Anmelden</button>
        )}
      </div>
    )}
  </article>;
};

const Events = () => {
  const { user } = useAuth();
  const [scope, setScope] = useState<EventScope>('upcoming');
  const { data: events, isLoading, error, refetch } = useEvents(user?.id, true, scope);
  const signupModal = useModalRoute('eventId');
  const isOrga = isOrgaRole(user?.role);
  const [editingEvent, setEditingEvent] = useState<EventSummary | null | undefined>(undefined);
  const [signupsEvent, setSignupsEvent] = useState<number | null>(null);
  const [showMailComposer, setShowMailComposer] = useState(false);
  const visibleEvents = (events ?? []).filter((detail) =>
    scope === 'past'
      ? isPast(detail.event.event_date) && detail.event.status === 'published'
      : !isPast(detail.event.event_date) && (isOrga || detail.event.status === 'published'),
  );

  if (isLoading) return <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}><Spinner label="Veranstaltungen werden geladen..." /></DashboardShell>;
  if (error) {
    return <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}><div className={`${cardShellClass} p-8 text-center`}><p role="alert" className="text-[var(--body)]">{getApiErrorMessage(error, 'Veranstaltungen konnten nicht geladen werden.')}</p><button type="button" onClick={() => void refetch()} className={`${buttonVariants.primary} mt-4`}>Erneut versuchen</button></div></DashboardShell>;
  }

  return (
    <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Zeitraum" className="flex gap-2">
            <button type="button" aria-pressed={scope === 'upcoming'} onClick={() => setScope('upcoming')} className={scope === 'upcoming' ? buttonVariants.primary : buttonVariants.secondary}>Anstehend</button>
            <button type="button" aria-pressed={scope === 'past'} onClick={() => setScope('past')} className={scope === 'past' ? buttonVariants.primary : buttonVariants.secondary}>Vergangen</button>
          </div>
          {isOrga && <button onClick={() => setEditingEvent(null)} className={buttonVariants.primary}>Veranstaltung erstellen</button>}
        </div>
        {visibleEvents.length === 0 ? <div className="rounded-lg bg-white p-8 text-center text-[var(--muted)]"><CalendarIcon className="mx-auto mb-3 h-12 w-12 text-[var(--hairline)]" /><p>{scope === 'past' ? 'Keine vergangenen Veranstaltungen' : 'Keine anstehenden Veranstaltungen'}</p></div> : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{visibleEvents.map((detail) => <EventCard key={detail.event.id} detail={detail} isOrga={isOrga} onSelect={signupModal.open} onEdit={setEditingEvent} onSignups={setSignupsEvent} />)}</div>}
      {signupModal.value !== null && <EventSignupModal eventId={signupModal.value} isOpen onClose={signupModal.close} />}
      {editingEvent !== undefined && <EventFormModal initialData={editingEvent} isOpen onClose={() => setEditingEvent(undefined)} />}
      {signupsEvent !== null && <EventSignupsModal eventId={signupsEvent} isOpen onClose={() => setSignupsEvent(null)} />}
    </DashboardShell>
  );
};

export default Events;
