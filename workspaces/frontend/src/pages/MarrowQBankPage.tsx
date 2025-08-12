// --- CORRECTED FILE: workspaces/frontend/src/pages/MarrowQBankPage.tsx ---

import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics';
import { getAttemptedMCQs } from '@/services/userDataService';
import { generateWeaknessBasedTest } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService';
import { ChevronDownIcon, ChevronRightIcon, BrainIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
// FIX: Use relative import for types to bypass potential module resolution issues
import type { Chapter, Topic, MCQ, AttemptedMCQs, Attempt } from '../../types/src';
import clsx from 'clsx';
import { HttpsCallableResult } from 'firebase/functions'; // FIX: Correct import path for HttpsCallableResult

const MarrowQBankPage: React.FC = () => {
    const { user } = useAuth();
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);

    const marrowTopics = useMemo(() => {
        return topics?.filter(topic => topic.source === 'Marrow') || [];
    }, [topics]);

    const { data: keyClinicalTopics, isLoading: isLoadingKeyClinicalTopics, error: keyTopicsError } = useQuery<string[]>({
        queryKey: ['keyClinicalTopics'],
        queryFn: async () => {
            const snapshot = await getDocs(collection(db, 'KeyClinicalTopics'));
            return snapshot.docs.map(doc => doc.data().name as string).sort();
        }
    });

    const { data: attemptedMCQs, isLoading: areAttemptsLoading, error: attemptsError } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const generateWeaknessTestMutation = useMutation<string, Error, { allMcqs: Pick<MCQ, 'id'>[], testSize: number }>({
        mutationFn: async (vars) => {
            if (!user) throw new Error("User not authenticated.");
            const incorrectMarrowMcqIds = Object.keys(attemptedMCQs || {}).filter(mcqId => {
                const attempt = attemptedMCQs?.[mcqId];
                if (!attempt || attempt.isCorrect) return false;
                
                // Heuristic: Check if the MCQ ID might belong to a Marrow topic based on chapter structure.
                // This is still a heuristic as we don't have the MCQ's `source` directly in `attemptedMCQs`.
                // A better approach would be to query actual MCQs by ID and check their source.
                return marrowTopics.some(topic => 
                    topic.chapters.some((chapter: Chapter) => // FIX: Explicitly type chapter
                        chapter.mcqCount > 0 && mcqId.includes(chapter.id) // Simplified check
                    )
                );
            }).map(id => ({ id }));
            
            if (incorrectMarrowMcqIds.length < 5) {
                throw new Error("Answer at least 5 Marrow questions incorrectly to unlock AI Marrow weakness tests.");
            }

            const aiResponse = await generateWeaknessBasedTest({ 
                allMcqs: incorrectMarrowMcqIds, 
                testSize: vars.testSize 
            });
            
            const mcqIds = aiResponse.data.mcqIds;
            if (mcqIds.length === 0) {
                throw new Error("Could not generate an AI weakness test from Marrow content.");
            }
            return await SessionManager.createSession(user.uid, 'weakness', mcqIds);
        },
        onSuccess: (sessionId) => {
            addToast(`Generated a Marrow weakness test!`, "success");
            navigate(`/session/weakness/${sessionId}`);
        },
        onError: (error) => {
            addToast(`Error generating test: ${error.message}`, "danger");
        },
        onSettled: () => setIsGeneratingTest(false),
    });

    const handleGenerateMarrowAiTest = () => {
        setIsGeneratingTest(true);
        generateWeaknessTestMutation.mutate({ allMcqs: [], testSize: 20 });
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    if (areTopicsLoading || isLoadingKeyClinicalTopics || areAttemptsLoading) return <Loader message="Loading Marrow QBank..." />;
    if (topicsError || keyTopicsError || attemptsError) return <div className="text-center py-4 text-red-500">Error: {topicsError?.message || keyTopicsError?.message || attemptsError?.message}</div>;

    const canAttemptAiTest = !!user;
    const hasEnoughIncorrectMarrowForAiTest = user && Object.values(attemptedMCQs || {}).filter((a: Attempt) => !a.isCorrect).length >= 5;

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
                    disabled={generateWeaknessTestMutation.isPending || !canAttemptAiTest || isGeneratingTest || !hasEnoughIncorrectMarrowForAiTest}
                    className="btn-secondary py-3 flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <BrainIcon />
                    {isGeneratingTest ? "Generating..." : "🎯 Start AI Marrow Weakness Test"}
                </button>
            </div>
             {!canAttemptAiTest && <p className="text-xs text-center text-neutral-500 -mt-2">Log in to unlock AI Marrow weakness tests.</p>}
             {canAttemptAiTest && !hasEnoughIncorrectMarrowForAiTest && <p className="text-xs text-center text-neutral-500 -mt-2">Answer at least 5 Marrow questions incorrectly to unlock AI Marrow weakness tests.</p>}


            {keyClinicalTopics && keyClinicalTopics.length > 0 && (
                <div className="card-base p-4">
                    <h2 className="text-xl font-bold mb-3">Key Clinical Topics (Tags)</h2>
                    <div className="flex flex-wrap gap-2">
                        {keyClinicalTopics.map(tag => (
                            <Link key={tag} to={`/tags/${encodeURIComponent(tag.replace(/\s+/g, '_').toLowerCase())}`} className="px-3 py-1 rounded-full bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300 text-sm font-medium hover:bg-success-200 dark:hover:bg-success-800/50 transition-colors">
                                {tag}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

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