import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '../hooks/useEvents';
import type { CreateEventRequest, EventSummary, EventType, UpdateEventRequest } from '../types';
import DeleteConfirmDialog from './DeleteConfirmDialog';

type Props = { isOpen: boolean; onClose: () => void; initialData?: EventSummary | null };
type FormState = Omit<CreateEventRequest, 'type'> & { type: EventType };

const emptyForm: FormState = { type: 'event', title: '', description: null, event_date: '', start_time: null, end_time: null, location: null, signup_deadline: null, capacity: null, allow_salad: false, allow_cake: false, status: 'draft' };

const EventFormModal = ({ isOpen, onClose, initialData = null }: Props) => {
  const { user } = useAuth();
  const isOrga = user?.role?.trim().toLowerCase() === 'orga';
  const createEvent = useCreateEvent(user?.id);
  const updateEvent = useUpdateEvent(user?.id);
  const deleteEvent = useDeleteEvent(user?.id);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showDelete, setShowDelete] = useState(false);
  const pending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  useEffect(() => {
    if (!initialData) { setForm(emptyForm); return; }
    setForm({ type: initialData.type, title: initialData.title, description: initialData.description, event_date: initialData.event_date, start_time: initialData.start_time, end_time: initialData.end_time, location: initialData.location, signup_deadline: initialData.signup_deadline, capacity: initialData.capacity, allow_salad: initialData.allow_salad, allow_cake: initialData.allow_cake, status: initialData.status });
  }, [initialData, isOpen]);

  if (!isOrga) return null;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const value = (key: keyof FormState) => form[key] ?? '';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.event_date) { toast.error('Titel und Datum sind erforderlich'); return; }
    if (form.start_time && form.end_time && form.end_time < form.start_time) { toast.error('Die Endzeit darf nicht vor der Startzeit liegen'); return; }
    if (form.signup_deadline && form.signup_deadline > form.event_date) { toast.error('Der Anmeldeschluss darf nicht nach dem Veranstaltungsdatum liegen'); return; }
    if (form.capacity !== null && (!Number.isInteger(form.capacity) || form.capacity < 1)) { toast.error('Die Kapazität muss eine positive ganze Zahl sein'); return; }
    const payload: CreateEventRequest = { ...form, title: form.title.trim(), description: form.description?.trim() || null, location: form.location?.trim() || null, start_time: form.start_time || null, end_time: form.end_time || null, signup_deadline: form.signup_deadline || null, capacity: form.capacity === null || form.capacity === 0 ? null : form.capacity };
    try {
      if (initialData) {
        const clear_fields = (['description', 'location', 'start_time', 'end_time', 'signup_deadline', 'capacity'] as const)
          .filter((field) => payload[field] === null);
        const updatePayload: UpdateEventRequest = {
          ...payload,
          clear_fields,
          ...Object.fromEntries(clear_fields.map((field) => [field, undefined])),
        };
        await updateEvent.mutateAsync({ id: initialData.id, payload: updatePayload });
      } else await createEvent.mutateAsync(payload);
      toast.success(initialData ? 'Veranstaltung aktualisiert' : 'Veranstaltung erstellt');
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Veranstaltung konnte nicht gespeichert werden'); }
  };
  const remove = async () => {
    if (!initialData) return;
    try { await deleteEvent.mutateAsync(initialData.id); toast.success('Veranstaltung gelöscht'); onClose(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Veranstaltung konnte nicht gelöscht werden'); }
    finally { setShowDelete(false); }
  };

  return <>
    <Dialog open={isOpen} onClose={() => { if (!pending) onClose(); }} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4"><DialogPanel className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
         <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4"><DialogTitle className="text-lg font-medium text-gray-900">{initialData ? 'Veranstaltung bearbeiten' : 'Neue Veranstaltung'}</DialogTitle><button aria-label="Schließen" onClick={onClose} disabled={pending} className="touch-control"><XMarkIcon className="h-6 w-6 text-gray-400" /></button></div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <label className="block text-sm font-medium text-gray-700">Titel<input aria-label="Titel" value={String(value('title'))} onChange={(e) => set('title', e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium text-gray-700">Typ<select aria-label="Typ" value={form.type} onChange={(e) => set('type', e.target.value as EventType)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"><option value="event">Veranstaltung</option><option value="work-duty">Arbeitsdienst</option></select></label>
          <label className="block text-sm font-medium text-gray-700">Datum<input aria-label="Datum" type="date" value={String(value('event_date'))} onChange={(e) => set('event_date', e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-gray-700">Startzeit<input aria-label="Startzeit" type="time" value={String(value('start_time'))} onChange={(e) => set('start_time', e.target.value || null)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label><label className="block text-sm font-medium text-gray-700">Endzeit<input aria-label="Endzeit" type="time" value={String(value('end_time'))} onChange={(e) => set('end_time', e.target.value || null)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label></div>
          <label className="block text-sm font-medium text-gray-700">Beschreibung<textarea aria-label="Beschreibung" value={String(value('description'))} onChange={(e) => set('description', e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium text-gray-700">Ort<input aria-label="Ort" value={String(value('location'))} onChange={(e) => set('location', e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-gray-700">Anmeldeschluss<input aria-label="Anmeldeschluss" type="date" value={String(value('signup_deadline'))} onChange={(e) => set('signup_deadline', e.target.value || null)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label><label className="block text-sm font-medium text-gray-700">Kapazität<input aria-label="Kapazität" type="number" min="1" value={form.capacity ?? ''} onChange={(e) => set('capacity', e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label></div>
          <div className="flex flex-wrap gap-4"><label><input aria-label="Salat anbieten" type="checkbox" checked={form.allow_salad} onChange={(e) => set('allow_salad', e.target.checked)} /> Salat anbieten</label><label><input aria-label="Kuchen anbieten" type="checkbox" checked={form.allow_cake} onChange={(e) => set('allow_cake', e.target.checked)} /> Kuchen anbieten</label></div>
          <fieldset><legend className="text-sm font-medium text-gray-700">Status</legend><label className="mr-4"><input aria-label="Entwurf" type="radio" checked={form.status === 'draft'} onChange={() => set('status', 'draft')} /> Entwurf</label><label><input aria-label="Veröffentlicht" type="radio" checked={form.status === 'published'} onChange={() => set('status', 'published')} /> Veröffentlicht</label></fieldset>
           <div className="flex justify-end gap-3"><>{initialData && <button type="button" onClick={() => setShowDelete(true)} disabled={pending} className="action-control mr-auto rounded-md border border-red-300 text-sm text-red-700">Löschen</button>}</><button type="button" onClick={onClose} disabled={pending} className="action-control rounded-md border border-gray-300 text-sm">Abbrechen</button><button type="submit" disabled={pending} className="action-control rounded-md bg-green-600 text-sm font-medium text-white">{initialData ? 'Aktualisieren' : 'Erstellen'}</button></div>
        </form>
      </DialogPanel></div>
    </Dialog>
    <DeleteConfirmDialog isOpen={showDelete} isProcessing={deleteEvent.isPending} onCancel={() => setShowDelete(false)} onConfirm={remove} />
  </>;
};

export default EventFormModal;
