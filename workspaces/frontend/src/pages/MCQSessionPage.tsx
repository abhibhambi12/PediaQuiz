// workspaces/frontend/src/pages/MCQSessionPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SessionManager, QuizSession } from '@/services/sessionService';
import { getMcqsByIds } from '@/services/firestoreService';
import { addAttempt, addQuizResult, toggleBookmark, deleteContentItem } from '@/services/userDataService';
import { getHint, evaluateFreeTextAnswer, createFlashcardFromMcq } from '@/services/aiService';
import { MCQ, QuizResult, ConfidenceRating } from '@pediaquiz/types';
import { BookmarkIcon as OutlineBookmarkIcon, TrashIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as SolidBookmarkIcon } from '@heroicons/react/24/solid';
import { useToast } from '@/components/Toast';
import Loader from '@/components/Loader';
import QuizTimerBar from '@/components/QuizTimerBar';
import ConfirmationModal from '@/components/ConfirmationModal';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import { useAuth } from "@/contexts/AuthContext";
import { FieldValue } from "firebase/firestore"; // FIX: Removed `deleteField` from this import. It is `FieldValue.delete()`


type SessionMode = 'practice' | 'quiz' | 'mock' | 'custom' | 'weakness' | 'incorrect' | 'review_due' | 'warmup';

const getCorrectAnswerText = (mcq: MCQ | undefined): string => mcq?.correctAnswer || "";

