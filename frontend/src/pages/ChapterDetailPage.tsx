// FILE: frontend/src/pages/ChapterDetailPage.tsx

import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getUserUploadDocuments } from '@/services/firestoreService';
import { getAttemptedMCQs } from '@/services/userDataService';
import Loader from '@/components/Loader';
import type { Chapter, Topic, UserUpload, MCQ, AttemptedMCQs } from '@pediaquiz/types';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: appData, isLoading: isAppDataLoading, error: appDataError } = useData();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<'notes' | 'original' | null>(null);

    const { chapter, topic } = useMemo(() => {
        if (!appData) return { chapter: null, topic: null };
        const foundTopic = appData.topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId);
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [appData, topicId, chapterId]);

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
    
    const { incorrectMcqIdsInChapter, chapterProgress } = useMemo(() => {
        if (!appData?.mcqs || !attemptedMCQs || !chapter) {
            return { incorrectMcqIdsInChapter: [], chapterProgress: 0 };
        }
        
        const mcqsInChapter = appData.mcqs.filter((mcq: MCQ) => mcq.chapterId === chapter.id);
        const attemptedInChapter = mcqsInChapter.filter(mcq => attemptedMCQs[mcq.id]);
        
        const incorrectIds = attemptedInChapter
            .filter(mcq => !attemptedMCQs[mcq.id].isCorrect)
            .map(mcq => mcq.id);
            
        const progress = mcqsInChapter.length > 0 ? (attemptedInChapter.length / mcqsInChapter.length) * 100 : 0;

        return { incorrectMcqIdsInChapter: incorrectIds, chapterProgress: progress };
    }, [appData, attemptedMCQs, chapter]);

    const wrongInChapter = incorrectMcqIdsInChapter.length;

    React.useEffect(() => {
        if (chapter) {
            if (chapter.summaryNotes) setActiveTab('notes');
            else if (chapter.originalTextRefIds?.length) setActiveTab('original');
        }
    }, [chapter]);

    const isLoadingPage = isAppDataLoading || isLoadingSourceUploads || areAttemptsLoading;

    if (isLoadingPage) return <Loader message="Loading chapter details..." />;
    if (appDataError) return <div className="text-center py-10 text-red-500">{appDataError.message}</div>;
    if (!chapter || !topic) {
        return (
            <div className="text-center py-10">
                <h1 className="text-xl font-bold">Chapter Not Found</h1>
                <p className="text-slate-500 mt-2">The chapter you are looking for may have been moved.</p>
                <button onClick={() => navigate('/')} className="mt-6 btn-primary">Back to Home</button>
            </div>
        );
    }
    
    // --- DEFINITIVE FIX: Restore the simple ActionButton that uses a standard Link ---
    // This removes the faulty session creation logic and restores the original navigation behavior.
    const ActionButton: React.FC<{ to: string, title: string, subtitle: string, disabled?: boolean, className?: string, state?: any }> = ({ to, title, subtitle, disabled = false, className = '', state }) => (
        <Link 
            to={disabled ? '#' : to} 
            state={state} 
            className={clsx(
                'block text-center p-6 rounded-lg shadow-md transition-transform hover:-translate-y-1',
                disabled ? 'bg-slate-200 dark:bg-slate-700 cursor-not-allowed text-slate-500' : className
            )}
            onClick={(e) => disabled && e.preventDefault()}
        >
             <h2 className="text-xl font-bold">{title}</h2>
             <p className="mt-1 text-sm">{subtitle}</p>
        </Link>
    );
    // --- END OF FIX ---

    const showStudyMaterials = chapter.summaryNotes || (chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0);

    return (
         <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6">
                <p className="text-sm text-sky-600 dark:text-sky-400 font-semibold">{topic.name}</p>
                <h1 className="text-3xl font-bold mt-1 mb-2">{chapter.name}</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-4">{chapter.mcqCount} MCQs | {chapter.flashcardCount} Flashcards</p>

                {chapter.mcqCount > 0 && (
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-500">Progress</span>
                            <span className="text-sm font-bold text-sky-500">{chapterProgress.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                            <div className="bg-sky-500 h-2.5 rounded-full" style={{ width: `${chapterProgress}%` }}></div>
                        </div>
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* --- DEFINITIVE FIX: Use ActionButton to navigate directly with the chapterId --- */}
                    <ActionButton to={`/session/practice/${chapter.id}`} title="Practice Mode" subtitle="Instant feedback" className="bg-sky-500 hover:bg-sky-600 text-white" />
                    <ActionButton to={`/session/quiz/${chapter.id}`} title="Quiz Mode" subtitle="Test your knowledge" className="bg-indigo-500 hover:bg-indigo-600 text-white" />
                    <ActionButton
                        to={`/session/incorrect/${chapter.id}`}
                        state={{ incorrectMcqIds: incorrectMcqIdsInChapter }}
                        title="Review Mistakes"
                        subtitle={`${wrongInChapter} incorrect questions`}
                        disabled={wrongInChapter === 0 || areAttemptsLoading}
                        className="bg-red-500 hover:bg-red-600 text-white"
                    />
                    <ActionButton 
                        to={`/flashcards/${topic.id}/${chapter.id}`}
                        title="Flashcards"
                        subtitle="Review key concepts"
                        className="bg-amber-500 hover:bg-amber-600 text-white"
                        disabled={!chapter.flashcardCount || chapter.flashcardCount === 0}
                     />
                </div>
            </div>

            {showStudyMaterials && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 mt-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold">Study Materials</h2>
                        {user?.isAdmin && (
                            <Link 
                                to={`/admin/marrow/notes/edit/${topicId}/${chapterId}`}
                                state={{ source: topic.source }}
                                className="p-2 rounded-full text-slate-400 hover:text-sky-500"
                                title="Edit Notes"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </Link>
                        )}
                    </div>
                    
                    <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                        <button
                            className={clsx(`px-4 py-2 -mb-px border-b-2 font-medium text-sm`, activeTab === 'notes' ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-sky-500')}
                            onClick={() => setActiveTab('notes')}
                            disabled={!chapter.summaryNotes && !user?.isAdmin}
                        >
                            Summary Notes
                        </button>
                        <button
                            className={clsx(`px-4 py-2 -mb-px border-b-2 font-medium text-sm`, activeTab === 'original' ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-sky-500')}
                            onClick={() => setActiveTab('original')}
                            disabled={!(chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0)}
                        >
                            Original Text
                        </button>
                    </div>

                    <div className="prose dark:prose-invert max-w-none">
                        {activeTab === 'notes' && (chapter.summaryNotes || user?.isAdmin) ? (
                            <ReactMarkdown>{chapter.summaryNotes || 'No summary notes available. Click the edit icon to add notes.'}</ReactMarkdown>
                        ) : activeTab === 'notes' && (
                            <p className="text-slate-500">No summary notes available for this chapter.</p>
                        )}
                        {activeTab === 'original' && combinedOriginalText ? (
                            <pre className="whitespace-pre-wrap text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-md overflow-auto max-h-96">
                                {combinedOriginalText}
                            </pre>
                        ) : activeTab === 'original' && (
                            <p className="text-slate-500">No original text found for this chapter's associated uploads.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChapterDetailPage;