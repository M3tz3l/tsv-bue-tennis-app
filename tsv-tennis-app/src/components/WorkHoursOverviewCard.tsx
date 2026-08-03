import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { DashboardResponse, MemberContribution } from '../types';
import { formatHours, getProgressPercentage } from '../utils/utils';
import { cardShellClass } from '../styles/tokens';

type WorkHoursOverviewCardProps = {
    data: DashboardResponse;
    selectedYear: number;
    variant?: 'overview' | 'detail';
};

const WorkHoursOverviewCard = ({ data, selectedYear, variant = 'overview' }: WorkHoursOverviewCardProps) => {
    const { user } = useAuth();
    const hasFamilyView = !!data.family && data.family.members.length > 1;

    if (!data.family && !data.personal) return null;

    const showChrome = variant === 'overview';

    const detailsLink = showChrome && (
        <Link
            className="text-sm font-medium text-[var(--primary)] underline decoration-[var(--primary)]/40 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
            to="/dashboard/arbeitsstunden"
        >
            Details ansehen
        </Link>
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
        <section className={`${cardShellClass} mb-6 sm:mb-8`}>
            {hasFamilyView && data.family ? (
                <>
                    {showChrome && (
                        <div className="flex items-baseline justify-between gap-2 mb-3">
                            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--ink)]">Arbeitsstunden {selectedYear}</h2>
                            {detailsLink}
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-sm text-[var(--body)] mb-1">
                        <span>Familien-Fortschritt</span>
                        <span className="font-semibold text-[var(--ink)]">{formatHours(data.family.completed)} Std von {formatHours(data.family.required)} Std</span>
                    </div>
                    {renderProgress(data.family.percentage, 'Familien-Fortschritt')}
                    <h3 className="mt-4 mb-1 text-sm font-medium text-[var(--muted)]">Familienmitglieder</h3>
                    <ul className="divide-y divide-[var(--hairline-soft)]">
                        {[...data.family.memberContributions]
                            .sort((a: MemberContribution, b: MemberContribution) => a.name.localeCompare(b.name, 'de'))
                            .map((member: MemberContribution) => {
                                const isCurrentUser = user?.id === member.id;
                                return (
                                    <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                                        <div className="min-w-0 flex flex-col">
                                            <span className={`truncate font-medium ${isCurrentUser ? 'text-[var(--ink)]' : 'text-[var(--ink)]'}`}>
                                                {member.name} {isCurrentUser ? '(Sie)' : ''}
                                            </span>
                                            {member.exemption_reason && (
                                                <span className="truncate text-xs text-[var(--muted)] italic">Befreit: {member.exemption_reason}</span>
                                            )}
                                        </div>
                                        <span className={`shrink-0 text-sm sm:text-base font-semibold ${member.exemption_reason ? 'text-[var(--success)]' : isCurrentUser ? 'text-[var(--ink)]' : 'text-[var(--body)]'}`}>
                                            {member.exemption_reason
                                                ? (member.hours > 0 ? `${formatHours(member.hours)} Std / Befreit` : 'Befreit')
                                                : `${formatHours(member.hours)} / ${formatHours(member.required)} Std`}
                                        </span>
                                    </li>
                                );
                            })}
                    </ul>
                    {data.family.remaining > 0 && (
                        <div className="flex items-center justify-between gap-3 pt-2 text-sm">
                            <span className="text-[var(--muted)]">Noch zu erledigen</span>
                            <span className="font-semibold text-[var(--muted)]">{formatHours(data.family.remaining)} Std</span>
                        </div>
                    )}
                </>
            ) : data.personal ? (
                <>
                    {showChrome && (
                        <div className="flex items-baseline justify-between gap-2 mb-3">
                            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--ink)]">{data.personal.name || 'Ihre Arbeitsstunden'} - {selectedYear}</h2>
                            {detailsLink}
                        </div>
                    )}
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
                            <div className="flex items-center justify-between gap-2 text-sm text-[var(--body)] mb-1">
                                <span>Ihr Fortschritt</span>
                                <span className="font-semibold text-[var(--ink)]">{formatHours(data.personal.hours)} Std von {formatHours(data.personal.required)} Std</span>
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
