import { useQuery } from '@tanstack/react-query';
import { getTopics } from '@/services/firestoreService';
import type { Topic } from '@pediaquiz/types';

export function useTopics() {
  return useQuery<Topic[], Error>({
    queryKey: ['topics'],
    queryFn: getTopics,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}