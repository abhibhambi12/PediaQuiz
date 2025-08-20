// frontend/src/pages/QuizResultsPage.tsx
// frontend/pages/QuizResultsPage.tsx
import React, { useMemo, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getQuizResults } from '@/services/userDataService';
import { getMCQsByIds } from '@/services/firestoreService';
import { getQuizSessionFeedback } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService'; // Import SessionManager
import Loader from '@/components/Loader';
// Direct type imports
import { MCQ, QuizResult } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import useWindowSize from 'react-use/lib/useWindowSize';
import Confetti from 'react-confetti';
import { Timestamp } from 'firebase/firestore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

interface QuizResultsPageProps {
    // onReview?: () => void; // Removed as it's not passed via route
}

const QuizResultsPage: React.FC<QuizResultsPageProps> = ({ }) => {
    const navigate = useNavigate();
    const { resultId } = useParams<{ resultId: string }>();
    const location = useLocation();
    const { addToast } = useToast();
    const { width, height } = useWindowSize();
    const [showConfetti, setShowConfetti] = useState(false);

    // Prioritize quizResult from location state to avoid immediate re-fetch if just completed a quiz
    const quizResultFromState = (location.state as { quizResult?: QuizResult, mcqs?: MCQ[], quizResultId?: string })?.quizResult;
    const mcqsFromState = (location.state as { quizResult?: QuizResult, mcqs?: MCQ[], quizResultId?: string })?.mcqs;

    // Fetch quiz result from Firestore if not available in state (e.g., direct URL access)
    const { data: quizResultData, isLoading: isLoadingQuizResult, error: quizResultError } = useQuery<QuizResult[], Error>({
        queryKey: ['quizResult', resultId],
        queryFn: async () => {
            if (!resultId) return [];
            return await getQuizResults(null, resultId); // Fetch by resultId
        },
        enabled: !!resultId && !quizResultFromState, // Only query if resultId is present and not from state
        staleTime: Infinity, // Quiz results are immutable once saved
    });

    const result = useMemo(() => quizResultFromState ?? quizResultData?.[0], [quizResultFromState, quizResultData]);

    // Fetch MCQs for the quiz results if not available in state
    const { data: mcqsData, isLoading: isLoadingMcqs, error: mcqsError } = useQuery<MCQ[], Error>({
        queryKey: ['quizMcqs', result?.id],
        queryFn: async () => {
            if (!result?.mcqAttempts) return [];
            const mcqIds = result.mcqAttempts.map(a => a.mcqId);
            return getMCQsByIds(mcqIds);
        },
        enabled: !!result?.mcqAttempts && !mcqsFromState, // Only query if result attempts exist and MCQs not from state
        staleTime: Infinity, // Quiz MCQs are immutable
    });

    useEffect(() => {
        if (quizResultError) addToast(`Failed to load quiz results: ${quizResultError.message}`, 'error');
        if (mcqsError) addToast(`Failed to load quiz questions: ${mcqsError.message}`, 'error');
    }, [quizResultError, mcqsError, addToast]);

    const mcqs = useMemo(() => mcqsFromState ?? mcqsData, [mcqsFromState, mcqsData]);

    // Mutation for generating AI feedback
    const { mutate: generateFeedback, isPending: isGeneratingFeedback, data: aiFeedbackData } = useMutation<any, Error, string>({
        mutationFn: (id: string) => getQuizSessionFeedback({ quizResultId: id }),
        onSuccess: (data) => {
            addToast("AI Feedback generated!", "success");
        },
        onError: (error: any) => {
            addToast(`Failed to get AI Feedback: ${error.message}`, "error");
        }
    });

    // Confetti for good scores
    useEffect(() => {
        if (result && result.totalQuestions > 0 && (result.score / result.totalQuestions) > 0.7) { // Trigger confetti if score > 70%
            setShowConfetti(true);
            const timer = setTimeout(() => setShowConfetti(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [result]);

    if (isLoadingQuizResult || isLoadingMcqs || !result || !mcqs) {
        return <Loader message="Loading quiz results..." />;
    }

    const totalQuestions = result.totalQuestions;
    const correctAnswers = result.score;
    const incorrectAnswers = totalQuestions - correctAnswers;
    const percentageScore = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

    // Data for the Pie Chart
    const pieChartData = {
        labels: ['Correct', 'Incorrect'],
        datasets: [{
            data: [correctAnswers, incorrectAnswers],
            backgroundColor: ['#22c55e', '#ef4444'], // Green for correct, Red for incorrect
            borderColor: ['#ffffff', '#ffffff'],
            borderWidth: 2,
        }],
    };

    // Aggregate performance by topic for Bar Chart
    const topicPerformance = useMemo(() => {
        if (!result || !mcqs) return [];
        const topicStats: Record<string, { correct: number; total: number }> = {};

        result.mcqAttempts.forEach((attempt: { mcqId: string; isCorrect: boolean; }) => {
            const mcq = mcqs.find((m: MCQ) => m.id === attempt.mcqId);
            if (mcq) {
                const topicName = mcq.topicName || 'Uncategorized';
                if (!topicStats[topicName]) {
                    topicStats[topicName] = { correct: 0, total: 0 };
                }
                topicStats[topicName].total++;
                if (attempt.isCorrect) {
                    topicStats[topicName].correct++;
                }
            }
        });

        return Object.entries(topicStats).map(([topic, stats]) => ({
            topic,
            accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
        }));
    }, [result.mcqAttempts, mcqs]);

    // Data for the Bar Chart
    const barChartData = {
        labels: topicPerformance.map(data => data.topic),
        datasets: [{
            label: 'Accuracy (%)',
            data: topicPerformance.map(data => data.accuracy),
            backgroundColor: '#0ea5e9', // Sky blue
            borderColor: '#0284c7', // Darker sky blue
            borderWidth: 1,
        }],
    };

    // Chart options for consistent styling
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
                labels: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-slate-500').trim() || '#64748b', // Dynamic color based on CSS variable
                },
            },
            title: {
                display: true,
                text: 'Quiz Performance',
                color: getComputedStyle(document.documentElement).getPropertyValue('--text-slate-800').trim() || '#1e293b', // Dynamic color based on CSS variable
            },
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += `${context.parsed.y.toFixed(1)}%`;
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-slate-600').trim() || '#475569' }, // Dynamic color
                grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-slate-200').trim() || '#e2e8f0' } // Dynamic color
            },
            y: {
                ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-slate-600').trim() || '#475569' }, // Dynamic color
                grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-slate-200').trim() || '#e2e8f0' } // Dynamic color
            }
        }
    };

    const handleGoHome = () => {
        navigate('/');
    };

    // Feature #4.4: "Review Your Answers" button
    const handleReviewAnswers = async () => {
        if (!result || !mcqs || !result.userId) {
            addToast("Cannot start review: quiz data is incomplete.", "error");
            return;
        }

        // Create a new session specifically for review mode with the same MCQs
        try {
            const mcqIdsToReview = mcqs.map(m => m.id);
            // Use 'review_due' mode as per type definition in QuizSession
            const newSessionId = await SessionManager.createSession(result.userId, 'review_due', mcqIdsToReview);
            navigate(`/session/review_due/${newSessionId}`, { state: { generatedMcqIds: mcqIdsToReview }, replace: true });
        } catch (error: any) {
            addToast(`Failed to start review session: ${error.message || "Unknown error."}`, "error");
            console.error("Error creating review session:", error);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} gravity={0.15} />}
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">Quiz Results</h1>

            <div className="card-base p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Questions</p>
                    <p className="text-3xl font-bold text-sky-600 dark:text-sky-400 mt-1">{totalQuestions}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Correct Answers</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{correctAnswers}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Your Score (%)</p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{percentageScore.toFixed(1)}%</p>
                </div>
                {result.xpEarned !== undefined && (
                    <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">XP Earned</p>
                        <p className="text-3xl font-bold text-amber-500 dark:text-amber-300 mt-1">+{result.xpEarned}</p>
                    </div>
                )}
                {result.streakBonus !== undefined && result.streakBonus > 0 && (
                    <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Streak Bonus</p>
                        <p className="text-3xl font-bold text-red-500 dark:text-red-300 mt-1">+{result.streakBonus}</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card-base p-6">
                    <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-slate-300">Overall Accuracy</h2>
                    <div style={{ height: '250px' }}>
                        <Pie data={pieChartData} options={chartOptions as any} />
                    </div>
                </div>
                <div className="card-base p-6">
                    <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-slate-300">Performance by Topic</h2>
                    <div style={{ height: '250px' }}>
                        <Bar data={barChartData} options={chartOptions as any} />
                    </div>
                </div>
            </div>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-slate-300">Detailed Review</h2>
                <div className="space-y-6">
                    {result.mcqAttempts.map((attempt, index) => {
                        const mcq = mcqs.find((m: MCQ) => m.id === attempt.mcqId);
                        if (!mcq) return null;

                        const isCorrect = attempt.isCorrect;
                        const selectedAnswerText = attempt.selectedAnswer || 'Skipped';
                        const correctAnswerText = attempt.correctAnswer;

                        return (
                            <div key={mcq.id} className={clsx(
                                "p-4 rounded-lg border-l-4",
                                isCorrect ? "bg-green-50 dark:bg-green-900/30 border-green-500" : "bg-red-50 dark:bg-red-900/30 border-red-500"
                            )}>
                                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                                    Question {index + 1}: {mcq.question}
                                </h3>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">Your Answer:</span>
                                    <span className={clsx("ml-1", isCorrect ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>
                                        {selectedAnswerText}
                                    </span>
                                </p>
                                {!isCorrect && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        <span className="font-medium">Correct Answer:</span>
                                        <span className="ml-1 text-green-700 dark:text-green-300">{correctAnswerText}</span>
                                    </p>
                                )}
                                {mcq.explanation && (
                                    <div className="mt-3 text-sm text-slate-700 dark:text-slate-300 prose dark:prose-invert max-w-none">
                                        <h4 className="font-semibold text-base mb-1">Explanation:</h4>
                                        <ReactMarkdown>{mcq.explanation}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {aiFeedbackData && aiFeedbackData.data?.feedback && (
                <div className="card-base p-6 mt-6 animate-fade-in-up">
                    <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-slate-300">🤖 AI Feedback</h2>
                    <div className="prose dark:prose-invert max-w-none">
                        <ReactMarkdown>{aiFeedbackData.data.feedback}</ReactMarkdown>
                    </div>
                </div>
            )}

            <div className="flex justify-end space-x-4 mt-6">
                {/* Review Your Answers Button (Feature #4.4) */}
                <button
                    onClick={handleReviewAnswers}
                    className="btn-neutral px-6 py-2"
                    disabled={!result || !mcqs || mcqs.length === 0}
                >
                    Review Your Answers
                </button>
                <button
                    onClick={() => resultId && generateFeedback(resultId)} // Only call if resultId exists
                    className="btn-secondary px-6 py-2"
                    disabled={isGeneratingFeedback || !resultId}
                >
                    {isGeneratingFeedback ? 'Generating AI Feedback...' : '🤖 Get AI Feedback'}
                </button>
                <button
                    onClick={handleGoHome}
                    className="btn-primary px-6 py-2"
                >
                    Go to Home
                </button>
            </div>
        </div>
    );
};

export default QuizResultsPage;