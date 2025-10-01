    import { useQuery } from '@tanstack/react-query';
    import { getChapterContent } from '@/services/contentService';
    import { useData } from '@/contexts/DataContext';
    import { MCQ, Flashcard } from '@pediaquiz/types';
    
    /**
     * Fetches all MCQs and Flashcards for a specific chapter ID.
     * This hook relies on the efficient, centralized contentService which
     * filters the globally cached AppData, avoiding redundant network calls.
     */
    export function useChapterContent(chapterId: string | undefined) {
      const { appData } = useData();
    
      return useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
        queryKey: ['chapterContent', chapterId],
        queryFn: () => {
          if (!chapterId) return { mcqs: [], flashcards: [] };
          // This function is now a fast, in-memory filter of the global appData.
          return getChapterContent(appData ?? undefined, chapterId);
        },
        enabled: !!chapterId && !!appData, // Only run if we have a chapterId and the global data is loaded.
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
      });
    }