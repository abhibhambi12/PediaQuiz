// FILE: workspaces/frontend/src/hooks/useChapterContent.ts

import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '@/services/firestoreService';
import type { MCQ, Flashcard } from '@pediaquiz/types';

interface ChapterContent {
    mcqs: MCQ[];
    flashcards: Flashcard[];
}

export const useChapterContent = (chapterId: string | undefined) => {
  return useQuery<ChapterContent, Error>({
    queryKey: ['chapterContent', chapterId],
    queryFn: () => getChapterContent(chapterId!), // The query is only enabled when chapterId is defined
    enabled: !!chapterId, // Only run the query if chapterId is not null/undefined
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
};