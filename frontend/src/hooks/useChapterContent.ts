import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '@/services/firestoreService';
import type { MCQ, Flashcard } from '@pediaquiz/types';

export function useChapterContent(chapterId: string | undefined) {
  return useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
    queryKey: ['chapterContent', chapterId],
    queryFn: async () => {
      if (!chapterId) return { mcqs: [], flashcards: [] };
      return getChapterContent(chapterId);
    },
    enabled: !!chapterId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });
}