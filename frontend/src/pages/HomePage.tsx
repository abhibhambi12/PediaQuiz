import React, { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useSession } from '@/contexts/SessionContext';
import { generateWeaknessBasedTest, getDailyWarmupQuiz } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService';
import { ChevronDownIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, QuizSession } from '@pediaquiz/types';
import clsx from 'clsx';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { appData, isLoadingData, errorLoadingData } = useData();
    const { activeSession, isLoading: isLoadingActiveSession } = useSession();
    const { isOnline } = useNetworkStatus();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    
    const generalTopics = useMemo(() => appData?.topics.filter(topic => topic.source === 'General') || [], [appData]);

    const startSessionMutation = useMutation({
        mutationFn: async ({ mode, mcqIds }: { mode: QuizSession['mode'], mcqIds: string[] }) => {
            const sessionId = await SessionManager.createSession(mode, mcqIds);
            return { mode, sessionId };
        },
        onSuccess: ({ mode, sessionId }) => navigate(`/session/${mode}/${sessionId}`),
        onError: (error: any) => addToast(`Error starting session: ${error.message}`, "error"),
    });

    const weaknessTestMutation = useMutation({
        mutationFn: (testSize: number) => generateWeaknessBasedTest({ testSize }),
        onSuccess: (response) => {
            if (response.data.mcqIds.length === 0) {
                return addToast("No content available for this session. Complete some quizzes first!", "info");
            }
            startSessionMutation.mutate({ mode: 'weakness', mcqIds: response.data.mcqIds });
        },
        onError: (error: any) => {
            addToast(`Error generating weakness test: ${error.message}`, "error");
        }
    });

    const warmupQuizMutation = useMutation({
        mutationFn: () => getDailyWarmupQuiz(),
        onSuccess: (response) => {
             if (response.data.mcqIds.length === 0) {
                return addToast("No content available for this session.", "info");
            }
            startSessionMutation.mutate({ mode: 'warmup', mcqIds: response.data.mcqIds });
        },
        onError: (error: any) => {
            addToast(`Error generating warm-up quiz: ${error.message}`, "error");
        }
    });
    
    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const query = (new FormData(e.currentTarget).get('search') as string).trim();
        if (query.length < 3) return addToast("Please enter at least 3 characters.", "info");
        navigate(`/search?q=${encodeURIComponent(query)}`);
    };

    const toggleTopic = useCallback((topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    }, []);

    if (isLoadingData || isLoadingActiveSession) return <Loader fullScreen message="Loading dashboard..." />;
    if (errorLoadingData || !appData || !user) return <div className="text-center py-10 text-red-500">Could not load application data.</div>;

    const isActionLoading = startSessionMutation.isPending || weaknessTestMutation.isPending || warmupQuizMutation.isPending;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Welcome, {user.displayName || 'Future Pediatrician'}!</h1>
            
            {activeSession && !activeSession.isFinished && (
                <div className="card-base p-4 bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 flex items-center justify-between animate-fade-in-up">
                    <p className="font-semibold">Continue your {activeSession.mode.replace(/_/g, ' ')} session?</p>
                    <Link to={`/session/${activeSession.mode}/${activeSession.id}`} className="btn-secondary flex items-center gap-2 px-3 py-1 text-sm">Resume <ArrowPathIcon className="h-4 w-4" /></Link>
                </div>
            )}

            <div className="card-base p-4">
                <form onSubmit={handleSearchSubmit}>
                    <div className="relative"><input type="search" name="search" placeholder="Smart Search all content..." className="input-field pl-10" /><div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400" /></div></div>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onClick={() => warmupQuizMutation.mutate()} disabled={isActionLoading || !isOnline} className="btn-warning py-4 text-lg">☀️ Daily Warm-up</button>
                <Link to="/custom-test-builder" className="btn-primary flex items-center justify-center py-4 text-lg">Build Custom Test</Link>
                <button onClick={() => weaknessTestMutation.mutate(20)} disabled={isActionLoading || !isOnline} className="btn-secondary py-4 text-lg">🎯 AI Weakness Test</button>
            </div>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold pt-4">Browse Topics</h2>
                {generalTopics.map((topic: Topic) => {
                    const isExpanded = expandedTopics.has(topic.id);
                    return (
                        <div key={topic.id} className="card-base overflow-hidden transition-all">
                            <button className="w-full text-left p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-700/50" onClick={() => toggleTopic(topic.id)}>
                                <h3 className="font-bold text-lg">{topic.name}</h3>
                                <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-300`, isExpanded && 'rotate-180')} />
                            </button>
                            {isExpanded && (
                                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                    <ul className="space-y-2">
                                        {(topic.chapters as Chapter[]).map((chapter: Chapter) => (
                                            <li key={chapter.id}>
                                                <Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-100 dark:hover:bg-sky-900/50">
                                                   <p className="font-medium">{chapter.name}</p>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>
        </div>
    );
};

export default HomePage;