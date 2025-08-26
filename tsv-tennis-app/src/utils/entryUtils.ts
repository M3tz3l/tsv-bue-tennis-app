import type { WorkHourEntry } from '../types';

export function hasDuplicateEntry(
    existingEntries: WorkHourEntry[] = [],
    formData: { Datum?: string; [key: string]: unknown },
    editingId?: string | number
) {
    if (!existingEntries || existingEntries.length === 0) return false;
    const newDate = formData.Datum;
    if (!newDate) return false;

    return existingEntries.some((e: WorkHourEntry) => {
        if (!e || !e.Datum) return false;
        if (editingId && (e.id === editingId || String(e.id) === String(editingId))) return false;

        // Otherwise fall back to date-only match
        return e.Datum === newDate;
    });
}
