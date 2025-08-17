// frontend/src/pages/ChapterNotesEditPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTopics } from '@/hooks/useTopics'; // CORRECTED: Use useTopics
import { updateChapterNotes } from '@/services/firestoreService'; // CORRECTED: Import from firestoreService
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { Topic, Chapter } from '@pediaquiz/types';

const ChapterNotesEditPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { data: topics, isLoading: isTopicsLoading, error: topicsError } = useTopics(); // CORRECTED

    // Determine the source from route state. This is CRITICAL for backend.
    const source = location.state?.source as 'General' | 'Marrow' | undefined;

    // Find the specific topic and chapter from the fetched topics
    const { chapter, topic } = React.useMemo(() => {
        if (!topics || !topicId || !chapterId) return { chapter: null, topic: null };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        let foundChapter: Chapter | undefined;

        if (foundTopic) {
            // Chapters can be stored as string array (General) or object array (Marrow)
            if (foundTopic.source === 'General') {
                const chapterName = (foundTopic.chapters as any[]).find(ch => {
                    // For General, chapters array holds strings. Match normalized chapterId to normalized chapter name
                    return typeof ch === 'string' && ch.replace(/\s+/g, '_').toLowerCase() === chapterId;
                });
                if (chapterName) {
                    foundChapter = {
                        id: chapterId,
                        name: chapterName,
                        mcqCount: 0, flashcardCount: 0, // Not available directly in General's chapter array
                        topicId: foundTopic.id,
                        source: 'General',
                        topicName: foundTopic.name,
                        summaryNotes: null, // Will fetch notes from subcollection if it exists
                    };
                }
            } else { // Marrow source
                foundChapter = foundTopic.chapters.find((ch: Chapter) => ch.id === chapterId);
            }
        }
        return { chapter: foundChapter || null, topic: foundTopic || null };
    }, [topics, topicId, chapterId]);

    const [notesContent, setNotesContent] = useState<string>('');

    // If it's a General topic, notes might be in a subcollection. Fetch them.
    useEffect(() => {
        const fetchGeneralNotes = async () => {
            if (topic && chapter && source === 'General') {
                // Assuming getChapterNotes is a new service function in firestoreService.ts
                // You would need to implement this:
                // export const getChapterNotes = async (topicId: string, chapterId: string) => {
                //   const docSnap = await getDoc(doc(db, 'Topics', topicId, 'ChapterNotes', chapterId));
                //   return docSnap.exists() ? docSnap.data().summaryNotes : '';
                // };
                // For now, if getChapterNotes doesn't exist, we'll assume notes come from chapter object or are empty.
                const generalNotes = chapter.summaryNotes || ''; // Fallback if no specific general notes fetching
                setNotesContent(generalNotes);
            } else if (chapter && source === 'Marrow') {
                setNotesContent(chapter.summaryNotes || '');
            }
        };
        fetchGeneralNotes();
    }, [chapter, source, topic]);


    const updateNotesMutation = useMutation({
        mutationFn: updateChapterNotes, // Correct function from firestoreService
        onSuccess: () => {
            addToast("Chapter notes saved successfully!", 'success');
            queryClient.invalidateQueries({ queryKey: ['allTopics'] }); // Invalidate allTopics to refetch updated chapters
            queryClient.invalidateQueries({ queryKey: ['chapterContent', source, chapter?.name] }); // Invalidate chapter content if needed
            navigate(`/chapters/${topicId}/${chapterId}`);
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
        updateNotesMutation.mutate({ topicId: topic.id, chapterId: chapter.id, newSummary: notesContent, source });
    };

    if (isTopicsLoading) return <Loader message="Loading chapter for notes..." />;
    if (topicsError) return <div className="text-center py-10 text-red-500">Error: {topicsError.message}</div>;
    if (!chapter || !topic) {
        return <div className="text-center py-10">Chapter or Topic not found. Please ensure correct IDs and source are provided.</div>;
    }
    if (!source) {
        return <div className="text-center py-10 text-red-500">Error: Source for this topic was not provided in navigation state. Cannot edit notes.</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Edit Notes for {chapter.name}</h1>
            <p className="text-slate-500 dark:text-slate-400">Topic: {topic.name} ({source} Source)</p>

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
