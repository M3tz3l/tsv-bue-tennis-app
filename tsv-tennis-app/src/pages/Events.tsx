import { useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useEvent, useEvents } from '../hooks/useEvents';
import EventSignupModal from '../components/EventSignupModal';

const formatDate = (value: string) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(new Date(`${value}T00:00:00`));
const isPast = (value: string) => new Date(`${value}T23:59:59`).getTime() < Date.now();

const Events = () => {
  const { user } = useAuth();
  const { data: events, isLoading, error } = useEvents(user?.id);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: selectedDetail } = useEvent(user?.id, selectedId ?? undefined);
  const visibleEvents = (events ?? []).filter((event) => event.status === 'published' && !isPast(event.event_date));

  if (isLoading) return <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6 text-center text-gray-600">Veranstaltungen werden geladen...</main>;
  if (error) {
    toast.error(error instanceof Error ? error.message : 'Veranstaltungen konnten nicht geladen werden');
    return <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6"><div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">Fehler beim Laden der Veranstaltungen</div></main>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Veranstaltungen</h1>
        {visibleEvents.length === 0 ? <div className="rounded-lg bg-white p-8 text-center text-gray-600 shadow-lg">Keine anstehenden Veranstaltungen</div> : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{visibleEvents.map((event) => {
          const full = event.capacity !== null && event.signup_people_count >= event.capacity;
          const deadlinePassed = event.signup_deadline !== null && new Date(`${event.signup_deadline}T23:59:59`).getTime() < Date.now();
          const unavailable = full || deadlinePassed;
          return <article key={event.id} className="flex flex-col rounded-lg bg-white p-5 shadow-lg">
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
            {selectedDetail?.event.id === event.id && selectedDetail.own_signup && <p className="mt-4 text-sm font-medium text-green-700">Ihre Anmeldung: {selectedDetail.own_signup.people_count} Personen</p>}
            <div className="mt-5 flex-1" />
            {unavailable ? <p className="rounded-md bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-600">{full ? 'Ausgebucht' : 'Anmeldeschluss erreicht'}</p> : <button onClick={() => setSelectedId(event.id)} className="rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700">{selectedDetail?.event.id === event.id && selectedDetail.own_signup ? 'Anmeldung bearbeiten' : 'Anmelden'}</button>}
          </article>;
        })}</div>}
      </div>
      {selectedId !== null && <EventSignupModal eventId={selectedId} isOpen onClose={() => setSelectedId(null)} />}
    </main>
  );
};

export default Events;
