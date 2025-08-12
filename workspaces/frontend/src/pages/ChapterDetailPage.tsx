// FILE: workspaces/frontend/src/pages/ChapterDetailPage.tsx

import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTopics } from '@/hooks/useTopics'; // NEW: Use topics hook
import { useChapterContent } from '@/hooks/useChapterContent'; // NEW: Use chapter content hook
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { useSound } from '@/hooks/useSound'; // NEW IMPORT: useSound
import { getUserUploadDocuments } from '@/services/firestoreService';
import { generateChapterSummary } from '@/services/aiService';
import { getAttemptedMCQs } from '@/services/userDataService';
import { SessionManager } from '@/services/sessionService'; // NEW: SessionManager for persistent sessions
import Loader from '@/components/Loader';
import type { Chapter, Topic, UserUpload, MCQ, AttemptedMCQs } from '@pediaquiz/types';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const { data: chapterContent, isLoading: isContentLoading } = useChapterContent(chapterId); // Lazily load content
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { playSound } = useSound(); // Use sound hook

    const [activeTab, setActiveTab] = useState<'notes' | 'original' | 'summary_preview' | null>(null);
    const [aiSummaryPreview, setAiSummaryPreview] = useState<string | null>(null);
    const [isCreatingSession, setIsCreatingSession] = useState(false); // For managing session creation loading state

    // REFACTORED: Find chapter and topic from the lighter `topics` query
    const { chapter, topic } = useMemo(() => {
        if (!topics) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId);
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    const { data: sourceUploads, isLoading: isLoadingSourceUploads } = useQuery<UserUpload[]>({
        queryKey: ['chapterOriginalUploads', chapterId],
        queryFn: () => getUserUploadDocuments(chapter?.originalTextRefIds || []),
        enabled: !!chapter?.originalTextRefIds && chapter.originalTextRefIds.length > 0,
    });
    
    const combinedOriginalText = useMemo(() => {
        if (!sourceUploads) return null;
        return sourceUploads.map(upload => upload.extractedText).filter(Boolean).join('\n\n---\n\n');
    }, [sourceUploads]);
    
    const { data: attemptedMCQs, isLoading: areAttemptsLoading } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user,
        initialData: {},
    });
    
    // REFACTORED: Progress calculation is now more efficient, using `chapterContent`
    const { incorrectMcqIdsInChapter, chapterProgress } = useMemo(() => {
        if (!chapterContent?.mcqs || !attemptedMCQs || !chapter) {
            return { incorrectMcqIdsInChapter: [], chapterProgress: 0 };
        }
        
        const mcqsInChapter = chapterContent.mcqs;
        const attemptedInChapter = mcqsInChapter.filter(mcq => attemptedMCQs[mcq.id]);
        
        const incorrectIds = attemptedInChapter
            .filter(mcq => !attemptedMCQs[mcq.id].isCorrect)
            .map(mcq => mcq.id);
            
        const progress = mcqsInChapter.length > 0 ? (attemptedInChapter.length / mcqsInChapter.length) * 100 : 0;

        return { incorrectMcqIdsInChapter: incorrectIds, chapterProgress: progress };
    }, [chapterContent, attemptedMCQs, chapter]);

    const wrongInChapter = incorrectMcqIdsInChapter.length;

    const generateSummaryMutation = useMutation<any, Error, { uploadIds: string[] }>({
        mutationFn: generateChapterSummary,
        onSuccess: (data) => {
            playSound('notification');
            setAiSummaryPreview(data.data.summary);
            setActiveTab('summary_preview');
            addToast("AI Summary generated!", 'success');
        },
        onError: (error) => {
            playSound('incorrect');
            addToast(`Failed to generate AI Summary: ${error.message}`, 'danger');
            setAiSummaryPreview(null);
            setActiveTab('notes');
        },
    });

    React.useEffect(() => {
        if (chapter) {
            if (chapter.summaryNotes) setActiveTab('notes');
            else if (chapter.originalTextRefIds?.length) setActiveTab('original');
            else setActiveTab(null);
        }
    }, [chapter]);

    const isLoadingPage = areTopicsLoading || isContentLoading || isLoadingSourceUploads || areAttemptsLoading;

    if (isLoadingPage) return <Loader message="Loading chapter details..." />;
    if (topicsError) return <div className="text-center py-10 text-danger-500">{topicsError.message}</div>;
    if (!chapter || !topic) {
        return (
            <div className="text-center py-10">
                <h1 className="text-xl font-bold">Chapter Not Found</h1>
                <p className="text-neutral-500 mt-2">The chapter you are looking for may have been moved.</p>
                <button onClick={() => navigate('/')} className="btn-primary mt-6">Back to Home</button>
            </div>
        );
    }
    
    // --- DEFINITIVE FIX: ActionButton now creates a persistent session ---
    const ActionButton: React.FC<{ mode: 'practice' | 'quiz' | 'incorrect' | 'flashcards', title: string, subtitle: string, disabled?: boolean, className?: string, mcqIds?: string[] }> = ({ mode, title, subtitle, disabled = false, className = '', mcqIds }) => {
        const handleAction = async () => {
            playSound('buttonClick');
            if (disabled || !user || !chapterContent) return; // chapterContent should be loaded by now

            setIsCreatingSession(true);
            try {
                let sessionMcqIds: string[] = [];
                if (mode === 'practice' || mode === 'quiz') {
                    sessionMcqIds = chapterContent.mcqs.map(m => m.id);
                } else if (mode === 'incorrect') {
                    sessionMcqIds = mcqIds || []; // Use provided incorrect IDs
                } else if (mode === 'flashcards') {
                    // Flashcards are handled by their own page, this button links directly.
                    // This `mode` is primarily for routing to `/flashcards`
                    navigate(`/flashcards/${topic.id}/${chapter.id}`);
                    return; // Exit as navigation is direct
                }

                if (sessionMcqIds.length === 0 && mode !== 'flashcards') {
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
                        playSound('buttonClick'); // Play sound even if disabled, but not on default prevent
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
    // --- END OF FIX ---

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
                        mode="flashcards" // This mode will trigger direct Link navigation in its handler
                        title="Flashcards"
                        subtitle="Review key concepts"
                        className="bg-warning-500 hover:bg-warning-600 text-white"
                        disabled={!chapter.flashcardCount || chapter.flashcardCount === 0}
                     />
                </div>
            </div>

            {/* Universal Study Materials Section */}
            {(showStudyMaterials || (user?.isAdmin && chapter?.originalTextRefIds && chapter.originalTextRefIds.length > 0)) && ( // Show if materials exist OR if admin and original text exists for summary gen
                <div className="card-base p-6 mt-6 space-y-4 animate-fade-in-up">
                    <div className="flex justify-between items-center pb-3 border-b border-neutral-200 dark:border-neutral-700">
                        <h2 className="text-2xl font-bold">Study Materials</h2>
                        {user?.isAdmin && ( // Only show admin controls if original text is available
                            <>
                                {chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0 && !aiSummaryPreview && ( // Only show if original text exists and no preview yet
                                    <button
                                        onClick={() => { playSound('buttonClick'); generateSummaryMutation.mutate({ uploadIds: chapter.originalTextRefIds! }); }}
                                        disabled={generateSummaryMutation.isPending}
                                        className="btn-neutral text-sm py-1.5 px-3"
                                    >
                                        {generateSummaryMutation.isPending ? 'Generating...' : '🤖 Generate AI Summary'}
                                    </button>
                                )}
                                {activeTab === 'notes' && ( // Only show edit button on notes tab
                                    <Link 
                                        to={`/admin/marrow/notes/edit/${topicId}/${chapterId}`}
                                        state={{ source: topic.source }} // Pass the source for universal updates
                                        className="p-2 rounded-full text-neutral-400 hover:text-primary-500 transition-colors"
                                        title="Edit Notes"
                                        onClick={() => playSound('buttonClick')}
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
                            onClick={() => { playSound('buttonClick'); setActiveTab('notes'); setAiSummaryPreview(null); }} // Clear preview when switching tabs
                            disabled={!chapter.summaryNotes && !user?.isAdmin} // Disable if no notes and not admin (to add)
                        >
                            Summary Notes
                        </button>
                        <button
                            className={clsx(
                                "px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-colors",
                                activeTab === 'original' ? 'border-primary-500 text-primary-500' : 'border-transparent text-neutral-500 hover:text-primary-500'
                            )}
                            onClick={() => { playSound('buttonClick'); setActiveTab('original'); setAiSummaryPreview(null); }}
                            disabled={!(chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0)}
                        >
                            Original Text
                        </button>
                        {aiSummaryPreview && ( // Show AI Summary Preview tab if available
                             <button
                                className={clsx(
                                    "px-4 py-2 -mb-px border-b-2 font-medium text-sm transition-colors",
                                    activeTab === 'summary_preview' ? 'border-primary-500 text-primary-500' : 'border-transparent text-neutral-500 hover:text-primary-500'
                                )}
                                onClick={() => { playSound('buttonClick'); setActiveTab('summary_preview'); }}
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