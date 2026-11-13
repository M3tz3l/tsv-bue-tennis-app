import { useMemo } from 'react';
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

    // Resolve to a string so the memo keeps a stable profile object across
    // unrelated re-renders; an unstable object would reset the open form.
    const resolvedName =
        dashboardData?.personal?.name ||
        dashboardData?.family?.members?.find(
            (member: { email?: string; name?: string }) => member.email === email,
        )?.name;
    const userProfile = useMemo(() => {
        if (!resolvedName) return { Nachname: '', Vorname: '' };
        const parts = resolvedName.split(' ');
        return { Nachname: parts.slice(1).join(' '), Vorname: parts[0] };
    }, [resolvedName]);

    const handleSave = async (formData: SaveInput): Promise<boolean> => {
        try {
            const myEntries = getMemberEntries(dashboardData, userId);

            if (editing) {
                if (editing.Datum !== formData.Datum && hasDuplicateEntry(myEntries, formData, editing.id)) {
                    toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                    return false;
                }
            } else if (hasDuplicateEntry(myEntries, formData)) {
                toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
                return false;
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
                return true;
            }
            toast.error(response.message || (editing ? 'Fehler beim Aktualisieren' : 'Fehler beim Erstellen'));
            return false;
        } catch (error: unknown) {
            const msg = getApiErrorMessage(error, 'Ein Fehler ist aufgetreten');
            if (typeof msg === 'string' && /duplicate|bereits (vorhanden|ein Eintrag)/i.test(msg)) {
                toast.error('Für dieses Datum existiert bereits ein Eintrag. Pro Person und Tag ist nur ein Eintrag erlaubt.');
            } else {
                toast.error(msg);
            }
            return false;
        }
    };

    return { handleSave, userProfile };
}
