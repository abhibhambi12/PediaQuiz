import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAttemptedMCQs, getQuizResults } from '@/services/userDataService';
import { generatePerformanceAdvice } from '@/services/aiService';
import { AttemptedMCQs, MCQ, QuizResult } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useToast } from '@/components/Toast';

const StatCard: React.FC<{ title: string; value: string | number; colorClass?: string; }> = ({ title, value, colorClass }) => (
    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${colorClass || 'text-slate-800 dark:text-slate-200'}`}>{value}</p>
    </div>
);

const StatsPage: React.FC = () => {
    const { user } = useAuth();
    const { data: appData, isLoading: isAppDataLoading } = useData();
    const { addToast } = useToast();
    const [aiAdvice, setAiAdvice] = useState<string | null>(null);
    const [selectedSource, setSelectedSource] = useState<'All' | 'Marrow' | 'Master'>('All'); // PediaQuiz removed

    const { data: attemptedMCQs, isLoading: areAttemptsLoading } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const { data: quizResults, isLoading: areQuizResultsLoading } = useQuery<QuizResult[]>({
        queryKey: ['quizResults', user?.uid],
        queryFn: () => getQuizResults(user!.uid),
        enabled: !!user,
        initialData: [],
    });

    const generateAdviceMutation = useMutation<HttpsCallableResult<{ advice: string }>, Error, { overallAccuracy: number; strongTopics: string[]; weakTopics: string[]; }>({
        mutationFn: generatePerformanceAdvice,
        onSuccess: (data) => {
            setAiAdvice(data.data.advice);
            addToast("AI advice generated!", 'success');
        },
        onError: (error) => addToast(`Failed to generate AI advice: ${error.message}`, 'error'),
    });

    const filteredMcqs = useMemo(() => {
        if (!appData?.mcqs) return [];
        if (selectedSource === 'All') return appData.mcqs;
        if (selectedSource === 'Marrow') return appData.mcqs.filter(mcq => mcq.source === 'Marrow' || mcq.source === 'Marrow_AI_Generated');
        if (selectedSource === 'Master') return appData.mcqs.filter(mcq => mcq.source === 'Master' || mcq.source === 'PediaQuiz'); // Group Master and PediaQuiz
        return appData.mcqs;
    }, [appData, selectedSource]);

    const overallStats = useMemo(() => {
        if (!filteredMcqs.length || !attemptedMCQs) return { total: 0, attempted: 0, correct: 0, accuracy: 0 };

        const attemptedIds = Object.keys(attemptedMCQs);
        const relevantAttemptedMcqIds = filteredMcqs.filter(mcq => attemptedIds.includes(mcq.id)).map(mcq => mcq.id);

        const correctCount = relevantAttemptedMcqIds.filter(id => attemptedMCQs[id].isCorrect).length;
        const accuracy = relevantAttemptedMcqIds.length > 0 ? (correctCount / relevantAttemptedMcqIds.length) * 100 : 0;
        
        return {
            total: filteredMcqs.length,
            attempted: relevantAttemptedMcqIds.length,
            correct: correctCount,
            accuracy,
        };
    }, [filteredMcqs, attemptedMCQs]);

    const topicPerformance = useMemo(() => {
        if (!appData?.mcqs || !attemptedMCQs || !filteredMcqs.length) return [];
        
        const performanceMap: Record<string, { correct: number, total: number }> = {};

        const relevantAttemptedMCQs = Object.fromEntries(
            Object.entries(attemptedMCQs).filter(([mcqId]) => 
                filteredMcqs.some(fm => fm.id === mcqId)
            )
        );

        for (const mcqId in relevantAttemptedMCQs) {
            const attempt = relevantAttemptedMCQs[mcqId];
            const mcq = appData.mcqs.find(m => m.id === mcqId);
            if (mcq) {
                if (!performanceMap[mcq.topic]) {
                    performanceMap[mcq.topic] = { correct: 0, total: 0 };
                }
                performanceMap[mcq.topic].total++;
                if (attempt.isCorrect) {
                    performanceMap[mcq.topic].correct++;
                }
            }
        }
        
        return Object.entries(performanceMap)
            .map(([topic, data]) => ({
                topic,
                accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            }))
            .sort((a, b) => b.accuracy - a.accuracy);

    }, [appData, attemptedMCQs, filteredMcqs]);

    const sortedTopicsByAccuracy = useMemo(() => {
        if (topicPerformance.length === 0) return [];
        return [...topicPerformance].sort((a, b) => a.accuracy - b.accuracy);
    }, [topicPerformance]);

    const weakestTopics = sortedTopicsByAccuracy.slice(0, 3);
    const strongestTopics = sortedTopicsByAccuracy.slice(-3).reverse();

    const handleGetAiAdvice = () => {
        if (!user || overallStats.attempted < 10) {
            addToast("Attempt at least 10 questions to get personalized AI advice.", "info");
            return;
        }

        generateAdviceMutation.mutate({
            overallAccuracy: overallStats.accuracy,
            strongTopics: strongestTopics.map(t => t.topic),
            weakTopics: weakestTopics.map(t => t.topic),
        });
    };

    const isLoadingPage = isAppDataLoading || areAttemptsLoading || areQuizResultsLoading;

    if (isLoadingPage) return <Loader message="Calculating stats..." />;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Performance Stats</h1>

            <div className="flex space-x-2 mb-4">
                {['All', 'Marrow', 'Master'].map(source => (
                    <button
                        key={source}
                        onClick={() => setSelectedSource(source as 'All' | 'Marrow' | 'Master')}
                        className={`px-4 py-2 rounded-md font-semibold text-sm transition-colors ${
                            selectedSource === source
                                ? 'bg-sky-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                    >
                        {source}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Total MCQs" value={overallStats.total} />
                <StatCard title="Attempted" value={`${overallStats.attempted} / ${overallStats.total}`} />
                <StatCard title="Correct" value={overallStats.correct} colorClass="text-green-500" />
                <StatCard title="Accuracy" value={`${overallStats.accuracy.toFixed(1)}%`} colorClass="text-sky-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                    <h3 className="font-bold text-lg text-green-600 dark:text-green-400 mb-2">🚀 Strongest Topics</h3>
                    <ul className="space-y-2">
                        {strongestTopics.length > 0 ? (
                            strongestTopics.map(topic => (
                                <li key={topic.topic} className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{topic.topic}</span>
                                    <span className="font-semibold text-green-500">{topic.accuracy.toFixed(0)}%</span>
                                </li>
                            ))
                        ) : (
                            <p className="text-slate-500 text-sm">Attempt more questions to see your strongest topics.</p>
                        )}
                    </ul>
                </div>

                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                    <h3 className="font-bold text-lg text-red-600 dark:text-red-400 mb-2">🎯 Areas for Improvement</h3>
                    <ul className="space-y-2">
                        {weakestTopics.length > 0 ? (
                            weakestTopics.map(topic => (
                                <li key={topic.topic} className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{topic.topic}</span>
                                    <span className="font-semibold text-red-500">{topic.accuracy.toFixed(0)}%</span>
                                </li>
                            ))
                        ) : (
                            <p className="text-slate-500 text-sm">Your performance is looking solid so far!</p>
                        )}
                    </ul>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-4">AI Performance Advisor</h2>
                {overallStats.attempted >= 10 ? (
                    <>
                        <button onClick={handleGetAiAdvice} disabled={generateAdviceMutation.isPending} className="btn-primary w-full">
                            {generateAdviceMutation.isPending ? "Analyzing..." : "🤖 Get AI-Powered Advice"}
                        </button>
                        {aiAdvice && (
                            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
                                {aiAdvice.split('\n').map((line, index) => (
                                    <p key={index}>{line}</p>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <p className="text-center text-slate-500 py-4">
                        Attempt at least 10 questions to unlock AI-powered advice.
                    </p>
                )}
            </div>
            
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-4">Performance by Topic ({selectedSource})</h2>
                {topicPerformance.length > 0 ? (
                    <div style={{ width: "100%", height: 300 }}>
                        <ResponsiveContainer>
                            <BarChart data={topicPerformance} layout="vertical" margin={{ left: 10, right: 10 }}>
                                <XAxis type="number" domain={[0, 100]} unit="%" />
                                <YAxis type="category" dataKey="topic" width={150} tick={{ fontSize: 12 }} />
                                <Tooltip formatter={(value: number) => `${value.toFixed(0)}%`} />
                                <Legend />
                                <Bar dataKey="accuracy" fill="#0ea5e9" name="Accuracy" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-center text-slate-500 py-4">No attempts recorded for this source yet. Complete a quiz to see your stats!</p>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-4">Quiz History</h2>
                {quizResults && quizResults.length > 0 ? (
                    <div className="space-y-3">
                        {quizResults.map(quiz => (
                            <div key={quiz.id} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                                <div className="flex justify-between items-center text-sm">
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                                        {quiz.source.replace(/_/g, ' ')} Quiz {quiz.chapterId ? `(${quiz.chapterId.replace(/_/g, ' ')})` : ''}
                                    </p>
                                    <span className="text-slate-500 dark:text-slate-400">
                                        {new Date(quiz.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-xl font-bold text-sky-600 dark:text-sky-400">
                                    {((quiz.score / quiz.totalQuestions) * 100).toFixed(0)}%
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {quiz.score} / {quiz.totalQuestions} correct | Score: {quiz.results.reduce((acc, r) => r.isCorrect ? acc + 4 : r.selectedAnswer !== null ? acc - 1 : acc, 0)}
                                </p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-slate-500 py-4">No quizzes completed yet.</p>
                )}
            </div>
        </div>
    );
};

export default StatsPage;