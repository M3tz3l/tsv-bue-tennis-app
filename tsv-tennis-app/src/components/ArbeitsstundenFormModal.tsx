import React, { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';
import { useForm } from 'react-hook-form';
import type { CreateWorkHourRequest, WorkHourEntry } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import BackendService from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import { DASHBOARD_QUERY_KEY } from '../hooks/useDashboard';
import DeleteConfirmDialog from './DeleteConfirmDialog';

type FormValues = {
    Nachname: string;
    Vorname: string;
    Datum: string;
    Stunden: string; // keep as string for input, convert on submit
    Tätigkeit: string;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    // onSave should accept either create or update shape; modal will pass CreateWorkHourRequest-like payload
    onSave: (formData: CreateWorkHourRequest | (CreateWorkHourRequest & { id?: string })) => Promise<void>;
    initialData?: WorkHourEntry | null;
    userProfile?: { Nachname?: string; Vorname?: string } | null;
    selectedYear?: number;
};

const ArbeitsstundenFormModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData, userProfile, selectedYear }) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const today = new Date().toISOString().split('T')[0];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const minAllowedYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const minDate = `${minAllowedYear}-01-01`;

    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
        defaultValues: {
            Nachname: userProfile?.Nachname || '',
            Vorname: userProfile?.Vorname || '',
            Datum: initialData?.Datum || today,
            Stunden: initialData ? String(initialData.Stunden) : '',
            Tätigkeit: initialData?.Tätigkeit || ''
        }
    });

    useEffect(() => {
        // Reset form when modal opens or initialData / profile changes
        reset({
            Nachname: userProfile?.Nachname || '',
            Vorname: userProfile?.Vorname || '',
            Datum: initialData?.Datum || today,
            Stunden: initialData ? String(initialData.Stunden) : '',
            Tätigkeit: initialData?.Tätigkeit || ''
        });
    }, [isOpen, initialData, userProfile, reset, today]);

    const onSubmit = async (values: FormValues) => {
        // Validate date not in future
        const selectedDate = new Date(values.Datum);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        if (selectedDate > endOfToday) {
            toast.error('Das Datum darf nicht in der Zukunft liegen');
            return;
        }

        const selYear = selectedDate.getFullYear();
        if (selYear < minAllowedYear) {
            if (currentMonth === 0) {
                toast.error(`Arbeitsstunden können nur für ${currentYear} oder ${currentYear - 1} (Nachfrist bis Ende Januar) eingetragen werden.`);
            } else {
                toast.error(`Arbeitsstunden können nur für das aktuelle Jahr ${currentYear} eingetragen werden.`);
            }
            return;
        }

        const hours = parseFloat(values.Stunden.replace(',', '.'));
        if (isNaN(hours) || hours <= 0) {
            toast.error('Stunden müssen eine positive Zahl sein');
            return;
        }
        if (hours > 24) {
            toast.error('Mehr als 24 Stunden pro Tag sind nicht möglich');
            return;
        }

        const payload: CreateWorkHourRequest = {
            Datum: values.Datum,
            Tätigkeit: values.Tätigkeit,
            Stunden: hours
        };

        try {
            await onSave(payload);
            // close only if onSave succeeds
            onClose();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Fehler beim Speichern';
            toast.error(msg);
        }
    };

    const handleDelete = async () => {
        if (!initialData) return;
        setIsDeleting(true);
        try {
            const response = await BackendService.deleteArbeitsstunden(initialData.id);
            if (response?.success) {
                toast.success('Eintrag erfolgreich gelöscht');
                onClose();
                queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY(user?.id, selectedYear) });
            } else {
                toast.error(response?.message || 'Fehler beim Löschen');
            }
        } catch (err: any) {
            console.error('Delete error:', err);
            toast.error(err?.response?.data?.message || err?.message || 'Fehler beim Löschen');
        } finally {
            setIsDeleting(false);
            setShowDeleteDialog(false);
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
                <DialogPanel className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white rounded-lg shadow-xl">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <DialogTitle className="text-lg font-medium text-gray-900">
                            {initialData ? 'Arbeitsstunden bearbeiten' : 'Neue Arbeitsstunden hinzufügen'}
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
                            <p className="text-sm text-gray-600">Bitte beachten Sie die Zeiträume für die Eingabe von Arbeitsstunden.</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
                                <input
                                    type="text"
                                    {...register('Nachname', { required: 'Nachname ist erforderlich' })}
                                    readOnly
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                {errors.Nachname && <p className="text-xs text-red-600 mt-1">{errors.Nachname.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
                                <input
                                    type="text"
                                    {...register('Vorname', { required: 'Vorname ist erforderlich' })}
                                    readOnly
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                {errors.Vorname && <p className="text-xs text-red-600 mt-1">{errors.Vorname.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                                <input
                                    type="date"
                                    {...register('Datum', { required: 'Datum ist erforderlich' })}
                                    min={minDate}
                                    max={today}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    lang="de"
                                    aria-invalid={!!errors.Datum}
                                />
                                {errors.Datum && <p className="text-xs text-red-600 mt-1">{errors.Datum.message}</p>}
                                <p className="text-xs text-gray-500 mt-1">Datum darf nicht in der Zukunft liegen. {currentMonth === 0 ? `Nur ${currentYear} oder ${currentYear - 1} (Nachfrist bis Ende Januar) erlaubt.` : `Nur ${currentYear} erlaubt.`}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Stunden</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min={0.5}
                                    max={24}
                                    {...register('Stunden', {
                                        required: 'Stunden sind erforderlich',
                                        pattern: { value: /^\d+(?:[.,]\d+)?$/, message: 'Ungültiges Stundenformat' }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder="z.B. 2.5"
                                />
                                {errors.Stunden && <p className="text-xs text-red-600 mt-1">{errors.Stunden.message}</p>}
                                <p className="text-xs text-gray-500 mt-1">Zwischen 0.5 und 24 Stunden</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tätigkeit</label>
                                <input
                                    type="text"
                                    {...register('Tätigkeit', { required: 'Tätigkeit ist erforderlich', maxLength: { value: 40, message: 'Maximal 40 Zeichen' } })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    placeholder="z.B. Platzpflege, Vereinsfeier..."
                                />
                                <div className="text-xs text-gray-500 mt-1">{/* length shown by API consumer if needed */}</div>
                                {errors.Tätigkeit && <p className="text-xs text-red-600 mt-1">{errors.Tätigkeit.message}</p>}
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 mt-6 w-full items-center">
                            {initialData && (
                                <div className="mr-auto w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteDialog(true)}
                                        className={`px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 hover:bg-red-50 transition-colors ${isDeleting ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        disabled={isDeleting || isSubmitting}
                                    >
                                        Löschen
                                    </button>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                disabled={isSubmitting || isDeleting}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className={`px-4 py-2 border border-transparent rounded-md text-sm font-medium transition-colors ${isSubmitting ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                disabled={isSubmitting || isDeleting}
                                style={isSubmitting ? { pointerEvents: 'none' } : {}}
                            >
                                {isSubmitting ? 'Speichern...' : (initialData ? 'Aktualisieren' : 'Erstellen')}
                            </button>
                        </div>
                    </form>
                </DialogPanel>
            </div>
            <DeleteConfirmDialog
                isOpen={showDeleteDialog}
                isProcessing={isDeleting}
                onCancel={() => setShowDeleteDialog(false)}
                onConfirm={handleDelete}
            />
        </Dialog>
    );
};

export default ArbeitsstundenFormModal;
