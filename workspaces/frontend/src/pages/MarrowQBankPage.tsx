import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics';
import { getAttemptedMCQs } from '@/services/userDataService';
import { generateWeaknessBasedTest } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService';
import { ChevronDownIcon, ChevronRightIcon, BrainIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, AttemptedMCQs } from '@pediaquiz/types';
import clsx from 'clsx';

const MarrowQBankPage: React.FC = () => {
    const { user } = useAuth();
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const marrowTopics = useMemo(() => {
        return topics?.filter(topic => topic.source === 'Marrow') || [];
    }, [topics]);

    const { data: attemptedMCQs, isLoading: areAttemptsLoading, error: attemptsError } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const generateWeaknessTestMutation = useMutation<
        { mcqIds: string[] }, // Explicit return type (backend now returns this directly)
        Error, // Error type
        { testSize: number } // Variables type for the function call
    >({
        mutationFn: async (vars) => {
            if (!user) throw new Error("User not authenticated.");
            return await generateWeaknessBasedTest(vars);
        },
        onSuccess: async (data) => {
            const mcqIds = data.mcqIds;
            if (mcqIds.length === 0) {
                addToast("Could not generate an AI weakness test from Marrow content.", "info");
                return;
            }
            addToast(`Generated a Marrow weakness test!`, "success");
            const sessionId = await SessionManager.createSession(user!.uid, 'weakness', mcqIds);
            navigate(`/session/weakness/${sessionId}`);
        },
        onError: (error: Error) => {
            addToast(`Error generating test: ${error.message}`, "danger");
        },
    });

    const handleGenerateMarrowAiTest = () => {
        if (!user) { // Ensure user is logged in
            addToast("Please log in to generate AI tests.", "warning");
            return;
        }
        if (!hasAttemptedMarrowQuestions) {
            addToast("Attempt some Marrow questions first to unlock the AI Weakness Test.", "info");
            return;
        }
        generateWeaknessTestMutation.mutate({ testSize: 20 }); // Pass testSize as variable
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    const hasAttemptedMarrowQuestions = useMemo(() => {
        if (!attemptedMCQs || !marrowTopics.length || !topics) return false;
        const marrowTopicIds = new Set(marrowTopics.map(t => t.id));
        
        // Create a map for quick chapterId to topicId lookup
        const chapterToTopicIdMap = new Map<string, string>();
        topics.forEach(topic => {
            topic.chapters.forEach(chapter => {
                chapterToTopicIdMap.set(chapter.id, topic.id);
            });
        });

        return Object.values(attemptedMCQs).some(attemptWrapper => {
            const mcqId = attemptWrapper.latestAttempt.mcqId;
            // Extract chapterId from mcqId based on the pattern "chapterId_somethingElse"
            const chapterIdEndIndex = mcqId.indexOf('_');
            const chapterId = chapterIdEndIndex !== -1 ? mcqId.substring(0, chapterIdEndIndex) : mcqId;
            
            const topicId = chapterToTopicIdMap.get(chapterId);
            return topicId ? marrowTopicIds.has(topicId) : false;
        });
    }, [attemptedMCQs, marrowTopics, topics]);


    if (areTopicsLoading || areAttemptsLoading) return <Loader message="Loading Marrow QBank..." />;
    if (topicsError || attemptsError) return <div className="text-center py-4 text-red-500">Error: {topicsError?.message || attemptsError?.message}</div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <h1 className="text-3xl font-bold text-success-600 dark:text-success-400">High-Yield QBank (Marrow)</h1>
            <p className="text-neutral-500">
                Browse and practice questions extracted from your Marrow PDF uploads.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/custom-test-builder" state={{ source: 'marrow' }} className="btn-primary py-3 flex items-center justify-center gap-2 text-lg">
                    Build a Custom Test
                </Link>
                <button
                    onClick={handleGenerateMarrowAiTest}
                    disabled={generateWeaknessTestMutation.isPending || !hasAttemptedMarrowQuestions || !user}
                    className="btn-secondary py-3 flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <BrainIcon className="w-6 h-6"/>
                    {generateWeaknessTestMutation.isPending ? "Generating..." : "🎯 Start AI Marrow Weakness Test"}
                </button>
            </div>
            {!hasAttemptedMarrowQuestions && <p className="text-xs text-center text-neutral-500 -mt-2">Attempt some Marrow questions first to unlock the AI Weakness Test.</p>}

            <h2 className="text-2xl font-bold pt-4">Browse Marrow Topics</h2>
            {(marrowTopics && marrowTopics.length > 0) ? (
                <div className="space-y-4">
                    {marrowTopics.map((topic: Topic) => {
                        const isExpanded = expandedTopics.has(topic.id);
                        return (
                            <div key={topic.id} className="card-base overflow-hidden transition-all duration-200 ease-in-out">
                                <div
                                    className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                                    onClick={() => toggleTopic(topic.id)}
                                >
                                    <div>
                                        <h3 className="font-bold text-lg">{topic.name}</h3>
                                        <p className="text-sm text-neutral-500 dark:text-neutral-400">{topic.chapters.length} Chapters | {topic.totalMcqCount || 0} MCQs</p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <ChevronDownIcon className={clsx(`transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
                                        <ul className="space-y-2">
                                            {topic.chapters.map((chapter: Chapter) => (
                                                <li key={chapter.id}>
                                                    <Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-neutral-50 dark:bg-neutral-700/50 hover:bg-success-100 dark:hover:bg-success-900/50 transition-colors">
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="font-medium">{chapter.name}</p>
                                                                <p className="text-sm text-neutral-500 dark:text-neutral-400">{chapter.mcqCount || 0} MCQs</p>
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
            ) : (
                <p className="text-center py-8 text-neutral-500">No Marrow content found. Upload PDFs from Settings.</p>
            )}
        </div>
    );
};

export default MarrowQBankPage;