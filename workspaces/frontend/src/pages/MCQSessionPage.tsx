// --- CORRECTED FILE: workspaces/frontend/src/pages/MCQSessionPage.tsx ---

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions'; // FIX: Correct import path
import { useAuth } from '@/contexts/AuthContext';
import { SessionManager, QuizSession, getMcqsByIds } from '@/services/sessionService';
import { addAttempt, addQuizResult, toggleBookmark, getBookmarks, deleteContentItem } from '@/services/userDataService';
// FIX: Use relative import for types to bypass potential module resolution issues
import { MCQ, QuizResult, AttemptedMCQs, ToggleBookmarkCallableData, DeleteContentItemCallableData } from '../../types/src';
import { BookmarkIcon, TrashIcon } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import Loader from '@/components/Loader';
import QuizTimerBar from '@/components/QuizTimerBar';
import QuizResultsPage from '@/components/QuizResultsPage';
import ConfirmationModal from '@/components/ConfirmationModal';
import clsx from 'clsx';

type SessionMode = 'practice' | 'quiz' | 'mock' | 'custom' | 'weakness' | 'incorrect';

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
    const { mode: rawMode, sessionId } = useParams<{ mode?: SessionMode; sessionId?: string; }>();
    const mode = rawMode || 'practice';
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    
    const [sessionState, setSessionState] = useState<QuizSession | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    const mcqIds = useMemo(() => sessionState?.mcqIds || [], [sessionState]);
    const currentIndex = useMemo(() => sessionState?.currentIndex || 0, [sessionState]);
    const answers = useMemo(() => sessionState?.answers || {}, [sessionState]);
    const markedForReview = useMemo(() => new Set(sessionState?.markedForReview || []), [sessionState]);
    const isFinished = useMemo(() => sessionState?.isFinished || false, [sessionState]);

    const { data: mcqs, isLoading: isLoadingMcqs } = useQuery<MCQ[]>({
        queryKey: ['sessionMcqs', sessionId],
        queryFn: () => getMcqsByIds(mcqIds),
        enabled: !!sessionId && mcqIds.length > 0,
    });

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

    const currentMcq = useMemo(() => mcqs?.[currentIndex], [mcqs, currentIndex]);
    const isQuizMode = useMemo(() => mode !== 'practice' && mode !== 'incorrect', [mode]);
    const showAnswer = useMemo(() => !isQuizMode || isFinished, [isQuizMode, isFinished]);
    
    const { data: bookmarks } = useQuery<string[]>({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        initialData: [],
    });
    const isBookmarked = useMemo(() => !!(bookmarks && currentMcq && bookmarks.includes(currentMcq.id)), [bookmarks, currentMcq]);

    const addAttemptMutation = useMutation<HttpsCallableResult<any>, Error, { mcqId: string; isCorrect: boolean }>({
        mutationFn: addAttempt,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attemptedMCQs', user?.uid] }),
    });

    const addQuizResultMutation = useMutation<HttpsCallableResult<any>, Error, Omit<QuizResult, 'id' | 'userId' | 'date'>>({
        mutationFn: addQuizResult,
    });

    const toggleBookmarkMutation = useMutation<HttpsCallableResult<any>, Error, ToggleBookmarkCallableData>({
        mutationFn: toggleBookmark,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] }),
    });


    const handleSelectOption = useCallback((option: string) => {
        if (answers[currentIndex] != null && !isQuizMode) return;
        if (!currentMcq) return;

        const correctAnswerText = getCorrectAnswerText(currentMcq);
        const wasCorrect = option === correctAnswerText;

        updateSessionState({ answers: { ...answers, [currentIndex]: option } });
        
        if (user) {
            addAttemptMutation.mutate({ mcqId: currentMcq.id, isCorrect: wasCorrect });
        }
        
        if (isQuizMode && currentIndex < (mcqs?.length || 0) - 1) {
            setTimeout(() => updateSessionState({ currentIndex: currentIndex + 1 }), 300);
        }
    }, [answers, currentIndex, currentMcq, user, isQuizMode, mcqs?.length, addAttemptMutation, updateSessionState]);

    const finishSession = useCallback(() => {
        if (isFinished || !user || !mcqs) return;
        updateSessionState({ isFinished: true });
        if (sessionId) SessionManager.deleteSession(sessionId);

        if (isQuizMode) {
            const results: QuizResult['results'] = mcqs.map((mcq, index) => {
                const selectedAnswer = answers[index] || null;
                const correctAnswerText = getCorrectAnswerText(mcq);
                const isCorrect = selectedAnswer === correctAnswerText;
                return { mcqId: mcq.id, isCorrect, selectedAnswer, correctAnswer: correctAnswerText };
            });

            const score = results.filter((r: { isCorrect: boolean; }) => r.isCorrect).length;
            const quizResultPayload = {
                results, score, totalQuestions: mcqs.length,
                source: mode || 'unknown', chapterId: mcqs[0]?.chapterId,
            };

            addQuizResultMutation.mutate(quizResultPayload, {
                onSuccess: (data) => {
                    const newQuizResultId = data.data.id;
                    const resultWithPenalty = { 
                        ...quizResultPayload, 
                        id: newQuizResultId, 
                        scoreWithPenalty: results.reduce((acc: number, r: { isCorrect: boolean; selectedAnswer: string | null; }) => r.isCorrect ? acc + 4 : r.selectedAnswer !== null ? acc - 1 : acc, 0),
                        results 
                    };
                    navigate(location.pathname + '/results', { state: { result: resultWithPenalty, mcqs }, replace: true });
                    addToast("Quiz submitted! Review your answers.", "success");
                },
                onError: (error) => {
                    addToast(`Failed to save quiz results: ${(error as Error).message}`, "error");
                    const resultWithPenalty = { 
                        ...quizResultPayload, 
                        scoreWithPenalty: results.reduce((acc: number, r: { isCorrect: boolean; selectedAnswer: string | null; }) => r.isCorrect ? acc + 4 : r.selectedAnswer !== null ? acc - 1 : acc, 0), 
                        results 
                    };
                    navigate(location.pathname + '/results', { state: { result: resultWithPenalty, mcqs }, replace: true });
                }
            });
        } else {
            addToast("Session complete!", "info");
            navigate(`/chapters/${currentMcq?.topicId}/${currentMcq?.chapterId}`);
        }
    }, [isFinished, user, isQuizMode, mcqs, answers, addQuizResultMutation, mode, sessionId, addToast, navigate, currentMcq, updateSessionState, location.pathname]);
    
    const handleDelete = () => {
        if (!user?.isAdmin || !currentMcq) return;
        const collectionName: 'MasterMCQ' | 'MarrowMCQ' = currentMcq.source?.toLowerCase().includes('marrow') ? 'MarrowMCQ' : 'MasterMCQ';
        deleteMcqMutation.mutate({ id: currentMcq.id, type: 'mcq', collectionName });
        setIsDeleteModalOpen(false);
    };

    const deleteMcqMutation = useMutation<HttpsCallableResult<any>, Error, DeleteContentItemCallableData>({
        mutationFn: deleteContentItem,
        onSuccess: () => {
            addToast("MCQ deleted successfully.", "success");
            queryClient.invalidateQueries({ queryKey: ['topics'] });
            queryClient.invalidateQueries({ queryKey: ['chapterContent', currentMcq?.chapterId] });
            if (mcqs && mcqs.length > 1) {
                setSessionState(prev => prev ? { ...prev, mcqIds: prev.mcqIds.filter(id => id !== currentMcq?.id) } : null);
                setCurrentIndex(prev => (prev >= (mcqs?.length || 0) - 1 ? 0 : prev));
            } else {
                navigate(-1);
            }
        },
        onError: (error) => addToast(`Error deleting MCQ: ${error.message}`, "error"),
    });

    const handleToggleBookmark = () => { if (currentMcq) toggleBookmarkMutation.mutate({ contentId: currentMcq.id, contentType: 'mcq' }); };

    const goToQuestion = (index: number) => { if (index >= 0 && index < (mcqs?.length || 0)) { updateSessionState({ currentIndex: index }); } };
    const handleNext = () => (currentIndex < (mcqs?.length || 0) - 1) ? goToQuestion(currentIndex + 1) : finishSession();
    const handlePrevious = () => goToQuestion(currentIndex - 1); // FIX: Should be currentIndex -1
    const toggleMarkForReview = useCallback(() => {
        setMarkedForReview(prev => { 
            const newSet = new Set(prev); 
            newSet.has(currentIndex) ? newSet.delete(currentIndex) : newSet.add(currentIndex);
            updateSessionState({ markedForReview: Array.from(newSet) }); // FIX: Use the updated set
            return newSet; 
        });
    }, [currentIndex, updateSessionState]); // FIX: Removed markedForReview from dependencies to avoid stale closure (it's from 'prev' anyway)


    const finalResult = useMemo(() => {
        if (!location.pathname.endsWith('/results')) return null;
        
        const resultFromState = location.state?.result as QuizResult & { scoreWithPenalty: number };
        if (!resultFromState) return null;

        const scoreWithPenalty = resultFromState.scoreWithPenalty ?? resultFromState.results.reduce((acc: number, r: { isCorrect: boolean; selectedAnswer: string | null; }) => {
            if (r.selectedAnswer === null) return acc;
            return r.isCorrect ? acc + 4 : acc - 1;
        }, 0);

        return { ...resultFromState, scoreWithPenalty };
    }, [location.pathname, location.state]);

    if (!sessionState || isLoadingMcqs || !mcqs) return <Loader message="Loading Session..." />;
    
    if (finalResult) {
        return <QuizResultsPage result={finalResult} mcqs={mcqs} onReview={() => navigate(-1)} />;
    }
    
    if (mcqs.length === 0) {
        return <div className="text-center p-10"><p>No questions found for this session.</p><button onClick={() => navigate('/')} className="btn-primary mt-4">Go Home</button></div>;
    }
    if (!currentMcq) return <Loader message="Loading question..." />;

    const optionsArray = Array.isArray(currentMcq.options) ? currentMcq.options : [];

    return (
        <>
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete} title="Delete MCQ" message="Are you sure you want to permanently delete this question?" confirmText="Delete" variant="danger" isLoading={deleteMcqMutation.isPending}/>
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold capitalize">Q. {currentIndex + 1}/{(mcqs || []).length} ({mode?.replace(/_/g,' ')})</h1>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && (<button onClick={() => setIsDeleteModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-red-500" title="Delete MCQ"><TrashIcon /></button>)}
                        <button onClick={handleToggleBookmark} className={clsx("p-2 rounded-full", isBookmarked ? "text-amber-500 bg-amber-100 dark:bg-amber-800/50" : "text-slate-400 hover:text-amber-400")}><BookmarkIcon filled={isBookmarked} /></button>
                    </div>
                </div>
                {isQuizMode && <QuizTimerBar key={currentIndex} duration={60} onTimeUp={handleNext} isPaused={isFinished} />}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6">
                    <p className="text-lg font-semibold mb-4 whitespace-pre-wrap">{currentMcq.question}</p>
                    <div className="space-y-3">
                        {optionsArray.map((option: string, idx: number) => {
                            const isSelected = option === answers[currentIndex];
                            const correctAnswerText = getCorrectAnswerText(currentMcq);
                            let style = "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600";
                            
                            if (showAnswer && answers[currentIndex] != null) {
                                if (option === correctAnswerText) {
                                    style = "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 ring-2 ring-green-500";
                                } else if (isSelected) {
                                    style = "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 ring-2 ring-red-500";
                                }
                            } else if (isSelected) {
                                style = "bg-sky-200 dark:bg-sky-800 ring-2 ring-sky-500";
                            }
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
                    <button onClick={handlePrevious} disabled={currentIndex === 0} className="px-6 py-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600">Previous</button>
                    {isQuizMode && <button onClick={toggleMarkForReview} className={clsx("px-4 py-2 rounded-md font-semibold", markedForReview.has(currentIndex) ? 'bg-purple-500 text-white' : 'bg-slate-200 dark:bg-slate-700')}>{markedForReview.has(currentIndex) ? 'Unmark' : 'Mark Review'}</button>}
                    <button onClick={handleNext} className="px-6 py-2 rounded-md bg-sky-500 text-white hover:bg-sky-600">{currentIndex === (mcqs || []).length - 1 && !isFinished && isQuizMode ? "Submit Quiz" : (currentIndex === (mcqs || []).length - 1 ? "Finish" : "Next")}</button>
                </div>
                
                <QuestionNavigator count={(mcqs || []).length} currentIndex={currentIndex} answers={answers} marked={markedForReview} mcqs={mcqs || []} goToQuestion={(i: number) => updateSessionState({currentIndex: i})} mode={mode!} isFinished={isFinished} />
            </div>
        </>
    );
};

export default MCQSessionPage;