import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { DashboardResponse, MemberContribution } from '../types';
import { formatHours, getProgressPercentage } from '../utils/utils';
import { cardShellClass } from '../styles/tokens';

type WorkHoursOverviewCardProps = {
    data: DashboardResponse;
    selectedYear: number;
};

const WorkHoursOverviewCard = ({ data, selectedYear }: WorkHoursOverviewCardProps) => {
    const { user } = useAuth();
    const hasFamilyView = !!data.family && data.family.members.length > 1;

    if (!data.family && !data.personal) return null;

    const renderProgress = (percentage: number, label: string) => {
        const clampedPercentage = Math.min(100, Math.max(0, percentage));

        return (
            <div
                aria-label={`${label}: ${Math.round(clampedPercentage)}% abgeschlossen`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={clampedPercentage}
                className="w-full h-2.5 rounded-full bg-[#EDF1EF]"
                role="progressbar"
            >
                <div
                    className="h-2.5 rounded-full transition-all duration-300 bg-emerald-500"
                    style={{ width: `${clampedPercentage}%` }}
                />
            </div>
        );
    };

    return (
        <section className={`${cardShellClass} mb-6 sm:mb-8`}>
            {hasFamilyView && data.family ? (
                <>
                    <div className="flex items-baseline justify-between gap-2 mb-3">
                        <h2 className="text-lg sm:text-xl font-semibold text-emerald-700">Familie - {selectedYear}</h2>
                        <span className="text-sm text-gray-500">{Math.round(Math.min(100, Math.max(0, data.family.percentage)))}% abgeschlossen</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-gray-600 mb-1">
                        <span>Familien-Fortschritt</span>
                        <span className="font-semibold text-gray-800">{formatHours(data.family.completed)} Std von {formatHours(data.family.required)} Std</span>
                    </div>
                    {renderProgress(data.family.percentage, 'Familien-Fortschritt')}
                    <h3 className="mt-4 mb-1 text-sm font-medium text-gray-600">Familienmitglieder</h3>
                    <ul className="divide-y divide-gray-100">
                        {[...data.family.memberContributions]
                            .sort((a: MemberContribution, b: MemberContribution) => a.name.localeCompare(b.name, 'de'))
                            .map((member: MemberContribution) => {
                                const isCurrentUser = user?.id === member.id;
                                return (
                                    <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                                        <div className="min-w-0 flex flex-col">
                                            <span className={`truncate font-medium ${isCurrentUser ? 'text-emerald-700' : 'text-gray-800'}`}>
                                                {member.name} {isCurrentUser ? '(Sie)' : ''}
                                            </span>
                                            {member.exemption_reason && (
                                                <span className="truncate text-xs text-gray-500 italic">Befreit: {member.exemption_reason}</span>
                                            )}
                                        </div>
                                        <span className={`shrink-0 text-sm sm:text-base font-semibold ${member.exemption_reason ? 'text-emerald-600' : isCurrentUser ? 'text-emerald-700' : 'text-gray-700'}`}>
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
                            <span className="text-gray-600">Noch zu erledigen</span>
                            <span className="font-semibold text-amber-600">{formatHours(data.family.remaining)} Std</span>
                        </div>
                    )}
                </>
            ) : data.personal ? (
                <>
                    <div className="flex items-baseline justify-between gap-2 mb-3">
                        <h2 className="text-lg sm:text-xl font-semibold text-emerald-700">{data.personal.name || 'Ihre Arbeitsstunden'} - {selectedYear}</h2>
                        {data.personal.required > 0 && (
                            <span className="text-sm text-gray-500">{Math.round(Math.min(100, Math.max(0, getProgressPercentage(data.personal.hours, data.personal.required))))}% abgeschlossen</span>
                        )}
                    </div>
                    {data.personal.required === 0 ? (
                        <div className="p-4 border border-[#E7EAE9] rounded-lg">
                            <div className="flex items-center justify-between">
                                <span className="text-emerald-700 font-semibold text-lg">Befreit von Arbeitsstunden</span>
                                {data.personal.hours > 0 && <span className="text-emerald-700 font-semibold">{formatHours(data.personal.hours)} Std geleistet</span>}
                            </div>
                            {data.personal.exemption_reason && <p className="text-sm text-emerald-700 mt-1">Grund: {data.personal.exemption_reason}</p>}
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between gap-2 text-sm text-gray-600 mb-1">
                                <span>Ihr Fortschritt</span>
                                <span className="font-semibold text-gray-800">{formatHours(data.personal.hours)} Std von {formatHours(data.personal.required)} Std</span>
                            </div>
                            {renderProgress(getProgressPercentage(data.personal.hours, data.personal.required), 'Ihr Fortschritt')}
                        </div>
                    )}
                </>
            ) : null}
            <Link
                aria-label="Details anzeigen"
                className="inline-flex mt-4 text-sm font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                to="/dashboard/arbeitsstunden"
            >
                Arbeitsstunden Details
            </Link>
        </section>
    );
};

export default WorkHoursOverviewCard;
