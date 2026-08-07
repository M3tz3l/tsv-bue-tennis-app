import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '../hooks/useEvents';
import { buttonVariants, fieldControl, stackMdClass } from '../styles/tokens';
import type { CreateEventRequest, EventSummary, EventType, UpdateEventRequest } from '../types';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { isOrgaRole } from '../utils/roles';
import ModalShell from './ModalShell';

type Props = { isOpen: boolean; onClose: () => void; initialData?: EventSummary | null };
type FormState = Omit<CreateEventRequest, 'type' | 'allow_signups'> & { type: EventType; allow_signups: boolean };

const FieldLabel = ({ children, optional }: { children: React.ReactNode; optional?: boolean }) => (
  <span>
    {children}
    {optional && <span className="ml-1.5 text-xs font-normal text-[var(--muted-soft)]">(optional)</span>}
  </span>
);

const emptyForm: FormState = { type: 'event', title: '', description: null, event_date: '', start_time: null, end_time: null, location: null, signup_deadline: null, capacity: null, allow_salad: false, allow_cake: false, allow_signups: true, status: 'draft' };

const EventFormModal = ({ isOpen, onClose, initialData = null }: Props) => {
  const { user } = useAuth();
  const isOrga = isOrgaRole(user?.role);
  const createEvent = useCreateEvent(user?.id);
  const updateEvent = useUpdateEvent(user?.id);
  const deleteEvent = useDeleteEvent(user?.id);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showDelete, setShowDelete] = useState(false);
  const pending = createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  useEffect(() => {
    if (!initialData) { setForm(emptyForm); return; }
    setForm({ type: initialData.type, title: initialData.title, description: initialData.description, event_date: initialData.event_date, start_time: initialData.start_time, end_time: initialData.end_time, location: initialData.location, signup_deadline: initialData.signup_deadline, capacity: initialData.capacity, allow_salad: initialData.allow_salad, allow_cake: initialData.allow_cake, allow_signups: initialData.allow_signups, status: initialData.status });
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
    const payload: CreateEventRequest = { ...form, title: form.title.trim(), description: form.description?.trim() || null, location: form.location?.trim() || null, start_time: form.start_time || null, end_time: form.start_time ? (form.end_time || null) : null, signup_deadline: form.signup_deadline || null, capacity: form.capacity === null || form.capacity === 0 ? null : form.capacity };
    try {
      if (initialData) {
        const clear_fields = (['description', 'location', 'start_time', 'end_time', 'signup_deadline', 'capacity'] as const)
          .filter((field) => payload[field] === null);
        const updatePayload: UpdateEventRequest = {
          ...payload,
          allow_signups: form.allow_signups,
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
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!pending) onClose(); }}
      title={initialData ? 'Veranstaltung bearbeiten' : 'Neue Veranstaltung'}
      disableClose={pending}
      widthClassName="max-w-2xl"
      panelClassName="max-h-[90vh] overflow-y-auto"
      backdropTestId="modal-backdrop"
       footer={null}
       footerActions={{
         destructive: initialData && <button type="button" onClick={() => setShowDelete(true)} disabled={pending} className={buttonVariants.destructive}>Löschen</button>,
         secondary: <button type="button" onClick={onClose} disabled={pending} className={buttonVariants.secondary}>Abbrechen</button>,
         primary: <button type="submit" form="event-form" disabled={pending} className={buttonVariants.primary}>{initialData ? 'Aktualisieren' : 'Erstellen'}</button>,
       }}
    >
        <form id="event-form" onSubmit={submit} className={`${stackMdClass} px-6 py-5`}>
          <label className="block text-sm font-medium text-[var(--body)]">Titel<input aria-label="Titel" value={String(value('title'))} onChange={(e) => set('title', e.target.value)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label>
          <label className="block text-sm font-medium text-[var(--body)]">Typ<select aria-label="Typ" value={form.type} onChange={(e) => set('type', e.target.value as EventType)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`}><option value="event">Veranstaltung</option><option value="work-duty">Arbeitsdienst</option></select></label>
          <label className="block text-sm font-medium text-[var(--body)]">Datum<input aria-label="Datum" type="date" value={String(value('event_date'))} onChange={(e) => set('event_date', e.target.value)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-[var(--body)]"><FieldLabel optional>Startzeit</FieldLabel><input aria-label="Startzeit" type="time" value={String(value('start_time'))} onChange={(e) => { set('start_time', e.target.value || null); if (!e.target.value) set('end_time', null); }} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label><label className="block text-sm font-medium text-[var(--body)]"><FieldLabel optional>Endzeit</FieldLabel><input aria-label="Endzeit" type="time" disabled={!form.start_time} value={String(value('end_time'))} onChange={(e) => set('end_time', e.target.value || null)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)] disabled:bg-[var(--hairline-soft)] disabled:text-[var(--muted-soft)]`} /></label></div>
          <label className="block text-sm font-medium text-[var(--body)]"><FieldLabel optional>Beschreibung</FieldLabel><textarea aria-label="Beschreibung" value={String(value('description'))} onChange={(e) => set('description', e.target.value)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label>
          <label className="block text-sm font-medium text-[var(--body)]"><FieldLabel optional>Ort</FieldLabel><input aria-label="Ort" value={String(value('location'))} onChange={(e) => set('location', e.target.value)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-[var(--body)]"><FieldLabel optional>Anmeldeschluss</FieldLabel><input aria-label="Anmeldeschluss" type="date" value={String(value('signup_deadline'))} onChange={(e) => set('signup_deadline', e.target.value || null)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label><label className="block text-sm font-medium text-[var(--body)]"><FieldLabel optional>Kapazität</FieldLabel><input aria-label="Kapazität" type="number" min="1" value={form.capacity ?? ''} onChange={(e) => set('capacity', e.target.value ? Number(e.target.value) : null)} className={`${fieldControl} mt-1 border-[var(--hairline-strong)]`} /></label></div>
          <div className="flex flex-wrap gap-4"><label><input aria-label="Salat anbieten" type="checkbox" checked={form.allow_salad} onChange={(e) => set('allow_salad', e.target.checked)} /> Salat anbieten</label><label><input aria-label="Kuchen anbieten" type="checkbox" checked={form.allow_cake} onChange={(e) => set('allow_cake', e.target.checked)} /> Kuchen anbieten</label><label><input aria-label="Anmeldungen zulassen" type="checkbox" checked={form.allow_signups} onChange={(e) => set('allow_signups', e.target.checked)} /> Anmeldungen zulassen</label></div>
          <fieldset><legend className="text-sm font-medium text-[var(--body)]">Status</legend><label className="mr-4"><input aria-label="Entwurf" type="radio" name="event-status" value="draft" checked={form.status === 'draft'} onChange={() => set('status', 'draft')} /> Entwurf</label><label><input aria-label="Veröffentlicht" type="radio" name="event-status" value="published" checked={form.status === 'published'} onChange={() => set('status', 'published')} /> Veröffentlicht</label></fieldset>
        </form>
    </ModalShell>
    <DeleteConfirmDialog isOpen={showDelete} isProcessing={deleteEvent.isPending} onCancel={() => setShowDelete(false)} onConfirm={remove} />
  </>;
};

export default EventFormModal;
