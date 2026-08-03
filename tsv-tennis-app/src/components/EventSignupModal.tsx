import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useCreateEventSignup, useDeleteEventSignup, useEvent, useUpdateEventSignup } from '../hooks/useEvents';
import type { SignupRequest } from '../types';

type Props = { eventId: number; isOpen: boolean; onClose: () => void };

const EventSignupModal = ({ eventId, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const { data, isLoading, error } = useEvent(user?.id, eventId);
  const createSignup = useCreateEventSignup(user?.id);
  const updateSignup = useUpdateEventSignup(user?.id);
  const deleteSignup = useDeleteEventSignup(user?.id);
  const signup = data?.own_signup;
  const [peopleCount, setPeopleCount] = useState('1');
  const [saladCount, setSaladCount] = useState('0');
  const [cakeCount, setCakeCount] = useState('0');
  const [comment, setComment] = useState('');
  const pending = createSignup.isPending || updateSignup.isPending || deleteSignup.isPending;

  useEffect(() => {
    if (signup) {
      setPeopleCount(String(signup.people_count));
      setSaladCount(String(signup.salad_count));
      setCakeCount(String(signup.cake_count));
      setComment(signup.comment ?? '');
    } else {
      setPeopleCount('1');
      setSaladCount('0');
      setCakeCount('0');
      setComment('');
    }
  }, [signup, isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: SignupRequest = {
      people_count: Number(peopleCount),
      salad_count: Number(saladCount),
      cake_count: Number(cakeCount),
      comment: comment.trim() || null,
    };
    if (!Number.isInteger(payload.people_count) || payload.people_count < 1) {
      toast.error('Die Anzahl der Personen muss mindestens 1 sein');
      return;
    }
    if (![payload.salad_count, payload.cake_count].every((count) => Number.isInteger(count) && count >= 0)) {
      toast.error('Beiträge dürfen nicht negativ sein');
      return;
    }
    try {
      if (signup) await updateSignup.mutateAsync({ id: eventId, payload });
      else await createSignup.mutateAsync({ id: eventId, payload });
      toast.success(signup ? 'Anmeldung aktualisiert' : 'Erfolgreich angemeldet');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anmeldung konnte nicht gespeichert werden');
    }
  };

  const cancelSignup = async () => {
    try {
      await deleteSignup.mutateAsync(eventId);
      toast.success('Anmeldung storniert');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anmeldung konnte nicht storniert werden');
    }
  };

  const close = () => {
    if (!pending) onClose();
  };

  return (
    <Dialog open={isOpen} onClose={close} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <DialogTitle className="text-lg font-medium text-gray-900">{data?.event.title ?? 'Veranstaltung'}</DialogTitle>
             <button aria-label="Schließen" onClick={close} disabled={pending} className="touch-control"><XMarkIcon className="h-6 w-6 text-gray-400" /></button>
          </div>
          {isLoading && <p className="p-6 text-gray-600">Wird geladen...</p>}
          {error && <p className="p-6 text-red-600">Fehler beim Laden der Veranstaltung</p>}
          {data?.event && (
            <form onSubmit={submit} className="space-y-4 px-6 py-5">
              <label className="block text-sm font-medium text-gray-700">Personen
                <input aria-label="Personen" type="number" step="1" value={peopleCount} onChange={(e) => setPeopleCount(e.target.value)} disabled={pending} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              {data.event.allow_salad && <label className="block text-sm font-medium text-gray-700">Salat
                <input aria-label="Salat" type="number" step="1" value={saladCount} onChange={(e) => setSaladCount(e.target.value)} disabled={pending} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>}
              {data.event.allow_cake && <label className="block text-sm font-medium text-gray-700">Kuchen
                <input aria-label="Kuchen" type="number" step="1" value={cakeCount} onChange={(e) => setCakeCount(e.target.value)} disabled={pending} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>}
              <label className="block text-sm font-medium text-gray-700">Kommentar
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={pending} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                {signup && <button type="button" onClick={() => void cancelSignup()} disabled={pending} className="mr-auto rounded-md border border-red-300 px-4 py-2 text-sm text-red-700">Abmelden</button>}
                 <button type="button" onClick={close} disabled={pending} className="action-control rounded-md border border-gray-300 text-sm text-gray-700">Abbrechen</button>
                 <button type="submit" disabled={pending} className="action-control rounded-md bg-green-600 text-sm font-medium text-white disabled:bg-gray-400">{pending ? 'Speichern...' : signup ? 'Aktualisieren' : 'Anmelden'}</button>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default EventSignupModal;
