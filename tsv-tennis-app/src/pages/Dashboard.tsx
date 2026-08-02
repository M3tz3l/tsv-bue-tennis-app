import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import BackendService, { getApiErrorMessage } from '../services/backendService.ts';
import { PencilIcon, PlusIcon, ArrowRightOnRectangleIcon, ClockIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import TSV_Logo from '../assets/TSV_Tennis.svg';
import type { WorkHourEntry, CreateWorkHourRequest, MemberContribution } from '../types';
import useDashboard, { DASHBOARD_QUERY_KEY } from '../hooks/useDashboard';
import ArbeitsstundenFormModal from '../components/ArbeitsstundenFormModal';
import MailComposer from '../components/MailComposer';
import {
    getCurrentYear,
    getMemberEntries,
    getProgressColor,
    getProgressPercentage,
    hasDuplicateEntry,
    formatHours,
    sortEntriesByDate,
} from '../utils/utils';

const Dashboard = () => {
    const { user, logout, token } = useAuth();
    const queryClient = useQueryClient();
    const [editingRow, setEditingRow] = useState<WorkHourEntry | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedYear, setSelectedYear] = useState(getCurrentYear());
    const [showMailComposer, setShowMailComposer] = useState(false);
    const isOrga = user?.role?.trim().toLowerCase() === 'orga';

    // Fetch family dashboard data from the backend API
    const { data: dashboardData, isLoading, error } = useDashboard(user?.id, selectedYear, !!user?.id && !!token);

    const handleLogout = () => {
        logout();
    };

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
    const getMyEntries = (): WorkHourEntry[] => getMemberEntries(dashboardData, user?.id);

    const handleSave = async (formData: Partial<CreateWorkHourRequest> & { [key: string]: unknown }) => {
        try {
            const myEntries = getMyEntries();

            // Check for duplicate entry on the same date
            if (!editingRow) {
                if (hasDuplicateEntry(myEntries, formData)) {
                    toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                    return;
                }
            } else if (editingRow.Datum !== formData.Datum) {
                if (hasDuplicateEntry(myEntries, formData, editingRow.id)) {
                    toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                    return;
                }
            }

            const payload: CreateWorkHourRequest = {
                Datum: formData.Datum || '',
                Tätigkeit: String(formData.Tätigkeit ?? ''),
                Stunden: Number(formData.Stunden) || 0
            };

            const response = editingRow
                ? await BackendService.updateArbeitsstunden(String(editingRow.id), payload)
                : await BackendService.createArbeitsstunden(payload);

            if (response && response.success) {
                toast.success(editingRow ? 'Eintrag erfolgreich aktualisiert' : 'Eintrag erfolgreich erstellt');
                if (editingRow) setEditingRow(null);
                else setShowAddForm(false);
                void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY(user?.id, selectedYear) });
            } else {
                const backendMsg = response.message;
                toast.error(backendMsg || (editingRow ? 'Fehler beim Aktualisieren' : 'Fehler beim Erstellen'));
            }
        } catch (error: unknown) {
            const msg = getApiErrorMessage(error, 'Ein Fehler ist aufgetreten');
            if (typeof msg === 'string' && /duplicate|bereits (vorhanden|ein Eintrag)/i.test(msg)) {
                toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
            } else {
                toast.error(msg);
            }
        }
    };

    const renderArbeitsstundenTable = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                </div>
            );
        }

        if (error || !dashboardData?.success) {
            return (
                <div className="text-center py-12">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                        <h3 className="text-lg font-medium text-red-800 mb-2">Fehler beim Laden der Daten</h3>
                        <p className="text-red-600">
                            {getApiErrorMessage(error, 'Fehler beim Laden der Dashboard-Daten')}
                        </p>
                        <p className="text-sm text-red-500 mt-2">
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
                    <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Arbeitsstunden für {selectedYear} gefunden</h3>
                    <p className="mt-1 text-sm text-gray-500">Fügen Sie Ihren ersten Eintrag hinzu.</p>
                    <div className="mt-6">
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
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
            <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                    <div>
                        <h3 className="text-lg font-medium text-gray-900">Meine Arbeitsstunden - {selectedYear}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Detaillierte Übersicht aller Einträge
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                    >
                        <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                        Eintragen
                    </button>
                </div>

                {/* Mobile card layout (compact with overflow menu only) */}
                <div className="block md:hidden">
                    <div className="divide-y divide-gray-200">
                        {data.map((row: WorkHourEntry) => (
                            <div key={row.id} className="p-3 hover:bg-gray-50">
                                <div className="flex items-center justify-between space-x-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline space-x-2">
                                            <div className="text-sm font-medium text-gray-700 flex-none whitespace-nowrap">{row.Datum}</div>
                                            <div className="text-xs text-gray-500">·</div>
                                            <div className="text-sm text-gray-900 min-w-0 flex-1 truncate">{String(row.Tätigkeit ?? '-')}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className="text-sm font-semibold text-gray-800 w-14 text-right">{formatHours(row.Stunden)}h</div>
                                        <div className="relative">
                                            <button
                                                onClick={() => handleEdit(row)}
                                                aria-label="Bearbeiten"
                                                className="p-2 rounded-md text-blue-600 hover:bg-blue-50"
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
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                {fieldNames.map((field) => (
                                    <th
                                        key={field}
                                        className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                                    >
                                        {FIELD_LABELS[String(field)] ?? String(field).replace(/_/g, ' ')}
                                    </th>
                                ))}
                                <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    Aktionen
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((row: WorkHourEntry) => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    {fieldNames.map((field) => {
                                        const fieldKey = String(field);
                                        const value = (row as Record<string, unknown>)[fieldKey];
                                        return (
                                            <td key={fieldKey} className="px-3 lg:px-6 py-4 text-sm text-gray-900">
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
                                                className="p-2 rounded-md text-blue-600 hover:bg-blue-50"
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

    // Prepare user profile for the modal (avoid repeated finds and implicit any)
    const userProfile = (() => {
        if (dashboardData?.personal?.name) {
            const parts = dashboardData.personal.name.split(' ');
            return { Nachname: parts.slice(1).join(' '), Vorname: parts[0] };
        }
        const found = dashboardData?.family?.members?.find((m: { email?: string; name?: string }) => m.email === user?.email);
        if (found && found.name) {
            const parts = found.name.split(' ');
            return { Nachname: parts.slice(1).join(' '), Vorname: parts[0] };
        }
        return { Nachname: '', Vorname: '' };
    })();

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row justify-between items-center py-4 space-y-3 sm:space-y-0">
                        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0">
                            <img src={TSV_Logo} alt="TSV BÜ Tennis Logo" className="h-16 sm:h-20 w-auto mr-0 sm:mr-4 drop-shadow-sm hover:drop-shadow-md transition-all duration-300" />
                            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 text-center sm:text-left">TSV BÜ Tennis Arbeitsstunden</h1>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
                            <span className="text-xs sm:text-sm text-gray-600 text-center">
                                Willkommen, {user?.email || 'Benutzer'}
                            </span>
                            {isOrga && (
                                <button
                                    onClick={() => setShowMailComposer(true)}
                                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                                    title="Versende Rundmails an Mitglieder (nur Rolle orga)."
                                >
                                    <EnvelopeIcon className="-ml-1 mr-2 h-4 sm:h-5 w-4 sm:w-5" />
                                    Rundmail
                                </button>
                            )}
                            <button
                                onClick={handleLogout}
                                className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                            >
                                <ArrowRightOnRectangleIcon className="-ml-1 mr-2 h-4 sm:h-5 w-4 sm:w-5" />
                                Abmelden
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
                <nav aria-label="Dashboard-Bereiche" className="mb-6 flex flex-wrap gap-2">
                    <NavLink
                        to="/dashboard/arbeitsstunden"
                        className={({ isActive }) => `rounded-md px-4 py-2 text-sm font-medium ${isActive ? 'bg-green-600 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-green-50'}`}
                    >
                        Arbeitsstunden
                    </NavLink>
                    <NavLink
                        to="/dashboard/veranstaltungen"
                        className={({ isActive }) => `rounded-md px-4 py-2 text-sm font-medium ${isActive ? 'bg-green-600 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-green-50'}`}
                    >
                        Veranstaltungen
                    </NavLink>
                </nav>
                {/* Year Selector */}
                <div className="mb-4 sm:mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Jahr auswählen:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        {[new Date().getFullYear() - 1, new Date().getFullYear()].map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>

                {/* Work Hours Status Card - Shows family info if multiple members, otherwise single member */}
                {(dashboardData?.family || dashboardData?.personal) && (
                    <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 mb-6 sm:mb-8">
                        {dashboardData?.family && dashboardData.family.members.length > 1 ? (
                            // Multiple family members - show family view
                            <>
                                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
                                    🏠 Familie - {selectedYear}
                                </h2>

                                {/* Family Progress Bar */}
                                <div className="mb-4">
                                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm text-gray-600 mb-1 space-y-1 sm:space-y-0">
                                        <span>Familien-Fortschritt</span>
                                        <span><span className="font-bold">{formatHours(dashboardData.family.completed)} Std</span> von <span className="font-bold">{formatHours(dashboardData.family.required)} Std</span></span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                        <div
                                        className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(dashboardData.family.percentage)}`}
                                            style={{ width: `${Math.min(100, dashboardData.family.percentage)}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-right text-sm text-gray-600 mt-1">
                                        {Math.round(Math.min(100, dashboardData.family.percentage))}% abgeschlossen
                                    </div>
                                </div>

                                {/* Family Members Contributions */}
                                <div className="space-y-3">
                                    <h3 className="font-medium text-gray-800">Familienmitglieder:</h3>
                                        {[...dashboardData.family.memberContributions]
                                        .sort((a: MemberContribution, b: MemberContribution) => a.name.localeCompare(b.name, 'de'))
                                        .map((member: MemberContribution, index: number) => {
                                            const isCurrentUser = user?.name === member.name;

                                            return (
                                                <div
                                                    key={index}
                                                    className={`flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 rounded space-y-1 sm:space-y-0 ${isCurrentUser
                                                        ? 'bg-blue-100 border-2 border-blue-300'
                                                        : 'bg-gray-50'
                                                        }`}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className={`font-medium ${isCurrentUser ? 'text-blue-800' : ''}`}>
                                                            {member.name} {isCurrentUser ? '(Sie)' : ''}
                                                        </span>
                                                        {member.exemption_reason && (
                                                            <span className="text-xs text-gray-600 italic">
                                                                Befreit: {member.exemption_reason}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`font-bold text-sm sm:text-base ${isCurrentUser ? 'text-blue-700' : 'text-blue-600'
                                                        } ${member.exemption_reason ? 'text-green-600' : ''}`}>
                                                        {member.exemption_reason ?
                                                            (member.hours > 0 ? `${formatHours(member.hours)} Std / Befreit` : 'Befreit')
                                                            : `${formatHours(member.hours)} / ${formatHours(member.required)} Std`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    {dashboardData.family.remaining > 0 && (
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-red-50 rounded border border-red-200 space-y-1 sm:space-y-0">
                                            <span className="font-medium text-red-700">Noch zu erledigen</span>
                                            <span className="text-red-600 font-bold">{formatHours(dashboardData.family.remaining)} Std</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            // Single member - show simplified personal view with progress bar
                            <>
                                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                                    👤 {dashboardData?.personal?.name || 'Ihre Arbeitsstunden'} - {selectedYear}
                                </h2>

                                {/* Check if user is exempt */}
                                {dashboardData?.personal?.required === 0 ? (
                                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <span className="text-green-600 font-semibold text-lg">✓ Befreit von Arbeitsstunden</span>
                                            {dashboardData?.personal?.hours > 0 && (
                                                <span className="text-green-700 font-bold">
                                                    {formatHours(dashboardData.personal.hours)} Std geleistet
                                                </span>
                                            )}
                                        </div>
                                        {dashboardData.personal.exemption_reason && (
                                            <p className="text-sm text-green-700 mt-1">
                                                Grund: {dashboardData.personal.exemption_reason}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    /* Personal Progress Bar */
                                    <div className="mb-4">
                                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                                            <span>Ihr Fortschritt</span>
                                            <span>
                                                <span className="font-bold">{formatHours(dashboardData?.personal?.hours || 0)} Std</span> von{' '}
                                                <span className="font-bold">{formatHours(dashboardData?.personal?.required || 8)} Std</span>
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-3">
                                            <div
                                                    className={`h-3 rounded-full ${getProgressColor(getProgressPercentage(dashboardData.personal?.hours || 0, dashboardData.personal?.required || 8))}`}
                                                style={{
                                                    width: `${getProgressPercentage(dashboardData.personal?.hours || 0, dashboardData.personal?.required || 8)}%`
                                                }}
                                            ></div>
                                        </div>
                                        <div className="text-right text-sm text-gray-600 mt-1">
                                            {Math.round(getProgressPercentage(dashboardData.personal?.hours || 0, dashboardData.personal?.required || 8))}% abgeschlossen
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Arbeitsstunden Table */}
                {renderArbeitsstundenTable()}
            </main>

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

            {/* Mail Composer Modal */}
            <MailComposer
                isOpen={showMailComposer}
                onClose={() => setShowMailComposer(false)}
            />
        </div>
    );
};

export default Dashboard;
