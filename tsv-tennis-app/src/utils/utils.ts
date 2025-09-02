// Shared utility functions for the frontend
import type { WorkHourEntry } from '../types';

export function hasDuplicateEntry(
    existingEntries: WorkHourEntry[] = [],
    formData: { Datum?: string;[key: string]: unknown },
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

// Format hours: round to max 2 decimals, drop trailing zeros (e.g., 2 -> "2", 2.5 -> "2.5", 2.75 -> "2.75")
export const formatHours = (value: unknown): string => {
    const num = Number(value);
    if (!isFinite(num) || isNaN(num)) return '0';
    const rounded = Math.round(num * 100) / 100;
    if (Number.isInteger(rounded)) return String(rounded);
    return String(rounded).replace(/(\.\d*?)0+$/, '$1');
};
