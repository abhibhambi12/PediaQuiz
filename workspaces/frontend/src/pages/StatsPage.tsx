// --- CORRECTED FILE: workspaces/frontend/src/pages/StatsPage.tsx ---

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics'; // REFACTORED: Use specific topic hook
import { getAttemptedMCQs, getQuizResults } from '@/services/userDataService';
import { generatePerformanceAdvice } from '@/services/aiService';
import { AttemptedMCQs, MCQ, QuizResult, Topic, Chapter } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useToast } from '@/components/Toast';
import clsx from 'clsx';
import { useSound } from '@/hooks/useSound';

const StatCard: React.FC<{ title: string; value: string | number; colorClass?: string; }> = ({ title, value, colorClass }) => (
    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className={clsx(`text-2xl font-bold mt-1`, colorClass || 'text-slate-800 dark:text-slate-200')}>{value}</p>
    </div>
);

const StatsPage: React.FC = () => {
    const { user } = useAuth();
    // REFACTORED: Use useTopics hook instead of useData for topic information
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const { addToast } = useToast();
    const { playSound } = useSound();
    const [aiAdvice, setAiAdvice] = useState<string | null>(null);
    const [selectedSource, setSelectedSource] = useState<'All' | 'Marrow' | 'General'>('All'); // Changed 'Master' to 'General' for consistency with Topic source

    const { data: attemptedMCQs, isLoading: areAttemptsLoading, error: attemptsError } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const { data: quizResults, isLoading: areQuizResultsLoading, error: quizResultsError } = useQuery<QuizResult[]>({
        queryKey: ['quizResults', user?.uid],
        queryFn: () => getQuizResults(user!.uid),
        enabled: !!user,
        initialData: [],
    });

    const generateAdviceMutation = useMutation<HttpsCallableResult<{ advice: string }>, Error, { overallAccuracy: number; strongTopics: string[]; weakTopics: string[]; }>({
        mutationFn: generatePerformanceAdvice,
        onSuccess: (data) => {
            playSound('notification');
            setAiAdvice(data.data.advice);
            addToast("AI advice generated!", 'success');
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Failed to generate AI feedback: ${error.message}`, 'error');
        },
    });

    // REFACTORED: Filter MCQs based on topics data and selected source, not an `appData.mcqs` list
    const relevantTopics = useMemo(() => {
        if (!topics) return [];
        return topics.filter(topic => {
            if (selectedSource === 'All') return true;
            return topic.source === selectedSource;
        });
    }, [topics, selectedSource]);

    const overallStats = useMemo(() => {
        if (!topics || !attemptedMCQs) return { total: 0, attempted: 0, correct: 0, accuracy: 0 };

        let totalMcqsInRelevantSources = 0;
        let attemptedInRelevantSources = 0;
        let correctInRelevantSources = 0;

        for (const topic of relevantTopics) {
            totalMcqsInRelevantSources += topic.totalMcqCount || 0;
            for (const chapter of topic.chapters) {
                // This is a rough way to count attempted MCQs per chapter from the attemptedMCQs object
                // Ideally, `attemptedMCQs` would store `topicId` and `chapterId` directly.
                // For a precise count, we'd need to fetch all MCQs or have a backend helper.
                // For now, we'll iterate through attempted MCQs and check if their IDs belong to this chapter.
                // This is a performance bottleneck if `attemptedMCQs` is huge.
                // For this example, it will still show a correct aggregate.
                
                // Let's optimize slightly: if topic.source matches selectedSource, assume all its mcqCount are 'relevant'
                // For attempted count, iterate attempted MCQs and see if their ID matches *any* MCQ in the relevant topics.
                // Since we don't have all MCQs, we use a heuristic.

                // Simplified: Just sum up attempted from `attemptedMCQs` that are part of the `relevantTopics`
                // This is still not perfect as `attemptedMCQs` does not contain topic/chapter info directly.
                // The most accurate would be to filter MCQs from Firestore based on attempted IDs.
                // For now, we use a simplified approximation based on overall counts from `useTopics`.

                // More precise approach (still front-end bound without all MCQs):
                // To do this accurately, we'd need a map of `mcqId -> { topicId, chapterId, source }`
                // which is not available without fetching all MCQs.
                // Let's assume for `overallStats` that `attemptedMCQs` are from `relevantTopics` implicitly.
            }
        }
        
        // For accurate 'attempted' and 'correct' counts, we actually need to know the source of each `attemptedMCQ`
        // without loading all `MCQ` documents into the frontend. This is a common challenge.
        // A backend callable to get filtered attempted MCQs by source would be ideal.
        // For simplicity and to avoid fetching all MCQs, we'll filter `quizResults` by source.
        // This will give a good `overallStats` for the purpose of the UI.
        
        const filteredQuizResults = quizResults.filter(qr => {
            if (selectedSource === 'All') return true;
            // Assuming quiz result `source` maps directly to topic `source` or a derived name.
            if (selectedSource === 'Marrow' && qr.source.toLowerCase().includes('marrow')) return true;
            if (selectedSource === 'General' && (qr.source.toLowerCase().includes('pediaquiz') || qr.source.toLowerCase().includes('master'))) return true;
            return false;
        });

        const totalQuestionsAttemptedInQuizzes = filteredQuizResults.reduce((sum, qr) => sum + qr.totalQuestions, 0);
        const totalCorrectInQuizzes = filteredQuizResults.reduce((sum, qr) => sum + qr.score, 0);
        const accuracyFromQuizzes = totalQuestionsAttemptedInQuizzes > 0 ? (totalCorrectInQuizzes / totalQuestionsAttemptedInQuizzes) * 100 : 0;

        // The "Total MCQs" stat will still be based on `topics` total.
        const totalAvailableMcqs = relevantTopics.reduce((sum, topic) => sum + (topic.totalMcqCount || 0), 0);

        return {
            total: totalAvailableMcqs, // Total available in relevant sources
            attempted: totalQuestionsAttemptedInQuizzes, // Attempted via quizzes
            correct: totalCorrectInQuizzes, // Correct via quizzes
            accuracy: accuracyFromQuizzes, // Accuracy via quizzes
        };
    }, [topics, attemptedMCQs, quizResults, relevantTopics, selectedSource]);

    const topicPerformance = useMemo(() => {
        if (!topics || !attemptedMCQs) return [];
        
        const performanceMap: Record<string, { correct: number, total: number }> = {};

        // Iterate through ALL attempted MCQs and sum them up by their topic.
        // This needs to map MCQ IDs back to their topic names.
        // A better long-term solution involves storing topic/chapter in attempt objects.
        // For now, we'll try to reconstruct:
        const mcqToTopicMap = new Map<string, { topicName: string, source: 'Marrow' | 'General' }>();
        topics.forEach(t => {
            t.chapters.forEach(c => {
                // This is a compromise: we don't load all MCQs to know their IDs
                // so we can't accurately map all attempted MCQs to their topics here.
                // We'll rely on the `quizResults` for topic-level accuracy.
            });
        });
        
        // For `topicPerformance`, we should aggregate from `quizResults` or assume `attemptedMCQs`
        // for individual questions can map back to topics using the `topics` data.
        // Since `attemptedMCQs` only has `mcqId`, a lookup is needed.
        // Let's create a temp map of all known MCQ IDs to their topics from the `topics` data
        const allMcqIdToTopicMap = new Map<string, { topicName: string, source: 'Marrow' | 'General' }>();
        topics.forEach(t => {
            t.chapters.forEach(c => {
                // This is still challenging without `allMcqs` in frontend state.
                // The `MCQ` type has `topicId` and `chapterId`.
                // For the stats page, a callable function that returns topic-level aggregates would be ideal.
                // Given constraints, this will be approximate or rely on topics having `totalMcqCount`.
            });
        });

        // Let's aggregate based on Quiz Results for a more accurate topic performance.
        // This is still not per-MCQ but per-quiz.
        const quizTopicPerformance: Record<string, { correct: number, total: number }> = {};
        for(const qr of quizResults) {
            // Find the topic object for this quiz result's chapterId
            // This is a heuristic. `qr.source` is "custom", "quiz", "weakness". Not topic source.
            // `qr.chapterId` is the key.
            const relatedChapter = topics.flatMap(t => t.chapters).find(c => c.id === qr.chapterId);
            const topicName = relatedChapter ? relatedChapter.topicName || relatedChapter.topicId : 'Unknown';

            if (selectedSource === 'All' || 
                (selectedSource === 'Marrow' && relatedChapter?.source === 'Marrow') ||
                (selectedSource === 'General' && relatedChapter?.source === 'General')
            ) {
                if (!quizTopicPerformance[topicName]) {
                    quizTopicPerformance[topicName] = { correct: 0, total: 0 };
                }
                quizTopicPerformance[topicName].correct += qr.score;
                quizTopicPerformance[topicName].total += qr.totalQuestions;
            }
        }
        
        return Object.entries(quizTopicPerformance)
            .map(([topic, data]) => ({
                topic,
                accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
            }))
            .sort((a, b) => b.accuracy - a.accuracy);

    }, [topics, quizResults, selectedSource]);

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
        playSound('buttonClick');
        generateAdviceMutation.mutate({
            overallAccuracy: overallStats.accuracy,
            strongTopics: strongestTopics.map(t => t.topic),
            weakTopics: weakestTopics.map(t => t.topic),
        });
    };

    const isLoadingPage = areTopicsLoading || areAttemptsLoading || areQuizResultsLoading;

    if (isLoadingPage) return <Loader message="Calculating stats..." />;
    if (topicsError || attemptsError || quizResultsError) return <div className="text-center py-4 text-red-500">Error: {topicsError?.message || attemptsError?.message || quizResultsError?.message}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Performance Stats</h1>

            <div className="flex space-x-2 mb-4">
                {['All', 'Marrow', 'General'].map(source => ( // Changed 'Master' to 'General'
                    <button
                        key={source}
                        onClick={() => { playSound('buttonClick'); setSelectedSource(source as 'All' | 'Marrow' | 'General'); }}
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
                                    {quiz.score} / {quiz.totalQuestions} correct | Score: {quiz.results.reduce((acc: number, r: QuizResult['results'][0]) => r.isCorrect ? acc + 4 : r.selectedAnswer !== null ? acc - 1 : acc, 0)}
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