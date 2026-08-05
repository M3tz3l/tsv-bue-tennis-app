import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { CalendarIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../hooks/useEvents';
import useModalRoute from '../hooks/useModalRoute';
import type { EventDetail, EventSummary } from '../types';
import EventSignupModal from '../components/EventSignupModal';
import EventFormModal from '../components/EventFormModal';
import EventSignupsModal from '../components/EventSignupsModal';
import DashboardShell from '../components/DashboardShell';
import { isOrgaRole } from '../utils/roles';
import { buttonVariants, cardShellClass } from '../styles/tokens';
import { formatDate, isPast, parseEventDate } from '../utils/dates';

const EventCard = ({ detail, isOrga, onSelect, onEdit, onSignups }: { detail: EventDetail; isOrga: boolean; onSelect: (id: number) => void; onEdit: (event: EventSummary) => void; onSignups: (id: number) => void }) => {
  const event = detail.event;
  const ownSignup = detail.own_signup;
  const full = event.capacity !== null && event.signup_people_count >= event.capacity;
  const deadlinePassed = event.signup_deadline !== null && (parseEventDate(event.signup_deadline, true)?.getTime() ?? 0) < Date.now();
  const unavailable = full || deadlinePassed;

  return <article className={`flex flex-col ${cardShellClass}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{event.type === 'work-duty' ? 'Arbeitsdienst' : 'Veranstaltung'}</p>
    <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--ink)]">{event.title}</h2>
    {event.description && <p className="mt-2 text-sm text-[var(--muted)]">{event.description}</p>}
    <dl className="mt-3 space-y-1 text-sm">
      <div><dt className="inline text-[var(--muted)]">Datum: </dt><dd className="inline font-medium text-[var(--ink)]">{formatDate(event.event_date)}</dd></div>
      {(event.start_time || event.end_time) && <div><dt className="inline text-[var(--muted)]">Zeit: </dt><dd className="inline font-medium text-[var(--ink)]">{event.start_time ?? ''}{event.end_time ? ` - ${event.end_time}` : ''}</dd></div>}
      {event.location && <div><dt className="inline text-[var(--muted)]">Ort: </dt><dd className="inline font-medium text-[var(--ink)]">{event.location}</dd></div>}
      <div><dt className="inline text-[var(--muted)]">Plätze: </dt><dd className="inline font-medium text-[var(--ink)]">{event.signup_people_count}{event.capacity === null ? '' : ` / ${event.capacity}`} Personen</dd></div>
      {event.signup_deadline && <div><dt className="inline text-[var(--muted)]">Anmeldung bis: </dt><dd className="inline font-medium text-[var(--ink)]">{formatDate(event.signup_deadline)}</dd></div>}
    </dl>
    {ownSignup && <p className="mt-3 text-sm font-medium text-[var(--primary-active)]">Ihre Anmeldung: {ownSignup.people_count} Personen</p>}
    {!event.allow_signups && ownSignup && (
      <div className="mt-3">
        <button onClick={() => onSelect(event.id)} className={`${buttonVariants.secondary} w-full`}>Stornieren</button>
      </div>
    )}
    <div className="mt-4 flex-1" />
    {isOrga && (
      <div className="flex gap-2">
        <button onClick={() => onEdit(event)} className={`${buttonVariants.secondary} flex-1`}>Bearbeiten</button>
        <button onClick={() => onSignups(event.id)} className={`${buttonVariants.secondary} flex-1`}>Anmeldungen</button>
      </div>
    )}
    {event.allow_signups && (
      <div className="mt-3 border-t border-[var(--hairline-soft)] pt-3">
        {ownSignup ? <button onClick={() => onSelect(event.id)} className={`${buttonVariants.primary} w-full`}>Anmeldung bearbeiten</button> : unavailable ? <p className="rounded-md bg-[var(--canvas-soft)] px-3 py-2 text-center text-sm font-medium text-[var(--muted)]">{full ? 'Ausgebucht' : 'Anmeldeschluss erreicht'}</p> : <button onClick={() => onSelect(event.id)} className={`${buttonVariants.primary} w-full`}>Anmelden</button>}
      </div>
    )}
  </article>;
};

const Events = () => {
  const { user } = useAuth();
  const { data: events, isLoading, error } = useEvents(user?.id);
  const signupModal = useModalRoute('eventId');
  const isOrga = isOrgaRole(user?.role);
  const [editingEvent, setEditingEvent] = useState<EventSummary | null | undefined>(undefined);
  const [signupsId, setSignupsId] = useState<number | null>(null);
  const [showMailComposer, setShowMailComposer] = useState(false);
  const visibleEvents = (events ?? []).filter((detail) => isOrga || (detail.event.status === 'published' && !isPast(detail.event.event_date)));

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'Veranstaltungen konnten nicht geladen werden');
  }, [error]);

  if (isLoading) return <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}><div className="text-center text-[var(--muted)]">Veranstaltungen werden geladen...</div></DashboardShell>;
  if (error) {
    return <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}><div className="rounded-lg bg-white p-8 text-center text-[var(--muted)]">Veranstaltungen konnten nicht geladen werden.</div></DashboardShell>;
  }

  return (
    <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}>
        <div className="mb-6 flex items-center justify-between">{isOrga && <button onClick={() => setEditingEvent(null)} className={buttonVariants.primary}>Veranstaltung erstellen</button>}</div>
        {visibleEvents.length === 0 ? <div className="rounded-lg bg-white p-8 text-center text-[var(--muted)]"><CalendarIcon className="mx-auto mb-3 h-12 w-12 text-[var(--hairline)]" /><p>Keine anstehenden Veranstaltungen</p></div> : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{visibleEvents.map((detail) => <EventCard key={detail.event.id} detail={detail} isOrga={isOrga} onSelect={signupModal.open} onEdit={setEditingEvent} onSignups={setSignupsId} />)}</div>}
      {signupModal.value !== null && <EventSignupModal eventId={signupModal.value} isOpen onClose={signupModal.close} />}
      {editingEvent !== undefined && <EventFormModal initialData={editingEvent} isOpen onClose={() => setEditingEvent(undefined)} />}
      {signupsId !== null && <EventSignupsModal eventId={signupsId} isOpen onClose={() => setSignupsId(null)} />}
    </DashboardShell>
  );
};

export default Events;
