// frontend/src/pages/MarrowQBankPage.tsx
// frontend/pages/MarrowQBankPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuestions } from '../services/firestoreService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
// Direct type imports
import { MCQ, Topic, Chapter } from '@pediaquiz/types';
import { useTopics } from '@/hooks/useTopics'; // Import useTopics
import { ChevronDownIcon } from '@heroicons/react/24/outline'; // For expand/collapse
import clsx from 'clsx'; // For conditional classes

const MarrowQBankPage: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();

    // Fetch all Marrow MCQs
    const { data: allMarrowQuestions, isLoading: isLoadingQuestions, error: questionsError } = useQuery<MCQ[], Error>({
        queryKey: ['marrowQuestionsAll'],
        queryFn: () => getQuestions('MarrowMCQ'), // Specify collection name
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    // Fetch Marrow topics for structure
    const { data: allTopics, isLoading: isLoadingTopics, error: topicsError } = useTopics();

    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());


    useEffect(() => {
        if (questionsError) {
            addToast(`Failed to load Marrow questions: ${questionsError.message}`, "error");
        }
        if (topicsError) {
            addToast(`Failed to load Marrow topics: ${topicsError.message}`, "error");
        }
    }, [questionsError, topicsError, addToast]);

    // Group MCQs by Topic and Chapter for organized display
    const groupedMarrowContent = useMemo(() => {
        if (!allMarrowQuestions || !allTopics) return {};

        const marrowTopics = allTopics.filter(t => t.source === 'Marrow');
        type GroupedType = { [topicId: string]: { topic: Topic; chapters: { [chapterId: string]: { chapter: Chapter; mcqs: MCQ[] } } } };
        const grouped: GroupedType = {};

        marrowTopics.forEach(topic => {
            grouped[topic.id] = { topic: topic, chapters: {} };
            // Populate chapters based on the topic's own chapter list
            // Ensure topic.chapters is treated as Chapter[] for marrow topics
            (topic.chapters as Chapter[]).forEach(chapter => {
                grouped[topic.id].chapters[chapter.id] = { chapter: chapter, mcqs: [] };
            });
        });

        // Distribute MCQs into the grouped structure
        allMarrowQuestions.forEach(mcq => {
            const topicId = mcq.topicId;
            const chapterId = mcq.chapterId;
            // Ensure the topic and chapter exist in our grouped structure before pushing MCQ
            if (grouped[topicId] && grouped[topicId].chapters[chapterId]) {
                grouped[topicId].chapters[chapterId].mcqs.push(mcq);
            }
        });

        // Filter out chapters/topics that ended up empty after grouping MCQs
        Object.values(grouped).forEach(topicGroup => {
            for (const chapterId in topicGroup.chapters) {
                if (topicGroup.chapters[chapterId].mcqs.length === 0) {
                    delete topicGroup.chapters[chapterId];
                } else {
                    // Sort MCQs alphabetically within each chapter for consistent display
                    topicGroup.chapters[chapterId].mcqs.sort((a, b) => a.id.localeCompare(b.id));
                }
            }
            if (Object.keys(topicGroup.chapters).length === 0) {
                delete grouped[topicGroup.topic.id]; // Remove topic if it has no chapters with MCQs
            }
        });

        return grouped;
    }, [allMarrowQuestions, allTopics]);


    const handleSelectQuestion = (mcq: MCQ) => {
        // Navigating to the chapter detail page for context when an MCQ is clicked
        if (mcq.topicId && mcq.chapterId) {
            navigate(`/chapters/${mcq.topicId}/${mcq.chapterId}`);
        } else {
            addToast("Missing topic or chapter info for this MCQ. Cannot navigate.", "error");
        }
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    const toggleChapter = (chapterId: string) => {
        setExpandedChapters(prev => {
            const newSet = new Set(prev);
            newSet.has(chapterId) ? newSet.delete(chapterId) : newSet.add(chapterId);
            return newSet;
        });
    };


    if (isLoadingQuestions || isLoadingTopics) {
        return <Loader message="Loading Marrow Question Bank..." />;
    }

    if (questionsError || topicsError) {
        return <div className="p-6 text-center text-red-500">Error loading questions: {questionsError?.message || topicsError?.message}</div>;
    }

    // Sort topics for consistent display order
    const sortedTopics = Object.values(groupedMarrowContent).sort((a, b) => a.topic.name.localeCompare(b.topic.name));

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Marrow Question Bank</h1>
            {sortedTopics.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">No Marrow questions found.</p>
            ) : (
                <div className="space-y-4">
                    {sortedTopics.map(({ topic, chapters }) => {
                        const isTopicExpanded = expandedTopics.has(topic.id);
                        const sortedChapters = Object.values(chapters).sort((a, b) => a.chapter.name.localeCompare(b.chapter.name));

                        return (
                            <div key={topic.id} className="card-base overflow-hidden">
                                {/* Topic Header - Click to expand/collapse chapters within this topic */}
                                <div
                                    className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    onClick={() => toggleTopic(topic.id)}
                                >
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{Object.keys(chapters).length} Chapters with MCQs</p>
                                    </div>
                                    <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-300`, isTopicExpanded ? 'rotate-180' : '')} />
                                </div>
                                {isTopicExpanded && (
                                    <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                        {sortedChapters.map(({ chapter, mcqs }) => {
                                            const isChapterExpanded = expandedChapters.has(chapter.id);
                                            return (
                                                <div key={chapter.id} className="border border-slate-200 dark:border-slate-700 rounded-lg">
                                                    {/* Chapter Header - Click to expand/collapse MCQs within this chapter */}
                                                    <div
                                                        className="w-full text-left p-3 flex justify-between items-center cursor-pointer bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-50 dark:hover:bg-sky-900/50 transition-colors"
                                                        onClick={() => toggleChapter(chapter.id)}
                                                    >
                                                        <div>
                                                            <h4 className="font-medium text-slate-700 dark:text-slate-300">{chapter.name}</h4>
                                                            <p className="text-sm text-slate-500 dark:text-slate-400">{mcqs.length} MCQs</p>
                                                        </div>
                                                        <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-300`, isChapterExpanded ? 'rotate-180' : '')} />
                                                    </div>
                                                    {isChapterExpanded && (
                                                        <ul className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                                            {mcqs.map((mcq) => (
                                                                <li
                                                                    key={mcq.id}
                                                                    className="card-base p-4 cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors duration-150"
                                                                    onClick={() => handleSelectQuestion(mcq)}
                                                                >
                                                                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{mcq.question}</h2>
                                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                                        {mcq.tags?.map((tag: string) => (
                                                                            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
                                                                                {tag}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MarrowQBankPage;