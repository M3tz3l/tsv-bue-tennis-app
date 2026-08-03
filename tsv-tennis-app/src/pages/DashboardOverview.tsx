import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import useDashboard from '../hooks/useDashboard';
import { useEvents } from '../hooks/useEvents';
import { getApiErrorMessage } from '../services/backendService';
import DashboardShell from '../components/DashboardShell';
import WorkHoursOverviewCard from '../components/WorkHoursOverviewCard';
import UpcomingEventsList from '../components/UpcomingEventsList';

const DashboardOverview = () => {
    const { user, token } = useAuth();
    const selectedYear = new Date().getFullYear();
    const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboard(user?.id, selectedYear, !!user?.id && !!token);
    const { data: events, isLoading: eventsLoading, error: eventsError } = useEvents(user?.id, !!user?.id && !!token);
    const [isMailComposerOpen, setIsMailComposerOpen] = useState(false);

    useEffect(() => {
        if (dashboardError) toast.error(getApiErrorMessage(dashboardError, 'Dashboard-Daten konnten nicht geladen werden'));
        if (eventsError) toast.error(getApiErrorMessage(eventsError, 'Veranstaltungen konnten nicht geladen werden'));
    }, [dashboardError, eventsError]);

    return (
        <DashboardShell title="Meine Übersicht" onOpenMailComposer={() => setIsMailComposerOpen(true)} isMailComposerOpen={isMailComposerOpen} onCloseMailComposer={() => setIsMailComposerOpen(false)}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
                <div className="min-h-56">
                    {dashboardLoading ? <div className="h-56 animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Arbeitsstunden werden geladen" /> : dashboardError ? <section className="min-h-56 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">Arbeitsstunden</h2><p className="mt-4 text-sm">Arbeitsstunden konnten nicht geladen werden: {getApiErrorMessage(dashboardError, 'Unbekannter Fehler')}</p></section> : dashboardData ? <WorkHoursOverviewCard data={dashboardData} selectedYear={selectedYear} /> : null}
                </div>
                <UpcomingEventsList events={events} isLoading={eventsLoading} error={eventsError} limit={3} />
            </div>
        </DashboardShell>
    );
};

export default DashboardOverview;
