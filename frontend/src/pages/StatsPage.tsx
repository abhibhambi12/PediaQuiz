// frontend/pages/StatsPage.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, QueryClient } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAttemptedMCQs, getQuizResults } from '@/services/userDataService';
import { getQuestions as getMcqsFromCollections } from '@/services/firestoreService'; // Import a function to get MCQs directly
import { generatePerformanceAdvice } from '@/services/aiService';
import { AttemptedMCQDocument, MCQ, QuizResult, Topic } from '@pediaquiz/types'; // Removed 'type' prefix here
import Loader from '@/components/Loader';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useToast } from '@/components/Toast';
import clsx from 'clsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement as ChartJsBarElement, Title as ChartJsTitle, Tooltip as ChartJsTooltip, Legend as ChartJsLegend } from 'chart.js';
import { calculateLevelProgress } from '@/utils/gamification';
import ReactMarkdown from 'react-markdown';
import { Timestamp } from 'firebase/firestore';

ChartJS.register(CategoryScale, LinearScale, ChartJsBarElement, ChartJsTitle, ChartJsTooltip, ChartJsLegend);

const StatCard: React.FC<{ title: string; value: string | number; colorClass?: string; }> = ({ title, value, colorClass }) => (
    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className={clsx(`text-2xl font-bold mt-1`, colorClass || 'text-slate-800 dark:text-slate-200')}>{value}</p>
    </div>
);

