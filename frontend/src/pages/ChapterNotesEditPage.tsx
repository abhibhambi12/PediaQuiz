// frontend/src/pages/ChapterNotesEditPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { updateChapterNotes } from '@/services/aiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { Topic, Chapter } from '@pediaquiz/types';

const ChapterNotesEditPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { data: appData, isLoading: isAppDataLoading, error: appDataError } = useData();

    const { chapter, topic } = React.useMemo(() => {
        if (!appData) return { chapter: null, topic: null };
        const foundTopic = appData.topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId);
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [appData, topicId, chapterId]);

    const [notesContent, setNotesContent] = useState<string>('');
    const source = location.state?.source as 'General' | 'Marrow' | undefined;

    useEffect(() => {
        if (chapter) {
            setNotesContent(chapter.summaryNotes || '');
        }
    }, [chapter]);

    const updateNotesMutation = useMutation<any, Error, { topicId: string; chapterId: string; newSummary: string, source: 'General' | 'Marrow' }>({
        mutationFn: updateChapterNotes,
        onSuccess: () => {
            addToast("Chapter notes saved successfully!", 'success');
            queryClient.invalidateQueries({ queryKey: ['appData'] });
            navigate(`/chapters/${topicId}/${chapterId}`);
        },
        onError: (error) => addToast(`Failed to save notes: ${error.message}`, 'error'),
    });
    
    const handleSave = () => {
        if (!topic || !chapter || !source) {
            addToast("Cannot save: missing topic, chapter, or source information.", "error");
            return;
        }
        updateNotesMutation.mutate({ topicId: topic.id, chapterId: chapter.id, newSummary: notesContent, source });
    };

    if (isAppDataLoading) return <Loader message="Loading chapter for notes..." />;
    if (appDataError) return <div className="text-center py-10 text-red-500">Error: {appDataError.message}</div>;
    if (!chapter || !topic) {
        return <div className="text-center py-10">Chapter or Topic not found.</div>;
    }
    if (!source) {
        return <div className="text-center py-10 text-red-500">Error: Source for this topic was not provided. Cannot edit notes.</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Edit Notes for {chapter.name}</h1>
            <p className="text-slate-500 dark:text-slate-400">Topic: {topic.name}</p>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
                <textarea
                    className="w-full h-96 p-4 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={notesContent}
                    onChange={(e) => setNotesContent(e.target.value)}
                    placeholder="Start typing your chapter summary notes here using Markdown..."
                ></textarea>
                <div className="flex justify-end mt-4 space-x-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="px-6 py-2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                        disabled={updateNotesMutation.isPending}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={updateNotesMutation.isPending}
                        className="px-6 py-2 rounded-md bg-sky-500 text-white font-bold hover:bg-sky-600 transition-colors disabled:opacity-50"
                    >
                        {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChapterNotesEditPage;