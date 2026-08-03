import { useAuth } from '../context/AuthContext';
import { useEventSignups } from '../hooks/useEvents';
import { isOrgaRole } from '../utils/roles';
import { stackMdClass } from '../styles/tokens';
import ModalShell from './ModalShell';

type Props = { eventId: number; isOpen: boolean; onClose: () => void };

const EventSignupsModal = ({ eventId, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const isOrga = isOrgaRole(user?.role);
  const { data, isLoading, error } = useEventSignups(user?.id, eventId, isOrga);
  if (!isOrga) return null;
    return <ModalShell isOpen={isOpen} onClose={onClose} title="Anmeldungen" widthClassName="max-w-3xl" panelClassName="max-h-[90vh] overflow-y-auto" backdropTestId="modal-backdrop" footer={null}>
      {isLoading && <p className="p-6">Wird geladen...</p>}
      {error && <p className="p-6 text-[var(--error)]">Anmeldungen konnten nicht geladen werden</p>}
      {data && <div className={`${stackMdClass} px-6 py-5`}>
        <div className="grid gap-3 sm:grid-cols-3"><p>Personen gesamt: {data.total_people}</p><p>Salate gesamt: {data.total_salad}</p><p>Kuchen gesamt: {data.total_cake}</p></div>
        <div className={stackMdClass}>{data.signups.map((signup) => <article key={signup.id} className="rounded-md border border-[var(--hairline)] p-4"><h3 className="font-medium">{signup.member_name ?? signup.member_id}</h3><p>{signup.people_count} Personen · {signup.salad_count} Salate · {signup.cake_count} Kuchen</p>{signup.comment && <p className="mt-1 text-sm text-[var(--muted)]">{signup.comment}</p>}</article>)}</div>
      </div>}
    </ModalShell>;
};

export default EventSignupsModal;
