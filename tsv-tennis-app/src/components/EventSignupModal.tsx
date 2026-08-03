import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { buttonVariants, fieldControl, stackMdClass } from '../styles/tokens';
import { useAuth } from '../context/AuthContext';
import { useCreateEventSignup, useDeleteEventSignup, useEvent, useUpdateEventSignup } from '../hooks/useEvents';
import type { SignupRequest } from '../types';
import ModalShell from './ModalShell';

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
  const [errors, setErrors] = useState<{ peopleCount?: string; contributions?: string }>({});
  const pending = createSignup.isPending || updateSignup.isPending || deleteSignup.isPending;

  useEffect(() => {
    setErrors({});
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
    setErrors({});
    const payload: SignupRequest = {
      people_count: Number(peopleCount),
      salad_count: Number(saladCount),
      cake_count: Number(cakeCount),
      comment: comment.trim() || null,
    };
    
    let hasError = false;
    const newErrors: { peopleCount?: string; contributions?: string } = {};

    if (!Number.isInteger(payload.people_count) || payload.people_count < 1) {
      newErrors.peopleCount = 'Die Anzahl der Personen muss mindestens 1 sein';
      hasError = true;
    }
    if (![payload.salad_count, payload.cake_count].every((count) => Number.isInteger(count) && count >= 0)) {
      newErrors.contributions = 'Beiträge dürfen nicht negativ sein';
      hasError = true;
    }

    if (hasError) {
      setErrors(newErrors);
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
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      title={data?.event.title ?? 'Veranstaltung'}
      disableClose={pending}
      backdropTestId="modal-backdrop"
       footer={null}
       footerActions={{
         destructive: signup && <button type="button" onClick={() => void cancelSignup()} disabled={pending} className={buttonVariants.destructive}>Abmelden</button>,
         secondary: <button type="button" onClick={close} disabled={pending} className={buttonVariants.secondary}>Abbrechen</button>,
         primary: data?.event && <button type="submit" form="event-signup-form" disabled={pending} className={buttonVariants.primary}>{pending ? 'Speichern...' : signup ? 'Aktualisieren' : 'Anmelden'}</button>,
       }}
    >
      {isLoading && <p className="p-6 text-gray-600">Wird geladen...</p>}
      {error && <p className="p-6 text-red-600">Fehler beim Laden der Veranstaltung</p>}
      {data?.event && (
        <form id="event-signup-form" onSubmit={submit} className={`${stackMdClass} px-6 py-5`}>
              <div>
                <label className="block text-sm font-medium text-gray-700">Personen
                  <input aria-label="Personen" type="number" step="1" value={peopleCount} onChange={(e) => setPeopleCount(e.target.value)} disabled={pending} className={`${fieldControl} mt-1 ${errors.peopleCount ? 'border-red-500' : 'border-gray-300'}`} />
                </label>
                {errors.peopleCount && <p className="mt-1 text-sm text-red-500">{errors.peopleCount}</p>}
              </div>
              
              {data.event.allow_salad && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Salat
                    <input aria-label="Salat" type="number" step="1" value={saladCount} onChange={(e) => setSaladCount(e.target.value)} disabled={pending} className={`${fieldControl} mt-1 ${errors.contributions ? 'border-red-500' : 'border-gray-300'}`} />
                  </label>
                </div>
              )}
              
              {data.event.allow_cake && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Kuchen
                    <input aria-label="Kuchen" type="number" step="1" value={cakeCount} onChange={(e) => setCakeCount(e.target.value)} disabled={pending} className={`${fieldControl} mt-1 ${errors.contributions ? 'border-red-500' : 'border-gray-300'}`} />
                  </label>
                </div>
              )}
              {errors.contributions && <p className="text-sm text-red-500">{errors.contributions}</p>}
              
              <label className="block text-sm font-medium text-gray-700">Kommentar
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={pending} className={`${fieldControl} mt-1 border-gray-300`} />
              </label>
        </form>
      )}
    </ModalShell>
  );
};

export default EventSignupModal;
