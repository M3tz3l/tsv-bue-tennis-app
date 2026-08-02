// Shared utility functions for the frontend
import type { DashboardResponse, MemberContribution, WorkHourEntry } from '../types';

export const getCurrentYear = (): number => new Date().getFullYear();

export const getMemberEntries = (
    dashboard: DashboardResponse | undefined,
    userId: string | undefined,
): WorkHourEntry[] => {
    const familyEntries = (dashboard?.family?.memberContributions ?? [])
        .filter((member: MemberContribution) => member.id === userId)
        .flatMap((member: MemberContribution) => member.entries ?? []);
    return [...(dashboard?.personal?.entries ?? []), ...familyEntries];
};

export const sortEntriesByDate = (entries: WorkHourEntry[]): WorkHourEntry[] =>
    [...entries].sort((a, b) => {
        if (!a.Datum && !b.Datum) return 0;
        if (!a.Datum) return 1;
        if (!b.Datum) return -1;
        return b.Datum.localeCompare(a.Datum);
    });

export const getProgressPercentage = (completed: number, required: number): number =>
    required > 0 ? Math.min(100, (completed / required) * 100) : 100;

export const getProgressColor = (percentage: number): string =>
    percentage >= 100 ? 'bg-green-500' : percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500';

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
    return String(rounded).replace(/\.?0+$/, '');
};

// Check if a number represents a valid quarter-hour increment (0.25 steps)
export const isQuarterHour = (hours: number): boolean => {
    if (!Number.isFinite(hours)) return false;
    // Allow small floating point errors
    return Math.abs(hours * 4 - Math.round(hours * 4)) < 1e-9;
};

// Helper to parse user input that may contain comma as decimal separator
export const parseHoursInput = (input: string): number => {
    return parseFloat(String(input).replace(',', '.'));
};
