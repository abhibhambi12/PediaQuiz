import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAttemptedMCQs, getDueReviewItems, getActiveSession } from '@/services/userDataService';
import { generateWeaknessBasedTest, getDailyWarmupQuiz, getExpandedSearchTerms } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService'; 
import { ChevronDownIcon, ChevronRightIcon, BookIcon, BrainIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, AttemptedMCQs } from '@pediaquiz/types';
import clsx from 'clsx';

const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { data: appData, isLoading, error } = useData();
    const { addToast } = useToast();
    const navigate = useNavigate();
    
    const [expandedTopics, setExpandedTopics] = new useState<Set<string>>(new Set());

    const generalTopics = useMemo(() => appData?.topics.filter((topic: Topic) => topic.source === 'General') || [], [appData]);

    const { data: attemptedMCQs, isLoading: areAttemptsLoading } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
        staleTime: 1000 * 60,
    });

    const { data: dueItems, isLoading: areDueItemsLoading } = useQuery<{ dueMcqIds: string[], dueFlashcardIds: string[] }>({
        queryKey: ['dueReviewItems', user?.uid],
        queryFn: getDueReviewItems, // No need for .then(res => res.data)
        enabled: !!user,
        staleTime: 1000 * 60 * 5,
    });

    const { data: activeSession, isLoading: isLoadingActiveSession } = useQuery<{ sessionId: string | null, sessionMode?: string }>({
        queryKey: ['activeSession', user?.uid],
        queryFn: getActiveSession, // No need for .then(res => res.data)
        enabled: !!user,
        staleTime: 0,
        gcTime: 0,
    });

    const totalDueItems = useMemo(() => (dueItems?.dueMcqIds?.length || 0) + (dueItems?.dueFlashcardIds?.length || 0), [dueItems]);

    const generateWeaknessTestMutation = useMutation<
        { mcqIds: string[] }, // Explicit return type
        Error, // Error type
        void
    >({
        mutationFn: async () => {
            if (!user) throw new Error("User not available.");
            return await generateWeaknessBasedTest({ testSize: 20 });
        },
        onSuccess: async (data) => {
            if (data.mcqIds.length === 0) {
                addToast("Could not generate an AI weakness test with the current data.", "info");
                return;
            }
            addToast(`Generated AI weakness test with ${data.mcqIds.length} questions!`, "success");
            const sessionId = await SessionManager.createSession(user!.uid, 'weakness', data.mcqIds);
            navigate(`/session/weakness/${sessionId}`);
        },
        onError: (error: Error) => addToast(`Error generating test: ${error.message}`, "danger"),
    });

    const handleGenerateAiTest = () => {
        if (!user || Object.keys(attemptedMCQs || {}).length < 10) {
            addToast("Attempt at least 10 questions to unlock AI-powered tests.", "info");
            return;
        }
        generateWeaknessTestMutation.mutate();
    };

    const getDailyWarmupQuizMutation = useMutation<
        { mcqIds: string[] }, // Explicit return type
        Error, // Error type
        void // Variables type, no explicit userId needed as it's from auth context on backend
    >({
        mutationFn: async () => {
            if (!user) throw new Error("User not available.");
            // userId is retrieved on the backend from auth context, no need to pass it here.
            return await getDailyWarmupQuiz({ count: 10 });
        },
        onSuccess: async (data) => {
            if (data.mcqIds.length === 0) {
                addToast("No questions available for Daily Warmup at the moment.", "info");
                return;
            }
            addToast(`Starting Daily Warmup with ${data.mcqIds.length} questions!`, "success");
            const sessionId = await SessionManager.createSession(user!.uid, 'warmup', data.mcqIds);
            navigate(`/session/warmup/${sessionId}`);
        },
        onError: (error: Error) => addToast(`Failed to get Daily Warmup: ${error.message}`, "danger"),
    });

    const handleStartDailyWarmup = () => {
        if (!user) {
            addToast("Please log in to start a Daily Warmup.", "info");
            return;
        }
        getDailyWarmupQuizMutation.mutate();
    };
    
    const handleStartReviewDue = async () => {
        if (!user || !dueItems || totalDueItems === 0) {
            addToast("No items currently due for review!", "info");
            return;
        }
        const dueMcqsForSession = dueItems.dueMcqIds || []; 
        if (dueMcqsForSession.length === 0) {
             addToast("No MCQs are due for review. Flashcard review coming soon!", "info");
             return;
        }
        try {
            const sessionId = await SessionManager.createSession(user.uid, 'review_due', dueMcqsForSession);
            navigate(`/session/review_due/${sessionId}`);
        } catch (err: any) {
            addToast("Failed to start review session. Please try again.", "danger");
        }
    };

    const getExpandedSearchTermsMutation = useMutation<
        { terms: string[] },
        Error,
        string
    >({
        mutationFn: (query) => getExpandedSearchTerms({ query }),
        onSuccess: (data, query) => {
            navigate('/search', { state: { query, expandedTerms: data.terms } });
        },
        onError: (error: Error, query) => { 
            addToast(`Search expansion failed: ${error.message}`, "danger");
            navigate('/search', { state: { query } }); 
        },
    });

    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const searchQuery = formData.get('search') as string;
        if (searchQuery.trim().length < 3) {
            addToast("Please enter at least 3 characters to search.", "info");
            return;
        }
        getExpandedSearchTermsMutation.mutate(searchQuery.trim());
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    if (isLoading || areAttemptsLoading || areDueItemsLoading || isLoadingActiveSession) return <Loader message="Loading study data..." />;
    if (error) return <div className="text-center py-4 text-red-500">Failed to load topics: {error.message}</div>;

    const canGenerateAiTest = user && Object.keys(attemptedMCQs || {}).length >= 10;
    const hasActiveSession = !!(activeSession?.sessionId && user?.activeSessionId === activeSession.sessionId);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">Dashboard</h1>
            
            <div className="card-base p-4">
                <form onSubmit={handleSearchSubmit}>
                    <div className="relative">
                        <input type="search" name="search" placeholder="Search all MCQs and Flashcards..." className="w-full p-3 pl-10 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                    </div>
                </form>
            </div>

            {hasActiveSession && (
                <div className="card-base p-4 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200">
                    <p className="font-bold text-xl">Resume Your Last Session!</p>
                    <p className="text-sm mt-1">You have an active {activeSession.sessionMode?.replace(/_/g,' ')} session in progress.</p>
                    <button 
                        onClick={() => navigate(`/session/${activeSession.sessionMode}/${activeSession.sessionId}`)}
                        className="btn-secondary mt-3 px-4 py-2"
                    >
                        Continue Session
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={handleStartDailyWarmup} disabled={!!getDailyWarmupQuizMutation.isPending || !user || !!hasActiveSession} className="card-base p-4 bg-sky-500 hover:bg-sky-600 text-white font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 text-center">
                    <span>☀️ {getDailyWarmupQuizMutation.isPending ? 'Loading...' : 'Start Daily Warmup'}</span>
                    <p className="text-sm font-normal text-white/90">A quick test of mixed topics</p>
                </button>
                <button onClick={handleGenerateAiTest} disabled={!!generateWeaknessTestMutation.isPending || !canGenerateAiTest || !!hasActiveSession} className="card-base p-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 text-center">
                    <span><BrainIcon className="inline h-6 w-6 mr-1" /> {generateWeaknessTestMutation.isPending ? "Generating..." : "AI Weakness Test"}</span>
                    <p className="text-sm font-normal text-white/90">AI-powered personalized review</p>
                </button>
            </div>
             {!canGenerateAiTest && <p className="text-xs text-center text-slate-500 dark:text-slate-400 -mt-2">Attempt at least 10 questions to unlock AI-powered tests.</p>}
            
            <div className="card-base p-4">
                <button onClick={handleStartReviewDue} disabled={totalDueItems === 0 || !user || !!hasActiveSession} className="block text-center w-full py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <span className={clsx("font-bold text-xl", totalDueItems > 0 ? "text-secondary-600 dark:text-secondary-400" : "text-slate-500")}>🗓️ {totalDueItems} Item(s) Due for Review!</span>
                    <p className="text-sm font-normal text-slate-500 dark:text-slate-400">Practice spaced repetition</p>
                </button>
            </div>

            <div className="card-base p-4">
                <Link to="/custom-test-builder" className="block text-center group py-2">
                    <span className="font-bold text-xl text-primary-600 dark:text-primary-400 group-hover:text-primary-700 dark:group-hover:text-primary-500 transition-colors">✍️ Build a Custom Test</span>
                    <p className="text-sm font-normal text-slate-500 dark:text-slate-400">Create tests from specific topics/chapters</p>
                </Link>
            </div>

            <div className="card-base p-4">
                <Link to="/marrow-qbank" className="block text-center group py-2">
                    <span className="font-bold text-xl text-teal-600 dark:text-teal-400 group-hover:text-teal-700 dark:group-hover:text-teal-500 transition-colors">📚 High-Yield QBank (Marrow)</span>
                    <p className="text-sm font-normal text-slate-500 dark:text-slate-400">Targeted content from top sources</p>
                </Link>
            </div>


            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 pt-4">Browse Topics</h2>
            {generalTopics.length > 0 ? (
                generalTopics.map((topic: Topic) => {
                    const isExpanded = expandedTopics.has(topic.id);
                    return (
                        <div key={topic.id} className="card-base overflow-hidden">
                            <div onClick={() => toggleTopic(topic.id)} role="button" aria-expanded={isExpanded} className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{topic.chapterCount} Chapters | {topic.totalMcqCount} MCQs | {topic.totalFlashcardCount || 0} Flashcards</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {(topic.totalFlashcardCount ?? 0) > 0 && (<Link to={`/flashcards/${topic.id}/all`} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title={`Practice all flashcards for ${topic.name}`} onClick={e => e.stopPropagation()}><BookIcon /></Link>)}
                                    <ChevronDownIcon className={clsx(`transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="p-4 border-t border-slate-200 dark:border-slate-700"><ul className="space-y-2">
                                    {topic.chapters.map((chapter: Chapter) => (
                                        <li key={chapter.id}><Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-slate-700 dark:text-slate-300">{chapter.name}</p>

                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{chapter.mcqCount} MCQs | {chapter.flashcardCount || 0} Flashcards</p>
                                                </div>
                                                <ChevronRightIcon />
                                            </div>
                                        </Link></li>
                                    ))}
                                </ul></div>
                            )}
                        </div>
                    );
                })) : (
                <div className="card-base text-center py-8">
                    <p className="text-slate-500">No topics have been added yet.</p>
                    {user?.isAdmin && <p className="text-sm mt-2">You can add content from the Settings page.</p>}
                </div>
            )}
        </div>
    );
};

export default HomePage;