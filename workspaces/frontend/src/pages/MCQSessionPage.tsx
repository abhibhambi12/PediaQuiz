// --- CORRECTED FILE: workspaces/frontend/src/pages/MCQSessionPage.tsx ---

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from "@/contexts/AuthContext";
import { SessionManager, QuizSession, getMcqsByIds } from "@/services/sessionService";
import { addAttempt, addQuizResult, toggleBookmark, getBookmarks, deleteContentItem } from "@/services/userDataService";
import { MCQ, QuizResult, AttemptedMCQs, ToggleBookmarkCallableData, DeleteContentItemCallableData } from "@pediaquiz/types";
import { BookmarkIcon, TrashIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import Loader from "@/components/Loader";
import QuizTimerBar from "@/components/QuizTimerBar";
import QuizResultsPage from "@/components/QuizResultsPage";
import ConfirmationModal from "@/components/ConfirmationModal";
import clsx from 'clsx';
import { useSound } from "@/hooks/useSound";

// (QuestionNavigator and getCorrectAnswerText components remain the same as provided)

const getCorrectAnswerText = (mcq: MCQ | undefined): string => {
    if (!mcq || !Array.isArray(mcq.options) || mcq.options.length === 0) return "";
    if (mcq.answer && mcq.answer.length === 1 && mcq.answer >= 'A' && mcq.answer <= 'D') {
        const correctIndex = mcq.answer.charCodeAt(0) - 'A'.charCodeAt(0);
        if (correctIndex >= 0 && correctIndex < mcq.options.length) {
            return mcq.options[correctIndex];
        }
    }
    return mcq.answer;
};

const QuestionNavigator: React.FC<{
    count: number; currentIndex: number; answers: Record<number, string | null>; marked: Set<number>;
    mcqs: MCQ[]; goToQuestion: (index: number) => void; mode: QuizSession['mode']; isFinished: boolean;
}> = ({ count, currentIndex, answers, marked, mcqs, goToQuestion, mode, isFinished }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getButtonColor = (i: number) => {
        const answer = answers[i];
        const mcq = mcqs[i];
        if (answer !== undefined && answer !== null && mcq) {
            const correctAnswerText = getCorrectAnswerText(mcq);
            if (isFinished || mode === 'practice' || mode === 'incorrect') {
                return answer === correctAnswerText ? "bg-green-500 text-white" : "bg-red-500 text-white";
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
                    {Array.from({ length: count }, (_, i) => {
                        const colorClass = getButtonColor(i);
                        const isCurrent = i === currentIndex && !isFinished ? "ring-2 ring-offset-2 dark:ring-offset-slate-800 ring-blue-500" : "";
                        const isMarked = marked.has(i) && !isFinished ? "ring-2 ring-purple-500" : "";
                        return (
                            <button key={i} onClick={() => goToQuestion(i)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm", colorClass, isCurrent, isMarked)}>
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
    const { mode, sessionId } = useParams<{ mode: QuizSession['mode']; sessionId: string; }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const { playSound } = useSound();

    const [sessionState, setSessionState] = useState<QuizSession | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // --- State derived from sessionState for UI ---
    const mcqIds = useMemo(() => sessionState?.mcqIds || [], [sessionState]);
    const currentIndex = useMemo(() => sessionState?.currentIndex || 0, [sessionState]);
    const answers = useMemo(() => sessionState?.answers || {}, [sessionState]);
    const markedForReview = useMemo(() => new Set(sessionState?.markedForReview || []), [sessionState]);
    const isFinished = useMemo(() => sessionState?.isFinished || false, [sessionState]);

    // --- Fetch MCQs based on IDs from the session ---
    const { data: mcqs, isLoading: isLoadingMcqs } = useQuery<MCQ[]>({
        queryKey: ['sessionMcqs', sessionId],
        queryFn: () => getMcqsByIds(mcqIds),
        enabled: !!sessionId && mcqIds.length > 0,
    });

    // --- Fetch session data on initial load ---
    useEffect(() => {
        if (sessionId && user?.uid) {
            SessionManager.getSession(sessionId, user.uid).then(session => {
                if (session) {
                    setSessionState(session);
                } else {
                    addToast("Session not found or has expired.", "error");
                    navigate('/');
                }
            });
        }
    }, [sessionId, user?.uid, navigate, addToast]);

    // --- Persist session state changes to Firestore ---
    const updateSessionMutation = useMutation({
        mutationFn: (updates: Partial<QuizSession>) => {
            if (!sessionId) return Promise.reject("No session ID");
            return SessionManager.updateSession(sessionId, updates);
        },
        onError: () => addToast("Failed to sync session. Please check your connection.", "error"),
    });

    const updateSessionState = useCallback((updates: Partial<QuizSession>) => {
        setSessionState(prev => prev ? { ...prev, ...updates } : null);
        updateSessionMutation.mutate(updates);
    }, [updateSessionMutation]);

    // --- Core Session Logic ---
    const currentMcq = useMemo(() => mcqs?.[currentIndex], [mcqs, currentIndex]);
    const isQuizMode = useMemo(() => mode !== 'practice' && mode !== 'incorrect', [mode]);
    const showAnswer = useMemo(() => !isQuizMode || isFinished, [isQuizMode, isFinished]);
    
    const { data: bookmarks } = useQuery<string[]>({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
    });
    const isBookmarked = useMemo(() => !!(bookmarks && currentMcq && bookmarks.includes(currentMcq.id)), [bookmarks, currentMcq]);

    const addAttemptMutation = useMutation<HttpsCallableResult<{ success: boolean }>, Error, { mcqId: string; isCorrect: boolean }>({
        mutationFn: addAttempt,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attemptedMCQs', user?.uid] }),
    });
    
    const addQuizResultMutation = useMutation<HttpsCallableResult<{ success: boolean; id: string }>, Error, Omit<QuizResult, 'id' | 'userId' | 'date'>>({
        mutationFn: addQuizResult,
    });

    const handleSelectOption = useCallback((option: string) => {
        if (answers[currentIndex] != null && !isQuizMode) return;
        if (!currentMcq || !user) return;
        playSound(option === getCorrectAnswerText(currentMcq) ? 'correct' : 'incorrect');
        
        const wasCorrect = option === getCorrectAnswerText(currentMcq);
        updateSessionState({ answers: { ...answers, [currentIndex]: option } });
        addAttemptMutation.mutate({ mcqId: currentMcq.id, isCorrect: wasCorrect });
        
        if (isQuizMode && currentIndex < (mcqs?.length || 0) - 1) {
            setTimeout(() => updateSessionState({ currentIndex: currentIndex + 1 }), 400);
        }
    }, [answers, currentIndex, currentMcq, user, isQuizMode, mcqs, addAttemptMutation, playSound, updateSessionState]);

    const finishSession = useCallback(async () => {
        if (isFinished || !user || !mcqs) return;
        playSound('notification');
        updateSessionState({ isFinished: true });
        if (sessionId) SessionManager.deleteSession(sessionId);

        if (isQuizMode) {
            const results: QuizResult['results'] = mcqs.map((mcq, index) => {
                const selectedAnswer = answers[index] || null;
                const correctAnswerText = getCorrectAnswerText(mcq);
                return { mcqId: mcq.id, isCorrect: selectedAnswer === correctAnswerText, selectedAnswer, correctAnswer: correctAnswerText };
            });
            const score = results.filter(r => r.isCorrect).length;
            const quizResultPayload = { results, score, totalQuestions: mcqs.length, source: mode || 'unknown', chapterId: mcqs[0]?.chapterId };
            
            try {
                const data = await addQuizResultMutation.mutateAsync(quizResultPayload);
                const resultId = data.data.id;
                const resultForNav = { ...quizResultPayload, id: resultId, scoreWithPenalty: results.reduce((acc, r) => r.isCorrect ? acc + 4 : r.selectedAnswer !== null ? acc - 1 : acc, 0) };
                navigate(location.pathname + '/results', { state: { result: resultForNav, mcqs }, replace: true });
            } catch (error) {
                 addToast(`Failed to save quiz results: ${(error as Error).message}`, "error");
                 navigate(`/chapters/${currentMcq?.topicId}/${currentMcq?.chapterId}`);
            }
        } else {
            addToast("Session complete!", "info");
            navigate(`/chapters/${currentMcq?.topicId}/${currentMcq?.chapterId}`);
        }
    }, [isFinished, user, isQuizMode, mcqs, answers, addQuizResultMutation, mode, addToast, navigate, currentMcq, updateSessionState, sessionId, playSound, location.pathname]);
    
    const handleNext = () => {
        playSound('buttonClick');
        if (currentIndex < (mcqs?.length || 0) - 1) {
            updateSessionState({ currentIndex: currentIndex + 1 });
        } else {
            finishSession();
        }
    };
    const handlePrevious = () => {
        playSound('buttonClick');
        if (currentIndex > 0) updateSessionState({ currentIndex: currentIndex - 1 });
    };

    const toggleMarkForReview = useCallback(() => {
        playSound('buttonClick');
        const newMarkedSet = new Set(markedForReview);
        newMarkedSet.has(currentIndex) ? newMarkedSet.delete(currentIndex) : newMarkedSet.add(currentIndex);
        updateSessionState({ markedForReview: Array.from(newMarkedSet) });
    }, [currentIndex, markedForReview, updateSessionState, playSound]);

    const finalResultState = location.state as { result: QuizResult & { scoreWithPenalty: number }, mcqs: MCQ[] } | undefined;

    if (!sessionState || isLoadingMcqs) return <Loader message="Loading Session..." />;
    if (finalResultState?.result) return <QuizResultsPage result={finalResultState.result} mcqs={finalResultState.mcqs} onReview={() => navigate(-1)} />;
    if (!mcqs || mcqs.length === 0) return <div className="text-center p-10"><p>No questions found for this session.</p><button onClick={() => navigate('/')} className="btn-primary mt-4">Go Home</button></div>;
    if (!currentMcq) return <Loader message="Loading question..." />;

    const optionsArray = Array.isArray(currentMcq.options) ? currentMcq.options : [];

    return (
        <>
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={() => {}} title="Delete MCQ" message="Are you sure you want to permanently delete this question?" confirmText="Delete" variant="danger"/>
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold capitalize">Q. {currentIndex + 1}/{mcqs.length} ({mode?.replace(/_/g,' ')})</h1>
                </div>
                {isQuizMode && <QuizTimerBar key={currentIndex} duration={60} onTimeUp={handleNext} isPaused={isFinished} />}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-lg font-semibold whitespace-pre-wrap flex-1">{currentMcq.question}</p>
                        <div className="flex items-center space-x-2 ml-4">
                            {user?.isAdmin && (<button onClick={() => setIsDeleteModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-red-500" title="Delete MCQ"><TrashIcon /></button>)}
                            <button onClick={() => toggleBookmarkMutation.mutate({ contentId: currentMcq.id, contentType: 'mcq' })} className={clsx("p-2 rounded-full", isBookmarked ? "text-amber-500 bg-amber-100 dark:bg-amber-800/50" : "text-slate-400 hover:text-amber-400")}><BookmarkIcon filled={isBookmarked} /></button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {optionsArray.map((option, idx) => {
                            const isSelected = option === answers[currentIndex];
                            const correctAnswerText = getCorrectAnswerText(currentMcq);
                            let style = "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600";
                            
                            if (showAnswer && answers[currentIndex] != null) {
                                if (option === correctAnswerText) style = "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 ring-2 ring-green-500";
                                else if (isSelected) style = "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 ring-2 ring-red-500";
                            } else if (isSelected) style = "bg-sky-200 dark:bg-sky-800 ring-2 ring-sky-500";
                            
                            return (
                                <button key={idx} onClick={() => handleSelectOption(option)} disabled={showAnswer && answers[currentIndex] != null} className={clsx("w-full text-left p-4 rounded-lg flex items-start transition-colors disabled:cursor-not-allowed", style)}>
                                    <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span>
                                    <span>{option}</span>
                                </button>
                            );
                        })}
                    </div>
                    {showAnswer && answers[currentIndex] != null && (
                        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/40 rounded-lg animate-fade-in-down">
                            <h3 className="font-bold text-amber-800 dark:text-amber-200">Explanation</h3>
                            <p className="mt-2 whitespace-pre-wrap">{currentMcq.explanation || "No explanation provided."}</p>
                        </div>
                    )}
                </div>
                <div className="flex justify-between items-center mt-6">
                    <button onClick={handlePrevious} disabled={currentIndex === 0} className="btn-neutral">Previous</button>
                    {isQuizMode && <button onClick={toggleMarkForReview} className={clsx("px-4 py-2 rounded-md font-semibold", markedForReview.has(currentIndex) ? 'bg-purple-500 text-white' : 'bg-slate-200 dark:bg-slate-700')}>{markedForReview.has(currentIndex) ? 'Unmark' : 'Mark Review'}</button>}
                    <button onClick={handleNext} className="btn-primary">{currentIndex === mcqs.length - 1 && !isFinished && isQuizMode ? "Submit Quiz" : (currentIndex === mcqs.length - 1 ? "Finish" : "Next")}</button>
                </div>
                <QuestionNavigator count={mcqs.length} currentIndex={currentIndex} answers={answers} marked={markedForReview} mcqs={mcqs} goToQuestion={(i) => updateSessionState({currentIndex: i})} mode={mode!} isFinished={isFinished} />
            </div>
        </>
    );
};

export default MCQSessionPage;