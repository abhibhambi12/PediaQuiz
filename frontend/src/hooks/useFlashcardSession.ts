// frontend/src/hooks/useFlashcardSession.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { toggleBookmark, addFlashcardAttempt } from '@/services/apiService';
// FIX: Updated the import path to the correct service file.
import { getChapterContent } from '@/services/contentService';
import { Flashcard, ConfidenceRating } from '@pediaquiz/types';

type FilterType = 'all' | 'bookmarked' | 'rated_hard';

export function useFlashcardSession() {
  const { chapterId } = useParams<{ chapterId: string; topicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, updateUserDoc } = useAuth();
  const { addToast } = useToast();

  const [allFlashcards, setAllFlashcards] = useState<Flashcard[]>([]);
  const [filteredFlashcards, setFilteredFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: chapterContent, isLoading: isLoadingContent } = useQuery({
    queryKey: ['chapterFlashcards', chapterId],
    // The `res` parameter is now correctly typed because the import works.
    queryFn: () => getChapterContent({ chapterId: chapterId! }).then(res => res.data),
    enabled: !!chapterId,
  });

  useEffect(() => {
    if (chapterContent?.flashcards) {
      setAllFlashcards(chapterContent.flashcards);
      setFilteredFlashcards(chapterContent.flashcards);
    }
  }, [chapterContent]);

  useEffect(() => {
    let newFiltered = allFlashcards;
    if (filter === 'bookmarked') {
      newFiltered = allFlashcards.filter((fc) =>
        user?.bookmarkedFlashcards?.includes(fc.id)
      );
    }
    setFilteredFlashcards(newFiltered);
    setCurrentCardIndex(0);
  }, [filter, allFlashcards, user?.bookmarkedFlashcards]);

  const addAttemptMutation = useMutation({
    mutationFn: addFlashcardAttempt,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['userProfile', user?.uid] }),
  });

  const toggleBookmarkMutation = useMutation({ mutationFn: toggleBookmark });

  const currentCard = useMemo(
    () => filteredFlashcards[currentCardIndex],
    [filteredFlashcards, currentCardIndex]
  );
  const isBookmarked = useMemo(
    () => !!user?.bookmarkedFlashcards?.includes(currentCard?.id ?? ''),
    [user?.bookmarkedFlashcards, currentCard]
  );

  const goToNext = useCallback(() => {
    setIsFlipped(false);
    setTimeout(() => {
      if (currentCardIndex < filteredFlashcards.length - 1) {
        setCurrentCardIndex((prev) => prev + 1);
      } else {
        addToast('Session complete!', 'success');
        navigate(-1);
      }
    }, 150);
  }, [currentCardIndex, filteredFlashcards.length, navigate, addToast]);

  const goToPrevious = () => {
    if (currentCardIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentCardIndex((prev) => prev - 1), 150);
    }
  };

  const rateConfidence = useCallback(
    (rating: ConfidenceRating) => {
      if (currentCard) {
        addAttemptMutation.mutate({ flashcardId: currentCard.id, rating });
      }
      goToNext();
    },
    [currentCard, addAttemptMutation, goToNext]
  );

  const handleToggleBookmark = () => {
    const cardId = currentCard?.id;
    if (!cardId || !user) return;
    const currentBookmarks = user.bookmarkedFlashcards || [];
    const newBookmarks = currentBookmarks.includes(cardId)
      ? currentBookmarks.filter((id) => id !== cardId)
      : [...currentBookmarks, cardId];
    updateUserDoc({ bookmarkedFlashcards: newBookmarks }); // Optimistic update
    toggleBookmarkMutation.mutate({ contentId: cardId, contentType: 'flashcard' });
  };

  return {
    isLoading: isLoadingContent,
    currentCard,
    isFlipped,
    isBookmarked,
    filter,
    progress: {
      current: currentCardIndex + 1,
      total: filteredFlashcards.length,
    },
    actions: {
      setFilter,
      flipCard: () => setIsFlipped((f) => !f),
      rateConfidence,
      goToNext,
      goToPrevious,
      toggleBookmark: handleToggleBookmark,
    },
  };
}