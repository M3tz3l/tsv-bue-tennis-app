import { PlusIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { DashboardResponse, MemberContribution } from '../types';
import { formatHours, getProgressPercentage } from '../utils/utils';
import { cardShellClass, buttonVariants } from '../styles/tokens';

type WorkHoursOverviewCardProps = {
    data: DashboardResponse;
    selectedYear: number;
    variant?: 'overview' | 'detail';
    onAdd?: () => void;
};

const WorkHoursOverviewCard = ({ data, selectedYear, variant = 'overview', onAdd }: WorkHoursOverviewCardProps) => {
    const { user } = useAuth();
    const hasFamilyView = !!data.family && data.family.members.length > 1;

    if (!data.family && !data.personal) return null;

    const showChrome = variant === 'overview';
    // The overview variant sits inside a grid whose gap provides vertical
    // spacing, so it needs no bottom margin on small screens. The detail
    // variant (followed by the table) keeps a margin.
    const sectionMargin = showChrome ? '' : 'mb-6';

    const addButton = showChrome && onAdd && (
        <button
            type="button"
            onClick={onAdd}
            aria-label="Arbeitsstunden eintragen"
            className={`${buttonVariants.primary} inline-flex items-center justify-center`}
        >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Eintragen
        </button>
    );

    const title = hasFamilyView && data.family
        ? `Arbeitsstunden ${selectedYear}`
        : `${data.personal?.name || 'Ihre Arbeitsstunden'} - ${selectedYear}`;

    const header = showChrome && (
        <div className="mb-3 flex items-center justify-between gap-2">
            <Link to="/dashboard/arbeitsstunden" className="group">
                <h2 className="text-lg font-extrabold tracking-tight text-[var(--ink)] group-hover:text-[var(--primary)] transition-colors">{title}</h2>
            </Link>
            {addButton}
        </div>
    );

    const renderProgress = (percentage: number, label: string) => {
        const clampedPercentage = Math.min(100, Math.max(0, percentage));

        return (
            <div
                aria-label={`${label}: ${Math.round(clampedPercentage)}% abgeschlossen`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={clampedPercentage}
                className="w-full h-2.5 rounded-full bg-[var(--hairline-soft)]"
                role="progressbar"
            >
                <div
                    className="h-2.5 rounded-full transition-all duration-300 bg-[var(--primary)]"
                    style={{ width: `${clampedPercentage}%` }}
                />
            </div>
        );
    };

    return (
        <section className={`${cardShellClass} ${sectionMargin}`}>
            {hasFamilyView && data.family ? (
                <>
                    {header}
                    <div className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--body)] mb-1">
                        <span>Familien-Fortschritt</span>
                        <span className="font-semibold text-base text-[var(--ink)]">{formatHours(data.family.completed)} Std von {formatHours(data.family.required)} Std</span>
                    </div>
                    {renderProgress(data.family.percentage, 'Familien-Fortschritt')}
                    <div className={showChrome ? 'hidden md:block' : ''}>
                        <h3 className="mt-4 mb-1 text-sm font-medium text-[var(--muted)]">Familienmitglieder</h3>
                        <ul className="divide-y divide-[var(--hairline-soft)]">
                            {[...data.family.memberContributions]
                                .sort((a: MemberContribution, b: MemberContribution) => a.name.localeCompare(b.name, 'de'))
                                .map((member: MemberContribution) => {
                                    const isCurrentUser = user?.id === member.id;
                                    return (
                                        <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                                            <div className="min-w-0 flex flex-col">
                                                <span className={`truncate font-medium ${isCurrentUser ? 'text-[var(--ink)]' : 'text-[var(--body)]'}`}>
                                                    {member.name} {isCurrentUser ? '(Sie)' : ''}
                                                </span>
                                                {member.exemption_reason && (
                                                    <span className="truncate text-sm text-[var(--muted)] italic">Befreit: {member.exemption_reason}</span>
                                                )}
                                            </div>
                                            <span className={`shrink-0 text-base font-semibold ${member.exemption_reason ? 'text-[var(--success)]' : isCurrentUser ? 'text-[var(--ink)]' : 'text-[var(--body)]'}`}>
                                                {member.exemption_reason
                                                    ? (member.hours > 0 ? `${formatHours(member.hours)} Std / Befreit` : 'Befreit')
                                                    : `${formatHours(member.hours)} / ${formatHours(member.required)} Std`}
                                            </span>
                                        </li>
                                    );
                                })}
                        </ul>
                    </div>
                    {data.family.remaining > 0 && (
                        <div className="flex items-center justify-between gap-3 border-t border-[var(--hairline-soft)] pt-2 mt-2 text-sm">
                            <span className="font-medium text-[var(--muted)]">Noch zu erledigen</span>
                            <span className="font-semibold text-base text-[var(--ink)]">{formatHours(data.family.remaining)} Std</span>
                        </div>
                    )}
                </>
            ) : data.personal ? (
                <>
                    {header}
                    {data.personal.required === 0 ? (
                        <div className="p-4 border border-[var(--hairline)] rounded-lg">
                            <div className="flex items-center justify-between">
                                <span className="text-[var(--success)] font-semibold text-lg">Befreit von Arbeitsstunden</span>
                                {data.personal.hours > 0 && <span className="text-[var(--success)] font-semibold">{formatHours(data.personal.hours)} Std geleistet</span>}
                            </div>
                            {data.personal.exemption_reason && <p className="text-sm text-[var(--success)] mt-1">Grund: {data.personal.exemption_reason}</p>}
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--body)] mb-1">
                                <span>Ihr Fortschritt</span>
                                <span className="font-semibold text-base text-[var(--ink)]">{formatHours(data.personal.hours)} Std von {formatHours(data.personal.required)} Std</span>
                            </div>
                            {renderProgress(getProgressPercentage(data.personal.hours, data.personal.required), 'Ihr Fortschritt')}
                        </div>
                    )}
                </>
            ) : null}
        </section>
    );
};

export default WorkHoursOverviewCard;
