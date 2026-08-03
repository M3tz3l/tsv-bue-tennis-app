import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useDashboard: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../hooks/useDashboard', () => ({
  default: mocks.useDashboard,
  DASHBOARD_QUERY_KEY: (userId?: string, year?: number) => ['dashboard', userId, year],
}));
vi.mock('../services/backendService.ts', () => ({
  default: {},
  getApiErrorMessage: () => 'error',
}));

import Dashboard from './Dashboard';

describe('Dashboard navigation', () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({
      user: { id: 'member-1', email: 'member@example.com', role: 'member' },
      token: 'token',
      logout: vi.fn(),
    });
    mocks.useDashboard.mockReturnValue({
      data: { success: true, personal: { entries: [], name: 'Member', hours: 0, required: 8 } },
      isLoading: false,
      error: null,
    });
  });

  it('marks work hours as active on the work-hours route', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard/arbeitsstunden']}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole('link', { name: /arbeitsstunden/i })[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: /veranstaltungen/i })[0]).not.toHaveAttribute('aria-current');
  });

  it('keeps both navigation controls usable on narrow layouts', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard/arbeitsstunden']}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole('link', { name: /arbeitsstunden/i })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /arbeitsstunden/i })[0]).toHaveAttribute('href', '/dashboard/arbeitsstunden');
    expect(screen.getAllByRole('link', { name: /veranstaltungen/i })[0]).toHaveAttribute('href', '/dashboard/veranstaltungen');
  });
});
