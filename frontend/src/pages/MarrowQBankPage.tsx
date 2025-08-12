// frontend/src/pages/MarrowQBankPage.tsx
import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAttemptedMCQs } from '@/services/userDataService';
import { generateWeaknessBasedTest } from '@/services/aiService';
import { ChevronDownIcon, ChevronRightIcon, BrainIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, MCQ, AttemptedMCQs } from '@pediaquiz/types';

const MarrowQBankPage: React.FC = () => {
    const { user } = useAuth();
    const { data: appData, isLoading: isAppDataLoading } = useData();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const marrowTopics = useMemo(() => {
        return appData?.topics.filter(topic => topic.source === 'Marrow') || [];
    }, [appData]);

    const { data: keyClinicalTopics, isLoading: isLoadingKeyClinicalTopics } = useQuery<string[]>({
        queryKey: ['keyClinicalTopics'],
        queryFn: async () => {
            const snapshot = await getDocs(collection(db, 'KeyClinicalTopics'));
            return snapshot.docs.map(doc => doc.data().name as string).sort();
        }
    });

    const { data: attemptedMCQs } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });

    const generateWeaknessTestMutation = useMutation<HttpsCallableResult<{ mcqIds: string[] }>, Error, { attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }>({
        mutationFn: generateWeaknessBasedTest,
        onSuccess: (response) => {
            const mcqIds = response.data.mcqIds;
            if (mcqIds.length === 0) {
                addToast("Could not generate an AI weakness test from Marrow content. Try answering more questions incorrectly!", "info");
            } else {
                addToast(`Generated a Marrow weakness test with ${mcqIds.length} questions!`, "success");
                navigate(`/session/weakness/marrow_test_${Date.now()}`, { state: { generatedMcqIds: mcqIds } });
            }
        },
        onError: (error) => addToast(`Error generating test: ${error.message}`, "error"),
    });

    const handleGenerateMarrowAiTest = () => {
        if (!user || !appData?.mcqs || !attemptedMCQs) {
            addToast("Please log in to generate AI tests.", "info");
            return;
        }

        const incorrectMarrowMcqIds = Object.keys(attemptedMCQs).filter(id => {
            const mcq = appData.mcqs.find(m => m.id === id);
            return mcq?.source === 'Marrow' && !attemptedMCQs[id].isCorrect;
        });

        if (incorrectMarrowMcqIds.length < 5) {
             addToast("Answer at least 5 Marrow questions incorrectly to unlock AI Marrow weakness tests.", "info");
             return;
        }

        // Optimization: Only send incorrectly answered Marrow MCQs to the AI
        const incorrectMarrowMcqs = appData.mcqs
            .filter(mcq => incorrectMarrowMcqIds.includes(mcq.id))
            .map(mcq => ({
                id: mcq.id,
                topicId: mcq.topicId,
                chapterId: mcq.chapterId,
                source: mcq.source,
                tags: mcq.tags,
            }));

        generateWeaknessTestMutation.mutate({
            attempted: attemptedMCQs,
            allMcqs: incorrectMarrowMcqs,
            testSize: 20
        });
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    if (isAppDataLoading || isLoadingKeyClinicalTopics) return <Loader message="Loading Marrow QBank..." />;

    const canGenerateAiTest = user && Object.keys(attemptedMCQs || {}).filter(id => {
        const mcq = appData?.mcqs.find(m => m.id === id);
        return mcq?.source === 'Marrow' && !attemptedMCQs[id].isCorrect;
    }).length >= 5;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-teal-600 dark:text-teal-400">High-Yield QBank (Marrow)</h1>
            <p className="text-slate-500 dark:text-slate-400">
                Browse and practice questions extracted from your Marrow PDF uploads.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/custom-test-builder" state={{ source: 'marrow' }} className="flex items-center justify-center gap-3 w-full text-center p-4 rounded-xl shadow-md bg-sky-500 hover:bg-sky-600 text-white font-bold text-lg transition-colors">
                    Build a Custom Test
                </Link>
                <button
                    onClick={handleGenerateMarrowAiTest}
                    disabled={generateWeaknessTestMutation.isPending || !canGenerateAiTest}
                    className="flex items-center justify-center gap-3 w-full text-center p-4 rounded-xl shadow-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <BrainIcon />
                    {generateWeaknessTestMutation.isPending ? "Generating..." : "🎯 Start AI Marrow Weakness Test"}
                </button>
            </div>
             {!canGenerateAiTest && <p className="text-xs text-center text-slate-500 dark:text-slate-400 -mt-2">Answer at least 5 Marrow questions incorrectly to unlock AI Marrow weakness tests.</p>}


            {keyClinicalTopics && keyClinicalTopics.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4">
                    <h2 className="text-xl font-bold mb-3">Key Clinical Topics (Tags)</h2>
                    <div className="flex flex-wrap gap-2">
                        {keyClinicalTopics.map(tag => (
                            <Link key={tag} to={`/tags/${encodeURIComponent(tag.replace(/\s+/g, '_').toLowerCase())}`} className="px-3 py-1 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-800/50 transition-colors">
                                {tag}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 pt-4">Browse Marrow Topics</h2>
            {(marrowTopics && marrowTopics.length > 0) ? (
                marrowTopics.map((topic: Topic) => {
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
                                        {topic.chapters.length} Chapters | {topic.totalMcqCount || 0} MCQs
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <ChevronDownIcon className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                    <ul className="space-y-2">
                                        {topic.chapters.map((chapter: Chapter) => (
                                            <li key={chapter.id}>
                                                <Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors">
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="font-medium text-slate-700 dark:text-slate-300">{chapter.name}</p>
                                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                                {chapter.mcqCount || 0} MCQs
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
                })
            ) : (
                <p className="text-center py-8 text-slate-500">No Marrow content found. Upload PDFs from Settings.</p>
            )}
        </div>
    );
};

export default MarrowQBankPage;