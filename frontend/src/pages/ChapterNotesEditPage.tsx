import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { updateChapterNotes } from '@/services/apiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Topic, Chapter } from '@pediaquiz/types';

const ChapterNotesEditPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { appData, isLoadingData } = useData();

    const [notesContent, setNotesContent] = useState<string>('');
    const { chapter, topic } = React.useMemo(() => {
        if (!appData) return { chapter: null, topic: null };
        const foundTopic = appData.topics.find((t: Topic) => t.id === topicId);
        const foundChapter = Array.isArray(foundTopic?.chapters) ? foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId) || null : null;
        return { chapter: foundChapter, topic: foundTopic || null };
    }, [appData, topicId, chapterId]);
    
    useEffect(() => { setNotesContent(chapter?.summaryNotes || ''); }, [chapter]);

    const mutation = useMutation({
        mutationFn: updateChapterNotes,
        onSuccess: () => {
            addToast("Notes saved!", 'success');
            queryClient.invalidateQueries({ queryKey: ['appData'] });
            navigate(`/chapters/${topicId}/${chapterId}`);
        },
        onError: (error: Error) => addToast(`Save failed: ${error.message}`, 'error'),
    });

    const handleSave = () => {
        if (!topic || !chapter) return addToast("Cannot save: missing topic/chapter.", "error");
        mutation.mutate({ topicId: topic.id, chapterId: chapter.id, newSummary: notesContent, source: topic.source });
    };

    if (isLoadingData) return <Loader fullScreen message="Loading chapter..." />;
    if (!chapter || !topic) return <div className="text-center py-10">Chapter or Topic not found.</div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold">Edit Notes for {chapter.name}</h1>
            <div className="card-base p-6">
                <textarea className="input-field h-96 min-h-[500px]" value={notesContent} onChange={(e) => setNotesContent(e.target.value)} placeholder="Enter notes here using Markdown..." />
                <div className="flex justify-end mt-4 space-x-3">
                    <button onClick={() => navigate(-1)} className="btn-neutral" disabled={mutation.isPending}>Cancel</button>
                    <button onClick={handleSave} disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? 'Saving...' : 'Save Notes'}</button>
                </div>
            </div>
        </div>
    );
};
export default ChapterNotesEditPage;