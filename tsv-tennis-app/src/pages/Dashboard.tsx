import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import BackendService, { getApiErrorMessage } from '../services/backendService.ts';
import { PencilIcon, PlusIcon, ClockIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import type { WorkHourEntry, MemberContribution } from '../types';
import useDashboard from '../hooks/useDashboard';
import { useWorkHourSave } from '../hooks/useWorkHourSave';
import ArbeitsstundenFormModal from '../components/ArbeitsstundenFormModal';
import DashboardShell from '../components/DashboardShell';
import WorkHoursOverviewCard from '../components/WorkHoursOverviewCard';
import {
    getCurrentYear,
    formatHours,
    sortEntriesByDate,
} from '../utils/utils';
import { buttonVariants } from '../styles/tokens';

const Dashboard = () => {
    const { user, token } = useAuth();
    const [editingRow, setEditingRow] = useState<WorkHourEntry | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedYear, setSelectedYear] = useState(getCurrentYear());
    const [showMailComposer, setShowMailComposer] = useState(false);

    // Fetch family dashboard data from the backend API
    const { data: dashboardData, isLoading, error } = useDashboard(user?.id, selectedYear, !!user?.id && !!token);

    const { handleSave, userProfile } = useWorkHourSave({
        userId: user?.id,
        email: user?.email,
        year: selectedYear,
        dashboardData,
        editingRow,
        onSuccess: () => {
            setEditingRow(null);
            setShowAddForm(false);
        },
    });

    const handleEdit = async (row: WorkHourEntry) => {
        try {
            const response = await BackendService.getArbeitsstundenById(String(row.id));

            if (response.success) {
                setEditingRow(response.data ?? null);
                setShowAddForm(false);
            } else {
                toast.error('Fehler beim Laden der Daten zum Bearbeiten');
            }
        } catch (error: unknown) {
            toast.error(getApiErrorMessage(error, 'Fehler beim Laden der Daten zum Bearbeiten'));
        }
    };

    // Consolidate current user's entries from personal + family data
    const renderArbeitsstundenTable = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
                </div>
            );
        }

        if (error || !dashboardData?.success) {
            return (
                <div className="text-center py-12">
                    <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/5 p-6">
                        <h3 className="text-lg font-medium text-[var(--error)] mb-2">Fehler beim Laden der Daten</h3>
                        <p className="text-[var(--error)]">
                            {getApiErrorMessage(error, 'Fehler beim Laden der Dashboard-Daten')}
                        </p>
                        <p className="text-sm text-[var(--error)] mt-2">
                            Bitte überprüfen Sie Ihre Konfiguration.
                        </p>
                    </div>
                </div>
            );
        }

        // Get work hours data from personal or family context
        // Use personal entries if available; otherwise use entries for the current family member only
        const currentMemberEntries = dashboardData?.family?.memberContributions
            ?.filter((m: MemberContribution) => m.id === user?.id)
            .flatMap((m: MemberContribution) => m.entries || []) || [];

        const data = sortEntriesByDate(
            dashboardData?.personal?.entries?.length ? dashboardData.personal.entries : currentMemberEntries,
        );

        if (data.length === 0) {
            return (
                <div className="text-center py-12">
                    <ClockIcon className="mx-auto h-12 w-12 text-[var(--muted-soft)]" />
                    <h3 className="mt-2 text-sm font-medium text-[var(--ink)]">Keine Arbeitsstunden für {selectedYear} gefunden</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">Fügen Sie Ihren ersten Eintrag hinzu.</p>
                    <div className="mt-6">
                        <button
                            onClick={() => setShowAddForm(true)}
                            className={`${buttonVariants.primary} inline-flex items-center`}
                        >
                            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                            Arbeitsstunden eintragen
                        </button>
                    </div>
                </div>
            );
        }

        // Get field names from the first data entry, excluding system fields
        const sampleRow = data[0] as WorkHourEntry;

        const FIELD_LABELS: Record<string, string> = {
            Datum: 'Datum',
            Tätigkeit: 'Tätigkeit',
            Stunden: 'Stunden',
        };

        const fieldNames = Object.keys(sampleRow).filter(key =>
            key !== 'order' &&
            !key.startsWith('_') &&
            key !== 'User' &&
            key !== 'Mitglied' &&
            key !== 'Vorname' &&
            key !== 'Nachname' &&
            key.toLowerCase() !== 'id'
        ) as Array<keyof WorkHourEntry>;

        return (
            <div className="bg-white rounded-xl overflow-hidden border border-[var(--hairline)]">
                <div className="px-4 sm:px-6 py-4 border-b border-[var(--hairline)] flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                    <div>
                        <h3 className="text-lg font-extrabold tracking-tight text-[var(--ink)]">Meine Arbeitsstunden - {selectedYear}</h3>
                        <p className="text-sm text-[var(--muted)] mt-1">
                            Detaillierte Übersicht aller Einträge
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className={`${buttonVariants.primary} inline-flex w-full items-center justify-center sm:w-auto`}
                    >
                        <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                        Eintragen
                    </button>
                </div>

                {/* Mobile card layout (compact with overflow menu only) */}
                <div className="block md:hidden">
                    <div className="divide-y divide-[var(--hairline)]">
                        {data.map((row: WorkHourEntry) => (
                            <div key={row.id} className="p-3 hover:bg-[var(--canvas-soft)]">
                                <div className="flex items-center justify-between space-x-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline space-x-2">
                                            <div className="text-sm font-medium text-[var(--body)] flex-none whitespace-nowrap">{row.Datum}</div>
                                            <div className="text-xs text-[var(--muted)]">·</div>
                                            <div className="text-sm text-[var(--ink)] min-w-0 flex-1 truncate">{String(row.Tätigkeit ?? '-')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className="text-sm font-semibold text-[var(--ink)] w-14 text-right">{formatHours(row.Stunden)}h</div>
                                        <div className="relative">
                                            <button
                                                onClick={() => handleEdit(row)}
                                                aria-label="Bearbeiten"
                                                className="touch-control rounded-md text-[var(--muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)]"
                                            >
                                                <PencilIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Desktop table layout */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-[var(--hairline)]">
                        <thead className="bg-[var(--canvas-soft)]">
                            <tr>
                                {fieldNames.map((field) => (
                                    <th
                                        key={field}
                                        className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider whitespace-nowrap"
                                    >
                                        {FIELD_LABELS[String(field)] ?? String(field).replace(/_/g, ' ')}
                                    </th>
                                ))}
                                <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider whitespace-nowrap">
                                    Aktionen
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-[var(--hairline)]">
                            {data.map((row: WorkHourEntry) => (
                                <tr key={row.id} className="hover:bg-[var(--canvas-soft)]">
                                    {fieldNames.map((field) => {
                                        const fieldKey = String(field);
                                        const value = (row as Record<string, unknown>)[fieldKey];
                                        return (
                                            <td key={fieldKey} className="px-3 lg:px-6 py-4 text-sm text-[var(--ink)]">
                                                <div className="max-w-xs break-words" title={fieldKey === 'Stunden' ?
                                                    formatHours(value) :
                                                    typeof value === 'string' || typeof value === 'number' ? String(value) : '-'}>
                                                    {fieldKey === 'Stunden' ?
                                                        formatHours(value) :
                                                        typeof value === 'string' || typeof value === 'number' ? String(value) : '-'
                                                    }
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="px-3 lg:px-6 py-4 text-sm font-medium">
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => handleEdit(row)}
                                                aria-label="Bearbeiten"
                                                className="touch-control rounded-md text-[var(--muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)]"
                                            >
                                                <PencilIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <DashboardShell
            title="Arbeitsstunden"
            onOpenMailComposer={() => setShowMailComposer(true)}
            isMailComposerOpen={showMailComposer}
            onCloseMailComposer={() => setShowMailComposer(false)}
        >
                {/* Year Selector */}
                <div className="mb-4 sm:mb-6">
                    <label className="block text-sm font-medium text-[var(--body)] mb-2">Jahr auswählen:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="w-full sm:w-auto px-3 py-2 border border-[var(--hairline-strong)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    >
                        {[new Date().getFullYear() - 1, new Date().getFullYear()].map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>

                {dashboardData && <WorkHoursOverviewCard data={dashboardData} selectedYear={selectedYear} variant="detail" />}

                {/* Arbeitsstunden Table */}
                {renderArbeitsstundenTable()}
            {/* Add/Edit Form Modal */}
            {(showAddForm || editingRow) && (
                <ArbeitsstundenFormModal
                    isOpen={showAddForm || !!editingRow}
                    onClose={() => {
                        setShowAddForm(false);
                        setEditingRow(null);
                    }}
                    onSave={handleSave}
                    initialData={editingRow}
                    userProfile={userProfile}
                    selectedYear={selectedYear}
                />
            )}

        </DashboardShell>
    );
};

export default Dashboard;
