// frontend/src/pages/CustomTestBuilder.tsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { createCustomTest } from '@/services/firestoreService';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
// Direct type imports
import { Chapter, Topic, MCQ, CreateCustomTestCallableData } from '@pediaquiz/types';
import clsx from 'clsx';

const CustomTestBuilder: React.FC = () => {
    const { appData, isLoadingData: isAppDataLoading, errorLoadingData: appDataError } = useData();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
    const [totalQuestions, setTotalQuestions] = useState<number>(20); // Default number of questions
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [customTestTitle, setCustomTestTitle] = useState('');

    const generalTopics = useMemo(() => {
        // Filter topics to only include 'General' source for custom tests
        return appData?.topics.filter((t: Topic) => t.source === 'General') || [];
    }, [appData]);

    // Calculate available MCQs based on selected chapters and data from topics (which should have counts)
    const availableMcqCount = useMemo(() => {
        if (!appData || !generalTopics) return 0;
        let count = 0;
        generalTopics.forEach((topic: Topic) => {
            // Ensure chapters are of type Chapter[] for consistent access to mcqCount
            (topic.chapters as Chapter[]).forEach((chapter: Chapter) => {
                if (selectedChapters.has(chapter.id)) {
                    count += chapter.mcqCount;
                }
            });
        });
        return count;
    }, [selectedChapters, generalTopics, appData]);

    const createTestMutation = useMutation({
        mutationFn: (data: CreateCustomTestCallableData) => createCustomTest(data),
        onSuccess: (response: any) => { // response.data is from callable, so it's `any` initially
            addToast(`Custom test "${customTestTitle}" created successfully!`, "success");
            const { testId, questions: mcqIds } = response.data; // Access data property from HttpsCallableResult
            navigate(`/session/custom/${testId}`, {
                state: { generatedMcqIds: mcqIds } // Pass the generated MCQ IDs to the session page
            });
        },
        onError: (error: any) => {
            addToast(`Failed to create custom test: ${error.message}`, "error");
        },
    });

    const handleChapterToggle = (chapterId: string) => {
        setSelectedChapters(prev => {
            const newSet = new Set(prev);
            newSet.has(chapterId) ? newSet.delete(chapterId) : newSet.add(chapterId);
            return newSet;
        });
    };

    const handleTopicToggle = (topic: Topic) => {
        const chapterIdsInTopic = (topic.chapters as Chapter[]).map((c: Chapter) => c.id);
        const allSelected = chapterIdsInTopic.length > 0 && chapterIdsInTopic.every(id => selectedChapters.has(id));

        setSelectedChapters(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                chapterIdsInTopic.forEach(id => newSet.delete(id));
            } else {
                chapterIdsInTopic.forEach(id => newSet.add(id));
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
        if (!customTestTitle.trim()) {
            addToast("Please provide a title for your custom test.", "error");
            return;
        }
        if (selectedChapters.size === 0) {
            addToast("Please select at least one chapter.", "error");
            return;
        }
        if (totalQuestions <= 0) {
            addToast("Please enter a valid number of questions.", "error");
            return;
        }
        if (availableMcqCount < totalQuestions) {
            addToast(`You requested ${totalQuestions} questions, but only ${availableMcqCount} are available from selected chapters.`, "error");
            return;
        }

        // The `questions` field in `CreateCustomTestCallableData` expects chapter IDs
        createTestMutation.mutate({
            title: customTestTitle.trim(),
            questions: Array.from(selectedChapters), // Pass the selected chapter IDs
            // The number of questions will be determined by the backend picking from these chapters.
            // The frontend only passes the *selected chapters*, not a specific count of questions.
            // If the backend needs `totalQuestions`, it should be added to the callable data.
            // Based on current backend, it just uses selected chapters to pick all questions.
        });
    };

    if (isAppDataLoading) return <Loader message="Loading exam builder..." />;
    if (appDataError) return <div className="text-center py-10 text-red-500">{appDataError.message}</div>;

    const isStartButtonDisabled = selectedChapters.size === 0 || totalQuestions <= 0 || !customTestTitle.trim() || createTestMutation.isPending;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">Custom Test Builder</h1>

            <div className="card-base p-6 space-y-4">
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">1. Configure Your Test</h2>
                <div>
                    <label htmlFor="testTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Test Title
                    </label>
                    <input
                        id="testTitle"
                        type="text"
                        value={customTestTitle}
                        onChange={(e) => setCustomTestTitle(e.target.value)}
                        placeholder="e.g., Cardiology Review Test"
                        className="input-field"
                        disabled={createTestMutation.isPending}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Number of Questions (Available: {availableMcqCount})
                    </label>
                    <input
                        type="number"
                        id="numQuestions"
                        min={1}
                        // Max should be the available count, but at least 1 if availableMcqCount is 0
                        max={availableMcqCount > 0 ? availableMcqCount : 1}
                        value={totalQuestions}
                        // Ensure input value doesn't exceed available count or fall below 1
                        onChange={(e) => setTotalQuestions(Math.max(1, Math.min(availableMcqCount > 0 ? availableMcqCount : 1, parseInt(e.target.value, 10) || 0)))}
                        className="input-field"
                        disabled={availableMcqCount === 0 || createTestMutation.isPending}
                    />
                </div>
                <button
                    onClick={handleStartTest}
                    disabled={isStartButtonDisabled}
                    className="btn-success w-full py-3"
                >
                    {createTestMutation.isPending ? 'Creating Test...' : 'Start Custom Test'}
                </button>
            </div>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-4">2. Select Content</h2>
                <div className="space-y-3">
                    {generalTopics.length === 0 ? (
                        <p className="text-center py-4 text-slate-500 dark:text-slate-400">No general topics available for custom tests.</p>
                    ) : (
                        generalTopics.map((topic: Topic) => {
                            const isTopicExpanded = expandedTopics.has(topic.id);
                            const chaptersInTopic = topic.chapters as Chapter[]; // Cast to Chapter[]
                            const chapterIdsInTopic = chaptersInTopic.map((c: Chapter) => c.id);
                            const allInTopicSelected = chaptersInTopic.length > 0 && chapterIdsInTopic.every(id => selectedChapters.has(id));
                            const selectedInTopicCount = chaptersInTopic.filter((c: Chapter) => selectedChapters.has(c.id)).length;
                            const isIndeterminate = selectedInTopicCount > 0 && selectedInTopicCount < chaptersInTopic.length;

                            return (
                                <div key={topic.id} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id={`topic-${topic.id}`}
                                                checked={allInTopicSelected}
                                                ref={el => el && (el.indeterminate = isIndeterminate)}
                                                onChange={() => handleTopicToggle(topic)}
                                                className="form-checkbox h-5 w-5 text-sky-600 rounded focus:ring-sky-500"
                                                disabled={createTestMutation.isPending}
                                            />
                                            <label htmlFor={`topic-${topic.id}`} className="font-medium cursor-pointer select-none text-slate-800 dark:text-slate-200">{topic.name}</label>
                                        </div>
                                        <button onClick={() => toggleTopicExpand(topic.id)} className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                            <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-200`, isTopicExpanded ? 'rotate-180' : '')} />
                                        </button>
                                    </div>
                                    {isTopicExpanded && (
                                        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                            <ul className="space-y-2">
                                                {chaptersInTopic.map((chapter: Chapter) => (
                                                    <li key={chapter.id}>
                                                        <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedChapters.has(chapter.id)}
                                                                onChange={() => handleChapterToggle(chapter.id)}
                                                                className="form-checkbox h-5 w-5 text-sky-600 rounded focus:ring-sky-500"
                                                                disabled={createTestMutation.isPending}
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
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomTestBuilder;