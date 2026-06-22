import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function usePunchStatus() {
  return useQuery({
    queryKey: ['punchStatus'],
    queryFn: async () => {
      const res = await api.get('/attendance/status');
      return res as any;
    },
    refetchInterval: 30000, // 30s auto-refresh
  });
}
