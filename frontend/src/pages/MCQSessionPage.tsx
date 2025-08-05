// frontend/src/pages/MCQSessionPage.tsx

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { getAttemptedMCQs, addAttempt, addQuizResult, toggleBookmark, getBookmarks, deleteContentItem } from "@/services/userDataService";
import { MCQ, QuizResult, AttemptedMCQs, ToggleBookmarkCallableData, DeleteContentItemCallableData } from "@pediaquiz/types";
import { BookmarkIcon, TrashIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import Loader from "@/components/Loader";
import QuizTimerBar from "@/components/QuizTimerBar";
import QuizResultsPage from "@/components/QuizResultsPage";
import ConfirmationModal from "@/components/ConfirmationModal";

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
    mcqs: MCQ[]; goToQuestion: (index: number) => void; mode: SessionMode; isFinished: boolean;
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
                            <button key={i} onClick={() => goToQuestion(i)} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${colorClass} ${isCurrent} ${isMarked}`}>
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
    const { mode: rawMode, id } = useParams<{ mode?: SessionMode; id?: string; }>();
    const mode = rawMode || 'practice';
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { data: appData, isLoading: isAppDataLoading } = useData();
    const { addToast } = useToast();
    
    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string | null>>({});
    const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
    const [sessionStreak, setSessionStreak] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    
    const { data: attemptedMCQs } = useQuery({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });
    
    const { data: bookmarks } = useQuery({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        initialData: [],
    });

    const addAttemptMutation = useMutation<HttpsCallableResult<{ success: boolean }>, Error, { mcqId: string; isCorrect: boolean }>({
        mutationFn: addAttempt,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attemptedMCQs', user?.uid] }),
    });

    const addQuizResultMutation = useMutation<HttpsCallableResult<{ success: boolean; id: string }>, Error, Omit<QuizResult, 'id' | 'userId' | 'date'>>({
        mutationFn: addQuizResult,
    });

    const toggleBookmarkMutation = useMutation<HttpsCallableResult<{ bookmarked: boolean, bookmarks: string[] }>, Error, ToggleBookmarkCallableData>({
        mutationFn: toggleBookmark,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] }),
    });

    const deleteMcqMutation = useMutation<HttpsCallableResult<{ success: boolean; message: string }>, Error, DeleteContentItemCallableData>({
        mutationFn: deleteContentItem,
        onSuccess: () => {
            addToast("MCQ deleted successfully.", "success");
            queryClient.invalidateQueries({ queryKey: ['appData'] });
            if (mcqs.length > 1) {
                setMcqs(prev => prev.filter(mcq => mcq.id !== currentMcq?.id));
                setCurrentIndex(prev => (prev >= mcqs.length - 1 ? 0 : prev));
            } else {
                navigate(-1);
            }
        },
        onError: (error) => addToast(`Error deleting MCQ: ${error.message}`, "error"),
    });

    const { generatedMcqIds, incorrectMcqIds } = (location.state || {}) as { generatedMcqIds?: string[], incorrectMcqIds?: string[] };

    useEffect(() => {
        if (!appData?.mcqs) return;
        let sessionMcqs: MCQ[] = [];
        if (mode === 'weakness' && generatedMcqIds?.length) {
            const mcqMap = new Map(appData.mcqs.map(m => [m.id, m]));
            sessionMcqs = Array.from(new Set(generatedMcqIds)).map(id => mcqMap.get(id)!).filter(Boolean) as MCQ[];
        } else if (mode === 'incorrect' && incorrectMcqIds?.length) {
            const mcqMap = new Map(appData.mcqs.map(m => [m.id, m]));
            sessionMcqs = Array.from(new Set(incorrectMcqIds)).map(id => mcqMap.get(id)!).filter(Boolean) as MCQ[];
        } else if (id) {
            sessionMcqs = appData.mcqs.filter(mcq => mcq.chapterId === id).sort(() => Math.random() - 0.5);
        }
        setMcqs(sessionMcqs);
        setCurrentIndex(0);
        setAnswers({});
        setMarkedForReview(new Set());
        setSessionStreak(0);
        setIsFinished(false);
    }, [appData, id, mode, generatedMcqIds, incorrectMcqIds]);

    const currentMcq = useMemo(() => mcqs[currentIndex], [mcqs, currentIndex]);
    const isQuizMode = useMemo(() => mode === 'quiz' || mode === 'mock' || mode === 'custom' || mode === 'weakness', [mode]);
    const showAnswer = useMemo(() => !isQuizMode || isFinished || mode === 'incorrect', [isQuizMode, isFinished, mode]);
    const isBookmarked = useMemo(() => !!(bookmarks && currentMcq && bookmarks.includes(currentMcq.id)), [bookmarks, currentMcq]);

    const handleSelectOption = useCallback((option: string) => {
        if (answers[currentIndex] != null && (mode === 'practice' || mode === 'incorrect')) return;
        if (!currentMcq) return;

        const correctAnswerText = getCorrectAnswerText(currentMcq);
        const wasCorrect = option === correctAnswerText;

        setAnswers(prev => ({ ...prev, [currentIndex]: option }));
        
        if (user && attemptedMCQs && mode !== 'incorrect') {
            addAttemptMutation.mutate({ mcqId: currentMcq.id, isCorrect: wasCorrect });
        }
        
        if (isQuizMode && currentIndex < mcqs.length - 1) {
            setTimeout(() => setCurrentIndex(i => i + 1), 300);
        }
    }, [answers, currentIndex, currentMcq, user, attemptedMCQs, isQuizMode, mcqs.length, addAttemptMutation, mode, getCorrectAnswerText]);

    const finishSession = useCallback(() => {
        if (isFinished || !user) return;
        setIsFinished(true);
        setMarkedForReview(new Set());

        if (isQuizMode) {
            const results: QuizResult['results'] = mcqs.map((mcq, index) => {
                const selectedAnswer = answers[index] || null;
                const correctAnswerText = getCorrectAnswerText(mcq);
                const isCorrect = selectedAnswer === correctAnswerText;
                return { mcqId: mcq.id, isCorrect, selectedAnswer, correctAnswer: correctAnswerText };
            });

            const score = results.filter(r => r.isCorrect).length;

            addQuizResultMutation.mutate({
                results,
                score,
                totalQuestions: mcqs.length,
                source: mode || 'unknown',
                chapterId: id,
            });
            addToast("Quiz submitted! Review your answers.", "success");
        } else {
            addToast("Session complete!", "info");
        }
    }, [isFinished, user, isQuizMode, mcqs, answers, addQuizResultMutation, mode, id, addToast, getCorrectAnswerText]);
    
    const handleDelete = () => {
        if (!user?.isAdmin || !currentMcq) return;
        let collectionName: 'MasterMCQ' | 'MarrowMCQ';
        if (currentMcq.source?.toLowerCase().includes('marrow')) {
            collectionName = 'MarrowMCQ';
        } else {
            collectionName = 'MasterMCQ';
        }
        deleteMcqMutation.mutate({ id: currentMcq.id, type: 'mcq', collectionName });
        setIsDeleteModalOpen(false);
    };

    const handleToggleBookmark = () => { if (currentMcq) toggleBookmarkMutation.mutate({ contentId: currentMcq.id, contentType: 'mcq' }); };

    const goToQuestion = (index: number) => {
        if (index >= 0 && index < mcqs.length) {
            setCurrentIndex(index);
        }
    };
    const handleNext = () => (currentIndex < mcqs.length - 1) ? goToQuestion(currentIndex + 1) : finishSession();
    const handlePrevious = () => goToQuestion(currentIndex - 1);
    const toggleMarkForReview = useCallback(() => {
        setMarkedForReview(prev => { 
            const newSet = new Set(prev); 
            if (newSet.has(currentIndex)) newSet.delete(currentIndex);
            else newSet.add(currentIndex);
            return newSet; 
        });
    }, [currentIndex]);

    const finalResult = useMemo(() => {
        if (!isFinished || !isQuizMode) return null;
        const results: QuizResult['results'] = mcqs.map((mcq, index) => {
            const selectedAnswer = answers[index] || null;
            const correctAnswerText = getCorrectAnswerText(mcq);
            const isCorrect = selectedAnswer === correctAnswerText;
            return { mcqId: mcq.id, isCorrect, selectedAnswer, correctAnswer: correctAnswerText };
        });
        const score = results.filter(r => r.isCorrect).length;
        const scoreWithPenalty = results.reduce((acc, r) => {
            if (r.selectedAnswer === null) return acc;
            return r.isCorrect ? acc + 4 : acc - 1;
        }, 0);
        return { results, score, totalQuestions: mcqs.length, scoreWithPenalty, source: mode, chapterId: id };
    }, [isFinished, isQuizMode, mcqs, answers, mode, id, getCorrectAnswerText]);

    if (isAppDataLoading) return <Loader message="Loading Session..." />;
    if (mcqs.length === 0) return <div className="text-center p-8">No questions available for this session.</div>;
    if (!currentMcq) return <div className="text-center p-8">Loading question...</div>;

    if (finalResult) {
        return <QuizResultsPage result={finalResult} mcqs={mcqs} onReview={() => { setIsFinished(true); setCurrentIndex(0); }} />;
    }

    const optionsArray = Array.isArray(currentMcq.options) ? currentMcq.options : [];

    return (
        <>
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete} title="Delete MCQ" message="Are you sure you want to permanently delete this question?" confirmText="Delete" variant="danger" isLoading={deleteMcqMutation.isPending}/>
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold capitalize">Q. {currentIndex + 1}/{mcqs.length} ({mode.replace(/_/g,' ')})</h1>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && (<button onClick={() => setIsDeleteModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-red-500" title="Delete MCQ"><TrashIcon /></button>)}
                        <button onClick={handleToggleBookmark} className={`p-2 rounded-full ${isBookmarked ? "text-amber-500 bg-amber-100 dark:bg-amber-800/50" : "text-slate-400 hover:text-amber-400"}`}><BookmarkIcon filled={isBookmarked} /></button>
                    </div>
                </div>
                {isQuizMode && <QuizTimerBar key={currentIndex} duration={60} onTimeUp={handleNext} isPaused={isFinished} />}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6">
                    <p className="text-lg font-semibold mb-4 whitespace-pre-wrap">{currentMcq.question}</p>
                    <div className="space-y-3">
                        {optionsArray.map((option, idx) => {
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
                                <button key={idx} onClick={() => handleSelectOption(option)} disabled={showAnswer && answers[currentIndex] != null} className={`w-full text-left p-4 rounded-lg flex items-start transition-colors disabled:cursor-not-allowed ${style}`}>
                                    <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span>
                                    <span>{option}</span>
                                </button>
                            );
                        })}
                    </div>
                    {showAnswer && answers[currentIndex] != null && (
                        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/40 rounded-lg animate-fade-in">
                            <h3 className="font-bold text-amber-800 dark:text-amber-200">Explanation</h3>
                            <p className="mt-2 whitespace-pre-wrap">{currentMcq.explanation || "No explanation provided."}</p>
                        </div>
                    )}
                </div>
                
                <div className="flex justify-between items-center mt-6">
                    <button onClick={handlePrevious} disabled={currentIndex === 0} className="px-6 py-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600">Previous</button>
                    {isQuizMode && <button onClick={toggleMarkForReview} className={`px-4 py-2 rounded-md font-semibold ${markedForReview.has(currentIndex) ? 'bg-purple-500 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{markedForReview.has(currentIndex) ? 'Unmark' : 'Mark Review'}</button>}
                    <button onClick={handleNext} className="px-6 py-2 rounded-md bg-sky-500 text-white hover:bg-sky-600">{currentIndex === mcqs.length - 1 && !isFinished && isQuizMode ? "Submit Quiz" : (currentIndex === mcqs.length - 1 ? "Finish" : "Next")}</button>
                </div>
                
                <QuestionNavigator count={mcqs.length} currentIndex={currentIndex} answers={answers} marked={markedForReview} mcqs={mcqs} goToQuestion={goToQuestion} mode={mode} isFinished={isFinished} />
            </div>
        </>
    );
};

export default MCQSessionPage;