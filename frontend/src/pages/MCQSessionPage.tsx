// frontend/pages/MCQSessionPage.tsx
// frontend/pages/MCQSessionPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from "@/contexts/AuthContext";
import { addAttempt, addQuizResult, toggleBookmark, getAttemptedMCQs, getBookmarks, deleteContentItem } from "@/services/userDataService";
import { getHint, evaluateFreeTextAnswer } from "@/services/aiService";
import { getMCQsByIds } from "@/services/firestoreService";
import { SessionManager } from '@/services/sessionService';
import { MCQ, QuizResult, AttemptedMCQDocument, ToggleBookmarkCallableData, DeleteContentItemCallableData, QuizSession } from "@pediaquiz/types";
import { BookmarkIcon as BookmarkOutlineIcon, TrashIcon, LightBulbIcon, PencilIcon, ChevronDownIcon, DocumentPlusIcon } from '@heroicons/react/24/outline'; // CRITICAL FIX: Added DocumentPlusIcon
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { useToast } from "@/components/Toast";
import Loader from "@/components/Loader";
import QuizTimerBar from "@/components/QuizTimerBar";
import ConfirmationModal from "@/components/ConfirmationModal";
import clsx from 'clsx';

type SessionMode = QuizSession['mode'];

// Helper to get correct answer text (for display and comparison)
const getCorrectAnswerText = (mcq: MCQ | undefined): string => {
    if (!mcq || !Array.isArray(mcq.options) || mcq.options.length === 0) return "";
    // Prioritize correctAnswer field if present, otherwise use answer letter
    if (mcq.correctAnswer) return mcq.correctAnswer;
    if (mcq.answer && mcq.answer.length === 1 && mcq.answer.charCodeAt(0) >= 'A'.charCodeAt(0) && mcq.answer.charCodeAt(0) <= 'D'.charCodeAt(0)) {
        const correctIndex = mcq.answer.charCodeAt(0) - 'A'.charCodeAt(0);
        if (correctIndex >= 0 && correctIndex < mcq.options.length) return mcq.options[correctIndex];
    }
    return mcq.answer; // Fallback to raw answer string if options parsing fails
};

