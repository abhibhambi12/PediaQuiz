// workspaces/frontend/src/pages/QuizResultsPage.tsx
// This file was moved from workspaces/frontend/src/components/QuizResultsPage.tsx
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { QuizResult, MCQ } from '@pediaquiz/types';
import { getQuizResultById } from '@/services/userDataService';
import { getMcqsByIds } from '@/services/firestoreService';
import { getQuizSessionFeedback } from '@/services/aiService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast'; // FIX: Adjusted import path
import Loader from '@/components/Loader'; // FIX: Adjusted import path
import ReactMarkdown from 'react-markdown';
import { SessionManager } from '@/services/sessionService';

const QuizResultsPage: React.FC = () => {
    const { resultId } = useParams<{ resultId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [feedback, setFeedback] = useState<string | null>(null);

    const { data: result, isLoading: isLoadingResult, error: resultError } = useQuery<QuizResult, Error>({
        queryKey: ['quizResult', resultId],
        queryFn: () => getQuizResultById(user!.uid, resultId!),
        enabled: !!user && !!resultId,
    });

    const mcqIds = React.useMemo(() => result?.mcqAttempts.map(a => a.mcqId) || [], [result]);
    
    const { data: mcqs, isLoading: isLoadingMcqs, error: mcqsError } = useQuery<MCQ[], Error>({
        queryKey: ['quizResultMcqs', mcqIds],
        queryFn: () => getMcqsByIds(mcqIds),
        enabled: mcqIds.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const feedbackMutation = useMutation<
        { feedback: string }, // Explicit return type for direct data return
        Error, // Error type
        { quizResultId: string } // Variables type
    >({
        mutationFn: getQuizSessionFeedback,
        onSuccess: (data) => setFeedback(data.feedback),
        onError: (error: Error) => addToast(`Failed to get AI feedback: ${error.message}`, 'danger'),
    });

    const handleGetFeedback = () => {
        if (!resultId) return;
        feedbackMutation.mutate({ quizResultId: resultId });
    };

    const handleReview = () => {
        if (!result || !mcqs) return;
        SessionManager.createSession(result.userId, result.mode as any, mcqs.map(m => m.id))
            .then(newSessionId => navigate(`/session/${result.mode}/${newSessionId}`, { state: { isReview: true } }))
            .catch(err => addToast(`Could not start review session: ${err.message || String(err)}`, "danger"));
    };
    
    const isLoading = isLoadingResult || isLoadingMcqs;
    const error = resultError || mcqsError;

    if (isLoading) return <Loader message="Loading quiz results..." />;
    if (error) return <div className="text-center p-10 text-red-500">Error loading results: {error.message}</div>;
    if (!result || !mcqs) return <div className="text-center p-10 text-slate-500">Quiz results not found.</div>;

    const { score, totalQuestions, mode, mcqAttempts } = result;
    const accuracy = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
    const scoreWithPenalty = mcqAttempts.reduce((acc, r) => acc + (r.isCorrect ? 4 : (r.selectedAnswer ? -1 : 0)), 0);

    return (
        <div className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg text-center shadow-lg animate-fade-in-down max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="font-bold text-sky-500 text-2xl mb-2">Quiz Complete!</h2>
                <p className="text-slate-600 dark:text-slate-300">Here's how you did on your <span className="capitalize font-semibold">{mode.replace(/_/g, ' ')}</span> session:</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col items-center justify-center">
                    <p className="text-6xl font-bold text-slate-800 dark:text-slate-100">{accuracy.toFixed(0)}%</p>
                    <p className="text-slate-500">({score} / {totalQuestions} correct)</p>
                </div>
                <div className="flex flex-col items-center justify-center">
                    <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Final Score</p>
                    <p className="text-4xl font-bold text-indigo-500">({scoreWithPenalty})</p>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded">
                    <div className="font-bold text-green-700 dark:text-green-300">Correct</div>
                    <div className="text-2xl font-semibold">{score}</div>
                </div>
                <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded">
                    <div className="font-bold text-red-700 dark:text-red-300">Incorrect</div>
                    <div className="text-2xl font-semibold">{mcqAttempts.filter((r) => !r.isCorrect && r.selectedAnswer !== null).length}</div>
                </div>
                <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded">
                    <div className="font-bold text-slate-700 dark:text-slate-300">Skipped</div>
                    <div className="text-2xl font-semibold">{mcqAttempts.filter((r) => r.selectedAnswer === null).length}</div>
                </div>
            </div>

            <div className="border-t dark:border-slate-700 pt-6 space-y-4">
                {resultId && !feedback && ( 
                    <button 
                        onClick={handleGetFeedback}
                        disabled={feedbackMutation.isPending}
                        className="w-full max-w-xs mx-auto btn-secondary"
                    >
                        {feedbackMutation.isPending ? 'Analyzing...' : '🤖 Get AI Feedback on this Session'}
                    </button>
                )}
                {feedback && (
                    <div className="text-left p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg prose dark:prose-invert max-w-none">
                        <h3 className="font-bold">AI Feedback</h3>
                        <ReactMarkdown>{feedback}</ReactMarkdown>
                    </div>
                )}
                 <button onClick={handleReview} className="w-full max-w-xs mx-auto btn-primary">
                    Review Your Answers
                </button>
            </div>
        </div>
    );
};

export default QuizResultsPage;