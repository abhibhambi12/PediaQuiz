// --- CORRECTED FILE: workspaces/frontend/src/pages/ChapterDetailPage.tsx ---

import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions'; // FIX: Correct import path
import { useTopics } from '@/hooks/useTopics';
import { useChapterContent } from '@/hooks/useChapterContent';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getUserUploadDocuments } from '@/services/firestoreService';
import { generateChapterSummary } from '@/services/aiService';
import { getAttemptedMCQs } from '@/services/userDataService';
import { SessionManager } from '@/services/sessionService';
import Loader from '@/components/Loader';
import type { Chapter, Topic, UserUpload, MCQ, AttemptedMCQs, Attempt } from '@pediaquiz/types'; // FIX: Import Attempt type
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const { data: chapterContent, isLoading: isContentLoading, error: chapterContentError } = useChapterContent(chapterId);
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [activeTab, setActiveTab] = useState<'notes' | 'original' | 'summary_preview' | null>(null);
    const [aiSummaryPreview, setAiSummaryPreview] = useState<string | null>(null);
    const [isCreatingSession, setIsCreatingSession] = useState(false);

    const { chapter, topic } = useMemo(() => {
        if (!topics) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId); // FIX: Explicitly type ch
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    const { data: sourceUploads, isLoading: isLoadingSourceUploads, error: sourceUploadsError } = useQuery<UserUpload[]>({
        queryKey: ['chapterOriginalUploads', chapterId],
        queryFn: () => getUserUploadDocuments(chapter?.originalTextRefIds || []),
        enabled: !!chapter?.originalTextRefIds && chapter.originalTextRefIds.length > 0,
    });
    
    const combinedOriginalText = useMemo(() => {
        if (!sourceUploads) return null;
        return sourceUploads.map(upload => upload.extractedText).filter(Boolean).join('\n\n---\n\n');
    }, [sourceUploads]);
    
    const { data: attemptedMCQs, isLoading: areAttemptsLoading, error: attemptsError } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });
    
    const { incorrectMcqIdsInChapter, chapterProgress } = useMemo(() => {
        if (!chapterContent?.mcqs || !attemptedMCQs || !chapter) {
            return { incorrectMcqIdsInChapter: [], chapterProgress: 0 };
        }
        
        const mcqsInChapter = chapterContent.mcqs;
        const attemptedInChapter = mcqsInChapter.filter((mcq: MCQ) => attemptedMCQs[mcq.id]); // FIX: Explicitly type mcq
        
        const incorrectIds = attemptedInChapter
            .filter((mcq: MCQ) => !(attemptedMCQs[mcq.id] as Attempt).isCorrect) // FIX: Explicitly type mcq and access isCorrect safely
            .map((mcq: MCQ) => mcq.id);
            
        const progress = mcqsInChapter.length > 0 ? (attemptedInChapter.length / mcqsInChapter.length) * 100 : 0;

        return { incorrectMcqIdsInChapter: incorrectIds, chapterProgress: progress };
    }, [chapterContent, attemptedMCQs, chapter]);

    const wrongInChapter = incorrectMcqIdsInChapter.length;

    const generateSummaryMutation = useMutation<HttpsCallableResult<any>, Error, { uploadIds: string[] }>({
        mutationFn: generateChapterSummary,
        onSuccess: (data) => {
            setAiSummaryPreview(data.data.summary);
            setActiveTab('summary_preview');
            addToast("AI Summary generated!", 'success');
        },
        onError: (error) => {
            addToast(`Failed to generate AI Summary: ${error.message}`, 'danger');
            setAiSummaryPreview(null);
            setActiveTab('notes');
        },
    });

    React.useEffect(() => {
        if (chapter) {
            if (chapter.summaryNotes) setActiveTab('notes');
            else if (chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0) setActiveTab('original'); // FIX: Check originalTextRefIds safely
            else setActiveTab(null);
        }
    }, [chapter]);

    const isLoadingPage = areTopicsLoading || isContentLoading || isLoadingSourceUploads || areAttemptsLoading;

    if (isLoadingPage) return <Loader message="Loading chapter details..." />;
    if (topicsError || chapterContentError || sourceUploadsError || attemptsError) { // FIX: Added chapterContentError, sourceUploadsError, attemptsError
        return <div className="text-center py-10 text-danger-500">{topicsError?.message || chapterContentError?.message || sourceUploadsError?.message || attemptsError?.message}</div>;
    }
    if (!chapter || !topic) {
        return (
            <div className="text-center py-10">
                <h1 className="text-xl font-bold">Chapter Not Found</h1>
                <p className="text-neutral-500 mt-2">The chapter you are looking for may have been moved.</p>
                <button onClick={() => navigate('/')} className="btn-primary mt-6">Back to Home</button>
            </div>
        );
    }
    
    const ActionButton: React.FC<{ mode: 'practice' | 'quiz' | 'incorrect' | 'flashcards', title: string, subtitle: string, disabled?: boolean, className?: string, mcqIds?: string[] }> = ({ mode, title, subtitle, disabled = false, className = '', mcqIds }) => {
        const handleAction = async () => {
            if (disabled || !user || !chapterContent) return;

            setIsCreatingSession(true);
            try {
                let sessionMcqIds: string[] = [];
                if (mode === 'practice' || mode === 'quiz') {
                    sessionMcqIds = chapterContent.mcqs.map((m: MCQ) => m.id); // FIX: Explicitly type m
                } else if (mode === 'incorrect') {
                    sessionMcqIds = mcqIds || [];
                } else if (mode === 'flashcards') {
                    navigate(`/flashcards/${topic.id}/${chapter.id}`);
                    return;
                }

                if (sessionMcqIds.length === 0 && mode !== 'flashcards') { // FIX: Correct mode comparison
                    addToast("No questions available for this session.", "warning");
                    return;
                }

                const sessionId = await SessionManager.createSession(user.uid, mode, sessionMcqIds);
                navigate(`/session/${mode}/${sessionId}`);

            } catch (err) {
                addToast("Failed to start session. Please try again.", "danger");
                console.error(err);
            } finally {
                setIsCreatingSession(false);
            }
        };

        const buttonContent = (
            <div className="block text-center p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold">{title}</h2>
                <p className="mt-1 text-sm">{subtitle}</p>
                {isCreatingSession && <Loader message="" />}
            </div>
        );

        if (mode === 'flashcards') {
            return (
                <Link 
                    to={`/flashcards/${topic.id}/${chapter.id}`}
                    className={clsx(
                        "block text-center rounded-lg shadow-md transition-all duration-200 ease-in-out hover:-translate-y-1",
                        disabled ? 'bg-neutral-200 dark:bg-neutral-700 cursor-not-allowed text-neutral-500 dark:text-neutral-400' : className
                    )}
                    onClick={(e) => { 
                        if (disabled) e.preventDefault();
                    }}
                >
                    {buttonContent}
                </Link>
            );
        }

        return (
            <button 
                onClick={handleAction}
                disabled={disabled || isCreatingSession}
                className={clsx(
                    "block text-center w-full rounded-lg shadow-md transition-all duration-200 ease-in-out hover:-translate-y-1",
                    disabled || isCreatingSession ? 'bg-neutral-200 dark:bg-neutral-700 cursor-not-allowed text-neutral-500 dark:text-neutral-400' : className
                )}
            >
                {buttonContent}
            </button>
        );
    };

    const showStudyMaterials = chapter.summaryNotes || (chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0);

    return (
         <div className="max-w-2xl mx-auto">
            <div className="card-base p-6 space-y-4 animate-pop-in">
                <p className="text-sm text-primary-600 dark:text-primary-400 font-semibold">{topic.name}</p>
                <h1 className="text-3xl font-bold mt-1 mb-2">{chapter.name}</h1>
                <p className="text-neutral-500 dark:text-neutral-400">{chapter.mcqCount} MCQs | {chapter.flashcardCount} Flashcards</p>

                {chapter.mcqCount > 0 && (
                    <div className="my-4">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Your Progress</span>
                            <span className="text-sm font-bold text-primary-500">{chapterProgress.toFixed(0)}% Complete</span>
                        </div>
                        <div className="w-full bg-neutral-300 dark:bg-neutral-600 rounded-full h-2">
                            <div className="bg-primary-500 h-2 rounded-full transition-all duration-300" style={{ width: `${chapterProgress}%` }}></div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ActionButton mode="practice" title="Practice Mode" subtitle="Instant feedback" className="bg-primary-500 hover:bg-primary-600 text-white" disabled={chapterContent?.mcqs.length === 0}/>
                    <ActionButton mode="quiz" title="Quiz Mode" subtitle="Test your knowledge" className="bg-secondary-500 hover:bg-secondary-600 text-white" disabled={chapterContent?.mcqs.length === 0}/>
                    <ActionButton
                        mode="incorrect"
                        title="Review Mistakes"
                        subtitle={`${wrongInChapter} incorrect questions`}
                        disabled={wrongInChapter === 0 || areAttemptsLoading}
                        className="bg-danger-500 hover:bg-danger-600 text-white"
                        mcqIds={incorrectMcqIdsInChapter}
                    />
                    <ActionButton 
                        mode="flashcards"
                        title="Flashcards"
                        subtitle="Review key concepts"
                        className="bg-warning-500 hover:bg-warning-600 text-white"
                        disabled={!chapter.flashcardCount || chapter.flashcardCount === 0}
                     />
                </div>
            </div>

            {(showStudyMaterials || (user?.isAdmin && chapter?.originalTextRefIds && chapter.originalTextRefIds.length > 0)) && (
                <div className="card-base p-6 mt-6 space-y-4 animate-fade-in-up">
                    <div className="flex justify-between items-center pb-3 border-b border-neutral-200 dark:border-neutral-700">
                        <h2 className="text-2xl font-bold">Study Materials</h2>
                        {user?.isAdmin && (
                            <>
                                {chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0 && !aiSummaryPreview && (
                                    <button
                                        onClick={() => { generateSummaryMutation.mutate({ uploadIds: chapter.originalTextRefIds! }); }}
                                        disabled={generateSummaryMutation.isPending}
                                        className="btn-neutral text-sm py-1.5 px-3"
                                    >
                                        {generateSummaryMutation.isPending ? 'Generating...' : '🤖 Generate AI Summary'}
                                    </button>
                                )}
                                {activeTab === 'notes' && (
                                    <Link 
                                        to={`/admin/marrow/notes/edit/${topicId}/${chapterId}`}
                                        state={{ source: topic.source }}
                                        className="p-2 rounded-full text-neutral-400 hover:text-primary-500 transition-colors"
                                        title="Edit Notes"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </Link>
                                )}
                            </>
                        )}
                    </div>
                    
                    <div className="flex border-b border-neutral-200 dark:border-neutral-700 mb-4">
                        <button
                            className={clsx(
                                "px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-colors",
                                activeTab === 'notes' ? 'border-primary-500 text-primary-500' : 'border-transparent text-neutral-500 hover:text-primary-500'
                            )}
                            onClick={() => { setActiveTab('notes'); setAiSummaryPreview(null); }}
                            disabled={!chapter.summaryNotes && !user?.isAdmin}
                        >
                            Summary Notes
                        </button>
                        <button
                            className={clsx(
                                "px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-colors",
                                activeTab === 'original' ? 'border-primary-500 text-primary-500' : 'border-transparent text-neutral-500 hover:text-primary-500'
                            )}
                            onClick={() => { setActiveTab('original'); setAiSummaryPreview(null); }}
                            disabled={!(chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0)}
                        >
                            Original Text
                        </button>
                        {aiSummaryPreview && (
                             <button
                                className={clsx(
                                    "px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-colors",
                                    activeTab === 'summary_preview' ? 'border-primary-500 text-primary-500' : 'border-transparent text-neutral-500 hover:text-primary-500'
                                )}
                                onClick={() => { setActiveTab('summary_preview'); }}
                            >
                                AI Summary Preview
                            </button>
                        )}
                    </div>

                    <div className="prose dark:prose-invert max-w-none text-neutral-800 dark:text-neutral-100">
                        {activeTab === 'notes' && (chapter.summaryNotes || user?.isAdmin) ? (
                            <ReactMarkdown>{chapter.summaryNotes || 'No summary notes available. Click the edit icon to add notes.'}</ReactMarkdown>
                        ) : activeTab === 'notes' && (
                            <p className="text-neutral-500">No summary notes available for this chapter.</p>
                        )}
                        {activeTab === 'original' && combinedOriginalText ? (
                            <pre className="whitespace-pre-wrap text-sm bg-neutral-100 dark:bg-neutral-900 p-4 rounded-md overflow-auto max-h-96">
                                {combinedOriginalText}
                            </pre>
                        ) : activeTab === 'original' && (
                            <p className="text-neutral-500">No original text found for this chapter's associated uploads.</p>
                        )}
                        {activeTab === 'summary_preview' && aiSummaryPreview && (
                            <ReactMarkdown>{aiSummaryPreview}</ReactMarkdown>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChapterDetailPage;