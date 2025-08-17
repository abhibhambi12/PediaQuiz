import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTopics } from '@/hooks/useTopics'; // Corrected: use useTopics instead of useData for topics
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
    const { data: topics, isLoading: isTopicsLoading, error: topicsError } = useTopics(); // Fetch topics directly

    const { chapter, topic } = React.useMemo(() => {
        if (!topics || !topicId || !chapterId) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        const foundChapter = foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId);
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    const [notesContent, setNotesContent] = useState<string>('');
    const source = location.state?.source as 'General' | 'Marrow' | undefined; // Get the source from route state

    useEffect(() => {
        if (chapter) {
            setNotesContent(chapter.summaryNotes || '');
        }
    }, [chapter]);

    const updateNotesMutation = useMutation({
        mutationFn: updateChapterNotes,
        onSuccess: () => {
            addToast("Chapter notes saved successfully!", 'success');
            queryClient.invalidateQueries({ queryKey: ['topics'] }); // Invalidate topics to refetch updated chapters
            queryClient.invalidateQueries({ queryKey: ['chapterContent', chapterId] }); // Invalidate chapter content if needed
            navigate(`/chapters/${topicId}/${chapterId}`);
        },
        onError: (error: Error) => { // Explicitly type error
            addToast(`Failed to save notes: ${error.message}`, 'danger');
        },
    });

    const handleSave = () => {
        if (!topic || !chapter || !source) { // Ensure source is available before saving
            addToast("Cannot save: missing topic, chapter, or source information.", "danger");
            return;
        }
        updateNotesMutation.mutate({ topicId: topic.id, chapterId: chapter.id, newSummary: notesContent, source });
    };

    const isLoadingPage = isTopicsLoading; // Only loading topics now
    if (isLoadingPage) return <Loader message="Loading chapter for notes..." />;
    if (topicsError) return <div className="text-center py-10 text-red-500">Error: {topicsError.message}</div>;
    if (!chapter || !topic) {
        return <div className="text-center py-10">Chapter or Topic not found.</div>;
    }
    if (!source) { // Check if source is provided via route state (critical for backend function)
        return <div className="text-center py-10 text-red-500">Error: Source for this topic was not provided. Cannot edit notes.</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Edit Notes for {chapter.name}</h1>
            <p className="text-slate-500 dark:text-slate-400">Topic: {topic.name}</p>

            <div className="card-base p-6">
                <textarea
                    className="w-full h-96 p-4 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={notesContent}
                    onChange={(e) => setNotesContent(e.target.value)}
                    placeholder="Start typing your chapter summary notes here using Markdown..."
                ></textarea>
                <div className="flex justify-end mt-4 space-x-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="btn-neutral"
                        disabled={updateNotesMutation.isPending}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={updateNotesMutation.isPending}
                        className="btn-primary"
                    >
                        {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChapterNotesEditPage;