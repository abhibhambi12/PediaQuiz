import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '@/services/firestoreService'; // Updated import
// Using direct type imports from types package
import { MCQ, Flashcard } from '@pediaquiz/types';

/**
 * Fetches all MCQs and Flashcards for a specific chapter, identified by its ID.
 * This hook is designed to be used by ChapterDetailPage.
 */
export function useChapterContent(chapterId: string | undefined) { // Removed topicSource parameter
  return useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
    queryKey: ['chapterContent', chapterId], // Query key now only depends on chapterId
    queryFn: async () => {
      if (!chapterId) return { mcqs: [], flashcards: [] };
      return getChapterContent(chapterId); // Call getChapterContent with only chapterId
    },
    enabled: !!chapterId, // Only run when chapterId is available
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false, // Prevents refetching on tab refocus
  });
}