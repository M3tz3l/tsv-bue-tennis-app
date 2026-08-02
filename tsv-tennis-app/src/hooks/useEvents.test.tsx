import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

vi.mock('../services/backendService', () => ({
  default: {
    getEvents: vi.fn(),
    getEvent: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    createEventSignup: vi.fn(),
    updateEventSignup: vi.fn(),
    deleteEventSignup: vi.fn(),
    getEventSignups: vi.fn(),
  },
}));

import BackendService from '../services/backendService';
import {
  EVENTS_QUERY_KEY,
  EVENT_DETAIL_QUERY_KEY,
  useEvents,
  useEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useCreateEventSignup,
  useUpdateEventSignup,
  useDeleteEventSignup,
  useEventSignups,
} from './useEvents';

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('event query hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds user- and event-scoped stable keys', () => {
    expect(EVENTS_QUERY_KEY('member-1')).toEqual(['events', 'member-1']);
    expect(EVENT_DETAIL_QUERY_KEY('member-1', 42)).toEqual(['event', 'member-1', 42]);
  });

  it('loads events and event details only for authenticated users', async () => {
    const events = [{ id: 42 }];
    const detail = { event: { id: 42 }, own_signup: null };
    vi.mocked(BackendService.getEvents).mockResolvedValue(events as never);
    vi.mocked(BackendService.getEvent).mockResolvedValue(detail as never);
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const list = renderHook(() => useEvents('member-1'), { wrapper });
    const detailHook = renderHook(() => useEvent('member-1', 42), { wrapper });
    const disabled = renderHook(() => useEvents(undefined), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailHook.result.current.isSuccess).toBe(true));
    expect(BackendService.getEvents).toHaveBeenCalledOnce();
    expect(BackendService.getEvent).toHaveBeenCalledWith(42);
    expect(BackendService.getEvents).not.toHaveBeenCalledTimes(2);
    expect(disabled.result.current.fetchStatus).toBe('idle');
  });

  it('loads signups only for authenticated users', async () => {
    vi.mocked(BackendService.getEventSignups).mockResolvedValue({ signups: [] } as never);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useEventSignups('member-1', 42), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(BackendService.getEventSignups).toHaveBeenCalledWith(42);
  });

  it('invalidates list, detail, and signup queries after event and signup mutations', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = createWrapper(queryClient);
    vi.mocked(BackendService.createEvent).mockResolvedValue({ success: true } as never);
    vi.mocked(BackendService.updateEvent).mockResolvedValue({ success: true } as never);
    vi.mocked(BackendService.deleteEvent).mockResolvedValue({ success: true } as never);
    vi.mocked(BackendService.createEventSignup).mockResolvedValue({ success: true } as never);
    vi.mocked(BackendService.updateEventSignup).mockResolvedValue({ success: true } as never);
    vi.mocked(BackendService.deleteEventSignup).mockResolvedValue({ success: true } as never);

    const create = renderHook(() => useCreateEvent('member-1'), { wrapper });
    const update = renderHook(() => useUpdateEvent('member-1'), { wrapper });
    const remove = renderHook(() => useDeleteEvent('member-1'), { wrapper });
    const createSignup = renderHook(() => useCreateEventSignup('member-1'), { wrapper });
    const updateSignup = renderHook(() => useUpdateEventSignup('member-1'), { wrapper });
    const removeSignup = renderHook(() => useDeleteEventSignup('member-1'), { wrapper });

    await act(async () => {
      await create.result.current.mutateAsync({} as never);
      await update.result.current.mutateAsync({ id: 42, payload: {} } as never);
      await remove.result.current.mutateAsync(42);
      await createSignup.result.current.mutateAsync({ id: 42, payload: {} } as never);
      await updateSignup.result.current.mutateAsync({ id: 42, payload: {} } as never);
      await removeSignup.result.current.mutateAsync(42);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: EVENTS_QUERY_KEY('member-1') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: EVENT_DETAIL_QUERY_KEY('member-1', 42) });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['event-signups', 'member-1', 42] });
  });
});
