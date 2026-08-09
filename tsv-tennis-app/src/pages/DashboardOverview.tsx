import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useDashboard from '../hooks/useDashboard';
import { useEvents } from '../hooks/useEvents';
import { useWorkHourSave } from '../hooks/useWorkHourSave';
import { getApiErrorMessage } from '../services/backendService';
import DashboardShell from '../components/DashboardShell';
import WorkHoursOverviewCard from '../components/WorkHoursOverviewCard';
import UpcomingEventsList from '../components/UpcomingEventsList';
import ArbeitsstundenFormModal from '../components/ArbeitsstundenFormModal';

const DashboardOverview = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const selectedYear = new Date().getFullYear();
    const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboard(user?.id, selectedYear, !!user?.id && !!token);
    const { data: events, isLoading: eventsLoading, error: eventsError } = useEvents(user?.id, !!user?.id && !!token);
    const [isMailComposerOpen, setIsMailComposerOpen] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);

    useEffect(() => {
        if (dashboardError) toast.error(getApiErrorMessage(dashboardError, 'Dashboard-Daten konnten nicht geladen werden'));
        if (eventsError) toast.error(getApiErrorMessage(eventsError, 'Veranstaltungen konnten nicht geladen werden'));
    }, [dashboardError, eventsError]);

    const { handleSave, userProfile } = useWorkHourSave({
        userId: user?.id,
        email: user?.email,
        year: selectedYear,
        dashboardData,
        onSuccess: () => {
            setShowAddForm(false);
            void navigate('/dashboard/arbeitsstunden');
        },
    });

    return (
        <DashboardShell title="Meine Übersicht" onOpenMailComposer={() => setIsMailComposerOpen(true)} isMailComposerOpen={isMailComposerOpen} onCloseMailComposer={() => setIsMailComposerOpen(false)}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
                <div>
                    {dashboardLoading ? <div className="h-56 animate-pulse border border-[var(--hairline)] bg-white" aria-label="Arbeitsstunden werden geladen" /> : dashboardData ? <WorkHoursOverviewCard data={dashboardData} selectedYear={selectedYear} onAdd={() => setShowAddForm(true)} /> : null}
                </div>
                <UpcomingEventsList events={events} isLoading={eventsLoading} error={eventsError} limit={3} />
            </div>
            {showAddForm && (
                <ArbeitsstundenFormModal
                    isOpen={showAddForm}
                    onClose={() => setShowAddForm(false)}
                    onSave={handleSave}
                    userProfile={userProfile}
                    selectedYear={selectedYear}
                />
            )}
        </DashboardShell>
    );
};

export default DashboardOverview;
