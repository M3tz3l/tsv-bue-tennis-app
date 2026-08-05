import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import BackendService, { getApiErrorMessage } from '../services/backendService.ts';
import type { CreateWorkHourRequest, DashboardResponse, WorkHourEntry } from '../types';
import { getMemberEntries, hasDuplicateEntry } from '../utils/utils';
import { DASHBOARD_QUERY_KEY } from './useDashboard';

type SaveInput = Partial<CreateWorkHourRequest> & { [key: string]: unknown };

type UseWorkHourSaveOptions = {
    userId?: string;
    email?: string;
    year: number;
    dashboardData?: DashboardResponse;
    editingRow?: WorkHourEntry | null;
    onSuccess?: () => void;
};

export function useWorkHourSave({ userId, email, year, dashboardData, editingRow, onSuccess }: UseWorkHourSaveOptions) {
    const queryClient = useQueryClient();
    const editing = editingRow ?? null;

    const userProfile = (() => {
        if (dashboardData?.personal?.name) {
            const parts = dashboardData.personal.name.split(' ');
            return { Nachname: parts.slice(1).join(' '), Vorname: parts[0] };
        }
        const found = dashboardData?.family?.members?.find((m: { email?: string; name?: string }) => m.email === email);
        if (found && found.name) {
            const parts = found.name.split(' ');
            return { Nachname: parts.slice(1).join(' '), Vorname: parts[0] };
        }
        return { Nachname: '', Vorname: '' };
    })();

    const handleSave = async (formData: SaveInput) => {
        try {
            const myEntries = getMemberEntries(dashboardData, userId);

            if (editing) {
                if (editing.Datum !== formData.Datum && hasDuplicateEntry(myEntries, formData, editing.id)) {
                    toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                    return;
                }
            } else if (hasDuplicateEntry(myEntries, formData)) {
                toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                return;
            }

            const payload: CreateWorkHourRequest = {
                Datum: formData.Datum || '',
                Tätigkeit: String(formData.Tätigkeit ?? ''),
                Stunden: Number(formData.Stunden) || 0,
            };

            const response = editing
                ? await BackendService.updateArbeitsstunden(String(editing.id), payload)
                : await BackendService.createArbeitsstunden(payload);

            if (response && response.success) {
                toast.success(editing ? 'Eintrag erfolgreich aktualisiert' : 'Eintrag erfolgreich erstellt');
                void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY(userId, year) });
                onSuccess?.();
            } else {
                toast.error(response.message || (editing ? 'Fehler beim Aktualisieren' : 'Fehler beim Erstellen'));
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

    return { handleSave, userProfile };
}
