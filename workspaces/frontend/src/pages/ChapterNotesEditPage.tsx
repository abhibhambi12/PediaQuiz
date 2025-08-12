// --- CORRECTED FILE: workspaces/frontend/src/pages/ChapterNotesEditPage.tsx ---

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions'; // FIX: Correct import path
import { useTopics } from '@/hooks/useTopics';
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
    const { data: topics, isLoading: isTopicsLoading, error: topicsError } = useTopics();

    const { chapter, topic } = React.useMemo(() => {
        if (!topics) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId);
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    const [notesContent, setNotesContent] = useState<string>('');
    const source = location.state?.source as 'General' | 'Marrow' | undefined;

    useEffect(() => {
        if (chapter) {
            setNotesContent(chapter.summaryNotes || '');
        }
    }, [chapter]);

    const updateNotesMutation = useMutation<HttpsCallableResult<any>, Error, { topicId: string; chapterId: string; newSummary: string, source: 'General' | 'Marrow' }>({
        mutationFn: updateChapterNotes,
        onSuccess: () => {
            addToast("Chapter notes saved successfully!", 'success');
            queryClient.invalidateQueries({ queryKey: ['topics'] });
            queryClient.invalidateQueries({ queryKey: ['chapterContent', chapterId] });
            navigate(`/chapters/${topicId}/${chapterId}`);
        },
        onError: (error) => {
            addToast(`Failed to save notes: ${error.message}`, 'danger');
        },
    });
    
    const handleSave = () => {
        if (!topic || !chapter || !source) {
            addToast("Cannot save: missing topic, chapter, or source information.", "danger");
            return;
        }
        updateNotesMutation.mutate({ topicId: topic.id, chapterId: chapter.id, newSummary: notesContent, source });
    };

    const isLoadingPage = isTopicsLoading;
    if (isLoadingPage) return <Loader message="Loading chapter for notes..." />;
    if (topicsError) return <div className="text-center py-10 text-danger-500">Error: {topicsError.message}</div>;
    if (!chapter || !topic) {
        return <div className="text-center py-10">Chapter or Topic not found.</div>;
    }
    if (!source) {
        return <div className="text-center py-10 text-danger-500">Error: Source for this topic was not provided. Cannot edit notes.</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Edit Notes for {chapter.name}</h1>
            <p className="text-neutral-500 dark:text-neutral-400">Topic: {topic.name}</p>

            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md">
                <textarea
                    className="w-full h-96 p-4 border border-neutral-300 dark:border-neutral-600 rounded-md dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={notesContent}
                    onChange={(e) => setNotesContent(e.target.value)}
                    placeholder="Start typing your chapter summary notes here using Markdown..."
                ></textarea>
                <div className="flex justify-end mt-4 space-x-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="px-6 py-2 rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                        disabled={updateNotesMutation.isPending}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={updateNotesMutation.isPending}
                        className="px-6 py-2 rounded-md bg-primary-500 text-white font-bold hover:bg-primary-600 transition-colors disabled:opacity-50"
                    >
                        {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChapterNotesEditPage;