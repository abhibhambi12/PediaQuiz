import { useQuery } from '@tanstack/react-query';
import { getTopics } from '@/services/firestoreService';
import type { Topic } from '@pediaquiz/types';

/**
 * Correctly fetches and caches all topics from both General and Marrow sources.
 */
export function useTopics() {
  return useQuery<Topic[], Error>({
    queryKey: ['allTopics'], // Use a distinct query key
    queryFn: getTopics, // This now fetches from both collections
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
  });
}