// workspaces/frontend/src/pages/CustomTestBuilder.tsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAllMcqs } from '@/services/firestoreService';
import { SessionManager } from '@/services/sessionService';
import { ChevronDownIcon } from '@/components/Icons';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, MCQ } from '@pediaquiz/types';
import clsx from 'clsx';

const CustomTestBuilder: React.FC = () => {
    const { user } = useAuth();
    const { data: appData, isLoading: isAppDataLoading, error: appDataError } = useData();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [isCreatingTest, setIsCreatingTest] = useState(false);

    const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
    const [totalQuestions, setTotalQuestions] = useState<number>(20);
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const topics = useMemo(() => appData?.topics || [], [appData]);
    
    const { data: allMcqs, isLoading: isLoadingAllMcqs, error: allMcqsError } = useQuery<MCQ[]>({
        queryKey: ['allMcqsForCustomTest'],
        queryFn: getAllMcqs,
        enabled: !!user,
        staleTime: 1000 * 60 * 5,
    });

    const selectedMcqCount = useMemo(() => {
        if (!topics) return 0;
        let count = 0;
        for (const topic of topics) {
            for (const chapter of topic.chapters) {
                if (selectedChapters.has(chapter.id)) {
                    count += chapter.mcqCount;
                }
            }
        }
        return count;
    }, [selectedChapters, topics]);

    const handleChapterToggle = (chapterId: string) => {
        setSelectedChapters(prev => {
            const newSet = new Set(prev);
            newSet.has(chapterId) ? newSet.delete(chapterId) : newSet.add(chapterId);
            return newSet;
        });
    };

    const handleTopicToggle = (chaptersInTopic: Chapter[]) => {
        const chapterIds = chaptersInTopic.map((c: Chapter) => c.id);
        const allSelected = chaptersInTopic.length > 0 && chapterIds.every(id => selectedChapters.has(id));
        
        setSelectedChapters(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                chapterIds.forEach(id => newSet.delete(id));
            } else {
                chapterIds.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };

    const toggleTopicExpand = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    const handleStartTest = async () => {
        setIsCreatingTest(true);
        const chapterIds = Array.from(selectedChapters);
        if (chapterIds.length === 0 || !user || !allMcqs) {
            addToast("Please select at least one chapter and ensure content is loaded.", "warning");
            setIsCreatingTest(false);
            return;
        }
        if (selectedMcqCount < totalQuestions) {
            addToast(`You requested ${totalQuestions} questions, but only ${selectedMcqCount} are available.`, "warning");
            setIsCreatingTest(false);
            return;
        }

        try {
            const allAvailableMcqs = allMcqs.filter((mcq: MCQ) => chapterIds.includes(mcq.chapterId));
            
            const testMcqIds = allAvailableMcqs
                .sort(() => 0.5 - Math.random())
                .slice(0, totalQuestions)
                .map((mcq: MCQ) => mcq.id);

            const sessionId = await SessionManager.createSession(user.uid, 'custom', testMcqIds);
            navigate(`/session/custom/${sessionId}`);

        } catch (err: any) {
            addToast("Failed to create the test. Please try again.", "danger");
            console.error(err);
        } finally {
            setIsCreatingTest(false);
        }
    };

    const isLoadingPage = isAppDataLoading || isLoadingAllMcqs;

    if (isLoadingPage) return <Loader message="Loading exam builder..." />;
    if (appDataError || allMcqsError) return <div className="text-center py-10 text-red-500">{appDataError?.message || allMcqsError?.message}</div>;

    const isStartButtonDisabled = selectedChapters.size === 0 || totalQuestions <= 0 || selectedMcqCount < totalQuestions || isCreatingTest || !allMcqs;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Custom Test Builder</h1>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">1. Configure Test</h2>
                <div className="mb-4">
                    <label htmlFor="numQuestions" className="block text-sm font-medium mb-1">
                        Number of Questions (Available: {selectedMcqCount})
                    </label>
                    <input
                        type="number"
                        id="numQuestions"
                        min={1}
                        max={selectedMcqCount > 0 ? selectedMcqCount : 1}
                        value={totalQuestions}
                        onChange={(e) => setTotalQuestions(Math.max(1, Math.min(selectedMcqCount, parseInt(e.target.value, 10) || 1)))}
                        className="input-field"
                        disabled={selectedMcqCount === 0}
                    />
                </div>
                <button
                    onClick={handleStartTest}
                    disabled={isStartButtonDisabled}
                    className="btn-success w-full py-3 text-lg"
                >
                    {isCreatingTest ? 'Building Test...' : 'Start Custom Test'}
                </button>
            </div>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">2. Select Content</h2>
                <div className="space-y-3">
                    {topics?.map((topic: Topic) => {
                        const isTopicExpanded = expandedTopics.has(topic.id);
                        const chaptersInTopic = topic.chapters;
                        const allInTopicSelected = chaptersInTopic.length > 0 && chaptersInTopic.every((c: Chapter) => selectedChapters.has(c.id));
                        const selectedInTopicCount = chaptersInTopic.filter((c: Chapter) => selectedChapters.has(c.id)).length;
                        const isIndeterminate = selectedInTopicCount > 0 && selectedInTopicCount < chaptersInTopic.length;

                        return (
                            <div key={topic.id} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id={`topic-${topic.id}`}
                                            checked={allInTopicSelected}
                                            ref={el => el && (el.indeterminate = isIndeterminate)}
                                            onChange={() => handleTopicToggle(chaptersInTopic)}
                                            className="h-5 w-5 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
                                        />
                                        <label htmlFor={`topic-${topic.id}`} className="font-medium cursor-pointer select-none">{topic.name}</label>
                                    </div>
                                    <button onClick={() => toggleTopicExpand(topic.id)} className="p-1">
                                        <ChevronDownIcon className={clsx(`transition-transform duration-200`, isTopicExpanded ? 'rotate-180' : '')} />
                                    </button>
                                </div>
                                {isTopicExpanded && (
                                    <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                        <ul className="space-y-2">
                                            {chaptersInTopic.map((chapter: Chapter) => (
                                                <li key={chapter.id}>
                                                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedChapters.has(chapter.id)}
                                                            onChange={() => handleChapterToggle(chapter.id)}
                                                            className="h-5 w-5 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
                                                        />
                                                        <span>{chapter.name} ({chapter.mcqCount} MCQs)</span>
                                                    </label>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CustomTestBuilder;