// Component to navigate between questions
const QuestionNavigator: React.FC<{
    count: number; currentIndex: number; answers: Record<number, string | null>; marked: Set<number>;
    mcqs: MCQ[]; goToQuestion: (index: number) => void; mode: SessionMode; isFinished: boolean;
}> = ({ count, currentIndex, answers, marked, mcqs, goToQuestion, mode, isFinished }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getButtonColor = (i: number) => {
        const answer = answers[i];
        const mcq = mcqs[i];
        if (answer !== undefined && answer !== null && mcq) {
            // In quiz mode after finish, or in practice/incorrect mode, show correctness
            if (isFinished || mode === 'practice' || mode === 'incorrect' || mode === 'daily_grind') {
                return answer === getCorrectAnswerText(mcq) ? "bg-green-500 text-white" : "bg-red-500 text-white";
            }
            return "bg-sky-500 text-white"; // In-progress quiz, answered but not revealed
        }
        return "bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"; // Unanswered
    };

    return (
        <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button onClick={() => setIsExpanded(!isExpanded)} className="font-bold mb-3 text-slate-800 dark:text-slate-200 w-full text-left flex items-center justify-between">
                <span>Question Navigator</span>
                <ChevronDownIcon className={clsx("h-5 w-5 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
            </button>
            {isExpanded && (
                <div className="flex flex-wrap gap-2 pt-2 border-t dark:border-slate-700">
                    {Array.from({ length: count }, (_, i) => {
                        const colorClass = getButtonColor(i);
                        const isCurrent = i === currentIndex ? "ring-2 ring-blue-500" : "";
                        const isMarked = marked.has(i) ? "ring-2 ring-purple-500" : "";
                        return (
                            <button key={i} onClick={() => goToQuestion(i)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", colorClass, isCurrent, isMarked)}>
                                {i + 1}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};


const MCQSessionPage: React.FC = () => {
    const { mode = 'practice', sessionId } = useParams<{ mode?: SessionMode; sessionId?: string; }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string | null>>({}); // Stores selected answer text
    const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
    const [isFinished, setIsFinished] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentSession, setCurrentSession] = useState<QuizSession | null>(null);
    const [hintText, setHintText] = useState<string | null>(null);
    const [showExplanation, setShowExplanation] = useState(false); // Manually control explanation reveal in quiz mode
    const [quizModeSelectedAnswer, setQuizModeSelectedAnswer] = useState<string | null>(null); // To store answer in quiz mode before reveal

    // Active Recall / Free Text specific state
    const [showActiveRecallInput, setShowActiveRecallInput] = useState(false);
    const [userFreeTextAnswer, setUserFreeTextAnswer] = useState('');
    const [activeRecallFeedback, setActiveRecallFeedback] = useState<string | null>(null);
    const [activeRecallIsCorrect, setActiveRecallIsCorrect] = useState<boolean | null>(null);


    // Pass generated MCQ IDs from state if available (e.g., from CustomTestBuilder, Weakness Test)
    const locationState = location.state as { generatedMcqIds?: string[], generatedFlashcardIds?: string[] } || {};

    // React Query to fetch user's attempted MCQs (for progress and SM-2 updates)
    const { data: attemptedMCQDocs, isLoading: areAttemptsLoading } = useQuery<Record<string, AttemptedMCQDocument>, Error>({
        queryKey: ['attemptedMCQDocs', user?.uid],
        queryFn: ({ queryKey }) => getAttemptedMCQs(queryKey[1] as string),
        enabled: !!user?.uid,
    });

    // React Query to fetch user's bookmarks
    const { data: bookmarks, isLoading: areBookmarksLoading } = useQuery<string[], Error>({
        queryKey: ['bookmarkedIds', user?.uid],
        queryFn: ({ queryKey }) => getBookmarks(queryKey[1] as string),
        enabled: !!user?.uid,
    });

    // Mutation for adding an MCQ attempt (includes SM-2 logic & streak update)
    const addAttemptMutation = useMutation<HttpsCallableResult<{ success: boolean }>, Error, { mcqId: string; isCorrect: boolean; selectedAnswer: string | null; sessionId?: string; confidenceRating?: string }>({
        mutationFn: addAttempt,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attemptedMCQDocs', user?.uid] });
            // Invalidate user data to reflect XP/Level/Streak updates
            queryClient.invalidateQueries({ queryKey: ['userProfile', user?.uid] });
        },
        onError: (error: any) => addToast(`Failed to save attempt: ${error.message}`, "error"),
    });

    // Mutation for adding a quiz result (final score, streak bonus, etc.)
    const addQuizResultMutation = useMutation<HttpsCallableResult<{ success: boolean; id: string }>, Error, Omit<QuizResult, 'id' | 'userId' | 'quizDate'>>({
        mutationFn: addQuizResult,
        onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ['quizResults', user?.uid] }),
        onError: (error) => addToast(`Failed to save quiz results: ${error.message}`, "error"),
    });

    // Mutation for toggling bookmark status
    const toggleBookmarkMutation = useMutation<any, Error, ToggleBookmarkCallableData>({
        mutationFn: toggleBookmark,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarkedIds', user?.uid] }),
        onError: (error) => addToast(`Failed to update bookmark: ${error.message}`, "error"),
    });

    // Mutation for deleting an MCQ (admin only)
    const deleteMcqMutation = useMutation({
        mutationFn: deleteContentItem,
        onSuccess: () => {
            addToast("MCQ deleted successfully.", "success");
            queryClient.invalidateQueries({ queryKey: ['allTopics'] }); // Counts might change
            queryClient.invalidateQueries({ queryKey: ['marrowQuestionsAll'] }); // For Marrow QBank if deleted from there
            if (mcqs.length > 1) {
                // Remove the deleted MCQ from local state and advance if needed
                setMcqs(prev => prev.filter(mcq => mcq.id !== currentMcq?.id));
                // If current index is now out of bounds, go back one
                if (currentIndex >= mcqs.length - 1) {
                    setCurrentIndex(prev => Math.max(0, prev - 1));
                }
            } else {
                // If only one MCQ was left, navigate back
                navigate(-1);
            }
        },
        onError: (error) => addToast(`Error deleting MCQ: ${error.message}`, "error"),
    });

    // Mutation for getting an AI hint
    const getHintMutation = useMutation({
        mutationFn: (mcqId: string) => getHint({ mcqId }),
        onSuccess: (data) => setHintText(data.data.hint),
        onError: (error: any) => addToast(`Failed to get hint: ${error.message}`, "error"),
    });

    // Mutation for evaluating free text answer (Active Recall)
    const evaluateFreeTextAnswerMutation = useMutation<HttpsCallableResult<{ isCorrect: boolean, feedback: string }>, Error, { mcqId: string, userAnswer: string }>({
        mutationFn: (data) => evaluateFreeTextAnswer(data),
        onSuccess: (data) => {
            setActiveRecallIsCorrect(data.data?.isCorrect || false);
            setActiveRecallFeedback(data.data?.feedback || null);
            addToast((data.data?.isCorrect ? "Correct! Well done." : "Not quite. Review the feedback."), (data.data?.isCorrect ? "success" : "warning"));
        },
        onError: (error: any) => {
            addToast(`Failed to evaluate answer: ${error.message}`, "error");
            setActiveRecallIsCorrect(null);
            setActiveRecallFeedback(null);
        },
    });

    // NEW FEATURE: Create Flashcard from MCQ (Feature #4.3)
    const createFlashcardFromMcqMutation = useMutation({
        mutationFn: (mcqId: string) => import('@/services/aiService').then(mod => mod.createFlashcardFromMcq({ mcqId })), // Dynamically import to avoid circular dependency
        onSuccess: (data) => {
            addToast(data.data.message || "Flashcard created successfully!", "success");
            queryClient.invalidateQueries({ queryKey: ['allTopics'] }); // Flashcard count might update on chapter/topic
            queryClient.invalidateQueries({ queryKey: ['chapterContent'] }); // Current chapter's content might update
        },
        onError: (error: any) => addToast(`Failed to create flashcard: ${error.message}`, "error"),
    });


    const currentMcq = useMemo(() => mcqs[currentIndex], [mcqs, currentIndex]);

    // FIX: Define goToQuestion first, as it's a dependency for other callbacks and effects
    const goToQuestion = useCallback((index: number) => {
        if (index >= 0 && index < mcqs.length) {
            setCurrentIndex(index);
            // Show explanation if already answered OR in immediate feedback modes
            setShowExplanation(answers[index] != null || mode === 'practice' || mode === 'incorrect' || mode === 'daily_grind');
            setHintText(null); // Clear hint when navigating
            setShowActiveRecallInput(false); // Hide active recall input
            setUserFreeTextAnswer('');
            setActiveRecallFeedback(null);
            setActiveRecallIsCorrect(null);
            setQuizModeSelectedAnswer(answers[index]); // Restore selected answer for quiz mode
        }
    }, [mcqs.length, mode, answers]); // Dependencies for goToQuestion

    // FIX: Define finishSession next, as goToNextQuestion depends on it
    const finishSession = useCallback(async () => {
        if (isFinished || !user || !currentSession) return;
        setIsFinished(true); // Prevent re-submission

        const results: QuizResult['mcqAttempts'] = mcqs.map((mcq, index) => {
            const selectedAnswer = answers[index] || null;
            const isCorrect = selectedAnswer === getCorrectAnswerText(mcq);
            return { mcqId: mcq.id, isCorrect, selectedAnswer, correctAnswer: getCorrectAnswerText(mcq) };
        });

        const score = results.filter(r => r.isCorrect).length;
        const quizResultPayload: Omit<QuizResult, 'id' | 'userId' | 'quizDate'> = {
            sessionId: currentSession.id,
            mode: mode,
            totalQuestions: mcqs.length,
            score,
            mcqAttempts: results,
        };

        addQuizResultMutation.mutate(quizResultPayload, {
            onSuccess: async (data) => {
                const newQuizResultId = data.data.id;
                await SessionManager.updateSession(currentSession.id, { isFinished: true });
                navigate(`/results/${newQuizResultId}`, { state: { quizResultId: newQuizResultId, mcqs }, replace: true });
            },
            onError: (error) => {
                addToast(`Failed to save quiz results: ${error.message || "Unknown error"}`, "error");
                SessionManager.updateSession(currentSession.id, { isFinished: true });
            }
        });
    }, [isFinished, user, currentSession, mode, mcqs, answers, addQuizResultMutation, navigate, addToast]); // Dependencies for finishSession

    // FIX: Define goToNextQuestion now that finishSession is declared
    const goToNextQuestion = useCallback(() => {
        if (currentIndex < mcqs.length - 1) {
            goToQuestion(currentIndex + 1);
        } else {
            finishSession(); // End session if it's the last question
        }
    }, [currentIndex, mcqs.length, goToQuestion, finishSession]); // Correct dependency order

    // Handle user selecting an option (for MCQ modes only)
    const handleSelectOption = useCallback(async (option: string) => {
        if (!currentMcq || !currentSession || answers[currentIndex] != null) return; // Prevent re-answering
        
        const isCorrect = option === getCorrectAnswerText(currentMcq);
        const newAnswers = { ...answers, [currentIndex]: option };
        setAnswers(newAnswers); // Update local state immediately

        // Record attempt to backend
        await addAttemptMutation.mutateAsync({
            mcqId: currentMcq.id,
            isCorrect: isCorrect,
            selectedAnswer: option,
            sessionId: currentSession.id,
            // confidenceRating will be prompted later in practice/review modes
        });

        // Update current session index
        const updatedIndex = currentIndex; // No auto-advance here
        await SessionManager.updateSession(currentSession.id, { answers: newAnswers, currentIndex: updatedIndex }); // Persist session state

        if (mode === 'quiz' || mode === 'mock') {
            setQuizModeSelectedAnswer(option); // Store selection for potential reveal
            setShowExplanation(false); // In quiz/mock mode, explanation is hidden until manually revealed or quiz end
            // Do NOT auto-advance here. User clicks 'Next' or 'Reveal Answer'.
        } else { // Practice, Incorrect, Daily Grind modes: show feedback immediately
            setShowExplanation(true);
        }
    }, [currentMcq, currentSession, currentIndex, answers, addAttemptMutation, mode]);


    // Handle confidence rating for Practice/Incorrect/Daily Grind modes (Feature #4.2)
    const handleConfidenceRating = useCallback(async (rating: 'again' | 'hard' | 'good' | 'easy') => {
        if (!currentMcq || !currentSession || answers[currentIndex] === null) return; // Must have an answer to rate

        // Re-send attempt with confidence rating
        await addAttemptMutation.mutateAsync({
            mcqId: currentMcq.id,
            isCorrect: answers[currentIndex] === getCorrectAnswerText(currentMcq), // Use the recorded answer's correctness
            selectedAnswer: answers[currentIndex],
            sessionId: currentSession.id,
            confidenceRating: rating, // Send the confidence rating
        });
        addToast("Attempt recorded with rating.", "info", 1500);
        goToNextQuestion(); // Advance to next question after rating
    }, [currentMcq, currentSession, currentIndex, answers, addAttemptMutation, addToast, goToNextQuestion]);

    // Handle deleting current MCQ (Admin only)
    const handleDelete = useCallback(() => {
        if (!user?.isAdmin || !currentMcq) return;
        const collectionName: 'MasterMCQ' | 'MarrowMCQ' = currentMcq.source?.startsWith("Marrow") ? 'MarrowMCQ' : 'MasterMCQ';
        deleteMcqMutation.mutate({ id: currentMcq.id, type: 'mcq', collectionName });
        setIsDeleteModalOpen(false); // Close modal after action
    }, [user, currentMcq, deleteMcqMutation]);

    // Handle toggling bookmark status
    const handleToggleBookmark = useCallback(() => {
        if (currentMcq) toggleBookmarkMutation.mutate({ contentId: currentMcq.id, contentType: 'mcq' });
    }, [currentMcq, toggleBookmarkMutation]);

    // Handle getting AI hint
    const handleGetHint = useCallback(() => {
        if (currentMcq) {
            setHintText(null); // Clear previous hint
            getHintMutation.mutate(currentMcq.id);
        }
    }, [currentMcq, getHintMutation]);

    // Handle Active Recall / Free Text answer submission (Feature #4.1)
    const handleFreeTextSubmit = useCallback(async () => {
        if (!currentMcq || !userFreeTextAnswer.trim() || evaluateFreeTextAnswerMutation.isPending) return;

        evaluateFreeTextAnswerMutation.mutate({ mcqId: currentMcq.id, userAnswer: userFreeTextAnswer });

        // For active recall, we might not save a formal "attempt"
        // unless the evaluation leads to a confidence rating system for free text too.
        // For now, it's just feedback.
    }, [currentMcq, userFreeTextAnswer, evaluateFreeTextAnswerMutation]);

    // Handle Create Flashcard from MCQ (Feature #4.3)
    const handleCreateFlashcard = useCallback(() => {
        if (!user?.isAdmin || !currentMcq) {
            addToast("You must be an admin to create flashcards.", "error");
            return;
        }
        createFlashcardFromMcqMutation.mutate(currentMcq.id);
    }, [user, currentMcq, createFlashcardFromMcqMutation, addToast]);


    // Navigation functions (goToQuestion is now declared above)
    const goToPreviousQuestion = useCallback(() => {
        goToQuestion(currentIndex - 1);
    }, [currentIndex, goToQuestion]);


    // Effect to load or create session when component mounts/parameters change
    useEffect(() => {
        const loadSession = async () => {
            if (!user?.uid || !sessionId) {
                addToast("User not authenticated or session ID missing.", "error");
                navigate('/auth', { replace: true }); // Redirect if not authenticated or no session ID
                return;
            }

            let loadedSession = await SessionManager.getSession(sessionId, user.uid);

            if (!loadedSession || loadedSession.isFinished) {
                // If no session found or it's already finished, create a new one based on passed state
                const mcqIdsToLoad = locationState.generatedMcqIds || [];
                const flashcardIdsToLoad = locationState.generatedFlashcardIds || []; // For future mixed sessions

                if (mcqIdsToLoad.length === 0 && flashcardIdsToLoad.length === 0) {
                    addToast("No questions provided to start a new session.", "error");
                    navigate('/', { replace: true });
                    return;
                }

                // Create a new session with the generated IDs, passing both MCQ and Flashcard IDs
                const newSessionId = await SessionManager.createSession(user.uid, mode, mcqIdsToLoad, flashcardIdsToLoad);
                loadedSession = await SessionManager.getSession(newSessionId, user.uid);
                // Replace current URL with the new session ID
                navigate(`/session/${mode}/${newSessionId}`, { replace: true, state: locationState });
            }

            if (loadedSession) {
                setCurrentSession(loadedSession);
                // Fetch full MCQ objects for the loaded session's IDs
                setMcqs(await getMCQsByIds(loadedSession.mcqIds));
                setAnswers(loadedSession.answers);
                setMarkedForReview(new Set(loadedSession.markedForReview));
                setIsFinished(loadedSession.isFinished);
                // Determine initial explanation visibility based on mode or if already answered
                setShowExplanation(mode === 'practice' || mode === 'incorrect' || mode === 'daily_grind' || loadedSession.isFinished || answers[loadedSession.currentIndex] != null);
            }
        };
        loadSession();
    }, [sessionId, user?.uid, mode, navigate, locationState, addToast, answers, goToQuestion, finishSession]); // Added goToQuestion, finishSession as dependencies

    // Determine when to show feedback (correct/incorrect, explanation)
    const shouldShowFeedback = showExplanation || isFinished;

    // Destructure isLoading from the useQuery hook for activeSession
    // Note: The `queryFn` is a dummy one because the actual session loading is in the useEffect.
    // This hook is primarily to get the `isLoading` state for the loader.
    const { isLoading: isLoadingActiveSession } = useQuery<QuizSession | null, Error>({
        queryKey: ['activeSession', user?.uid, user?.activeSessionId],
        queryFn: async () => { return null; }, // Dummy queryFn, actual data is fetched in useEffect
        enabled: !!user?.uid && !!user?.activeSessionId, // Only enable if an active session is expected
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
    });


    if (!currentMcq || areAttemptsLoading || areBookmarksLoading || isLoadingActiveSession) return <Loader message="Loading session..." />;

    // Render logic for quiz vs. practice modes
    const isOptionClickable = answers[currentIndex] == null && !isFinished && !showActiveRecallInput; // Can select an option only if not answered, not finished, and not in active recall
    const correctAnswer = getCorrectAnswerText(currentMcq);
    const userSelectedAnswer = answers[currentIndex]; // The answer stored in state
    const isUserCorrect = userSelectedAnswer === correctAnswer;


    return (
        <>
            {/* Confirmation Modal for Admin Delete */}
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete} title="Delete MCQ" message="Are you sure?" variant="danger" isLoading={deleteMcqMutation.isPending} />

            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold">Q. {currentIndex + 1}/{mcqs.length} ({mode.replace(/_/g, ' ')})</h1>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && (<button onClick={() => setIsDeleteModalOpen(true)} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Delete MCQ"><TrashIcon className="h-6 w-6 text-slate-500 hover:text-red-500" /></button>)}
                        <button onClick={handleToggleBookmark} className={clsx("p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700", bookmarks?.includes(currentMcq.id) ? "text-amber-500" : "text-slate-400")} title="Toggle Bookmark">{bookmarks?.includes(currentMcq.id) ? <BookmarkSolidIcon className="h-6 w-6" /> : <BookmarkOutlineIcon className="h-6 w-6" />}</button>
                        <button onClick={handleGetHint} disabled={getHintMutation.isPending || hintText !== null} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Get Hint"><LightBulbIcon className="h-6 w-6 text-sky-500" /></button>
                        {/* Active Recall Button (Feature #4.1) - Only in practice mode for now */}
                        {mode === 'practice' && (
                            <button onClick={() => setShowActiveRecallInput(f => !f)} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Active Recall (Free Text)">
                                <PencilIcon className="h-6 w-6 text-purple-500" />
                            </button>
                        )}
                        {/* NEW FEATURE: Create Flashcard from MCQ (Feature #4.3) - Admin only */}
                        {user?.isAdmin && currentMcq && (
                            <button onClick={handleCreateFlashcard} disabled={createFlashcardFromMcqMutation.isPending} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Create Flashcard from MCQ">
                                <DocumentPlusIcon className="h-6 w-6 text-emerald-500" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Quiz Timer Bar (only for quiz/mock modes and if not finished) */}
                {(mode === 'quiz' || mode === 'mock') && currentSession && !isFinished && (
                    <QuizTimerBar
                        duration={Math.max(0, (new Date(currentSession.expiresAt as Date).getTime() - Date.now()) / 1000)}
                        onTimeUp={finishSession}
                        isPaused={isFinished}
                    />
                )}

                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6">
                    <p className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">{currentMcq.question}</p>

                    {/* Hint Display */}
                    {hintText && (
                        <div className="p-3 mb-4 bg-sky-50 dark:bg-sky-900/30 rounded-lg text-sky-800 dark:text-sky-200">
                            <span className="font-semibold">Hint:</span> {hintText}
                        </div>
                    )}

                    {/* Active Recall Input (Feature #4.1) */}
                    {showActiveRecallInput && mode === 'practice' ? (
                        <div className="space-y-3">
                            <textarea
                                value={userFreeTextAnswer}
                                onChange={(e) => setUserFreeTextAnswer(e.target.value)}
                                placeholder="Type your answer here..."
                                className="input-field h-32 resize-y"
                                disabled={evaluateFreeTextAnswerMutation.isPending || activeRecallFeedback !== null}
                            ></textarea>
                            <button
                                onClick={handleFreeTextSubmit}
                                disabled={!userFreeTextAnswer.trim() || evaluateFreeTextAnswerMutation.isPending || activeRecallFeedback !== null}
                                className="btn-secondary w-full"
                            >
                                {evaluateFreeTextAnswerMutation.isPending ? 'Evaluating...' : 'Submit Answer'}
                            </button>

                            {activeRecallFeedback && (
                                <div className={clsx("p-3 rounded-lg mt-3", activeRecallIsCorrect ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300")}>
                                    <h3 className="font-bold mb-1">Feedback:</h3>
                                    <p>{activeRecallFeedback}</p>
                                    <button
                                        onClick={() => setShowExplanation(true)} // Allow revealing the correct answer
                                        className="mt-2 text-sm text-sky-600 dark:text-sky-400 hover:underline"
                                    >
                                        Reveal Correct Answer & Explanation
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        // Standard MCQ options
                        <div className="space-y-3">
                            {currentMcq.options.map((option, idx) => {
                                const isSelected = (mode === 'quiz' || mode === 'mock') ? quizModeSelectedAnswer === option : userSelectedAnswer === option;
                                const isCorrectOption = option === getCorrectAnswerText(currentMcq);

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectOption(option)}
                                        disabled={!isOptionClickable} // Only clickable if not answered and not in active recall
                                        className={clsx(
                                            "w-full text-left p-4 rounded-lg transition-colors duration-150",
                                            "flex items-start", // To align options text correctly
                                            !isOptionClickable && "cursor-not-allowed", // Make disabled state clear
                                            shouldShowFeedback && isCorrectOption ? "bg-green-100 dark:bg-green-900/30" : // Correct answer highlight
                                            (shouldShowFeedback && isSelected && !isCorrectOption ? "bg-red-100 dark:bg-red-900/30" : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600") // Unanswered/other options
                                        )}
                                    >
                                        <span className="font-bold mr-3 min-w-[1.2em]">{String.fromCharCode(65 + idx)}.</span>
                                        <span className="flex-1">{option}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}


                    {/* Explanation Display */}
                    {shouldShowFeedback && currentMcq.explanation && (
                        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg text-slate-800 dark:text-slate-200">
                            <h3 className="font-bold text-lg mb-2">Explanation</h3>
                            <p className="mt-2 prose dark:prose-invert max-w-none">{currentMcq.explanation}</p>
                        </div>
                    )}
                </div>

                {/* Navigation and Actions */}
                <div className="flex justify-between items-center mt-6">
                    <button onClick={goToPreviousQuestion} disabled={currentIndex === 0} className="btn-neutral">Previous</button>

                    {/* Quiz/Mock mode: "Reveal Answer" button */}
                    {(mode === 'quiz' || mode === 'mock') && answers[currentIndex] !== null && !isFinished && !shouldShowFeedback && (
                        <button onClick={() => setShowExplanation(true)} className="btn-secondary">Reveal Answer</button>
                    )}

                    {/* Confidence Rating Buttons (Feature #4.2) - Only for Practice/Incorrect/Daily Grind if answered and feedback shown */}
                    {(mode === 'practice' || mode === 'incorrect' || mode === 'daily_grind') && answers[currentIndex] !== null && shouldShowFeedback && (
                        <div className="flex justify-center space-x-2">
                            <button onClick={() => handleConfidenceRating('again')} className="btn-danger text-sm">Again</button>
                            <button onClick={() => handleConfidenceRating('hard')} className="btn-warning text-sm">Hard</button>
                            <button onClick={() => handleConfidenceRating('good')} className="btn-secondary text-sm">Good</button>
                            <button onClick={() => handleConfidenceRating('easy')} className="btn-success text-sm">Easy</button>
                        </div>
                    )}

                    {/* Next/Finish Button */}
                    <button
                        onClick={goToNextQuestion}
                        className={clsx(
                            "btn-primary",
                            // In quiz/mock mode, enable Next only after answer revealed or if no answer yet (can skip)
                            ((mode === 'quiz' || mode === 'mock') && !shouldShowFeedback && answers[currentIndex] !== null) ? "opacity-50 cursor-not-allowed" : ""
                        )}
                        // Disable if answered but not revealed in quiz/mock mode, or if active recall is active
                        disabled={((mode === 'quiz' || mode === 'mock') && answers[currentIndex] !== null && !shouldShowFeedback && !isFinished) || showActiveRecallInput}
                    >
                        {currentIndex === mcqs.length - 1 ? 'Finish' : 'Next'}
                    </button>
                </div>

                {/* Question Navigator */}
                <QuestionNavigator
                    count={mcqs.length}
                    currentIndex={currentIndex}
                    answers={answers}
                    marked={markedForReview}
                    mcqs={mcqs}
                    goToQuestion={goToQuestion}
                    mode={mode}
                    isFinished={isFinished}
                />
            </div>
        </>
    );
};

export default MCQSessionPage;