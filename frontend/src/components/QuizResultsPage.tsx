import React from 'react';
import type { QuizResult, MCQ } from '@pediaquiz/types';

interface QuizResultsPageProps {
    result: Omit<QuizResult, 'id' | 'userId' | 'date'> & { scoreWithPenalty: number };
    mcqs: MCQ[]; // <-- RESTORED THIS PROP
    onReview: () => void;
}

const QuizResultsPage: React.FC<QuizResultsPageProps> = ({ result, mcqs, onReview }) => { // <-- RESTORED `mcqs` here
    const { score, totalQuestions, scoreWithPenalty } = result;
    const accuracy = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

    return (
        <div className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg text-center shadow-lg animate-fade-in-down">
            <h2 className="font-bold text-sky-500 text-2xl mb-2">Quiz Complete!</h2>
            <p className="text-slate-600 dark:text-slate-300">Here's how you did:</p>

            <div className="my-6">
                <p className="text-6xl font-bold text-slate-800 dark:text-slate-100">{accuracy.toFixed(0)}%</p>
                <p className="text-slate-500">({score} / {totalQuestions} correct)</p>
            </div>
            
             <div className="my-6">
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Final Score (with penalties)</p>
                <p className="text-4xl font-bold text-indigo-500">{scoreWithPenalty}</p>
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

            <button onClick={onReview} className="mt-8 w-full max-w-xs mx-auto px-6 py-3 bg-sky-500 text-white font-bold rounded-lg hover:bg-sky-600 transition-colors">
                Review Your Answers
            </button>
        </div>
    );
};

export default QuizResultsPage;