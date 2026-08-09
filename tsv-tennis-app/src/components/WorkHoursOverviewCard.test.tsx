import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    it('uses the shared card shell for the section surface', () => {
        const { container } = renderCard(dashboard({
            family: {
                name: 'Familie Mitglied',
                members: [
                    { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
                    { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
                ],
                required: 8, completed: 4, remaining: 4, percentage: 50,
                memberContributions: [],
            },
        }));

        expect(container.querySelector('section')).toHaveClass('card-shell');
        expect(container.querySelector('.stack-md')).not.toBeInTheDocument();
    });

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

        expect(screen.getByRole('heading', { name: 'Arbeitsstunden 2026' })).toBeInTheDocument();
        expect(screen.getByText('10.5 Std von 16 Std')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Familien-Fortschritt: 66% abgeschlossen' })).toHaveAttribute('aria-valuenow', '65.625');
    expect(screen.getByText('Anna Mitglied (Sie)')).toBeInTheDocument();
        expect(screen.getByText('6.5 / 8 Std')).toBeInTheDocument();
  });

  it('links the overview heading to the work-hours page', () => {
    renderCard(dashboard({
      family: {
        name: 'Familie Mitglied',
        members: [
          { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
          { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
        ],
        required: 8, completed: 4, remaining: 4, percentage: 50,
        memberContributions: [],
      },
    }));

    const headingLink = screen.getByRole('heading', { name: 'Arbeitsstunden 2026' }).closest('a');
    expect(headingLink).toHaveAttribute('href', '/dashboard/arbeitsstunden');
  });

    it('hides the heading in the detail variant', () => {
        render(
            <MemoryRouter>
                <WorkHoursOverviewCard data={dashboard({ family: {
                    name: 'Familie Mitglied',
                    members: [
                        { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
                        { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
                    ],
                    required: 8, completed: 4, remaining: 4, percentage: 50,
                    memberContributions: [],
                } })} selectedYear={2026} variant="detail" />
            </MemoryRouter>,
        );

        expect(screen.queryByRole('heading', { name: /Arbeitsstunden 2026/ })).not.toBeInTheDocument();
    });

    it('renders a red add button in the overview variant that opens the add modal', async () => {
        const user = userEvent.setup();
        const onAdd = vi.fn();
        render(
            <MemoryRouter>
                <WorkHoursOverviewCard
                    data={dashboard({ family: {
                        name: 'Familie Mitglied',
                        members: [
                            { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
                            { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
                        ],
                        required: 8, completed: 4, remaining: 4, percentage: 50,
                        memberContributions: [],
                    } })}
                    selectedYear={2026}
                    onAdd={onAdd}
                />
            </MemoryRouter>,
        );

        const addButton = screen.getByRole('button', { name: /Arbeitsstunden eintragen/ });
        expect(addButton).toBeInTheDocument();
        await user.click(addButton);
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('hides the add button when no onAdd handler is provided', () => {
        render(
            <MemoryRouter>
                <WorkHoursOverviewCard data={dashboard({ personal: {
                    name: 'Anna Mitglied', hours: 4, required: 8, entries: [], exemption_reason: null,
                } })} selectedYear={2026} />
            </MemoryRouter>,
        );

        expect(screen.queryByRole('button', { name: /Arbeitsstunden eintragen/ })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Anna Mitglied - 2026' })).toBeInTheDocument();
    });

    it('emphasizes the current family member over other members', () => {
        renderCard(dashboard({
            family: {
                name: 'Familie Mitglied',
                members: [
                    { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
                    { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
                ],
                required: 8, completed: 4, remaining: 4, percentage: 50,
                memberContributions: [
                    { id: 'member-1', name: 'Anna Mitglied', hours: 4, required: 8, entries: [], exemption_reason: null },
                    { id: 'member-2', name: 'Bernd Mitglied', hours: 4, required: 8, entries: [], exemption_reason: null },
                ],
            },
        }));

        expect(screen.getByText('Anna Mitglied (Sie)')).toHaveClass('text-[var(--ink)]');
        expect(screen.getByText('Bernd Mitglied')).toHaveClass('text-[var(--body)]');
    });

    it('identifies the current family member by ID and uses one exemption color', () => {
        renderCard(dashboard({
            family: {
                name: 'Familie Mitglied',
                members: [
                    { id: 'member-1', name: 'Alter Name', email: 'anna@example.com' },
                    { id: 'member-2', name: 'Anna Mitglied', email: 'other@example.com' },
                ],
                required: 8, completed: 0, remaining: 8, percentage: 0,
                memberContributions: [
                    { id: 'member-1', name: 'Alter Name', hours: 0, required: 0, entries: [], exemption_reason: 'Vorstand' },
                    { id: 'member-2', name: 'Anna Mitglied', hours: 2, required: 8, entries: [], exemption_reason: null },
                ],
            },
        }));

        expect(screen.getByText('Alter Name (Sie)')).toBeInTheDocument();
        const exemptValue = screen.getByText('Befreit');
        expect(exemptValue).toHaveClass('text-[var(--success)]');
        expect(exemptValue).not.toHaveClass('text-[var(--primary)]');
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

    it('shows normal personal progress values and styling', () => {
        renderCard(dashboard({
            personal: {
                name: 'Anna Mitglied',
                hours: 4,
                required: 8,
                entries: [],
                exemption_reason: null,
            },
        }));

        expect(screen.getByText('4 Std von 8 Std')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Ihr Fortschritt: 50% abgeschlossen' })).toHaveAttribute('aria-valuenow', '50');
        expect(screen.getByRole('progressbar').firstElementChild).toHaveClass('bg-[var(--primary)]');
        expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '50%' });
    });

    it('clamps personal progress semantics and styling to the visual range', () => {
        renderCard(dashboard({
            personal: {
                name: 'Anna Mitglied',
                hours: 12,
                required: 8,
                entries: [],
                exemption_reason: null,
            },
        }));

        const progress = screen.getByRole('progressbar', { name: 'Ihr Fortschritt: 100% abgeschlossen' });
        expect(screen.getByText('12 Std von 8 Std')).toBeInTheDocument();
        expect(progress).toHaveAttribute('aria-valuemin', '0');
        expect(progress).toHaveAttribute('aria-valuemax', '100');
        expect(progress).toHaveAttribute('aria-valuenow', '100');
        expect(progress.firstElementChild).toHaveClass('bg-[var(--primary)]');
        expect(progress.firstElementChild).toHaveStyle({ width: '100%' });
    });

    it('clamps family progress semantics to the same visual range', () => {
        renderCard(dashboard({
            family: {
                name: 'Familie Mitglied',
                members: [
                    { id: 'member-1', name: 'Anna Mitglied', email: 'anna@example.com' },
                    { id: 'member-2', name: 'Bernd Mitglied', email: 'bernd@example.com' },
                ],
                required: 8,
                completed: 12,
                remaining: 0,
                percentage: 150,
                memberContributions: [],
            },
        }));

        const progress = screen.getByRole('progressbar', { name: 'Familien-Fortschritt: 100% abgeschlossen' });
        expect(progress).toHaveAttribute('aria-valuenow', '100');
        expect(progress.firstElementChild).toHaveStyle({ width: '100%' });
    });

    it('keeps zero personal progress at the lower semantic and visual bound', () => {
        renderCard(dashboard({
            personal: {
                name: 'Anna Mitglied',
                hours: 0,
                required: 8,
                entries: [],
                exemption_reason: null,
            },
        }));

        const progress = screen.getByRole('progressbar', { name: 'Ihr Fortschritt: 0% abgeschlossen' });
        expect(progress).toHaveAttribute('aria-valuenow', '0');
        expect(progress.firstElementChild).toHaveStyle({ width: '0%' });
    });
});
