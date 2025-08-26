import type { WorkHourEntry } from '../types';

export function hasDuplicateEntry(existingEntries: WorkHourEntry[] = [], formData: { Datum?: string; Nachname?: string; Vorname?: string }, editingId?: string | number) {
    if (!existingEntries || existingEntries.length === 0) return false;
    const newDate = formData.Datum;
    if (!newDate) return false;

    return existingEntries.some(e => {
        if (!e || !e.Datum) return false;
        if (editingId && (e.id === editingId || String(e.id) === String(editingId))) return false;

        // If names are present on both sides, require a full match (date + name)
        if (e.Nachname && e.Vorname && formData.Nachname && formData.Vorname) {
            return e.Datum === newDate && e.Nachname === formData.Nachname && e.Vorname === formData.Vorname;
        }

        // Otherwise fall back to date-only match
        return e.Datum === newDate;
    });
}
