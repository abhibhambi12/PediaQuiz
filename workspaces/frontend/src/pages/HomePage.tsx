// workspaces/frontend/src/pages/HomePage.tsx
import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAttemptedMCQs } from '@/services/userDataService';
import { generateWeaknessBasedTest } from '@/services/aiService';
import { ChevronDownIcon, ChevronRightIcon, BookIcon, BrainIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, AttemptedMCQs, MCQ } from '@pediaquiz/types';

const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { data: appData, isLoading, error } = useData();
    const { addToast } = useToast();
    const navigate = useNavigate();
    
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const generalTopics = useMemo(() => { 
        return appData?.topics.filter(topic => topic.source === 'General') || [];
    }, [appData]);

    const { data: attemptedMCQs, isLoading: areAttemptsLoading } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const generateWeaknessTestMutation = useMutation<HttpsCallableResult<{ mcqIds: string[] }>, Error, { attempted: AttemptedMCQs; allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[]; testSize: number; }>({
        mutationFn: generateWeaknessBasedTest,
        onSuccess: (response) => {
            const mcqIds = response.data.mcqIds;
            if (mcqIds.length === 0) {
                addToast("Could not generate an AI weakness test with the current data.", "info");
            } else {
                addToast(`Generated AI weakness test with ${mcqIds.length} questions!`, "success");
                navigate(`/session/weakness/test_${Date.now()}`, { state: { generatedMcqIds: mcqIds } });
            }
        },
        onError: (error) => addToast(`Error generating test: ${error.message}`, "error"),
    });

    const handleGenerateAiTest = () => {
        if (!user || !appData?.mcqs) {
            addToast("Please log in to generate AI tests.", "info");
            return;
        }
        if (Object.keys(attemptedMCQs || {}).length < 10) {
            addToast("Attempt at least 10 questions to unlock AI-powered tests.", "info");
            return;
        }

        const lightweightMcqs = appData.mcqs.map(mcq => ({
            id: mcq.id,
            topicId: mcq.topicId,
            chapterId: mcq.chapterId,
            source: mcq.source,
            tags: mcq.tags,
        }));

        generateWeaknessTestMutation.mutate({
            attempted: attemptedMCQs,
            allMcqs: lightweightMcqs,
            testSize: 20
        });
    };

    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const searchQuery = formData.get('search') as string;
        if (searchQuery.trim().length < 3) {
            addToast("Please enter at least 3 characters to search.", "info");
            return;
        }
        navigate('/search', { state: { query: searchQuery } });
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    if (isLoading || areAttemptsLoading) return <Loader message="Loading study data..." />;
    if (error) return <div className="text-center py-4 text-red-500">Failed to load topics: {error.message}</div>;
    if (!appData || !generalTopics.length) return <div className="text-center py-10">No general topics found.</div>;

    const canGenerateAiTest = user && Object.keys(attemptedMCQs || {}).length >= 10;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">Dashboard</h1>
            
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
                <form onSubmit={handleSearchSubmit}>
                    <div className="relative">
                        <input
                            type="search"
                            name="search"
                            placeholder="Search all MCQs and Flashcards..."
                            className="w-full p-3 pl-10 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/custom-test-builder" className="flex items-center justify-center gap-3 w-full text-center p-4 rounded-xl shadow-md bg-sky-500 hover:bg-sky-600 text-white font-bold text-lg transition-colors">
                    Build a Custom Test
                </Link>
                <button
                    onClick={handleGenerateAiTest}
                    disabled={generateWeaknessTestMutation.isPending || !canGenerateAiTest}
                    className="flex items-center justify-center gap-3 w-full text-center p-4 rounded-xl shadow-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <BrainIcon />
                    {generateWeaknessTestMutation.isPending ? "Generating..." : "🎯 Start AI Weakness Test"}
                </button>
            </div>
             {!canGenerateAiTest && <p className="text-xs text-center text-slate-500 dark:text-slate-400 -mt-2">Attempt at least 10 questions to unlock AI-powered tests.</p>}
            
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all p-4">
                <Link to="/marrow-qbank" className="block text-center font-bold text-xl text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-500 transition-colors py-2">
                    📚 High-Yield QBank (Marrow)
                    <p className="text-sm font-normal text-slate-500 dark:text-slate-400">Targeted content from top sources</p>
                </Link>
            </div>

            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 pt-4">Browse Topics</h2>
            {generalTopics.map((topic: Topic) => {
                const isExpanded = expandedTopics.has(topic.id);
                return (
                    <div key={topic.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden transition-all">
                        <div 
                            className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            onClick={() => toggleTopic(topic.id)}
                            role="button"
                            aria-expanded={isExpanded}
                        >
                            <div>
                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {topic.chapterCount} Chapters | {topic.totalMcqCount} MCQs | {topic.totalFlashcardCount || 0} Flashcards
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                {(topic.totalFlashcardCount ?? 0) > 0 && (
                                    <Link to={`/flashcards/${topic.id}/all`} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title={`Practice all flashcards for ${topic.name}`} onClick={e => e.stopPropagation()}>
                                        <BookIcon />
                                    </Link>
                                )}
                                <ChevronDownIcon className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                        </div>
                        {isExpanded && (
                            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                <ul className="space-y-2">
                                    {topic.chapters.map((chapter: Chapter) => (
                                        <li key={chapter.id}>
                                            <Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-medium text-slate-700 dark:text-slate-300">{chapter.name}</p>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                                            {chapter.mcqCount} MCQs | {chapter.flashcardCount || 0} Flashcards
                                                        </p>
                                                    </div>
                                                    <ChevronRightIcon />
                                                </div>
                                            </Link>
                                        </li>
                                    ))}
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