const QuestionNavigator: React.FC<{
    count: number; currentIndex: number; answers: Record<number, string | null>; marked: Set<number>;
    mcqs: (MCQ | undefined)[]; goToQuestion: (index: number) => void; mode: SessionMode; isFinished: boolean;
}> = ({ count, currentIndex, answers, marked, mcqs, goToQuestion, mode, isFinished }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getButtonColor = (i: number) => {
        const answer = answers[i];
        const mcq = mcqs[i];
        if (answer !== undefined && answer !== null && mcq) {
            if (isFinished || ['practice', 'incorrect', 'review_due'].includes(mode)) {
                return answer === getCorrectAnswerText(mcq) ? "bg-green-500 text-white" : "bg-red-500 text-white";
            }
            return "bg-sky-500 text-white";
        }
        return "bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600";
    };

    return (
        <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button onClick={() => setIsExpanded(!isExpanded)} className="font-bold mb-3 text-slate-800 dark:text-slate-200 w-full text-left flex justify-between items-center">
                <span>Question Navigator</span>
                <span>{isExpanded ? 'Hide' : 'Show'}</span>
            </button>
            {isExpanded && (
                <div className="flex flex-wrap gap-2 pt-2 border-t dark:border-slate-700">
                    {Array.from({ length: count }, (_, i) => (
                        <button key={i} onClick={() => goToQuestion(i)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm", getButtonColor(i), i === currentIndex && !isFinished && "ring-2 ring-offset-2 dark:ring-offset-slate-800 ring-blue-500", marked.has(i) && !isFinished && "ring-2 ring-purple-500")}>
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


const MCQSessionPage: React.FC = () => {
    const { mode: rawMode, sessionId } = useParams<{ mode?: SessionMode; sessionId?: string; }>();
    const mode = rawMode || 'practice';
    const navigate = useNavigate();
    const location = useLocation();
    const { user, userBookmarksQuery, updateUserDoc } = useAuth();
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [sessionState, setSessionState] = useState<QuizSession | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [showRatingButtons, setShowRatingButtons] = useState(false);
    const [userFreeTextAnswer, setUserFreeTextAnswer] = useState<string>('');
    const [showOptionsAfterFreeText, setShowOptionsAfterFreeText] = useState(false);
    const [freeTextFeedback, setFreeTextFeedback] = useState<string | null>(null);
    const [hintText, setHintText] = useState<string | null>(null);

    const mcqIds = useMemo(() => sessionState?.mcqIds || location.state?.generatedMcqIds || [], [sessionState, location.state]);
    const { data: mcqs, isLoading: isMcqsLoading, isError: isMcqsError } = useQuery({
        queryKey: ['mcqs', mcqIds],
        queryFn: () => getMcqsByIds(mcqIds),
        enabled: mcqIds.length > 0,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (sessionId && user?.uid) {
            SessionManager.getSession(sessionId, user.uid).then(session => {
                if (session) setSessionState(session);
                else {
                    addToast("Session not found or has expired.", "danger");
                    navigate('/');
                }
            });
        }
    }, [sessionId, user?.uid, navigate, addToast]);

    const currentIndex = sessionState?.currentIndex || 0;
    const answers = sessionState?.answers || {};
    const markedForReview = useMemo(() => new Set(sessionState?.markedForReview || []), [sessionState]);
    const isFinished = sessionState?.isFinished || false;
    const currentMcq = mcqs?.[currentIndex];
    const isQuizMode = !['practice', 'incorrect', 'review_due'].includes(mode);
    const showAnswer = isFinished || (!isQuizMode && answers[currentIndex] != null);
    const isBookmarked = useMemo(() => !!(userBookmarksQuery.data?.mcq && currentMcq && userBookmarksQuery.data.mcq.includes(currentMcq.id)), [userBookmarksQuery.data, currentMcq]);

    const isActiveRecall = useMemo(() => {
        return mode === 'practice' && !answers[currentIndex] && currentMcq && !showOptionsAfterFreeText;
    }, [mode, answers, currentIndex, currentMcq, showOptionsAfterFreeText]);
    
    const updateSessionMutation = useMutation({
        mutationFn: (updates: Partial<QuizSession>) => SessionManager.updateSession(sessionId!, updates),
        onError: () => addToast("Failed to sync session.", "danger"),
    });

    const updateSessionState = useCallback((updates: Partial<QuizSession>) => {
        setSessionState(prev => prev ? { ...prev, ...updates } : null);
        if (sessionId) updateSessionMutation.mutate(updates);
    }, [sessionId, updateSessionMutation]);

    useEffect(() => { setShowRatingButtons(showAnswer && !isQuizMode); }, [showAnswer, isQuizMode]);
    useEffect(() => {
        setUserFreeTextAnswer('');
        setShowOptionsAfterFreeText(false);
        setFreeTextFeedback(null);
        setHintText(null);
    }, [currentIndex]);

    const addAttemptMutation = useMutation({
        mutationFn: addAttempt,
        // No .data extraction needed now, service returns directly
    });
    const addQuizResultMutation = useMutation({ 
        mutationFn: addQuizResult,
        // No .data extraction needed now, service returns directly
    });
    const toggleBookmarkMutation = useMutation({
        mutationFn: toggleBookmark,
        onMutate: async (data) => {
            await queryClient.cancelQueries({ queryKey: ['bookmarks', user?.uid] });
            const previousBookmarks = queryClient.getQueryData<{ mcq: string[], flashcard: string[] }>(['bookmarks', user?.uid]);
            queryClient.setQueryData<{ mcq: string[], flashcard: string[] }>(['bookmarks', user?.uid], (old) => {
                if (!old) return { mcq: [], flashcard: [] };
                const bookmarkedMcqs = old.mcq || [];
                const isCurrentlyBookmarked = bookmarkedMcqs.includes(data.contentId);
                const newBookmarks = isCurrentlyBookmarked
                    ? bookmarkedMcqs.filter(id => id !== data.contentId)
                    : [...bookmarkedMcqs, data.contentId];
                return { ...old, mcq: newBookmarks };
            });
            return { previousBookmarks };
        },
        onError: (err, variables, context) => {
            if (context?.previousBookmarks) {
                queryClient.setQueryData(['bookmarks', user?.uid], context.previousBookmarks);
            }
            addToast("Failed to update bookmark.", "danger");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] });
        },
    });
    const deleteMcqMutation = useMutation({
        mutationFn: deleteContentItem, 
        onSuccess: () => {
            addToast("MCQ deleted.", "success");
            queryClient.invalidateQueries({ queryKey: ['topics'] });
            const newMcqIds = mcqIds.filter((id: string) => id !== currentMcq?.id);
            if (newMcqIds.length > 0) {
                updateSessionState({ mcqIds: newMcqIds, currentIndex: Math.min(currentIndex, newMcqIds.length - 1) });
            } else { navigate(-1); }
        },
        onError: (e: Error) => addToast(`Deletion failed: ${e.message}`, "danger")
    });
    const getHintMutation = useMutation<
        { hint: string }, // Explicit return type for direct data return
        Error, // Error type
        { mcqId: string } // Variables type
    >({
        mutationFn: (data) => getHint(data),
        onSuccess: (data) => setHintText(data.hint),
        onError: (error: Error) => addToast(`Failed to get hint: ${error.message}`, "danger")
    });
    const evaluateFreeTextMutation = useMutation<
        { isCorrect: boolean, feedback: string }, // Explicit return type for direct data return
        Error, // Error type
        { mcqId: string, userAnswer: string } // Variables type
    >({
        mutationFn: (data) => evaluateFreeTextAnswer(data),
        onSuccess: (data) => {
            setFreeTextFeedback(data.feedback);
            setShowOptionsAfterFreeText(true);
            if (data.isCorrect) handleSelectOption(getCorrectAnswerText(currentMcq));
        },
        onError: (error: Error) => addToast(`Free text evaluation failed: ${error.message}`, "danger")
    });
    const createFlashcardMutation = useMutation<
        { flashcardId: string }, // Explicit return type for direct data return
        Error, // Error type
        { mcqId: string } // Variables type
    >({
        mutationFn: (data) => createFlashcardFromMcq(data),
        onSuccess: (data) => addToast(`Flashcard created! ID: ${data.flashcardId}`, "success"),
        onError: (error: Error) => addToast(`Failed to create flashcard: ${error.message}`, "danger")
    });

    const finishSession = useCallback(async () => {
        if (isFinished || !user || !mcqs || !sessionId) return;
        updateSessionState({ isFinished: true });
        // FIX: Use FieldValue.delete() correctly.
        await Promise.all([SessionManager.deleteSession(sessionId), updateUserDoc({ activeSessionId: FieldValue.delete() })]);
        const results = mcqs.map((mcq, index) => ({ mcqId: mcq.id, selectedAnswer: answers[index] || null, correctAnswer: getCorrectAnswerText(mcq), isCorrect: (answers[index] || null) === getCorrectAnswerText(mcq) }));
        const score = results.filter(r => r.isCorrect).length;
        const resultPayload: Omit<QuizResult, 'id' | 'userId' | 'quizDate'> = { sessionId, mode, totalQuestions: mcqs.length, score, durationSeconds: 0, mcqAttempts: results };

        if (isQuizMode) {
            try {
                const result = await addQuizResultMutation.mutateAsync(resultPayload); // Now directly returns data
                queryClient.invalidateQueries({ queryKey: ['quizResults', user.uid] });
                navigate(`/results/${result.id}`, { replace: true });
            } catch (error) { addToast("Failed to save quiz results.", "danger"); }
        } else {
            addToast("Practice session complete!", "info");
            navigate(`/chapters/${currentMcq?.topicId}/${currentMcq?.chapterId}`);
        }
    }, [isFinished, user, mcqs, sessionId, answers, mode, isQuizMode, addToast, currentMcq, queryClient, navigate, updateSessionState, updateUserDoc, addQuizResultMutation]);

    const handleConfidenceRating = useCallback((rating: ConfidenceRating) => {
        if (!currentMcq || answers[currentIndex] == null || !sessionId) return;
        addAttemptMutation.mutate({ mcqId: currentMcq.id, isCorrect: answers[currentIndex] === getCorrectAnswerText(currentMcq), selectedAnswer: answers[currentIndex]!, sessionId: sessionId, confidenceRating: rating });
        setShowRatingButtons(false);
        if (currentIndex < mcqs!.length - 1) updateSessionState({ currentIndex: currentIndex + 1 });
        else finishSession();
    }, [answers, currentIndex, currentMcq, mcqs, sessionId, addAttemptMutation, updateSessionState, finishSession]);

    const handleSelectOption = useCallback((option: string) => {
        if (!currentMcq || (isQuizMode && answers[currentIndex] != null) || (!isQuizMode && showAnswer)) return;
        updateSessionState({ answers: { ...answers, [currentIndex]: option } });
        if (isQuizMode && currentIndex < mcqs!.length - 1) setTimeout(() => updateSessionState({ currentIndex: currentIndex + 1 }), 300);
    }, [answers, currentIndex, currentMcq, isQuizMode, mcqs, showAnswer, updateSessionState]);

    const handleFreeTextSubmit = () => { if (userFreeTextAnswer.trim() && currentMcq) evaluateFreeTextMutation.mutate({ mcqId: currentMcq.id, userAnswer: userFreeTextAnswer }); else addToast("Please type an answer first.", "warning"); };
    const handleGetHint = () => { if (currentMcq) getHintMutation.mutate({ mcqId: currentMcq.id }); };
    const handleCreateFlashcard = () => { if (currentMcq) createFlashcardMutation.mutate({ mcqId: currentMcq.id }); };
    const handleDelete = () => { if (user?.isAdmin && currentMcq) { deleteMcqMutation.mutate({ id: currentMcq.id, type: 'mcq', collectionName: currentMcq.source?.toLowerCase().includes('marrow') ? 'MarrowMCQ' : 'MasterMCQ' }); setIsDeleteModalOpen(false); } };
    const handleToggleBookmark = () => { if (currentMcq) toggleBookmarkMutation.mutate({ contentId: currentMcq.id, contentType: 'mcq', action: isBookmarked ? 'remove' : 'add' }); };
    const goToQuestion = useCallback((index: number) => { if (index >= 0 && index < (mcqs?.length || 0)) updateSessionState({ currentIndex: index }); }, [mcqs, updateSessionState]);
    const handleNext = () => (currentIndex < mcqs!.length - 1) ? goToQuestion(currentIndex + 1) : finishSession();
    const handlePrevious = () => goToQuestion(currentIndex - 1);
    const toggleMarkForReview = useCallback(() => { const newMarked = new Set(markedForReview); newMarked.has(currentIndex) ? newMarked.delete(currentIndex) : newMarked.add(currentIndex); updateSessionState({ markedForReview: Array.from(newMarked) }); }, [currentIndex, markedForReview, updateSessionState]);
    
    const isSaving = updateSessionMutation.isPending || addAttemptMutation.isPending || addQuizResultMutation.isPending;
    if (!sessionState || isMcqsLoading) return <Loader message="Loading Session..." />;
    if (isMcqsError || !mcqs) return <div className="text-center p-10 text-red-500">Error loading questions.</div>;
    if (mcqs.length === 0) return <div className="text-center p-10">No questions for this session.</div>;
    if (!currentMcq) return <Loader message="Loading question..." />;

    const BookmarkComponent = isBookmarked ? SolidBookmarkIcon : OutlineBookmarkIcon;
    const optionsArray = currentMcq.options || [];

    return (
        <>
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete} title="Delete MCQ" message="Are you sure?" confirmText="Delete" variant="danger" isLoading={deleteMcqMutation.isPending}/>
            <div className="max-w-3xl mx-auto p-4 md:p-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl font-bold capitalize text-slate-800 dark:text-slate-100">Q. {currentIndex + 1}/{mcqs.length} ({mode.replace(/_/g, ' ')})</h1>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && (<button onClick={() => setIsDeleteModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-red-500" title="Delete"><TrashIcon /></button>)}
                        <button onClick={handleToggleBookmark} disabled={toggleBookmarkMutation.isPending} className={clsx("p-2 rounded-full", isBookmarked ? "text-amber-500" : "text-slate-400 hover:text-amber-400")}>
                            <BookmarkComponent className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                {isQuizMode && <QuizTimerBar key={currentIndex} duration={60} onTimeUp={handleNext} isPaused={isFinished} />}
                <div className="card-base p-6">
                    <div className="text-lg font-semibold mb-4 whitespace-pre-wrap text-slate-800 dark:text-slate-200"><ReactMarkdown>{currentMcq.question}</ReactMarkdown></div>
                    {isActiveRecall && !showOptionsAfterFreeText ? (
                        <div className="space-y-4">
                            <textarea value={userFreeTextAnswer} onChange={(e) => setUserFreeTextAnswer(e.target.value)} placeholder="Type your answer here from memory..." className="input-field w-full h-24"></textarea>
                            <button onClick={handleFreeTextSubmit} className="btn-primary w-full" disabled={evaluateFreeTextMutation.isPending}>{evaluateFreeTextMutation.isPending ? 'Evaluating...' : 'Submit Answer (Active Recall)'}</button>
                            {hintText && <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/40 rounded-lg text-blue-800 dark:text-blue-200 text-sm">Hint: {hintText}</div>}
                            <button onClick={handleGetHint} className="btn-neutral w-full flex items-center justify-center gap-2" disabled={getHintMutation.isPending || !!hintText}><LightBulbIcon className="w-5 h-5" /> {getHintMutation.isPending ? 'Generating Hint...' : 'Get Hint'}</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {freeTextFeedback && (<div className={clsx("p-3 rounded-lg text-sm", freeTextFeedback.includes("correct") ? "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300")}>Feedback: {freeTextFeedback}</div>)}
                            {optionsArray.map((option, idx) => {
                                const isSelected = answers[currentIndex] === option;
                                let style = "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600";
                                if (showAnswer) {
                                    if (option === getCorrectAnswerText(currentMcq)) style = "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 ring-2 ring-green-500";
                                    else if (isSelected) style = "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 ring-2 ring-red-500";
                                } else if (isSelected) style = "bg-sky-200 dark:bg-sky-800 ring-2 ring-sky-500";
                                return <button key={idx} onClick={() => handleSelectOption(option)} disabled={(isQuizMode && isSelected) || isSaving} className={clsx("w-full text-left p-4 rounded-lg flex items-start transition-colors disabled:cursor-not-allowed", style)}><span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span><span>{option}</span></button>;
                            })}
                            {hintText && <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/40 rounded-lg text-blue-800 dark:text-blue-200 text-sm">Hint: {hintText}</div>}
                            {!showAnswer && !isActiveRecall && (<button onClick={handleGetHint} className="btn-neutral w-full flex items-center justify-center gap-2" disabled={getHintMutation.isPending || !!hintText || isSaving}><LightBulbIcon className="w-5 h-5" /> {getHintMutation.isPending ? 'Generating Hint...' : 'Get Hint'}</button>)}
                        </div>
                    )}
                    {showAnswer && currentMcq.explanation && (
                        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/40 rounded-lg animate-fade-in-down text-amber-800 dark:text-amber-200">
                            <h3 className="font-bold">Explanation</h3>
                            <div className="mt-2 whitespace-pre-wrap"><ReactMarkdown>{currentMcq.explanation}</ReactMarkdown></div>
                            {!isQuizMode && (<button onClick={handleCreateFlashcard} className="btn-secondary mt-3 w-full" disabled={createFlashcardMutation.isPending || isSaving}>{createFlashcardMutation.isPending ? 'Creating...' : '⚡️ Create Flashcard from this MCQ'}</button>)}
                        </div>
                    )}
                </div>

                {showRatingButtons && (
                    <div className="flex justify-around mt-6 space-x-2 animate-fade-in-up">
                        <button onClick={() => handleConfidenceRating('again')} className="btn-danger flex-1 text-base" disabled={isSaving}>😥 Again</button>
                        <button onClick={() => handleConfidenceRating('hard')} className="btn-warning flex-1 text-base" disabled={isSaving}>😔 Hard</button>
                        <button onClick={() => handleConfidenceRating('good')} className="btn-primary flex-1 text-base" disabled={isSaving}>🙂 Good</button>
                        <button onClick={() => handleConfidenceRating('easy')} className="btn-success flex-1 text-base" disabled={isSaving}>🥳 Easy</button>
                    </div>
                )}
                
                {isQuizMode && !isFinished && (
                    <div className="flex justify-between items-center mt-6">
                        <button onClick={handlePrevious} disabled={currentIndex === 0 || isSaving} className="btn-neutral">Previous</button>
                        <button onClick={toggleMarkForReview} disabled={isSaving} className={clsx("px-4 py-2 rounded-md font-semibold", markedForReview.has(currentIndex) ? 'bg-purple-500 text-white hover:bg-purple-600' : 'btn-neutral')}>{markedForReview.has(currentIndex) ? 'Unmark' : 'Mark Review'}</button>
                        <button onClick={handleNext} disabled={isSaving} className="btn-primary">{currentIndex === mcqs.length - 1 ? "Submit Quiz" : "Next"}</button>
                    </div>
                )}

                <QuestionNavigator count={mcqs.length} currentIndex={currentIndex} answers={answers} marked={markedForReview} mcqs={mcqs} goToQuestion={goToQuestion} mode={mode} isFinished={isFinished} />
            </div>
        </>
    );
};

export default MCQSessionPage;