import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import BackendService, { type ApiError, type ApiResult } from '../services/backendService';
import type { CreateEventRequest, EventSignup, EventSummary, SignupRequest, UpdateEventRequest } from '@/types';

export const EVENTS_QUERY_KEY = (userId?: string) => ['events', userId ?? 'anon'];
export const EVENT_DETAIL_QUERY_KEY = (userId?: string, eventId?: number) => ['event', userId ?? 'anon', eventId];
export const EVENT_SIGNUPS_QUERY_KEY = (userId?: string, eventId?: number) => ['event-signups', userId ?? 'anon', eventId];

function throwOnFailure<T>(result: T | ApiError): T {
  if (typeof result === 'object' && result !== null && 'success' in result && result.success === false) {
    throw new Error(result.message);
  }
  return result as T;
}

function useEventInvalidation(userId?: string, eventId?: number) {
  const queryClient = useQueryClient();
  return async (affectedEventId = eventId) => {
    await queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY(userId) });
    if (affectedEventId !== undefined) {
      await queryClient.invalidateQueries({ queryKey: EVENT_DETAIL_QUERY_KEY(userId, affectedEventId) });
      await queryClient.invalidateQueries({ queryKey: EVENT_SIGNUPS_QUERY_KEY(userId, affectedEventId) });
    }
  };
}

export function useEvents(userId?: string) {
  return useQuery({ queryKey: EVENTS_QUERY_KEY(userId), queryFn: async () => throwOnFailure(await BackendService.getEvents()), enabled: !!userId });
}

export function useEvent(userId?: string, eventId?: number) {
  return useQuery({ queryKey: EVENT_DETAIL_QUERY_KEY(userId, eventId), queryFn: async () => throwOnFailure(await BackendService.getEvent(eventId!)), enabled: !!userId && eventId !== undefined });
}

export function useEventSignups(userId?: string, eventId?: number) {
  return useQuery({ queryKey: EVENT_SIGNUPS_QUERY_KEY(userId, eventId), queryFn: async () => throwOnFailure(await BackendService.getEventSignups(eventId!)), enabled: !!userId && eventId !== undefined });
}

export function useCreateEvent(userId?: string) {
  const onSuccess = useEventInvalidation(userId);
  return useMutation({
    mutationFn: (payload: CreateEventRequest) => BackendService.createEvent(payload).then(throwOnFailure),
    onSuccess: () => onSuccess(),
  });
}

export function useUpdateEvent(userId?: string) {
  const onSuccess = useEventInvalidation(userId);
  return useMutation<EventSummary, Error, { id: number; payload: UpdateEventRequest }>({ mutationFn: ({ id, payload }) => BackendService.updateEvent(id, payload).then(throwOnFailure), onSuccess: (_data, variables) => onSuccess(variables.id) });
}

export function useDeleteEvent(userId?: string) {
  const onSuccess = useEventInvalidation(userId);
  return useMutation<ApiResult, Error, number>({ mutationFn: (id) => BackendService.deleteEvent(id).then(throwOnFailure), onSuccess: (_data, id) => onSuccess(id) });
}

function useSignupMutation(userId: string | undefined, action: (id: number, payload: SignupRequest) => Promise<EventSignup | ApiError>) {
  const queryClient = useQueryClient();
  return useMutation<EventSignup, Error, { id: number; payload: SignupRequest }>({ mutationFn: ({ id, payload }) => action(id, payload).then(throwOnFailure), onSuccess: async (_data, { id }) => {
    await queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY(userId) });
    await queryClient.invalidateQueries({ queryKey: EVENT_DETAIL_QUERY_KEY(userId, id) });
    await queryClient.invalidateQueries({ queryKey: EVENT_SIGNUPS_QUERY_KEY(userId, id) });
  } });
}

export function useCreateEventSignup(userId?: string) { return useSignupMutation(userId, BackendService.createEventSignup.bind(BackendService)); }
export function useUpdateEventSignup(userId?: string) { return useSignupMutation(userId, BackendService.updateEventSignup.bind(BackendService)); }
export function useDeleteEventSignup(userId?: string) {
  const onSuccess = useEventInvalidation(userId);
  return useMutation<ApiResult, Error, number>({ mutationFn: (id) => BackendService.deleteEventSignup(id).then(throwOnFailure), onSuccess: (_data, id) => onSuccess(id) });
}
