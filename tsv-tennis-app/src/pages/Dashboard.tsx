import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BackendService from '../services/backendService.ts';
import { 
    PencilIcon, 
    PlusIcon,
    TrashIcon,
    ArrowRightOnRectangleIcon,
    ClockIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { toast } from 'react-toastify';
import TSV_Logo from '../assets/TSV_Tennis.svg';
import type { DashboardResponse } from '../types/DashboardResponse';
import type { WorkHourEntry } from '../types/WorkHourEntry';

const Dashboard = () => {
    const { user, logout, token } = useAuth();
    const queryClient = useQueryClient();
    const [editingRow, setEditingRow] = useState<any>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Fetch family dashboard data from the backend API
    const { data: dashboardData, isLoading, error } = useQuery({
        queryKey: ['dashboard', user?.id, selectedYear],
        queryFn: async (): Promise<DashboardResponse> => {
            console.log('🔍 Dashboard: Starting family dashboard API call');
            console.log('🔍 Dashboard: Token available:', !!token);
            console.log('🔍 Dashboard: User available:', !!user);
            console.log('🔍 Dashboard: Selected year:', selectedYear);
            
            if (!token) {
                throw new Error('Kein Authentifizierungs-Token verfügbar');
            }
            
            console.log(`🔍 Dashboard: Making API call to dashboard/${selectedYear}`);
            const response = await BackendService.getDashboard(selectedYear);
            
            console.log('🔍 Dashboard: Family dashboard response received:', response);
            return response;
        },
        enabled: !!user && !!token,
        retry: 1,
    });

    const handleLogout = () => {
        logout();
    };

    const handleEdit = async (row) => {
        try {
            console.log('🔍 Fetching work hour details for ID:', row.id);
            
            // Fetch the complete work hour entry using the GET endpoint
            const response = await BackendService.getArbeitsstundenById(row.id);
            
            if (response.success) {
                console.log('✅ Fetched work hour data:', response.data);
                setEditingRow(response.data);
                setShowAddForm(false);
            } else {
                toast.error('Fehler beim Laden der Daten zum Bearbeiten');
                console.error('Failed to fetch work hour:', response.message);
            }
        } catch (error) {
            console.error('Error fetching work hour for edit:', error);
            toast.error('Fehler beim Laden der Daten zum Bearbeiten');
        }
    };

    const handleDelete = async (rowId) => {
        if (window.confirm('Möchten Sie diesen Eintrag wirklich löschen?')) {
            try {
                console.log('🗑️ Deleting work hour entry:', rowId);
                
                const response = await BackendService.deleteArbeitsstunden(rowId);
                
                if (response.success) {
                    toast.success('Eintrag erfolgreich gelöscht');
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                } else {
                    toast.error(response.message || 'Fehler beim Löschen des Eintrags');
                }
            } catch (error) {
                console.error('Error deleting work hour:', error);
                toast.error(error.response?.data?.message || 'Fehler beim Löschen des Eintrags');
            }
        }
    };

    const handleSave = async (formData) => {
        try {
            // For new entries, use backend API
            if (!editingRow) {
                console.log('🚀 Creating new work hours entry:', formData);
                console.log('🚀 Stunden value:', formData.Stunden, 'type:', typeof formData.Stunden);
                
                // Check for existing entry on the same date (client-side check)
                let existingEntries = [];
                
                // Get all entries from both personal and family data
                if (dashboardData?.personal?.entries) {
                    existingEntries = dashboardData.personal.entries;
                } else if (dashboardData?.family?.memberContributions) {
                    existingEntries = dashboardData.family.memberContributions.flatMap(m => m.entries || []);
                }
                
                console.log('🔍 Checking for duplicates. Existing entries:', existingEntries.length);
                console.log('🔍 Looking for date:', formData.Datum, 'name:', formData.Vorname, formData.Nachname);
                console.log('🔍 All existing entries:', existingEntries.map(e => ({ 
                    id: e.id, 
                    Datum: e.Datum, 
                    Nachname: e.Nachname, 
                    Vorname: e.Vorname 
                })));
                
                const sameDate = existingEntries.find(entry => {
                    // Since the dashboard data doesn't include names, we'll check by date only
                    // This is still valid because each person can only have one entry per day
                    const entryDate = entry.Datum;
                    const formDate = formData.Datum;
                    
                    const dateMatch = entryDate === formDate;
                    
                    console.log('🔍 Comparing dates only (names not available in dashboard data):', {
                        existingDate: entryDate,
                        newDate: formDate,
                        dateMatch: dateMatch
                    });
                    
                    if (dateMatch) {
                        console.log('🔍 Found matching date:', entry);
                    }
                    return dateMatch;
                });
                
                if (sameDate) {
                    console.log('❌ Duplicate entry found, blocking creation');
                    toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                    return;
                }
                
                const response = await BackendService.createArbeitsstunden(formData);
                
                console.log('✅ Response from backend:', response);
                
                if (response.success) {
                    toast.success('Eintrag erfolgreich erstellt');
                    setShowAddForm(false);
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                } else {
                    toast.error(response.message || 'Fehler beim Erstellen');
                }
            } else {
                console.log('🚀 Updating work hours entry:', editingRow.id, formData);
                
                // For updates, check if we're changing the date and if so, check for duplicates
                if (editingRow.Datum !== formData.Datum) {
                    console.log('🔍 Date changed from', editingRow.Datum, 'to', formData.Datum, '- checking for duplicates');
                    
                    let existingEntries = [];
                    
                    // Get all entries from both personal and family data
                    if (dashboardData?.personal?.entries) {
                        existingEntries = dashboardData.personal.entries;
                    } else if (dashboardData?.family?.memberContributions) {
                        existingEntries = dashboardData.family.memberContributions.flatMap(m => m.entries || []);
                    }
                    
                    // Check if there's already an entry for the new date (excluding current entry being edited)
                    const duplicateEntry = existingEntries.find(entry => {
                        // Since dashboard data doesn't include names, check by date only (excluding current entry)
                        const entryDate = entry.Datum;
                        const formDate = formData.Datum;
                        
                        return entry.id !== editingRow.id && // Exclude the current entry being edited
                               entryDate === formDate;
                    });
                    
                    if (duplicateEntry) {
                        console.log('❌ Duplicate entry found for new date, blocking update');
                        toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                        return;
                    }
                }
                
                // Send the form data as-is (with German field names)
                console.log('🚀 Sending update data:', formData);
                
                const response = await BackendService.updateArbeitsstunden(editingRow.id, formData);
                
                console.log('✅ Update response from backend:', response);
                
                if (response.success) {
                    toast.success('Eintrag erfolgreich aktualisiert');
                    setEditingRow(null);
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                } else {
                    toast.error(response.message || 'Fehler beim Aktualisieren');
                }
            }
        } catch (error: any) {
            console.error('Error saving work hours:', error);
            // Handle specific error messages from backend
            if (error.response?.data?.message?.includes('duplicate') || 
                error.response?.data?.message?.includes('bereits vorhanden')) {
                toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
            } else {
                toast.error(error.response?.data?.message || error.response?.data?.error || 'Ein Fehler ist aufgetreten');
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
                            {error?.message || dashboardData?.error || 'Fehler beim Laden der Dashboard-Daten'}
                        </p>
                        <p className="text-sm text-red-500 mt-2">
                            Bitte überprüfen Sie Ihre Konfiguration.
                        </p>
                    </div>
                </div>
            );
        }

        // Get work hours data from personal or family context
        let data = dashboardData?.personal?.entries || 
                  (dashboardData?.family?.memberContributions.flatMap(m => m.entries)) || [];

        // Sort entries by Datum descending (most recent first)
        data = [...data].sort((a, b) => {
            // Fallback if Datum is missing
            if (!a.Datum) return 1;
            if (!b.Datum) return -1;
            // Compare as ISO date strings
            return b.Datum.localeCompare(a.Datum);
        });

        if (data.length === 0) {
            return (
                <div className="text-center py-12">
                    <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Arbeitsstunden für {selectedYear} gefunden</h3>
                    <p className="mt-1 text-sm text-gray-500">Fügen Sie Ihren ersten Eintrag für dieses Jahr hinzu.</p>
                    <div className="mt-6">
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                        >
                            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                            Arbeitsstunden hinzufügen
                        </button>
                    </div>
                </div>
            );
        }

        // Get field names from the first data entry, excluding system fields
        const sampleRow = data[0];
        console.log("🔍 Sample row keys:", Object.keys(sampleRow));
        console.log("🔍 Sample row data:", sampleRow);
        
        const fieldNames = Object.keys(sampleRow).filter(key => 
            key !== 'order' && 
            !key.startsWith('_') &&
            key !== 'User_UUID' &&
            key !== 'Mitglied_UUID' &&
            key !== 'User' &&
            key !== 'Mitglied' &&
            key !== 'UUID' &&
            key !== 'Vorname' &&
            key !== 'Nachname' &&
            key.toLowerCase() !== 'id'
        );
        
        console.log("🔍 Filtered field names:", fieldNames);

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
                        Hinzufügen
                    </button>
                </div>
                
                {/* Mobile card layout */}
                <div className="block md:hidden">
                    <div className="divide-y divide-gray-200">
                        {data.map((row) => (
                            <div key={row.id} className="p-4 hover:bg-gray-50">
                                <div className="space-y-2">
                                    {fieldNames.map((field) => (
                                        <div key={field} className="flex justify-between items-start">
                                            <span className="text-sm font-medium text-gray-500 min-w-0 flex-1">
                                                {field.replace(/_/g, ' ')}:
                                            </span>
                                            <span className="text-sm text-gray-900 ml-2 break-words text-right flex-1">
                                                {field === 'Stunden' ? 
                                                    parseFloat(row[field] || 0).toFixed(1) :
                                                    (row[field] || '-')
                                                }
                                            </span>
                                        </div>
                                    ))}
                                    <div className="flex space-x-2 pt-2 border-t border-gray-100">
                                        <button
                                            onClick={() => handleEdit(row)}
                                            className="flex-1 inline-flex items-center justify-center px-3 py-2 text-xs text-blue-600 hover:text-blue-900 border border-blue-300 rounded hover:bg-blue-50"
                                        >
                                            <PencilIcon className="h-4 w-4 mr-1" />
                                            Bearbeiten
                                        </button>
                                        <button
                                            onClick={() => handleDelete(row.id)}
                                            className="flex-1 inline-flex items-center justify-center px-3 py-2 text-xs text-red-600 hover:text-red-900 border border-red-300 rounded hover:bg-red-50"
                                        >
                                            <TrashIcon className="h-4 w-4 mr-1" />
                                            Löschen
                                        </button>
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
                                        {field.replace(/_/g, ' ')}
                                    </th>
                                ))}
                                <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    Aktionen
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((row) => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    {fieldNames.map((field) => (
                                        <td key={field} className="px-3 lg:px-6 py-4 text-sm text-gray-900">
                                            <div className="max-w-xs break-words" title={field === 'Stunden' ? 
                                                parseFloat(row[field] || 0).toFixed(1) :
                                                (row[field] || '-')}>
                                                {field === 'Stunden' ? 
                                                    parseFloat(row[field] || 0).toFixed(1) :
                                                    (row[field] || '-')
                                                }
                                            </div>
                                        </td>
                                    ))}
                                    <td className="px-3 lg:px-6 py-4 text-sm font-medium">
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => handleEdit(row)}
                                                className="inline-flex items-center justify-center px-2 py-1 text-xs text-blue-600 hover:text-blue-900 border border-blue-300 rounded hover:bg-blue-50"
                                            >
                                                <PencilIcon className="h-4 w-4 mr-1" />
                                                <span className="hidden lg:inline">Bearbeiten</span>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(row.id)}
                                                className="inline-flex items-center justify-center px-2 py-1 text-xs text-red-600 hover:text-red-900 border border-red-300 rounded hover:bg-red-50"
                                            >
                                                <TrashIcon className="h-4 w-4 mr-1" />
                                                <span className="hidden lg:inline">Löschen</span>
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
                {/* Year Selector */}
                <div className="mb-4 sm:mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Jahr auswählen:</label>
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        {[2024, 2025, 2026].map(year => (
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
                                        <span><span className="font-bold">{dashboardData.family.completed.toFixed(1)} Std</span> von <span className="font-bold">{dashboardData.family.required.toFixed(1)} Std</span></span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                        <div 
                                            className={`h-3 rounded-full transition-all duration-300 ${
                                                dashboardData.family.percentage >= 100 ? 'bg-green-500' :
                                                dashboardData.family.percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                                            }`}
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
                                    {dashboardData.family.memberContributions.map((member, index) => (
                                        <div key={index} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-gray-50 rounded space-y-1 sm:space-y-0">
                                            <span className="font-medium">{member.name}</span>
                                            <span className="text-blue-600 font-bold text-sm sm:text-base">
                                                {member.hours.toFixed(1)} / {member.required.toFixed(1)} Std
                                            </span>
                                        </div>
                                    ))}
                                    {dashboardData.family.remaining > 0 && (
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-red-50 rounded border border-red-200 space-y-1 sm:space-y-0">
                                            <span className="font-medium text-red-700">Noch zu erledigen</span>
                                            <span className="text-red-600 font-bold">{dashboardData.family.remaining.toFixed(1)} Std</span>
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
                                
                                {/* Personal Progress Bar */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                                        <span>Ihr Fortschritt</span>
                                        <span>
                                            <span className="font-bold">{(dashboardData?.personal?.hours || 0).toFixed(1)} Std</span> von{' '}
                                            <span className="font-bold">{(dashboardData?.personal?.required || 8).toFixed(1)} Std</span>
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                        <div 
                                            className={`h-3 rounded-full ${(() => {
                                                const personalHours = dashboardData?.personal?.hours || 0;
                                                const requiredHours = dashboardData?.personal?.required || 8;
                                                const percentage = (personalHours / requiredHours) * 100;
                                                return percentage >= 100 ? 'bg-green-500' :
                                                       percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500';
                                            })()}`}
                                            style={{ 
                                                width: `${Math.min(100, ((dashboardData?.personal?.hours || 0) / (dashboardData?.personal?.required || 8)) * 100)}%` 
                                            }}
                                        ></div>
                                    </div>
                                    <div className="text-right text-sm text-gray-600 mt-1">
                                        {Math.round(Math.min(100, (((dashboardData?.personal?.hours || 0) / (dashboardData?.personal?.required || 8)) * 100)))}% abgeschlossen
                                    </div>
                                </div>
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
                    userProfile={
                        // Extract user profile from different sources
                        dashboardData?.personal?.name ? {
                            // If personal.name exists, parse it
                            Nachname: dashboardData.personal.name.split(' ').slice(1).join(' '),
                            Vorname: dashboardData.personal.name.split(' ')[0]
                        } : 
                        // Fallback to family members lookup
                        dashboardData?.family?.members?.find(m => m.email === user?.email) ||
                        // Final fallback
                        { Nachname: '', Vorname: '' }
                    }
                    selectedYear={selectedYear}
                />
            )}
        </div>
    );
};

// Modal component for adding/editing Arbeitsstunden using Headless UI
const ArbeitsstundenFormModal = ({ isOpen, onClose, onSave, initialData, userProfile, selectedYear }) => {
    const [formData, setFormData] = useState(() => {
        if (!initialData && userProfile) {
            return {
                Nachname: userProfile.Nachname || userProfile.nachname || '',
                Vorname: userProfile.Vorname || userProfile.vorname || '',
                Datum: new Date().toISOString().split('T')[0],
                Stunden: '',
                Tätigkeit: ''
            };
        }
        return initialData || {};
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        console.log('🔧 userProfile changed:', userProfile);
        if (!initialData && userProfile) {
            console.log('🔧 Updating form data with userProfile:', {
                Nachname: userProfile.Nachname,
                Vorname: userProfile.Vorname
            });
            setFormData(prev => ({
                ...prev,
                Nachname: userProfile.Nachname || userProfile.nachname || '',
                Vorname: userProfile.Vorname || userProfile.vorname || ''
            }));
        }
    }, [userProfile, initialData]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Debug: Log form data for debugging
        console.log('Form submission - current form data:', formData);
        console.log('Field validation:', {
            Nachname: !!formData.Nachname,
            Vorname: !!formData.Vorname,
            Stunden: !!formData.Stunden,
            Datum: !!formData.Datum,
            Tätigkeit: !!formData.Tätigkeit
        });
        // Validate required fields
        if (!formData.Nachname || !formData.Vorname || !formData.Stunden || !formData.Datum || !formData.Tätigkeit) {
            toast.error('Bitte füllen Sie alle Felder aus');
            return;
        }
        // Validate date is not in the future
        const selectedDate = new Date(formData.Datum);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (selectedDate > today) {
            toast.error('Das Datum darf nicht in der Zukunft liegen');
            return;
        }
        // Validate hours is positive and reasonable
        const hours = parseFloat(formData.Stunden);
        if (isNaN(hours) || hours <= 0) {
            toast.error('Stunden müssen eine positive Zahl sein');
            return;
        }
        if (hours > 24) {
            toast.error('Mehr als 24 Stunden pro Tag sind nicht möglich');
            return;
        }
        setIsSubmitting(true);
        try {
            await onSave(formData);
        } finally {
            setIsSubmitting(false);
        }
    };

    const today = new Date().toISOString().split('T')[0];
    const fieldNames = ['Nachname', 'Vorname', 'Datum', 'Stunden', 'Tätigkeit'];

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
                <DialogPanel className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-xl">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <DialogTitle className="text-lg font-medium text-gray-900">
                            {initialData ? 'Arbeitsstunden bearbeiten' : `Neue Arbeitsstunden hinzufügen - ${selectedYear}`}
                        </DialogTitle>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                    {selectedYear && !initialData && (
                        <div className="px-6 pt-2">
                            <p className="text-sm text-gray-600">
                                Diese Stunden werden für das Jahr {selectedYear} erfasst.
                            </p>
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="px-6 py-4">
                        <div className="space-y-4">
                            {fieldNames.map((field) => (
                                <div key={field}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {field === 'Datum' ? 'Datum' :
                                         field === 'Nachname' ? 'Nachname' :
                                         field === 'Vorname' ? 'Vorname' :
                                         field === 'Stunden' ? 'Stunden' :
                                         field === 'Tätigkeit' ? 'Tätigkeit' :
                                         field.replace(/_/g, ' ')}
                                    </label>
                                    {field === 'Datum' ? (
                                        <div>
                                            <input
                                                type="date"
                                                value={formData[field] || ''}
                                                max={today}
                                                onChange={(e) => {
                                                    console.log('📅 Date input changed:', e.target.value);
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        [field]: e.target.value
                                                    }));
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                lang="de"
                                                style={{ colorScheme: 'light' }}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Datum darf nicht in der Zukunft liegen
                                            </p>
                                            <p className="text-xs text-blue-600 mt-1">
                                                📅 Ausgewähltes Datum: {formData[field] ? new Date(formData[field]).toLocaleDateString('de-DE', { 
                                                    weekday: 'long', 
                                                    year: 'numeric', 
                                                    month: 'long', 
                                                    day: 'numeric' 
                                                }) : 'Kein Datum ausgewählt'}
                                            </p>
                                        </div>
                                    ) : field === 'Stunden' ? (
                                        <div>
                                            <input
                                                type="number"
                                                step="0.5"
                                                min="0.5"
                                                max="24"
                                                value={formData[field] || ''}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    [field]: e.target.value
                                                }))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                placeholder="z.B. 2.5"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Zwischen 0.5 und 24 Stunden
                                            </p>
                                        </div>
                                    ) : field === 'Nachname' || field === 'Vorname' ? (
                                        <input
                                            type="text"
                                            value={formData[field] || ''}
                                            readOnly
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                                            placeholder={`${field} (aus Ihrem Profil)`}
                                        />
                                    ) : field === 'Tätigkeit' ? (
                                        <div>
                                            <input
                                                type="text"
                                                value={formData[field] || ''}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    [field]: e.target.value
                                                }))}
                                                maxLength={40}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                placeholder="z.B. Platzpflege, Vereinsfeier..."
                                            />
                                            <div className="text-xs text-gray-500 mt-1">
                                                {(formData[field] || '').length}/40 Zeichen
                                            </div>
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={formData[field] || ''}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                [field]: e.target.value
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                            placeholder={`${field} eingeben`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end space-x-3 mt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                disabled={isSubmitting}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className={`px-4 py-2 border border-transparent rounded-md text-sm font-medium transition-colors ${isSubmitting ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                disabled={isSubmitting}
                                style={isSubmitting ? { pointerEvents: 'none' } : {}}
                            >
                                {isSubmitting ? 'Speichern...' : (initialData ? 'Aktualisieren' : 'Erstellen')}
                            </button>
                        </div>
                    </form>
                </DialogPanel>
            </div>
        </Dialog>
    );
};

export default Dashboard;
