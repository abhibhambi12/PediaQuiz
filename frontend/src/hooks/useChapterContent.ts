import { useQuery } from '@tanstack/react-query';
import { getChapterContent as fetchChapterContent } from '@/services/contentService';
import { MCQ, Flashcard } from '@pediaquiz/types';

export function useChapterContent(chapterId: string | undefined) {
  // --- BATCH 2: ADVANCED CACHING STRATEGY ---
  // The options for useQuery have been enhanced to improve performance.
  // This change is part of a wider effort to optimize data fetching across the app.
  return useQuery<{ mcqs: MCQ[]; flashcards: Flashcard[] }, Error>({
    queryKey: ['chapterContent', chapterId],
    queryFn: () => {
      if (!chapterId) {
        // Return an empty structure to maintain type consistency if no ID is provided.
        // This prevents the query from entering an error state unnecessarily.
        return Promise.resolve({ mcqs: [], flashcards: [] });
      }
      return fetchChapterContent({ chapterId }).then(res => res.data);
    },
    // The `enabled` flag ensures the query only runs when a valid chapterId is present.
    enabled: !!chapterId,

    // --- NEW CACHING OPTIONS ---
    // staleTime: The data from this query is considered "fresh" for 5 minutes.
    // React Query will not attempt to refetch it from the network during this period,
    // leading to instantaneous loads when re-visiting a chapter page.
    staleTime: 1000 * 60 * 5, // 5 minutes

    // gcTime (cacheTime): Data will be kept in the cache for 30 minutes after it becomes
    // inactive (i.e., no component is using this query). This helps if the user
    // navigates back to the page within that window.
    gcTime: 1000 * 60 * 30, // 30 minutes

    // refetchOnWindowFocus: Disabled because chapter content is mostly static.
    // This prevents a jarring refetch and potential content shift when a user
    // switches browser tabs and comes back.
    refetchOnWindowFocus: false,
  });
}