const StatsPage: React.FC = () => {
    const { user } = useAuth();
    const { appData, isLoadingData: isAppDataLoading, errorLoadingData: appDataError } = useData();
    const { addToast } = useToast();
    const [aiAdvice, setAiAdvice] = useState<string | null>(null);
    const [selectedSource, setSelectedSource] = useState<'All' | 'Marrow' | 'Master'>('All');

    const { data: attemptedMCQDocs, isLoading: areAttemptsLoading, error: attemptsError } = useQuery<Record<string, AttemptedMCQDocument>, Error>({
        queryKey: ['attemptedMCQDocs', user?.uid],
        queryFn: ({ queryKey }) => getAttemptedMCQs(queryKey[1] as string),
        enabled: !!user?.uid,
    });

    const { data: quizResults, isLoading: areQuizResultsLoading, error: quizResultsError } = useQuery<QuizResult[], Error>({
        queryKey: ['quizResults', user?.uid],
        queryFn: ({ queryKey }) => getQuizResults(queryKey[1] as string),
        enabled: !!user?.uid,
    });

    // NEW: Fetch all MCQs for statistics calculation, as appData.mcqs is no longer globally loaded.
    // Fetch only necessary metadata to avoid large data transfers
    const { data: allMcqsData, isLoading: isLoadingAllMcqs, error: allMcqsError } = useQuery<MCQ[], Error>({
        queryKey: ['allMcqsForStats'],
        queryFn: async () => {
            const masterMcqs = await getMcqsFromCollections('MasterMCQ');
            const marrowMcqs = await getMcqsFromCollections('MarrowMCQ');
            return [...masterMcqs, ...marrowMcqs];
        },
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
        enabled: !isAppDataLoading, // Only fetch if app data (topics) is loaded
    });

    useEffect(() => {
        if (attemptsError) addToast(`Error loading attempts: ${attemptsError.message}`, 'error');
        if (quizResultsError) addToast(`Error loading quiz results: ${quizResultsError.message}`, 'error');
        if (allMcqsError) addToast(`Error loading all MCQs for stats: ${allMcqsError.message}`, 'error');
    }, [attemptsError, quizResultsError, allMcqsError, addToast]);

    const generateAdviceMutation = useMutation<HttpsCallableResult<{ advice: string }>, Error, { overallAccuracy: number; strongTopics: string[]; weakTopics: string[]; }>({
        mutationFn: generatePerformanceAdvice,
        onSuccess: (data) => {
            setAiAdvice(data.data.advice);
            addToast("AI advice generated!", 'success');
        },
        onError: (error) => {
            console.error("Failed to generate AI advice:", error);
            addToast(`Failed to generate AI advice: ${error.message}`, 'error');
        },
    });

    // Modified allMcqsMap to use the new `allMcqsData` fetched explicitly
    const allMcqsMap = useMemo(() => {
        const map = new Map<string, MCQ>();
        if (allMcqsData) {
            allMcqsData.forEach((mcq: MCQ) => map.set(mcq.id, mcq)); // Explicitly type mcq
        }
        return map;
    }, [allMcqsData]);

    const filteredAttemptedMCQDocs = useMemo(() => {
        if (!attemptedMCQDocs) return {}; // No need for appData here
        if (selectedSource === 'All') return attemptedMCQDocs;

        const filtered: Record<string, AttemptedMCQDocument> = {};
        for (const mcqId in attemptedMCQDocs) {
            const mcq = allMcqsMap.get(mcqId); // Use the new allMcqsMap
            if (mcq) {
                const source = mcq.source?.startsWith('Marrow') ? 'Marrow' : 'Master'; // Assuming 'Master' for non-Marrow
                if (source === selectedSource) {
                    filtered[mcqId] = attemptedMCQDocs[mcqId];
                }
            }
        }
        return filtered;
    }, [attemptedMCQDocs, selectedSource, allMcqsMap]); // Added allMcqsMap dependency


    const overallStats = useMemo(() => {
        const totalAttempted = Object.keys(filteredAttemptedMCQDocs).length;
        let totalCorrect = 0;

        Object.values(filteredAttemptedMCQDocs).forEach((attemptDoc: AttemptedMCQDocument) => {
            if (attemptDoc.latestAttempt.isCorrect) {
                totalCorrect++;
            }
        });

        // The total number of available MCQs is now derived from `allMcqsData` directly
        const totalAvailableInSelectedSource = selectedSource === 'All' ? (allMcqsData?.length || 0) :
            (allMcqsData?.filter(mcq => (mcq.source?.startsWith('Marrow') ? 'Marrow' : 'Master') === selectedSource).length || 0);

        const accuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

        return {
            total: totalAvailableInSelectedSource,
            attempted: totalAttempted,
            correct: totalCorrect,
            accuracy,
        };
    }, [filteredAttemptedMCQDocs, selectedSource, allMcqsData]);

    const topicPerformance = useMemo(() => {
        if (!appData?.topics || !attemptedMCQDocs) return [];
        const performanceMap: Record<string, { correct: number, total: number }> = {};

        Object.values(attemptedMCQDocs).forEach((attemptDoc: AttemptedMCQDocument) => {
            const latestAttempt = attemptDoc.latestAttempt;
            if (!latestAttempt.topicId) return;

            const topic = appData.topics.find((t: Topic) => t.id === latestAttempt.topicId);
            if (!topic) return;

            if (selectedSource !== 'All') {
                const mcqSource = topic.source === 'General' ? 'Master' : 'Marrow';
                if (mcqSource !== selectedSource) return;
            }

            const topicName = topic.name || 'Unknown Topic';
            if (!performanceMap[topicName]) {
                performanceMap[topicName] = { correct: 0, total: 0 };
            }
            performanceMap[topicName].total++;
            if (latestAttempt.isCorrect) {
                performanceMap[topicName].correct++;
            }
        });

        return Object.entries(performanceMap)
            .map(([topic, data]) => ({
                topic,
                accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            }))
            .sort((a, b) => b.accuracy - a.accuracy);
    }, [appData, attemptedMCQDocs, selectedSource]);

    const sortedTopicsByAccuracy = useMemo(() => {
        return [...topicPerformance].sort((a, b) => a.accuracy - b.accuracy);
    }, [topicPerformance]);

    const weakestTopics = sortedTopicsByAccuracy.slice(0, 3);
    const strongestTopics = sortedTopicsByAccuracy.slice(-3).reverse();

    const handleGetAiAdvice = () => {
        if (!user?.uid) {
            addToast("Please log in to get personalized AI advice.", "info");
            return;
        }
        if (overallStats.attempted < 10) {
            addToast("Attempt at least 10 questions to get personalized AI advice.", "info");
            return;
        }

        generateAdviceMutation.mutate({
            overallAccuracy: overallStats.accuracy,
            strongTopics: strongestTopics.map(t => t.topic),
            weakTopics: weakestTopics.map(t => t.topic),
        });
    };

    const isLoadingPage = isAppDataLoading || areAttemptsLoading || areQuizResultsLoading || isLoadingAllMcqs;

    if (isLoadingPage) return <Loader message="Calculating stats..." />;

    if (!appData && !isLoadingPage) return <div className="text-center p-10 text-red-500">Error loading app data.</div>;
    if (!user) return <div className="text-center p-10 text-slate-500">Please log in to view your statistics.</div>;

    const { currentLevel, progressToNextLevel } = calculateLevelProgress(user.xp ?? 0, user.level ?? 1);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">Performance Stats</h1>

            {user.xp !== undefined && user.level !== undefined && (
                <div className="card-base p-6">
                    <h2 className="text-xl font-bold mb-4">Your Progress</h2>
                    <div className="flex items-center space-x-4">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Current Level</p>
                            <p className="text-3xl font-bold text-sky-600 dark:text-sky-400 mt-1">{currentLevel}</p>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total XP</p>
                            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{user.xp}</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="font-medium text-slate-700 dark:text-slate-300">XP to next Level {currentLevel + 1}</span>
                            <span className="font-semibold text-sky-500">{progressToNextLevel.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-2">
                            <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${progressToNextLevel}%` }}></div>
                        </div>
                    </div>
                    {user.badges && user.badges.length > 0 && (
                        <div className="mt-4">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Earned Badges</h3>
                            <div className="flex flex-wrap gap-2">
                                {user.badges.map((badge: string) => (
                                    <span key={badge} className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                                        {badge}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex space-x-2 mb-4">
                {['All', 'Marrow', 'Master'].map(source => (
                    <button
                        key={source}
                        onClick={() => setSelectedSource(source as 'All' | 'Marrow' | 'Master')}
                        className={clsx(`px-4 py-2 rounded-md font-semibold text-sm transition-colors`,
                            selectedSource === source
                                ? 'bg-sky-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                        )}
                    >
                        {source}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Total MCQs (Attempted)" value={overallStats.attempted} />
                <StatCard title="Correct" value={overallStats.correct} colorClass="text-green-500" />
                <StatCard title="Accuracy" value={`${overallStats.accuracy.toFixed(1)}%`} colorClass="text-sky-500" />
                <StatCard title="Quiz Sessions" value={quizResults?.length || 0} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                    <h3 className="font-bold text-lg text-green-600 dark:text-green-400 mb-2">🚀 Strongest Topics</h3>
                    <ul className="space-y-2">
                        {strongestTopics.length > 0 ? (
                            strongestTopics.map((topic: { topic: string; accuracy: number }) => (
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
                            weakestTopics.map((topic: { topic: string; accuracy: number }) => (
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
                                <ReactMarkdown>{aiAdvice}</ReactMarkdown>
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
                        {quizResults.map((quiz: QuizResult) => (
                            <div key={quiz.id} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                                <div className="flex justify-between items-center text-sm">
                                    <p className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                                        {quiz.mode.replace(/_/g, ' ')} Quiz {quiz.chapterIds && quiz.chapterIds.length > 0 ? `(${quiz.chapterIds[0].replace(/_/g, ' ')})` : ''}
                                    </p>
                                    <span className="text-slate-500 dark:text-slate-400">
                                        {quiz.quizDate instanceof Timestamp ? quiz.quizDate.toDate().toLocaleDateString() : new Date(quiz.quizDate as any).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-xl font-bold text-sky-600 dark:text-sky-400">
                                    {((quiz.score / quiz.totalQuestions) * 100).toFixed(0)}%
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {quiz.score} / {quiz.totalQuestions} correct
                                </p>
                                {quiz.xpEarned !== undefined && (
                                    <p className="text-xs text-amber-500 dark:text-amber-300 font-medium">XP: +{quiz.xpEarned} {quiz.streakBonus !== undefined && quiz.streakBonus > 0 ? ` (+${quiz.streakBonus} Streak Bonus!)` : ''}</p>
                                )}
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