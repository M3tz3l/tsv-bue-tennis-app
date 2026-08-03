import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useEvent, useEvents } from '../hooks/useEvents';
import type { EventSummary } from '../types';
import EventSignupModal from '../components/EventSignupModal';
import EventFormModal from '../components/EventFormModal';
import EventSignupsModal from '../components/EventSignupsModal';
import DashboardShell from '../components/DashboardShell';
import { isOrgaRole } from '../utils/roles';

const parseEventDate = (value: string, endOfDay = false) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value: string) => {
  const date = parseEventDate(value);
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date) : value;
};
const isPast = (value: string) => (parseEventDate(value, true)?.getTime() ?? 0) < Date.now();

const EventCard = ({ event, userId, isOrga, onSelect, onEdit, onSignups }: { event: EventSummary; userId?: string; isOrga: boolean; onSelect: (id: number) => void; onEdit: (event: EventSummary) => void; onSignups: (id: number) => void }) => {
  const { data: detail } = useEvent(userId, event.id, !isOrga);
  const ownSignup = detail?.own_signup;
  const full = event.capacity !== null && event.signup_people_count >= event.capacity;
  const deadlinePassed = event.signup_deadline !== null && (parseEventDate(event.signup_deadline, true)?.getTime() ?? 0) < Date.now();
  const unavailable = full || deadlinePassed;

  return <article className="flex flex-col rounded-lg bg-white p-5 shadow-lg">
    <p className="text-sm font-semibold uppercase tracking-wide text-green-700">{event.type === 'work-duty' ? 'Arbeitsdienst' : 'Veranstaltung'}</p>
    <h2 className="mt-1 text-xl font-bold text-gray-900">{event.title}</h2>
    {event.description && <p className="mt-2 text-sm text-gray-600">{event.description}</p>}
    <dl className="mt-4 space-y-2 text-sm text-gray-700">
      <div><dt className="inline font-medium">Datum: </dt><dd className="inline">{formatDate(event.event_date)}</dd></div>
      {(event.start_time || event.end_time) && <div><dt className="inline font-medium">Zeit: </dt><dd className="inline">{event.start_time ?? ''}{event.end_time ? ` - ${event.end_time}` : ''}</dd></div>}
      {event.location && <div><dt className="inline font-medium">Ort: </dt><dd className="inline">{event.location}</dd></div>}
      <div><dt className="inline font-medium">Plätze: </dt><dd className="inline">{event.signup_people_count}{event.capacity === null ? '' : ` / ${event.capacity}`} Personen</dd></div>
      {event.signup_deadline && <div><dt className="inline font-medium">Anmeldung bis: </dt><dd className="inline">{formatDate(event.signup_deadline)}</dd></div>}
    </dl>
    {ownSignup && <p className="mt-4 text-sm font-medium text-green-700">Ihre Anmeldung: {ownSignup.people_count} Personen</p>}
    <div className="mt-5 flex-1" />
    {isOrga && <div className="flex gap-2"><button onClick={() => onEdit(event)} className="action-control rounded-md border border-gray-300 text-sm">Bearbeiten</button><button onClick={() => onSignups(event.id)} className="action-control rounded-md border border-gray-300 text-sm">Anmeldungen anzeigen</button></div>}
    {ownSignup ? <button onClick={() => onSelect(event.id)} className="action-control rounded-md bg-emerald-700 font-medium text-white hover:bg-emerald-800">Anmeldung bearbeiten</button> : unavailable ? <p className="rounded-md bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-600">{full ? 'Ausgebucht' : 'Anmeldeschluss erreicht'}</p> : <button onClick={() => onSelect(event.id)} className="action-control rounded-md bg-emerald-700 font-medium text-white hover:bg-emerald-800">Anmelden</button>}
  </article>;
};

const Events = () => {
  const { user } = useAuth();
  const { data: events, isLoading, error } = useEvents(user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = Number(searchParams.get('eventId'));
  const [selectedId, setSelectedId] = useState<number | null>(Number.isInteger(requestedEventId) && requestedEventId > 0 ? requestedEventId : null);
  const isOrga = isOrgaRole(user?.role);
  const [editingEvent, setEditingEvent] = useState<EventSummary | null | undefined>(undefined);
  const [signupsId, setSignupsId] = useState<number | null>(null);
  const [showMailComposer, setShowMailComposer] = useState(false);
  const visibleEvents = (events ?? []).filter((event) => isOrga || (event.status === 'published' && !isPast(event.event_date)));

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'Veranstaltungen konnten nicht geladen werden');
  }, [error]);

  if (isLoading) return <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}><div className="text-center text-gray-600">Veranstaltungen werden geladen...</div></DashboardShell>;
  if (error) {
    return <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}><div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">Fehler beim Laden der Veranstaltungen</div></DashboardShell>;
  }

  return (
    <DashboardShell title="Veranstaltungen" onOpenMailComposer={() => setShowMailComposer(true)} isMailComposerOpen={showMailComposer} onCloseMailComposer={() => setShowMailComposer(false)}>
        <div className="mb-6 flex items-center justify-between">{isOrga && <button onClick={() => setEditingEvent(null)} className="action-control rounded-md bg-emerald-700 font-medium text-white">Veranstaltung erstellen</button>}</div>
        {visibleEvents.length === 0 ? <div className="rounded-lg bg-white p-8 text-center text-gray-600 shadow-lg">Keine anstehenden Veranstaltungen</div> : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{visibleEvents.map((event) => <EventCard key={event.id} event={event} userId={user?.id} isOrga={isOrga} onSelect={setSelectedId} onEdit={setEditingEvent} onSignups={setSignupsId} />)}</div>}
      {selectedId !== null && <EventSignupModal eventId={selectedId} isOpen onClose={() => { setSelectedId(null); searchParams.delete('eventId'); setSearchParams(searchParams); }} />}
      {editingEvent !== undefined && <EventFormModal initialData={editingEvent} isOpen onClose={() => setEditingEvent(undefined)} />}
      {signupsId !== null && <EventSignupsModal eventId={signupsId} isOpen onClose={() => setSignupsId(null)} />}
    </DashboardShell>
  );
};

export default Events;
