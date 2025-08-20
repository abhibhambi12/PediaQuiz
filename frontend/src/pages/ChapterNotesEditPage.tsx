// frontend/src/pages/ChapterNotesEditPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTopics } from '@/hooks/useTopics';
import { updateChapterNotes } from '@/services/firestoreService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
// Direct type imports
import { Topic, Chapter } from '@pediaquiz/types';
import { db } from '@/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { normalizeId } from '@/utils/helpers';

const ChapterNotesEditPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { data: topics, isLoading: isTopicsLoading, error: topicsError } = useTopics();

    const source = location.state?.source as 'General' | 'Marrow' | undefined;
    const chapterNameFromState = location.state?.chapterName as string | undefined; // Not directly used but kept for context

    const { chapter, topic } = React.useMemo(() => {
        if (!topics || !topicId || !chapterId) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        let foundChapter: Chapter | null = null;

        if (foundTopic) {
            const normalizedChapterIdFromUrl = normalizeId(chapterId);

            if (foundTopic.source === 'General') {
                const storedChapterName = (foundTopic.chapters as string[]).find(chName => normalizeId(chName) === normalizedChapterIdFromUrl);
                if (storedChapterName) {
                    foundChapter = {
                        id: normalizedChapterIdFromUrl,
                        name: storedChapterName,
                        topicId: foundTopic.id,
                        source: 'General',
                        topicName: foundTopic.name,
                        mcqCount: 0, // These counts are not relevant for editing notes
                        flashcardCount: 0, // These counts are not relevant for editing notes
                    };
                }
            } else { // Marrow source, chapters are objects
                foundChapter = (foundTopic.chapters as Chapter[]).find((ch: Chapter) => ch.id === normalizedChapterIdFromUrl) || null;
            }
        }
        return { chapter: foundChapter, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    const [notesContent, setNotesContent] = useState<string>('');
    const [isNotesLoading, setIsNotesLoading] = useState(true);

    useEffect(() => {
        const fetchNotes = async () => {
            if (!topic || !chapter || !source) {
                setIsNotesLoading(false);
                return;
            }
            try {
                if (source === 'General') {
                    // For General topics, notes are stored in a subcollection
                    const chapterNotesRef = doc(db, 'Topics', topic.id, 'ChapterNotes', chapter.id);
                    const docSnap = await getDoc(chapterNotesRef);
                    if (docSnap.exists()) {
                        setNotesContent(docSnap.data().summaryNotes || '');
                    } else {
                        setNotesContent('');
                    }
                } else { // Marrow topics
                    // For Marrow topics, notes are embedded within the chapter object inside the topic document
                    const topicDocRef = doc(db, 'MarrowTopics', topic.id);
                    const topicDocSnap = await getDoc(topicDocRef);
                    if (topicDocSnap.exists()) {
                        const updatedTopicData = topicDocSnap.data();
                        // Find the specific chapter within the topic's chapters array
                        const marrowChapter = (updatedTopicData?.chapters as Chapter[] || []).find(ch => ch.id === chapter.id);
                        setNotesContent(marrowChapter?.summaryNotes || '');
                    } else {
                        setNotesContent('');
                    }
                }
            } catch (error) {
                console.error("Error fetching chapter notes:", error);
                addToast("Failed to load notes.", "error");
                setNotesContent('');
            } finally {
                setIsNotesLoading(false);
            }
        };
        fetchNotes();
    }, [chapter, source, topic, addToast]); // Dependencies for useEffect

    const updateNotesMutation = useMutation({
        mutationFn: updateChapterNotes, // Directly calling the callable wrapper
        onSuccess: () => {
            addToast("Chapter notes saved successfully!", 'success');
            // Invalidate queries that depend on topic/chapter data to reflect changes
            queryClient.invalidateQueries({ queryKey: ['allTopics'] });
            queryClient.invalidateQueries({ queryKey: ['chapterContent', chapter?.id] });
            navigate(`/chapters/${topicId}/${chapterId}`); // Navigate back to chapter detail
        },
        onError: (error: Error) => {
            addToast(`Failed to save notes: ${error.message}`, 'error');
        },
    });

    const handleSave = () => {
        if (!topic || !chapter || !source) {
            addToast("Cannot save: missing topic, chapter, or source information.", "error");
            return;
        }
        // Call the mutation with required data
        updateNotesMutation.mutate({ topicId: topic.id, chapterId: chapter.id, newSummary: notesContent, source });
    };

    if (isTopicsLoading || isNotesLoading) return <Loader message="Loading chapter for notes..." />;
    if (topicsError) return <div className="text-center py-10 text-red-500">Error: {topicsError.message}</div>;
    if (!chapter || !topic) {
        return <div className="text-center py-10 text-slate-700 dark:text-slate-300">Chapter or Topic not found. Please ensure correct IDs and source are provided.</div>;
    }
    if (!source) {
        return <div className="text-center py-10 text-red-500">Error: Source for this topic was not provided in navigation state. Cannot edit notes.</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">Edit Notes for {chapter.name}</h1>
            <p className="text-slate-500 dark:text-slate-400">Topic: {topic.name} ({source} Source)</p>

            <div className="card-base p-6">
                <textarea
                    className="w-full h-96 p-4 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100"
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