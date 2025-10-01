// frontend/src/pages/QuizResultsPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getQuizSessionFeedback } from '@/services/aiService';
import { getQuizResultWithDetails } from '@/services/apiService';
import Loader from '@/components/Loader';
import { MCQ, ClientQuizResult as QuizResult } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import { useWindowSize } from 'react-use';
import Confetti from 'react-confetti';
import { SessionManager } from '@/services/sessionService';

const QuizResultsPage: React.FC = () => {
    const navigate = useNavigate();
    const { resultId } = useParams<{ resultId: string }>();
    const { addToast } = useToast();
    const { width, height } = useWindowSize();
    const [showConfetti, setShowConfetti] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['quizResultWithDetails', resultId],
        queryFn: async () => {
            if (!resultId) return null;
            const response = await getQuizResultWithDetails({ resultId });
            return response.data as { quizResult: QuizResult; mcqs: MCQ[] };
        },
        enabled: !!resultId,
    });

    const result = data?.quizResult;
    const mcqs = data?.mcqs;

    const { mutate: generateFeedback, isPending: isGeneratingFeedback, data: aiFeedbackResult } = useMutation({
        mutationFn: (id: string) => getQuizSessionFeedback({ quizResultId: id }),
        onSuccess: () => addToast("AI Feedback generated!", "success"),
        onError: (error: any) => addToast(`Failed to get AI Feedback: ${error.message}`, "error"),
    });
    
    const aiFeedbackText = aiFeedbackResult?.data?.feedback;

    const createMistakesTestMutation = useMutation({
        mutationFn: async () => {
            if (!result || !mcqs) throw new Error("Result data not available.");
            const incorrectMcqIds = result.results.filter(r => !r.isCorrect).map(r => r.mcqId);
            if (incorrectMcqIds.length === 0) {
                addToast("No mistakes to review!", "info");
                return null;
            }
            const sessionId = await SessionManager.createSession('incorrect', incorrectMcqIds);
            return sessionId;
        },
        onSuccess: (sessionId) => {
            if(sessionId) navigate(`/session/incorrect/${sessionId}`);
        },
        onError: (error: any) => addToast(`Failed to create mistakes test: ${error.message}`, 'error'),
    });
    
    const retakeQuizMutation = useMutation({
        mutationFn: async () => {
            if (!result) throw new Error("Original result not available.");
            const allMcqIds = result.results.map(r => r.mcqId);
            const sessionId = await SessionManager.createSession(result.mode, allMcqIds);
            return { mode: result.mode, sessionId };
        },
        onSuccess: ({ mode, sessionId }) => {
            if(sessionId) navigate(`/session/${mode}/${sessionId}`);
        },
        onError: (error: any) => addToast(`Failed to retake quiz: ${error.message}`, 'error'),
    });

    useEffect(() => {
        if (result && result.totalQuestions > 0 && (result.score / result.totalQuestions) >= 0.8) {
            setShowConfetti(true);
        }
    }, [result]);

    if (isLoading || !result || !mcqs) {
        return <Loader fullScreen message="Loading quiz results..." />;
    }
    
    // UI for a result that is pending sync from an offline session
    if (!result.quizDate) {
        return (
            <div className="card-base text-center p-8 max-w-lg mx-auto">
                <h1 className="text-2xl font-bold">Sync Pending...</h1>
                <p className="mt-4 text-slate-500">This quiz was completed offline. Your results will be processed and saved as soon as you reconnect to the internet.</p>
            </div>
        )
    }

    const { totalQuestions, score } = result;
    const incorrectAnswers = totalQuestions - score;
    const percentageScore = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
            {showConfetti && <Confetti width={width} height={height} recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
            <h1 className="text-3xl font-bold text-center">Quiz Complete!</h1>

            <div className="card-base p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div><p className="text-sm text-slate-500">Score</p><p className="text-3xl font-bold text-sky-600">{percentageScore.toFixed(0)}%</p></div>
                <div><p className="text-sm text-slate-500">Correct</p><p className="text-3xl font-bold text-emerald-600">{score}</p></div>
                <div><p className="text-sm text-slate-500">Incorrect</p><p className="text-3xl font-bold text-red-600">{incorrectAnswers}</p></div>
                <div><p className="text-sm text-slate-500">XP Earned</p><p className="text-3xl font-bold text-amber-500">+{result.xpEarned || 0}</p></div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button onClick={() => navigate('/')} className="btn-neutral px-6 py-2">Back to Home</button>
                <button onClick={() => createMistakesTestMutation.mutate()} className="btn-danger px-6 py-2" disabled={incorrectAnswers === 0 || createMistakesTestMutation.isPending}>Review Mistakes</button>
                <button onClick={() => retakeQuizMutation.mutate()} className="btn-primary px-6 py-2" disabled={retakeQuizMutation.isPending}>Retake Quiz</button>
            </div>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">AI Performance Advisor</h2>
                <button onClick={() => resultId && generateFeedback(resultId)} className="btn-secondary w-full" disabled={isGeneratingFeedback || !resultId}>
                    {isGeneratingFeedback ? "Analyzing..." : "🤖 Get AI-Powered Feedback"}
                </button>
                {aiFeedbackText && <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg prose dark:prose-invert max-w-none"><ReactMarkdown children={aiFeedbackText} /></div>}
            </div>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">Detailed Review</h2>
                {result.results.map((attempt, index) => {
                    const mcq = mcqs.find(m => m.id === attempt.mcqId);
                    if (!mcq) return null;
                    return (
                        <div key={mcq.id} className={clsx("p-4 rounded-lg border-l-4 mb-4", attempt.isCorrect ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-500" : "bg-red-50 dark:bg-red-900/10 border-red-500")}>
                            <h3 className="font-semibold">{index + 1}. {mcq.question}</h3>
                            <p className="mt-2 text-sm">Your Answer: <span className={clsx("font-semibold", attempt.isCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>{attempt.selectedAnswer || 'Skipped'}</span></p>
                            {!attempt.isCorrect && <p className="text-sm">Correct Answer: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{attempt.correctAnswer}</span></p>}
                            <div className="mt-2 text-sm prose dark:prose-invert max-w-none prose-p:my-1"><ReactMarkdown children={mcq.explanation || ''} /></div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default QuizResultsPage;