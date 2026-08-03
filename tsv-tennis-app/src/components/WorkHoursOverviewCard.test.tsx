import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardResponse } from '../types';

const dashboard = (overrides: Partial<DashboardResponse>): DashboardResponse => ({
    success: true,
    family: null,
    personal: null,
    year: 2026,
    ...overrides,
});

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'member-1', name: 'Anna Mitglied' } }),
}));

import WorkHoursOverviewCard from './WorkHoursOverviewCard';

const renderCard = (data: DashboardResponse) => render(
    <MemoryRouter>
        <WorkHoursOverviewCard data={data} selectedYear={2026} />
    </MemoryRouter>,
);

describe('WorkHoursOverviewCard', () => {
    it('shows family progress, member values, accessible progress, and the detail link', () => {
        renderCard(dashboard({
            family: {
                name: 'Familie Mitglied',
                members: [
                    { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
                    { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
                ],
                required: 16,
                completed: 10.5,
                remaining: 5.5,
                percentage: 65.625,
                memberContributions: [
                    { id: 'member-2', name: 'Bernd Mitglied', hours: 4, required: 8, entries: [], exemption_reason: null },
                    { id: 'member-1', name: 'Anna Mitglied', hours: 6.5, required: 8, entries: [], exemption_reason: null },
                ],
            },
        }));

        expect(screen.getByRole('heading', { name: 'Familie - 2026' })).toBeInTheDocument();
        expect(screen.getByText('10.5 Std von 16 Std')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Familien-Fortschritt: 66% abgeschlossen' })).toHaveAttribute('aria-valuenow', '65.625');
        expect(screen.getByText('Anna Mitglied (Sie)')).toBeInTheDocument();
        expect(screen.getByText('6.5 / 8 Std')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Details anzeigen' })).toHaveAttribute('href', '/dashboard/arbeitsstunden');
    });

    it('shows the personal exemption state without rendering a progress bar', () => {
        renderCard(dashboard({
            personal: {
                name: 'Anna Mitglied',
                hours: 2,
                required: 0,
                entries: [],
                exemption_reason: 'Vorstand',
            },
        }));

        expect(screen.getByRole('heading', { name: 'Anna Mitglied - 2026' })).toBeInTheDocument();
        expect(screen.getByText('Befreit von Arbeitsstunden')).toBeInTheDocument();
        expect(screen.getByText('Grund: Vorstand')).toBeInTheDocument();
        expect(screen.getByText('2 Std geleistet')).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
