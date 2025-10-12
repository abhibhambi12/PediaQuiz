// frontend/src/hooks/useMCQSession.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { addAttempt, toggleBookmark } from '@/services/apiService';
import { SessionManager } from '@/services/sessionService';
import { getMCQsByIds } from '@/services/contentService';
import { useToast } from '@/components/Toast';
import { MCQ, QuizSession } from '@pediaquiz/types';
import { useNetworkStatus } from './useNetworkStatus';
import { usePersistentState } from './usePersistentState';

const getCorrectAnswerText = (mcq: MCQ): string =>
  mcq.correctAnswer || mcq.options[mcq.answer.charCodeAt(0) - 65];

export interface AnswerState {
  selectedAnswer: string;
}

export function useMCQSession() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const { user, updateUserDoc } = useAuth();
  const { isOnline } = useNetworkStatus();
  const { addToast } = useToast();
  // --- BATCH 2 CHANGE: STATS INVALIDATION ---
  // Get the queryClient instance to invalidate queries upon mutation.
  const queryClient = useQueryClient();

  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [isEnding, setIsEnding] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [consecutiveIncorrect, setConsecutiveIncorrect] = useState(0);
  const [answerTimestamps, setAnswerTimestamps] = useState<number[]>([]);
  const [motivationalMessage, setMotivationalMessage] = useState<string | null>(null);

  const [offlineQueue, setOfflineQueue] = usePersistentState<
    Partial<QuizSession>[]
  >(`session-queue-${sessionId}`, []);

  const { data: session, isLoading: isLoadingSession, isSuccess: isSessionLoaded } = useQuery({
    queryKey: ['sessionData', sessionId],
    queryFn: () => SessionManager.getSession(sessionId!),
    enabled: !!sessionId && !!user,
  });

  const { data: sessionMcqs, isLoading: isLoadingMcqs } = useQuery({
      queryKey: ['sessionMcqs', session?.mcqIds],
      queryFn: () => getMCQsByIds(session!.mcqIds),
      enabled: isSessionLoaded && !!session?.mcqIds && session.mcqIds.length > 0,
  });

  useEffect(() => {
    if (isSessionLoaded && session) {
        setAnswers((session.answers as Record<number, AnswerState>) || {});
        setCurrentIndex(session.currentIndex || 0);
    } else if (!isLoadingSession && !session) {
        addToast('Session not found or has expired.', 'error');
        navigate('/');
    }
  }, [isSessionLoaded, session, isLoadingSession, navigate, addToast]);

  useEffect(() => {
      if (sessionMcqs) {
          setMcqs(sessionMcqs);
      }
  }, [sessionMcqs]);


  const addAttemptMutation = useMutation({
    mutationFn: addAttempt,
    // --- BATCH 2 CHANGE: STATS INVALIDATION ---
    // This onSuccess callback is added to ensure that after an attempt is successfully
    // submitted, the cached data for `userStats` is marked as stale. This will
    // trigger a refetch the next time the user visits the Stats page.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userStats', user?.uid] });
    },
  });
  const toggleBookmarkMutation = useMutation({ mutationFn: toggleBookmark });

  const finishSessionMutation = useMutation({
    mutationFn: () => SessionManager.finishSession(session!.id, answers),
    onSuccess: (resultId) => navigate(`/results/${resultId}`, { replace: true }),
    onError: (error: any) =>
      addToast(`Failed to finish session: ${error.message}`, 'error'),
  });

  useEffect(() => {
    async function syncQueue() {
      if (isOnline && offlineQueue.length > 0 && session) {
        const updatesToSync = [...offlineQueue];
        setOfflineQueue([]);
        try {
          for (const updates of updatesToSync) {
            await SessionManager.updateSession(session.id, updates);
          }
          addToast('Session progress synced!', 'success');
        } catch (error) {
          addToast('Failed to sync session progress.', 'error');
          setOfflineQueue((prev) => [...updatesToSync, ...prev]);
        }
      }
    }
    syncQueue();
  }, [isOnline, offlineQueue, session, setOfflineQueue, addToast]);
  
  const updateSessionState = useCallback(
    async (updates: Partial<QuizSession>) => {
      if (!session) return;
      if (isOnline) {
        try {
          await SessionManager.updateSession(session.id, updates);
          setSessionError(null);
        } catch (error) {
          setSessionError('Failed to save progress. Retrying...');
          setOfflineQueue((prev) => [...prev, updates]);
        }
      } else {
        setOfflineQueue((prev) => [...prev, updates]);
      }
    },
    [session, isOnline, setOfflineQueue]
  );

  const selectOption = useCallback(
    async (option: string) => {
      if (answers[currentIndex] || !mcqs[currentIndex] || !session) return;
      const mcq = mcqs[currentIndex];
      const isCorrect = option === getCorrectAnswerText(mcq);
      const newAnswers = { ...answers, [currentIndex]: { selectedAnswer: option } };
      setAnswers(newAnswers);

      const now = Date.now();
      const lastTimestamp = answerTimestamps[answerTimestamps.length - 1] || (now - 10000);
      const timeTaken = (now - lastTimestamp) / 1000;
      setAnswerTimestamps(prev => [...prev, now]);

      if (isCorrect) {
          const newStreak = consecutiveCorrect + 1;
          setConsecutiveCorrect(newStreak);
          setConsecutiveIncorrect(0);
          if (newStreak === 5) {
              setMotivationalMessage("You're on a roll! 🔥 Keep it up!");
          }
      } else {
          const newStreak = consecutiveIncorrect + 1;
          setConsecutiveIncorrect(newStreak);
          setConsecutiveCorrect(0);
          if (newStreak === 3) {
              setMotivationalMessage("Keep going, learning happens step-by-step. 💪 Need a hint? 💡");
          }
          if (timeTaken < 5) {
              setMotivationalMessage("Take your time for better understanding. Quality > Speed! ⏳");
          }
      }

      addAttemptMutation.mutate({ mcqId: mcq.id, isCorrect, selectedAnswer: option, sessionId: session.id });
      await updateSessionState({ answers: newAnswers });
    },
    [answers, currentIndex, mcqs, session, addAttemptMutation, updateSessionState, consecutiveCorrect, consecutiveIncorrect, answerTimestamps]
  );
  
  // --- BATCH 1 CHANGE: PALETTE FEATURE ---
  // This new function allows direct navigation to any question index. It will be
  // passed as a prop to the new QuestionPalette component.
  const goToQuestion = useCallback((index: number) => {
      if (index >= 0 && index < mcqs.length) {
        setCurrentIndex(index);
        updateSessionState({ currentIndex: index });
      }
    }, [mcqs.length, updateSessionState]);

  const goToNext = useCallback(() => {
    if (currentIndex < mcqs.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      setIsFinishing(true);
    }
  }, [currentIndex, mcqs.length, goToQuestion]);

  const handleToggleBookmark = () => {
    const mcqId = mcqs[currentIndex]?.id;
    if (!mcqId || !user) return;
    const isCurrentlyBookmarked = user.bookmarkedMcqs?.includes(mcqId);
    const newBookmarks = isCurrentlyBookmarked
      ? user.bookmarkedMcqs?.filter((id) => id !== mcqId)
      : [...(user.bookmarkedMcqs || []), mcqId];
    updateUserDoc({ bookmarkedMcqs: newBookmarks });
    toggleBookmarkMutation.mutate({ contentId: mcqId, contentType: 'mcq' });
  };

  const currentMcq = mcqs[currentIndex];
  const isBookmarked = useMemo(() => !!user?.bookmarkedMcqs?.includes(currentMcq?.id ?? ''), [user?.bookmarkedMcqs, currentMcq]);
  
  // --- BATCH 1 CHANGE: PALETTE FEATURE ---
  // This new memoized array provides a lightweight list of all MCQs for the
  // QuestionPalette to consume, without passing the full, heavy objects.
  const mcqsForPalette = useMemo(() => mcqs.map(mcq => ({ id: mcq.id, options: mcq.options, answer: mcq.answer, correctAnswer: mcq.correctAnswer })), [mcqs]);

  return {
    isLoading: isLoadingSession || isLoadingMcqs,
    currentMcq,
    answers,
    isBookmarked,
    session,
    sessionError,
    progress: { current: currentIndex, total: mcqs.length },
    motivationalMessage,
    actions: {
      selectOption,
      goToNext,
      goToQuestion, // Export the new navigation function
      toggleBookmark: handleToggleBookmark,
      endSession: () => setIsEnding(true),
      confirmEndSession: () => finishSessionMutation.mutate(),
      cancelEndSession: () => setIsEnding(false),
      isEnding,
      isFinishing,
      confirmFinish: () => finishSessionMutation.mutate(),
      cancelFinish: () => setIsFinishing(false),
      mcqsForPalette, // Export the new data structure for the palette
      clearMotivationalMessage: () => setMotivationalMessage(null),
    },
  };
}