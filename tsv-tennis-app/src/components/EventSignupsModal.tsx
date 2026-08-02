import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useEventSignups } from '../hooks/useEvents';

type Props = { eventId: number; isOpen: boolean; onClose: () => void };

const EventSignupsModal = ({ eventId, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const isOrga = user?.role?.trim().toLowerCase() === 'orga';
  const { data, isLoading, error } = useEventSignups(user?.id, eventId, isOrga);
  if (!isOrga) return null;
  return <Dialog open={isOpen} onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-black/30" aria-hidden="true" /><div className="fixed inset-0 flex items-center justify-center p-4"><DialogPanel className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-200 px-6 py-4"><DialogTitle className="text-lg font-medium">Anmeldungen</DialogTitle><button aria-label="Schließen" onClick={onClose}><XMarkIcon className="h-6 w-6 text-gray-400" /></button></div>
      {isLoading && <p className="p-6">Wird geladen...</p>}{error && <p className="p-6 text-red-600">Anmeldungen konnten nicht geladen werden</p>}{data && <div className="space-y-5 px-6 py-5"><div className="grid gap-3 sm:grid-cols-3"><p>Personen gesamt: {data.total_people}</p><p>Salate gesamt: {data.total_salad}</p><p>Kuchen gesamt: {data.total_cake}</p></div><div className="space-y-3">{data.signups.map((signup) => <article key={signup.id} className="rounded-md border border-gray-200 p-4"><h3 className="font-medium">{signup.member_name ?? signup.member_id}</h3><p>{signup.people_count} Personen · {signup.salad_count} Salate · {signup.cake_count} Kuchen</p>{signup.comment && <p className="mt-1 text-sm text-gray-600">{signup.comment}</p>}</article>)}</div></div>}
    </DialogPanel></div>
  </Dialog>;
};

export default EventSignupsModal;
