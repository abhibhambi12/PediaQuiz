// frontend/pages/ChapterDetailPage.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTopics } from '@/hooks/useTopics';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getChapterContent } from '@/services/firestoreService';
import { generateChapterSummary } from '@/services/aiService'; // Ensure generateChapterSummary is imported
import { getAttemptedMCQs } from '@/services/userDataService';
import { SessionManager } from '@/services/sessionService';
import Loader from '@/components/Loader';
// Removed 'type' prefix for direct usage of types from @pediaquiz/types
import { Chapter, Topic, MCQ, Flashcard, AttemptedMCQDocument } from '@pediaquiz/types';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
// Ensure all necessary Chart.js components are registered
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement as ChartJsBarElement } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp
import { normalizeId } from '@/utils/helpers'; // Import normalizeId

// Register Chart.js components required for Doughnut chart
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, ChartJsBarElement);

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();

    // State for managing tabs in Study Materials section
    const [activeTab, setActiveTab] = useState<'notes' | 'ai_summary' | null>(null); // Renamed 'summary_preview' to 'ai_summary'
    const [aiSummaryContent, setAiSummaryContent] = useState<string | null>(null); // To store AI generated summary

    const [isCreatingSession, setIsCreatingSession] = useState(false);

    // Derive chapter and topic from global topics data
    const { chapter, topic } = useMemo(() => {
        if (!topics || !topicId) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        // Ensure that for Marrow topics, chapters are objects, and for General, they are strings
        const foundChapter = (foundTopic?.chapters as Chapter[] | string[] | undefined)?.find((ch: Chapter | string) =>
            typeof ch === 'string' ? normalizeId(ch) === chapterId : (ch as Chapter).id === chapterId
        ) as Chapter || null;

        // If chapter found as string, convert to Chapter object (for General topics)
        if (foundTopic && typeof foundChapter === 'string') {
            return {
                chapter: {
                    id: normalizeId(foundChapter),
                    name: foundChapter,
                    topicId: foundTopic.id,
                    source: 'General', // Default source for string chapters
                    topicName: foundTopic.name,
                    mcqCount: 0, flashcardCount: 0, // Will be filled by getChapterContent or useTopics
                } as Chapter,
                topic: foundTopic
            };
        }

        return { chapter: foundChapter, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    // Fetch content (MCQs & Flashcards) specific to this chapter
    const { data: chapterContent, isLoading: isContentLoading } = useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
        queryKey: ['chapterContent', chapterId],
        queryFn: () => getChapterContent(chapterId!), // chapterId is guaranteed by enabled
        enabled: !!chapterId,
    });

    // Fetch user's attempted MCQs for progress calculation
    const { data: attemptedMCQDocs, isLoading: areAttemptsLoading } = useQuery<Record<string, AttemptedMCQDocument>, Error>({
        queryKey: ['attemptedMCQDocs', user?.uid],
        queryFn: ({ queryKey }) => getAttemptedMCQs(queryKey[1] as string),
        enabled: !!user,
    });

    // Calculate progress and incorrect MCQs
    const { incorrectMcqIdsInChapter, chapterProgress, correctMcqCount, attemptedCount, unattemptedCount } = useMemo(() => {
        if (!chapterContent?.mcqs || !attemptedMCQDocs || !chapter) {
            return { incorrectMcqIdsInChapter: [], chapterProgress: 0, correctMcqCount: 0, attemptedCount: 0, unattemptedCount: 0 };
        }
        const mcqsInChapter = chapterContent.mcqs;
        let countedAttempted = 0;
        let countedCorrect = 0;
        const incorrectIds: string[] = [];

        mcqsInChapter.forEach((mcq: MCQ) => {
            const attemptDoc = attemptedMCQDocs[mcq.id];
            if (attemptDoc && attemptDoc.latestAttempt) {
                countedAttempted++;
                if (attemptDoc.latestAttempt.isCorrect) {
                    countedCorrect++;
                } else {
                    incorrectIds.push(mcq.id);
                }
            }
        });
        const progress = mcqsInChapter.length > 0 ? (countedAttempted / mcqsInChapter.length) * 100 : 0;
        const remainingUnattempted = mcqsInChapter.length - countedAttempted;
        return { incorrectMcqIdsInChapter: incorrectIds, chapterProgress: progress, correctMcqCount: countedCorrect, attemptedCount: countedAttempted, unattemptedCount: remainingUnattempted };
    }, [chapterContent, attemptedMCQDocs, chapter]);

    const wrongInChapter = incorrectMcqIdsInChapter.length;

    // Mutation for generating AI summary (Feature #5 - Automated Note Augmentation)
    // This is also used for the "Generate Chapter Summary" button on AdminUploadCard
    const generateSummaryMutation = useMutation<any, Error, { uploadIds: string[], topicId?: string, chapterId?: string, source?: 'General' | 'Marrow' }>({
        mutationFn: generateChapterSummary,
        onSuccess: (data) => {
            setAiSummaryContent(data.data.summary);
            setActiveTab('ai_summary'); // Switch to AI Summary tab on success
            addToast("AI Summary generated!", 'success');
        },
        onError: (error: any) => {
            addToast(`Failed to generate AI Summary: ${error.message}`, "error");
            setAiSummaryContent(null);
            if (activeTab === 'ai_summary') setActiveTab('notes'); // Fallback to notes tab on error
        },
    });

    // Determine initial active tab based on available notes
    useEffect(() => {
        // If there are existing notes, default to notes tab
        if (chapter?.summaryNotes) {
            setActiveTab('notes');
        } else {
            // Otherwise, default to AI Summary if it's generated, or null
            setActiveTab('ai_summary');
        }
    }, [chapter]);

    // Admin-only: Trigger AI Summary generation from ChapterDetailPage
    const handleGenerateAISummary = () => {
        if (!user?.isAdmin) {
            addToast("You must be an admin to generate AI summaries.", "error");
            return;
        }
        if (!chapter?.sourceUploadIds || chapter.sourceUploadIds.length === 0) {
            addToast("No source uploads linked to this chapter to generate summary from. Please use the Admin Generator to upload content and link it.", "warning");
            return;
        }

        // Trigger the callable function
        generateSummaryMutation.mutate({
            uploadIds: chapter.sourceUploadIds,
            topicId: topic?.id,
            chapterId: chapter?.id,
            source: topic?.source,
        });
    };

    const isLoadingPage = areTopicsLoading || isContentLoading || areAttemptsLoading;

    if (isLoadingPage) return <Loader message="Loading chapter details..." />;
    if (topicsError) return <div className="text-center py-10 text-red-500">{topicsError.message}</div>;
    if (!chapter || !topic) {
        return <div className="text-center py-10"><h1 className="text-xl font-bold">Chapter Not Found</h1><p className="text-slate-500">Please check the URL or try again later.</p></div>;
    }

    // Helper for action buttons (Practice, Quiz, Review)
    const ActionButton: React.FC<{ mode: 'practice' | 'quiz' | 'incorrect' | 'flashcards', title: string, subtitle: string, disabled?: boolean, className?: string, mcqIds?: string[] }> = ({ mode, title, subtitle, disabled = false, className = '', mcqIds }) => {
        const handleAction = async () => {
            if (disabled || !user || !chapterContent) return;
            setIsCreatingSession(true);
            try {
                let sessionMcqIds: string[] = [];
                let sessionFlashcardIds: string[] = [];

                if (mode === 'incorrect') {
                    sessionMcqIds = mcqIds || [];
                } else if (mode === 'practice' || mode === 'quiz') {
                    sessionMcqIds = chapterContent.mcqs.map((m: MCQ) => m.id);
                } else if (mode === 'flashcards') {
                    // Flashcards mode directly navigates to the flashcard session page
                    navigate(`/flashcards/${topic.id}/${chapter.id}`);
                    return;
                }

                if (sessionMcqIds.length === 0 && sessionFlashcardIds.length === 0) {
                    addToast("No questions or flashcards available for this session.", "warning");
                    return;
                }

                // Corrected call to SessionManager.createSession with 4 arguments (mcqIds and flashcardIds)
                const sessionId = await SessionManager.createSession(user.uid, mode, sessionMcqIds, sessionFlashcardIds);
                navigate(`/session/${mode}/${sessionId}`);
            } catch (err: any) {
                addToast(`Failed to start session: ${err.message || "Unknown error"}`, "error");
                console.error("Failed to start session:", err);
            } finally {
                setIsCreatingSession(false);
            }
        };

        const buttonContent = (
            <>
                <h2 className="text-xl font-bold">{title}</h2>
                <p className="mt-1 text-sm">{subtitle}</p>
            </>
        );

        // For Flashcards, use Link directly to allow separate navigation logic (if needed)
        if (mode === 'flashcards') {
            return (
                <Link
                    to={`/flashcards/${topic.id}/${chapter.id}`}
                    className={clsx("block text-center p-6 rounded-lg shadow-md transition-transform hover:-translate-y-1", disabled ? "bg-slate-200 dark:bg-slate-700 cursor-not-allowed text-slate-500" : className)}
                    onClick={(e) => { if (disabled) e.preventDefault(); }}
                >
                    {buttonContent}
                </Link>
            );
        }

        // For other modes, use button with onClick handler
        return (
            <button
                onClick={handleAction}
                disabled={disabled || isCreatingSession}
                className={clsx("block text-center w-full p-6 rounded-lg shadow-md transition-transform hover:-translate-y-1", disabled || isCreatingSession ? "bg-slate-200 dark:bg-slate-700 cursor-not-allowed text-slate-500" : className)}
            >
                {isCreatingSession ? <Loader message="" /> : buttonContent}
            </button>
        );
    };


    // Data for the Doughnut Chart
    const chartData = {
        labels: ['Correct', 'Incorrect', 'Unattempted'],
        datasets: [{
            data: [correctMcqCount, wrongInChapter, unattemptedCount],
            backgroundColor: ['#22c55e', '#ef4444', '#64748b'], // Green, Red, Grey
            borderColor: ['#ffffff', '#ffffff', '#ffffff'],
            borderWidth: 2,
        }],
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="card-base p-6 space-y-4">
                <p className="text-sm text-sky-600 dark:text-sky-400 font-semibold">{topic.name}</p>
                <h1 className="text-3xl font-bold mt-1 mb-2">{chapter.name}</h1>
                <p className="text-slate-500 dark:text-slate-400">{chapter.mcqCount} MCQs | {chapter.flashcardCount} Flashcards</p>
                {chapter.mcqCount > 0 && (
                    <div className="my-4">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Your Progress</span>
                            <span className="text-sm font-bold text-sky-500">{chapterProgress.toFixed(0)}% Complete</span>
                        </div>
                        <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-2">
                            <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${chapterProgress}%` }}></div>
                        </div>
                        <div className="mt-4 flex flex-col items-center">
                            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Knowledge Snapshot</h3>
                            <div className="w-48 h-48">
                                <Doughnut data={chartData} />
                            </div>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ActionButton
                        mode="practice"
                        title="Practice Mode"
                        subtitle="Instant feedback"
                        className="bg-sky-500 text-white"
                        disabled={!chapterContent || chapterContent.mcqs.length === 0}
                    />
                    <ActionButton
                        mode="quiz"
                        title="Quiz Mode"
                        subtitle="Test your knowledge"
                        className="bg-indigo-500 text-white"
                        disabled={!chapterContent || chapterContent.mcqs.length === 0}
                    />
                    <ActionButton
                        mode="incorrect"
                        title="Review Mistakes"
                        subtitle={`${wrongInChapter} incorrect`}
                        disabled={wrongInChapter === 0}
                        className="bg-red-500 text-white"
                        mcqIds={incorrectMcqIdsInChapter}
                    />
                    <ActionButton
                        mode="flashcards"
                        title="Flashcards"
                        subtitle="Review key concepts"
                        className="bg-amber-500 text-white"
                        disabled={!chapter.flashcardCount}
                    />
                </div>
            </div>

            {/* Study Materials Section (Feature #3.2) */}
            <div className="card-base p-6">
                <h2 className="text-2xl font-bold mb-4 text-slate-700 dark:text-slate-300">Study Materials</h2>

                {/* Tab Navigation */}
                <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                    <button
                        className={clsx(
                            "px-4 py-2 text-sm font-medium",
                            activeTab === 'notes' ? "border-b-2 border-sky-500 text-sky-600 dark:text-sky-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                        onClick={() => setActiveTab('notes')}
                        // Only disable if there are NO manual notes AND NO AI summary, and AI summary is not pending
                        disabled={!chapter.summaryNotes && !aiSummaryContent && !generateSummaryMutation.isPending}
                    >
                        Notes
                    </button>
                    <button
                        className={clsx(
                            "px-4 py-2 text-sm font-medium",
                            activeTab === 'ai_summary' ? "border-b-2 border-sky-500 text-sky-600 dark:text-sky-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                        onClick={() => setActiveTab('ai_summary')}
                        disabled={generateSummaryMutation.isPending && !aiSummaryContent} // Disable if currently generating and no summary exists
                    >
                        AI Summary
                    </button>
                    {user?.isAdmin && (
                        <Link
                            to={`/admin/marrow/notes/edit/${topicId}/${chapterId}`}
                            state={{ source: topic?.source, chapterName: chapter.name }}
                            className="ml-auto btn-neutral text-xs py-1 px-3 self-center"
                        >
                            Edit Notes
                        </Link>
                    )}
                </div>

                {/* Tab Content */}
                <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
                    {activeTab === 'notes' && (
                        chapter.summaryNotes ? (
                            <ReactMarkdown>{chapter.summaryNotes}</ReactMarkdown>
                        ) : (
                            <p className="text-center text-slate-500 dark:text-slate-400">No manual notes available for this chapter.</p>
                        )
                    )}
                    {activeTab === 'ai_summary' && (
                        generateSummaryMutation.isPending ? (
                            <Loader message="Generating AI Summary..." />
                        ) : aiSummaryContent ? (
                            <ReactMarkdown>{aiSummaryContent}</ReactMarkdown>
                        ) : (
                            <div className="text-center py-4">
                                <p className="text-slate-500 dark:text-slate-400 mb-3">No AI summary available yet for this chapter.</p>
                                {user?.isAdmin && (
                                    <button
                                        onClick={handleGenerateAISummary}
                                        className="btn-primary"
                                        disabled={generateSummaryMutation.isPending || !chapter?.sourceUploadIds?.length}
                                    >
                                        Generate AI Summary Now
                                    </button>
                                )}
                                {!user?.isAdmin && (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">AI summary generation is an admin feature.</p>
                                )}
                                {user?.isAdmin && !chapter?.sourceUploadIds?.length && (
                                    <p className="text-sm text-red-500 mt-2">Cannot generate: Chapter not linked to original upload source.</p>
                                )}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChapterDetailPage;