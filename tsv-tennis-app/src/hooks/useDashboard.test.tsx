import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

vi.mock('../services/backendService', () => ({
  default: {
    getDashboard: vi.fn(),
  },
}));

import BackendService from '../services/backendService';
import useDashboard, { DASHBOARD_QUERY_KEY } from './useDashboard';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads dashboard data for the given user and year', async () => {
    const dashboard = {
      success: true,
      family: null,
      personal: null,
      year: 2026,
    };
    vi.mocked(BackendService.getDashboard).mockResolvedValue(dashboard);

    const { result } = renderHook(() => useDashboard('user-1', 2026), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(BackendService.getDashboard).toHaveBeenCalledWith(2026);
    expect(result.current.data).toEqual(dashboard);
  });

  it('reports an error when the dashboard request fails', async () => {
    vi.mocked(BackendService.getDashboard).mockResolvedValue({
      success: false,
      message: 'Dashboard-Daten konnten nicht geladen werden',
    });

    const { result } = renderHook(() => useDashboard('user-1', 2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('does not fetch while disabled (e.g. no user id)', async () => {
    const { result } = renderHook(() => useDashboard(undefined, 2026), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    expect(BackendService.getDashboard).not.toHaveBeenCalled();
  });

  it('builds a stable query key from user id and year', () => {
    expect(DASHBOARD_QUERY_KEY('user-1', 2026)).toEqual(['dashboard', 'user-1', 2026]);
    expect(DASHBOARD_QUERY_KEY(undefined, 2026)).toEqual(['dashboard', 'anon', 2026]);
  });
});
