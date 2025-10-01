// frontend/src/hooks/useMCQSession.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
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
  const { appData } = useData();
  const { isOnline } = useNetworkStatus();
  const { addToast } = useToast();

  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [isEnding, setIsEnding] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [offlineQueue, setOfflineQueue] = usePersistentState<Partial<QuizSession>[]>(`session-queue-${sessionId}`, []);

  const { data: session, isLoading: isLoadingSession } = useQuery({
    queryKey: ['sessionData', sessionId],
    queryFn: () => SessionManager.getSession(sessionId!),
    enabled: !!sessionId && !!user,
  });

  const addAttemptMutation = useMutation({ mutationFn: addAttempt });
  const toggleBookmarkMutation = useMutation({ mutationFn: toggleBookmark });

  const finishSessionMutation = useMutation({
    mutationFn: () => SessionManager.finishSession(session!.id, answers),
    onSuccess: (resultId) => navigate(`/results/${resultId}`, { replace: true }),
    onError: (error: any) => addToast(`Failed to finish session: ${error.message}`, 'error'),
  });

  // Sync offline queue when network returns
  useEffect(() => {
    async function syncQueue() {
      if (isOnline && offlineQueue.length > 0 && session) {
        const updatesToSync = offlineQueue;
        setOfflineQueue([]); // Clear queue immediately
        try {
          for (const updates of updatesToSync) {
            await SessionManager.updateSession(session.id, updates);
          }
          addToast('Session progress synced!', 'success');
        } catch (error) {
          addToast('Failed to sync session progress.', 'error');
          setOfflineQueue(prev => [...updatesToSync, ...prev]); // Re-add failed updates
        }
      }
    }
    syncQueue();
  }, [isOnline, offlineQueue.length, session, setOfflineQueue, addToast]);

  useEffect(() => {
    if (session?.mcqIds && appData) {
      const fetchedMcqs = getMCQsByIds(appData, session.mcqIds);
      setMcqs(fetchedMcqs);
      setCurrentIndex(session.currentIndex || 0);
      setAnswers((session.answers as Record<number, AnswerState>) || {});
    } else if (sessionId && !isLoadingSession && !session) {
      addToast('Session not found or has expired.', 'error');
      navigate('/');
    }
  }, [session, appData, sessionId, isLoadingSession, navigate, addToast]);

  const updateSessionState = useCallback(async (updates: Partial<QuizSession>) => {
    if (!session) return;
    if (isOnline) {
      try {
        await SessionManager.updateSession(session.id, updates);
        setSessionError(null);
      } catch (error) {
        setSessionError('Failed to save progress. Retrying...');
        setOfflineQueue(prev => [...prev, updates]);
      }
    } else {
      setOfflineQueue(prev => [...prev, updates]);
    }
  }, [session, isOnline, setOfflineQueue]);

  const selectOption = useCallback(async (option: string) => {
    if (answers[currentIndex] || !mcqs[currentIndex] || !session) return;
    const mcq = mcqs[currentIndex];
    const newAnswers = { ...answers, [currentIndex]: { selectedAnswer: option } };
    setAnswers(newAnswers);
    addAttemptMutation.mutate({ mcqId: mcq.id, isCorrect: option === getCorrectAnswerText(mcq), selectedAnswer: option, sessionId: session.id });
    await updateSessionState({ answers: newAnswers });
  }, [answers, currentIndex, mcqs, session, addAttemptMutation, updateSessionState]);
  
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
    const newBookmarks = isCurrentlyBookmarked ? user.bookmarkedMcqs?.filter(id => id !== mcqId) : [...(user.bookmarkedMcqs || []), mcqId];
    updateUserDoc({ bookmarkedMcqs: newBookmarks }); // Optimistic update
    toggleBookmarkMutation.mutate({ contentId: mcqId, contentType: 'mcq' });
  };
  
  const currentMcq = mcqs[currentIndex];
  const isBookmarked = useMemo(() => !!user?.bookmarkedMcqs?.includes(currentMcq?.id ?? ''), [user?.bookmarkedMcqs, currentMcq]);
  
  return {
    isLoading: isLoadingSession || mcqs.length === 0,
    currentMcq,
    answers,
    isBookmarked,
    session,
    sessionError,
    progress: { current: currentIndex, total: mcqs.length },
    actions: {
      selectOption,
      goToNext,
      goToQuestion,
      toggleBookmark: handleToggleBookmark,
      endSession: () => setIsEnding(true),
      confirmEndSession: () => finishSessionMutation.mutate(),
      cancelEndSession: () => setIsEnding(false),
      isEnding,
      isFinishing,
      confirmFinish: () => finishSessionMutation.mutate(),
      cancelFinish: () => setIsFinishing(false),
    },
  };
}