import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'react-toastify';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDashboard: vi.fn(),
  useEvents: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useDashboard', () => ({ default: mocks.useDashboard, DASHBOARD_QUERY_KEY: (userId?: string, year?: number) => ['dashboard', userId, year] }));
vi.mock('../hooks/useEvents', () => ({ useEvents: mocks.useEvents }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.useNavigate };
});

import DashboardOverview from './DashboardOverview';
import BackendService from '../services/backendService';

const dashboard = {
  success: true,
  year: 2026,
  family: null,
  personal: { name: 'Anna Mitglied', hours: 2, required: 8, entries: [], exemption_reason: null },
};

const renderOverview = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><DashboardOverview /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('DashboardOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: 'member-1', name: 'Anna Mitglied', email: '', role: 'member' } });
    mocks.useDashboard.mockReturnValue({ data: dashboard, isLoading: false, error: null });
    mocks.useEvents.mockReturnValue({ data: [], isLoading: false, error: null });
  });

  it('renders the overview title, work hours, and events area', () => {
    renderOverview();

    expect(screen.getByRole('heading', { name: 'Meine Übersicht' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Mitglied - 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nächste Veranstaltungen' })).toBeInTheDocument();
  });

  it('shows Rundmail for Orga but not for regular members', () => {
    renderOverview();
    expect(screen.queryByRole('button', { name: 'Rundmail' })).not.toBeInTheDocument();
  });

  it('shows Rundmail for Orga members', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'orga-1', name: 'Orga', email: 'orga@example.com', role: 'Orga' } });
    renderOverview();
    expect(screen.getByRole('button', { name: 'Rundmail' })).toBeInTheDocument();
  });

  it('toasts the dashboard error instead of rendering it inline', () => {
    const toastSpy = vi.spyOn(toast, 'error').mockImplementation(() => '');
    const dashboardError = new Error('Teable ist vorübergehend nicht erreichbar');
    mocks.useDashboard.mockReturnValue({ data: undefined, isLoading: false, error: dashboardError });

    renderOverview();

    expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('Teable ist vorübergehend nicht erreichbar'));
    expect(screen.queryByText(/Arbeitsstunden konnten nicht geladen werden/i)).not.toBeInTheDocument();
    toastSpy.mockRestore();
  });

  it('opens the add work-hours modal from the overview card', async () => {
    const user = userEvent.setup();
    renderOverview();

    const addButton = screen.getByRole('button', { name: /Arbeitsstunden eintragen/ });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('navigates to the work-hours page after a successful add', async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(BackendService, 'createArbeitsstunden').mockResolvedValue({ success: true });
    renderOverview();

    await user.click(screen.getByRole('button', { name: /Arbeitsstunden eintragen/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(dialog.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-08-04' } });
    await user.type(screen.getByPlaceholderText(/Platzpflege/), 'Platzpflege');
    await user.type(screen.getByPlaceholderText(/2\.75/), '2');
    await user.click(screen.getByRole('button', { name: /Erstellen/ }));

    expect(createSpy).toHaveBeenCalled();
    expect(mocks.useNavigate).toHaveBeenCalledWith('/dashboard/arbeitsstunden');
  });
});
