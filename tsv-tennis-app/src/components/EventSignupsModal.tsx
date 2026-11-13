import { useAuth } from '../context/AuthContext';
import { useEvent, useEventSignups } from '../hooks/useEvents';
import { isOrgaRole } from '../utils/roles';
import ModalShell from './ModalShell';

type Props = { eventId: number; isOpen: boolean; onClose: () => void };

const th = 'py-2 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]';
const td = 'py-2.5 px-3 text-[var(--body)]';

const EventSignupsModal = ({ eventId, isOpen, onClose }: Props) => {
  const { user } = useAuth();
  const isOrga = isOrgaRole(user?.role);
  const { data: eventDetail, isLoading: eventLoading, error: eventError } = useEvent(user?.id, eventId, isOrga);
  const { data, isLoading, error } = useEventSignups(user?.id, eventId, isOrga);
  if (!isOrga) return null;

  const event = eventDetail?.event;
  const showSalad = event?.allow_salad ?? false;
  const showCake = event?.allow_cake ?? false;
  const columnCount = 3 + Number(showSalad) + Number(showCake); // Name, Personen, Kommentar + optional contributions

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Anmeldungen"
      widthClassName="max-w-3xl"
      panelClassName="max-h-[90vh] overflow-y-auto"
      backdropTestId="modal-backdrop"
      footer={null}
    >
      {(isLoading || eventLoading) && <p className="px-6 py-5 text-[var(--muted)]">Wird geladen...</p>}
      {(error || eventError) && <p className="px-6 py-5 text-[var(--error)]">Anmeldungen konnten nicht geladen werden</p>}
      {data && event && (
        <div className="px-6 py-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--hairline)]">
                <th className={`${th} py-2 pr-3 text-left`}>Name</th>
                <th className={`${th} text-right`}>Personen</th>
                {showSalad && <th className={`${th} text-right`}>Salate</th>}
                {showCake && <th className={`${th} text-right`}>Kuchen</th>}
                <th className={`${th} py-2 pl-3 text-left`}>Kommentar</th>
              </tr>
            </thead>
            <tbody>
              {data.signups.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className={`${td} px-0 py-6 text-center text-[var(--muted)]`}>Noch keine Anmeldungen</td>
                </tr>
              ) : data.signups.map((signup) => (
                <tr key={signup.id} className="border-b border-[var(--hairline-soft)]">
                  <td className={`${td} py-2.5 pr-3 font-medium text-[var(--ink)]`}>{signup.member_name ?? <span className="font-normal text-[var(--muted)]">Name nicht verfügbar</span>}</td>
                  <td className={`${td} text-right`}>{signup.people_count}</td>
                  {showSalad && <td className={`${td} text-right`}>{signup.salad_count}</td>}
                  {showCake && <td className={`${td} text-right`}>{signup.cake_count}</td>}
                  <td className={`${td} py-2.5 pl-3 text-[var(--muted)]`}>{signup.comment ?? ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-[var(--ink)]">
                <td className="pt-3 pr-3">Gesamt</td>
                <td className="px-3 pt-3 text-right">{data.total_people}</td>
                {showSalad && <td className="px-3 pt-3 text-right">{data.total_salad}</td>}
                {showCake && <td className="px-3 pt-3 text-right">{data.total_cake}</td>}
                <td className="pt-3 pl-3" />
              </tr>
            </tfoot>
            </table>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default EventSignupsModal;
