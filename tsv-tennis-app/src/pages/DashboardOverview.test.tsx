import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDashboard: vi.fn(),
  useEvents: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useDashboard', () => ({ default: mocks.useDashboard }));
vi.mock('../hooks/useEvents', () => ({ useEvents: mocks.useEvents, useEvent: vi.fn(() => ({ data: { own_signup: null } })) }));

import DashboardOverview from './DashboardOverview';

const dashboard = {
  success: true,
  year: 2026,
  family: null,
  personal: { name: 'Mitglied', hours: 2, required: 8, entries: [], exemption_reason: null },
};

describe('DashboardOverview', () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', name: '', email: '', role: 'member' } });
    mocks.useDashboard.mockReturnValue({ data: dashboard, isLoading: false, error: null });
    mocks.useEvents.mockReturnValue({ data: [], isLoading: false, error: null });
  });

  it('renders the overview title, greeting fallback, work hours, and events area', () => {
    render(<MemoryRouter><DashboardOverview /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Meine Übersicht' })).toBeInTheDocument();
    expect(screen.getByText('Willkommen, Benutzer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mitglied - 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Als Nächstes' })).toBeInTheDocument();
  });

  it('shows Rundmail for Orga but not for regular members', () => {
    const { rerender } = render(<MemoryRouter><DashboardOverview /></MemoryRouter>);
    expect(screen.queryAllByRole('button', { name: 'Rundmail' })).toHaveLength(0);

    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: 'Orga' } });
    rerender(<MemoryRouter><DashboardOverview /></MemoryRouter>);
    expect(screen.getAllByRole('button', { name: 'Rundmail' })).toHaveLength(2);
  });

  it('keeps the dashboard error message in the primary work-hours area', () => {
    const dashboardError = new Error('Teable ist vorübergehend nicht erreichbar');
    mocks.useDashboard.mockReturnValue({ data: undefined, isLoading: false, error: dashboardError });

    render(<MemoryRouter><DashboardOverview /></MemoryRouter>);

    expect(screen.getByText(/Arbeitsstunden konnten nicht geladen werden: Teable ist vorübergehend nicht erreichbar/i)).toBeInTheDocument();
  });
});
