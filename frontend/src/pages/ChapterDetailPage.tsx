import React, { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { getUserUploadDocuments } from '@/services/firestoreService';
import Loader from '@/components/Loader';
import type { Chapter, Topic, UserUpload, MCQ, AttemptedMCQs } from '@pediaquiz/types'; // Added MCQ, AttemptedMCQs types
import { useAuth } from '@/contexts/AuthContext'; // Added useAuth
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { getAttemptedMCQs } from '@/services/userDataService'; // Added getAttemptedMCQs

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: appData, isLoading: isAppDataLoading, error: appDataError } = useData();
    const { user } = useAuth(); // Get user for fetching attempts
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = React.useState<'notes' | 'original' | null>(null);

    const { chapter, topic } = useMemo(() => {
        if (!appData) return { chapter: null, topic: null };
        const foundTopic = appData.topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId);
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [appData, topicId, chapterId]);

    // Fetch original upload documents if this is a Marrow chapter with linked sources
    const { data: sourceUploads, isLoading: isLoadingSourceUploads } = useQuery<UserUpload[]>({
        queryKey: ['chapterOriginalUploads', topicId, chapterId],
        queryFn: () => getUserUploadDocuments(chapter?.originalTextRefIds || []),
        enabled: !!chapter && chapter.source === 'Marrow' && !!chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0,
    });

    const combinedOriginalText = useMemo(() => {
        if (!sourceUploads) return null;
        return sourceUploads.map(upload => upload.extractedText).filter(Boolean).join('\n\n---\n\n');
    }, [sourceUploads]);

    // Fetch user's attempted MCQs for "Review Mistakes" feature
    const { data: attemptedMCQs, isLoading: areAttemptsLoading } = useQuery<AttemptedMCQs>({
        queryKey: ['attemptedMCQs', user?.uid],
        queryFn: () => getAttemptedMCQs(user!.uid),
        enabled: !!user, // Only run this query if user is logged in
        initialData: {}, // Provide initial data to prevent undefined issues
    });

    // Calculate incorrect MCQs for this specific chapter
    const incorrectMcqIdsInChapter = useMemo(() => {
        if (!appData?.mcqs || !attemptedMCQs || !chapter) return [];
        return appData.mcqs
            .filter((mcq: MCQ) =>
                mcq.chapterId === chapter.id && // Filter by current chapter
                attemptedMCQs[mcq.id] && // Ensure it was attempted
                !attemptedMCQs[mcq.id].isCorrect // Ensure it was incorrect
            )
            .map((mcq: MCQ) => mcq.id);
    }, [appData, attemptedMCQs, chapter]);

    const wrongInChapter = incorrectMcqIdsInChapter.length;


    React.useEffect(() => {
        // Set initial active tab based on content availability
        if (chapter && chapter.source === 'Marrow') {
            if (chapter.summaryNotes) {
                setActiveTab('notes');
            } else if (chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0) {
                setActiveTab('original');
            }
        }
    }, [chapter]);

    const isLoadingPage = isAppDataLoading || isLoadingSourceUploads || areAttemptsLoading; // Combined loading state

    if (isLoadingPage) return <Loader message="Loading chapter details..." />;
    if (appDataError) return <div className="text-center py-10 text-red-500">{appDataError.message}</div>;
    if (!chapter || !topic) {
        return (
            <div className="text-center py-10">
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">Chapter Not Found</h1>
                <p className="text-slate-500 mt-2">The chapter you are looking for does not exist or may have been moved.</p>
                <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors">
                    Back to Home
                </button>
            </div>
        );
    }
    
    // ActionButton component updated to accept a 'state' prop for React Router Link
    const ActionButton: React.FC<{ to: string, title: string, subtitle: string, disabled?: boolean, className?: string, state?: any }> = ({ to, title, subtitle, disabled = false, className = '', state }) => (
        <Link to={disabled ? '#' : to} state={state} className={`block text-center p-6 rounded-lg shadow-md transition-transform hover:-translate-y-1 ${disabled ? 'bg-slate-200 dark:bg-slate-700 cursor-not-allowed text-slate-500 dark:text-slate-400' : className}`}>
             <h2 className="text-xl font-bold">{title}</h2>
             <p className="mt-1 text-sm">{subtitle}</p>
        </Link>
    );

    const showStudyMaterials = chapter.source === 'Marrow' && (chapter.summaryNotes || (chapter.originalTextRefIds && chapter.originalTextRefIds.length > 0));

    return (
         <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6">
                <p className="text-sm text-sky-600 dark:text-sky-400 font-semibold">{topic.name}</p>
                <h1 className="text-3xl font-bold mt-1 mb-2 text-slate-800 dark:text-slate-200">{chapter.name}</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-6">{chapter.mcqCount} MCQs | {chapter.flashcardCount} Flashcards</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ActionButton to={`/session/practice/${chapter.id}`} title="Practice Mode" subtitle="Instant feedback" className="bg-sky-500 hover:bg-sky-600 text-white" />
                    <ActionButton to={`/session/quiz/${chapter.id}`} title="Quiz Mode" subtitle="Test your knowledge" className="bg-indigo-500 hover:bg-indigo-600 text-white" />
                    <ActionButton
                        to={`/session/incorrect/${chapter.id}`} // New mode: 'incorrect'
                        state={{ incorrectMcqIds: incorrectMcqIdsInChapter }} // Pass specific IDs for the session
                        title="Review Mistakes"
                        subtitle={`${wrongInChapter} incorrect questions`}
                        disabled={wrongInChapter === 0}
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
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Study Materials</h2>
                        {user?.isAdmin && topic.source === 'Marrow' && activeTab === 'notes' && (
                            <Link 
                                to={`/admin/marrow/notes/edit/${topicId}/${chapterId}`} 
                                className="p-2 rounded-full text-slate-400 hover:text-sky-500"
                                title="Edit Notes"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </Link>
                        )}
                    </div>
                    
                    <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                        <button
                            className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm ${activeTab === 'notes' ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-sky-500'}`}
                            onClick={() => setActiveTab('notes')}
                            disabled={!chapter.summaryNotes && !user?.isAdmin}
                        >
                            Summary Notes
                        </button>
                        <button
                            className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm ${activeTab === 'original' ? 'border-sky-500 text-sky-500' : 'border-transparent text-slate-500 hover:text-sky-500'}`}
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
                            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700 p-4 rounded-md overflow-auto max-h-96">
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