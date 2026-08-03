import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { DashboardResponse, MemberContribution } from '../types';
import { formatHours, getProgressColor, getProgressPercentage } from '../utils/utils';
import { cardShellClass, stackMdClass } from '../styles/tokens';

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
            <>
            <div
                aria-label={`${label}: ${Math.round(clampedPercentage)}% abgeschlossen`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={clampedPercentage}
                className="w-full bg-gray-100 border-b-2 border-gray-300 h-3"
                role="progressbar"
            >
                <div
                    className={`h-2.5 transition-all duration-300 ${getProgressColor(clampedPercentage)}`}
                    style={{ width: `${clampedPercentage}%` }}
                />
            </div>
            <div className="text-right text-sm text-gray-600 mt-1">
                {Math.round(clampedPercentage)}% abgeschlossen
            </div>
            </>
        );
    };

    return (
        <section className={`${cardShellClass} mb-6 sm:mb-8`}>
            {hasFamilyView && data.family ? (
                <>
                    <h2 className="text-lg sm:text-xl font-semibold text-green-800 mb-4">Familie - {selectedYear}</h2>
                    <div className="mb-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between text-sm text-gray-600 mb-1 space-y-1 sm:space-y-0">
                            <span>Familien-Fortschritt</span>
                            <span>{formatHours(data.family.completed)} Std von {formatHours(data.family.required)} Std</span>
                        </div>
                        {renderProgress(data.family.percentage, 'Familien-Fortschritt')}
                    </div>
                    <div className={stackMdClass}>
                        <h3 className="font-medium text-gray-800">Familienmitglieder:</h3>
                        {[...data.family.memberContributions]
                            .sort((a: MemberContribution, b: MemberContribution) => a.name.localeCompare(b.name, 'de'))
                            .map((member: MemberContribution) => {
                                const isCurrentUser = user?.id === member.id;
                                return (
                                    <div
                                        key={member.id}
                                        className={`flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 rounded space-y-1 sm:space-y-0 ${isCurrentUser ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className={`font-medium ${isCurrentUser ? 'text-green-800' : ''}`}>
                                                {member.name} {isCurrentUser ? '(Sie)' : ''}
                                            </span>
                                            {member.exemption_reason && (
                                                <span className="text-xs text-gray-600 italic">Befreit: {member.exemption_reason}</span>
                                            )}
                                        </div>
                                        <span className={`font-bold text-sm sm:text-base ${member.exemption_reason ? 'text-green-600' : isCurrentUser ? 'text-green-700' : 'text-blue-600'}`}>
                                            {member.exemption_reason
                                                ? (member.hours > 0 ? `${formatHours(member.hours)} Std / Befreit` : 'Befreit')
                                                : `${formatHours(member.hours)} / ${formatHours(member.required)} Std`}
                                        </span>
                                    </div>
                                );
                            })}
                        {data.family.remaining > 0 && (
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-red-50 rounded border border-red-200 space-y-1 sm:space-y-0">
                                <span className="font-medium text-red-700">Noch zu erledigen</span>
                                <span className="text-red-600 font-bold">{formatHours(data.family.remaining)} Std</span>
                            </div>
                        )}
                    </div>
                </>
            ) : data.personal ? (
                <>
                    <h2 className="text-xl font-semibold text-green-800 mb-4">{data.personal.name || 'Ihre Arbeitsstunden'} - {selectedYear}</h2>
                    {data.personal.required === 0 ? (
                        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center justify-between">
                                <span className="text-green-600 font-semibold text-lg">Befreit von Arbeitsstunden</span>
                                {data.personal.hours > 0 && <span className="text-green-700 font-bold">{formatHours(data.personal.hours)} Std geleistet</span>}
                            </div>
                            {data.personal.exemption_reason && <p className="text-sm text-green-700 mt-1">Grund: {data.personal.exemption_reason}</p>}
                        </div>
                    ) : (
                        <div className="mb-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-1">
                                <span>Ihr Fortschritt</span>
                                <span>{formatHours(data.personal.hours)} Std von {formatHours(data.personal.required)} Std</span>
                            </div>
                            {renderProgress(getProgressPercentage(data.personal.hours, data.personal.required), 'Ihr Fortschritt')}
                        </div>
                    )}
                </>
            ) : null}
            <Link
                aria-label="Details anzeigen"
                className="inline-flex mt-2 text-sm font-medium text-green-800 underline decoration-green-300 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
                to="/dashboard/arbeitsstunden"
            >
                Arbeitsstunden Details
            </Link>
        </section>
    );
};

export default WorkHoursOverviewCard;
