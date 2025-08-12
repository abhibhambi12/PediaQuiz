// FILE: workspaces/frontend/src/hooks/useTopics.ts

import { useQuery } from '@tanstack/react-query';
import { getTopicsAndChapters } from '@/services/firestoreService';
import type { Topic } from '@pediaquiz/types';

export const useTopics = () => {
  return useQuery<Topic[], Error>({
    queryKey: ['topics'],
    queryFn: getTopicsAndChapters,
    staleTime: 1000 * 60 * 60, // 1 hour, as this data changes infrequently
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};