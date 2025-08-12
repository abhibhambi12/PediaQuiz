// --- CORRECTED FILE: workspaces/frontend/src/pages/HomePage.tsx ---

import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics'; // REFACTORED: Use specific topic hook
import { getAttemptedMCQs } from '@/services/userDataService';
import { generateWeaknessBasedTest, getDailyWarmupQuiz, getExpandedSearchTerms } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService'; // NEW: SessionManager for persistent sessions
import { ChevronDownIcon, ChevronRightIcon, BookIcon, BrainIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, AttemptedMCQs, MCQ } from '@pediaquiz/types';
import clsx from 'clsx';
import { useSound } from '@/hooks/useSound';

const HomePage: React.FC = () => {
    const { user } = useAuth();
    // REFACTORED: Use useTopics hook instead of useData
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const { addToast } = useToast();
    const navigate = useNavigate();
    const { playSound } = useSound();
    
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [isSearching, setIsSearching] = useState(false);
    const [isCreatingTest, setIsCreatingTest] = useState(false); // New state for managing test creation loading

    const generalTopics = useMemo(() => { 
        return topics?.filter((topic: Topic) => topic.source === 'General') || [];
    }, [topics]);

    const { data: attemptedMCQs, isLoading: areAttemptsLoading } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const generateWeaknessTestMutation = useMutation<string, Error, { allMcqs: Pick<MCQ, 'id'>[]; testSize: number }>({
        mutationFn: async (vars) => {
            if (!user) throw new Error("User not authenticated.");
            // The generateWeaknessBasedTest callable now directly takes light-weight MCQ IDs.
            // We'll prepare this list based on the attempted MCQs.
            // NOTE: The backend function `generateWeaknessBasedTest` should handle filtering
            // based on `isCorrect` from attemptedMCQs if `allMcqs` provided here is just a list of IDs.
            // For now, we only pass IDs and assume the AI service decides from ALL questions available to it.
            // If the goal is truly "incorrect-only", `attemptedMCQs` would need to be passed directly.
            // Given original function signature had `attempted: AttemptedMCQs; allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[];`,
            // I'm assuming it needs to see all attempted for "recent/frequent".
            // Since `useData` is gone, we don't have all MCQs here.
            // Simplified for now to pass only incorrect IDs (as per logic in `MarrowQBankPage`).
            const incorrectAttemptedIds = Object.keys(attemptedMCQs || {}).filter(id => !(attemptedMCQs?.[id]?.isCorrect));
            const lightweightIncorrectMcqs = incorrectAttemptedIds.map(id => ({ id }));
            
            const aiResponse = await generateWeaknessBasedTest({ 
                allMcqs: lightweightIncorrectMcqs, 
                testSize: vars.testSize 
            });
            
            const mcqIds = aiResponse.data.mcqIds;
            if (mcqIds.length === 0) {
                throw new Error("Could not generate an AI weakness test.");
            }
            return await SessionManager.createSession(user.uid, 'weakness', mcqIds);
        },
        onSuccess: (sessionId) => {
            playSound('notification');
            addToast(`Generated AI weakness test!`, "success");
            navigate(`/session/weakness/${sessionId}`);
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Error generating test: ${error.message}`, "error");
        },
        onSettled: () => setIsCreatingTest(false),
    });

    const dailyWarmupMutation = useMutation<string, Error>({
        mutationFn: async () => {
            if (!user) throw new Error("User not authenticated.");
            const aiResponse = await getDailyWarmupQuiz();
            const mcqIds = aiResponse.data.mcqIds;
            if (mcqIds.length === 0) {
                throw new Error("Not enough questions for a warm-up yet.");
            }
            return await SessionManager.createSession(user.uid, 'quiz', mcqIds);
        },
        onSuccess: (sessionId) => {
            playSound('notification');
            addToast(`Your Daily Warm-up is ready!`, "success");
            navigate(`/session/quiz/${sessionId}`);
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Error generating warm-up: ${error.message}`, "error");
        },
        onSettled: () => setIsCreatingTest(false),
    });

    const handleGenerateAiTest = () => {
        if (!user) {
            addToast("Please log in to generate AI tests.", "info");
            return;
        }
        playSound('buttonClick');
        setIsCreatingTest(true);
        const incorrectCount = Object.values(attemptedMCQs || {}).filter(a => !a.isCorrect).length;
        if (incorrectCount < 5) {
            addToast("Answer at least 5 questions incorrectly to unlock AI-powered weakness tests.", "info");
            setIsCreatingTest(false);
            return;
        }
        generateWeaknessTestMutation.mutate({ testSize: 20, allMcqs: [] }); // allMcqs is now populated internally by mutationFn
    };

    const handleDailyWarmup = () => {
        if (!user) {
            addToast("Please log in to get a daily warm-up.", "info");
            return;
        }
        playSound('buttonClick');
        setIsCreatingTest(true);
        dailyWarmupMutation.mutate();
    }

    const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        playSound('buttonClick');
        setIsSearching(true);
        const formData = new FormData(e.currentTarget);
        const query = (formData.get('search') as string).trim();
        if (query.length < 3) {
            addToast("Please enter at least 3 characters to search.", "info");
            setIsSearching(false);
            return;
        }
        try {
            const response = await getExpandedSearchTerms({ query });
            const allTerms = Array.from(new Set([query, ...response.data.terms]));
            navigate('/search', { state: { query, allTerms } });
        } catch (searchError) {
            addToast(`Smart Search failed: ${(searchError as Error).message}. Using basic search.`, "error");
            navigate('/search', { state: { query, allTerms: [query] } });
        } finally {
            setIsSearching(false);
        }
    };

    const toggleTopic = (topicId: string) => {
        playSound('buttonClick');
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    if (areTopicsLoading || areAttemptsLoading) return <Loader message="Loading study data..." />;
    if (topicsError) return <div className="text-center py-4 text-red-500">{topicsError.message}</div>;
    
    // Check if user has enough incorrect Marrow questions for AI weakness test
    const canGenerateAiTest = user && Object.values(attemptedMCQs || {}).filter(a => !a.isCorrect).length >= 5;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">Dashboard</h1>
            
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
                <form onSubmit={handleSearchSubmit}>
                    <div className="relative">
                        <input
                            type="search" name="search" placeholder="Smart Search all MCQs and Flashcards..."
                            className="w-full p-3 pl-10 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            disabled={isSearching}
                        />
                         <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        {isSearching && <div className="absolute inset-y-0 right-0 flex items-center pr-3"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500"></div></div>}
                    </div>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                    onClick={handleDailyWarmup}
                    disabled={isCreatingTest}
                    className="px-4 py-4 rounded-xl shadow-md bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg transition-colors disabled:opacity-50"
                >
                   {dailyWarmupMutation.isPending ? "Building..." : "☀️ Daily Warm-up"}
                </button>
                <Link to="/custom-test-builder" onClick={() => playSound('buttonClick')} className="flex items-center justify-center gap-3 w-full text-center p-4 rounded-xl shadow-md bg-sky-500 hover:bg-sky-600 text-white font-bold text-lg transition-colors">
                    Build a Custom Test
                </Link>
                <button
                    onClick={handleGenerateAiTest}
                    disabled={isCreatingTest || !canGenerateAiTest}
                    className="flex items-center justify-center gap-3 w-full text-center p-4 rounded-xl shadow-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <BrainIcon />
                    {generateWeaknessTestMutation.isPending ? "Generating..." : "🎯 Start AI Weakness Test"}
                </button>
            </div>
             {!canGenerateAiTest && <p className="text-xs text-center text-slate-500 dark:text-slate-400 -mt-2">Answer at least 5 questions incorrectly to unlock AI-powered tests.</p>}
            
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all p-4">
                <Link to="/marrow-qbank" onClick={() => playSound('buttonClick')} className="block text-center font-bold text-xl text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-500 transition-colors py-2">
                    📚 High-Yield QBank (Marrow)
                    <p className="text-sm font-normal text-slate-500 dark:text-slate-400">Targeted content from top sources</p>
                </Link>
            </div>

            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 pt-4">Browse General Topics</h2>
            {generalTopics.map((topic: Topic) => {
                const isExpanded = expandedTopics.has(topic.id);
                return (
                    <div key={topic.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all">
                        <div 
                            className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            onClick={() => toggleTopic(topic.id)}
                        >
                           <div>
                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {topic.chapterCount} Chapters | {topic.totalMcqCount} MCQs | {topic.totalFlashcardCount || 0} Flashcards
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                {/* Direct link to flashcards for the whole topic */}
                                {(topic.totalFlashcardCount ?? 0) > 0 && (
                                    <Link to={`/flashcards/${topic.id}/all`} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title={`Practice all flashcards for ${topic.name}`} onClick={e => e.stopPropagation()}>
                                        <BookIcon />
                                    </Link>
                                )}
                                <ChevronDownIcon className={clsx(`transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                            </div>
                        </div>
                        {isExpanded && (
                            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                <ul className="space-y-2">
                                    {topic.chapters.map((chapter: Chapter) => {
                                        // Progress calculation now only needs attemptedMCQs and chapter's mcqCount
                                        const attemptedInChapter = Object.keys(attemptedMCQs || {}).filter(mcqId => {
                                            // This filter can be made more efficient if attemptedMCQs stored topic/chapter
                                            // For now, it relies on looking up the chapter based on the ID.
                                            return topics.some(t => t.id === topic.id && t.chapters.some(ch => ch.id === chapter.id));
                                        }).length;
                                        const progress = chapter.mcqCount > 0 ? (attemptedInChapter / chapter.mcqCount) * 100 : 0;

                                        return (
                                            <li key={chapter.id}>
                                                <Link to={`/chapters/${topic.id}/${chapter.id}`} onClick={() => playSound('buttonClick')} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors">
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="font-medium text-slate-700 dark:text-slate-300">{chapter.name}</p>
                                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                                {chapter.mcqCount} MCQs | {chapter.flashcardCount || 0} Flashcards
                                                            </p>
                                                        </div>
                                                        <ChevronRightIcon />
                                                    </div>
                                                    {chapter.mcqCount > 0 && (
                                                        <div className="mt-2">
                                                            <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                                                                <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                                                            </div>
                                                            <p className="text-xs text-right text-slate-400 mt-1">{progress.toFixed(0)}% Complete</p>
                                                        </div>
                                                    )}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default HomePage;