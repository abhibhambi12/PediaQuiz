// frontend/src/components/QuizResultsPage.tsx
import React, { useState } from 'react';
import type { QuizResult, MCQ } from '@pediaquiz/types';
import { useMutation } from '@tanstack/react-query';
import { getQuizSessionFeedback } from '@/services/aiService';
import { useToast } from './Toast';
import ReactMarkdown from 'react-markdown';

interface QuizResultsPageProps {
    result: Omit<QuizResult, 'userId' | 'date'> & { scoreWithPenalty: number; id?: string };
    mcqs: MCQ[];
    onReview: () => void;
}

const QuizResultsPage: React.FC<QuizResultsPageProps> = ({ result, mcqs, onReview }) => {
    const { addToast } = useToast();
    const { score, totalQuestions, scoreWithPenalty } = result;
    const accuracy = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

    const [feedback, setFeedback] = useState<string | null>(null);

    const feedbackMutation = useMutation<any, Error, { quizResultId: string }>({
        mutationFn: getQuizSessionFeedback,
        onSuccess: (data) => {
            setFeedback(data.data.feedback);
        },
        onError: (error) => {
            addToast(`Failed to get AI feedback: ${error.message}`, 'error');
        },
    });

    const handleGetFeedback = () => {
        if (!result.id) {
            addToast("Cannot get feedback: Quiz result ID is missing.", "error");
            return;
        }
        feedbackMutation.mutate({ quizResultId: result.id });
    };

    return (
        <div className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg text-center shadow-lg animate-fade-in-down max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="font-bold text-sky-500 text-2xl mb-2">Quiz Complete!</h2>
                <p className="text-slate-600 dark:text-slate-300">Here's how you did:</p>
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
                    <div className="text-2xl font-semibold">{result.results.filter(r => !r.isCorrect && r.selectedAnswer !== null).length}</div>
                </div>
                <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded">
                    <div className="font-bold text-slate-700 dark:text-slate-300">Skipped</div>
                    <div className="text-2xl font-semibold">{result.results.filter(r => r.selectedAnswer === null).length}</div>
                </div>
            </div>

            <div className="border-t dark:border-slate-700 pt-6 space-y-4">
                {result.id && !feedback && (
                    <button 
                        onClick={handleGetFeedback}
                        disabled={feedbackMutation.isPending}
                        className="w-full max-w-xs mx-auto px-6 py-3 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
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
                 <button onClick={onReview} className="w-full max-w-xs mx-auto px-6 py-3 bg-sky-500 text-white font-bold rounded-lg hover:bg-sky-600 transition-colors">
                    Review Your Answers
                </button>
            </div>
        </div>
    );
};

export default QuizResultsPage;