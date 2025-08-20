import { useQuery } from '@tanstack/react-query';
import { getTopics } from '@/services/firestoreService'; // Import the correct topics fetching service
// Using direct type import from types package
import { Topic } from '@pediaquiz/types';

/**
 * Custom hook to fetch and cache all topics from both General and Marrow sources.
 * This hook uses TanStack Query for efficient data management.
 */
export function useTopics() {
  return useQuery<Topic[], Error>({
    queryKey: ['allTopics'], // Unique query key for all topics
    queryFn: getTopics, // The function to fetch topics (should combine both sources)
    staleTime: 1000 * 60 * 60, // Data considered stale after 1 hour (topics don't change frequently)
    gcTime: 1000 * 60 * 60 * 24, // Data garbage collected after 24 hours
    refetchOnWindowFocus: false, // Prevents automatic refetching on window focus, rely on manual invalidation
  });
}