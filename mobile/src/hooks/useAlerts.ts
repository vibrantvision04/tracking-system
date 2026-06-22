import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Alert } from '../types';

export function useAlerts() {
  return useQuery({
    queryKey: ['myAlerts'],
    queryFn: async () => {
      const res = await api.get('/alerts/my');
      return res as unknown as { alerts: Alert[] };
    },
    refetchInterval: 60000, // Poll every 60s
  });
}
