import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '@/services/firestoreService';
import type { MCQ, Flashcard } from '@pediaquiz/types';

/**
 * Fetches all MCQs and Flashcards for a specific chapter, identified by its source and name.
 */
export function useChapterContent(topicSource: 'General' | 'Marrow' | undefined, chapterName: string | undefined) {
  return useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
    queryKey: ['chapterContent', topicSource, chapterName],
    queryFn: async () => {
      if (!topicSource || !chapterName) return { mcqs: [], flashcards: [] };
      return getChapterContent(topicSource, chapterName);
    },
    enabled: !!topicSource && !!chapterName, // Only run when both params are available
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}