import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../services/backendService.ts', () => ({
  default: { createArbeitsstunden: mocks.create, updateArbeitsstunden: mocks.update },
  getApiErrorMessage: () => 'error',
}));
vi.mock('react-toastify', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { useWorkHourSave } from './useWorkHourSave';
import type { DashboardResponse } from '../types';

const dashboard: DashboardResponse = {
  success: true,
  year: 2026,
  family: null,
  personal: { name: 'Anna Mitglied', hours: 0, required: 0, entries: [], exemption_reason: null },
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useWorkHourSave', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true after a successful save', async () => {
    mocks.create.mockResolvedValue({ success: true });
    const { result } = renderHook(
      () => useWorkHourSave({ userId: 'u1', year: 2026 }),
      { wrapper },
    );

    let saved = false;
    await act(async () => {
      saved = await result.current.handleSave({
        Datum: '2026-01-01',
        Tätigkeit: 'Platzpflege',
        Stunden: 2,
      });
    });
    expect(saved).toBe(true);
  });

  it('returns false when the API rejects the save', async () => {
    mocks.create.mockResolvedValue({ success: false, message: 'Speichern fehlgeschlagen' });
    const { result } = renderHook(
      () => useWorkHourSave({ userId: 'u1', year: 2026 }),
      { wrapper },
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.handleSave({
        Datum: '2026-01-01',
        Tätigkeit: 'Platzpflege',
        Stunden: 2,
      });
    });
    expect(saved).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith('Speichern fehlgeschlagen');
  });

  it('keeps the derived user profile stable across re-renders', () => {
    const { result, rerender } = renderHook(
      () => useWorkHourSave({ userId: 'u1', year: 2026, dashboardData: dashboard }),
      { wrapper },
    );

    const first = result.current.userProfile;
    expect(first).toEqual({ Nachname: 'Mitglied', Vorname: 'Anna' });
    rerender();
    expect(result.current.userProfile).toBe(first);
  });
});
