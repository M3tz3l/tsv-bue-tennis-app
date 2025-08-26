import { useQuery } from '@tanstack/react-query';
import BackendService from '../services/backendService';

export const DASHBOARD_QUERY_KEY = (userId?: string, year?: number) => ['dashboard', userId ?? 'anon', year ?? new Date().getFullYear()];

export default function useDashboard(userId?: string, year?: number, enabled = true) {
    return useQuery({
        queryKey: DASHBOARD_QUERY_KEY(userId, year),
        queryFn: async () => {
            const y = year ?? new Date().getFullYear();
            const res = await BackendService.getDashboard(y);
            if (!res || !res.success) {
                // Avoid accessing properties that may not exist on the error shape
                throw new Error('Failed to load dashboard');
            }
            return res;
        },
        enabled: enabled && !!userId,
        retry: 1,
        staleTime: 1000 * 60, // 1 minute
    });
}
