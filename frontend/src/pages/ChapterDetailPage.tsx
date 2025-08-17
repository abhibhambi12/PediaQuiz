import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTopics } from '@/hooks/useTopics';
import { useChapterContent } from '@/hooks/useChapterContent'; // Import the hook
import Loader from '@/components/Loader';
import ReactMarkdown from 'react-markdown';
import type { Chapter, Topic } from '@pediaquiz/types';

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const navigate = useNavigate();
    const { data: topics, isLoading: isTopicsLoading, error: topicsError } = useTopics();

    // Determine the specific topic and chapter based on fetched topics
    const { chapter, topic, source } = React.useMemo(() => {
        if (!topics || !topicId || !chapterId) return { chapter: null, topic: null, source: undefined };
        const foundTopic = topics.find((t: Topic) => t.id === topicId);
        let foundChapter: Chapter | undefined;
        let inferredSource: 'General' | 'Marrow' | undefined;

        if (foundTopic) {
            inferredSource = foundTopic.source;
            if (foundTopic.source === 'General') {
                // For General topics, chapters are string arrays. Need to map to a Chapter object.
                const chapterName = (foundTopic.chapters as string[]).find(name => {
                    const normalizedName = name.replace(/\s+/g, '_').toLowerCase();
                    return normalizedName === chapterId;
                });
                if (chapterName) {
                    foundChapter = {
                        id: chapterId,
                        name: chapterName,
                        mcqCount: 0, // Counts are not directly available for chapters in General Topics' array
                        flashcardCount: 0,
                        topicId: foundTopic.id,
                        source: foundTopic.source,
                        topicName: foundTopic.name,
                        summaryNotes: null, // Notes for General topics are in a subcollection, not directly here
                    };
                }
            } else { // Marrow topics have Chapter objects
                foundChapter = foundTopic.chapters.find((ch: Chapter) => ch.id === chapterId);
            }
        }
        return { chapter: foundChapter || null, topic: foundTopic || null, source: inferredSource };
    }, [topics, topicId, chapterId]);

    // Fetch chapter-specific content (MCQs, Flashcards) using the dedicated hook
    const { data: chapterContent, isLoading: isChapterContentLoading, error: chapterContentError } = useChapterContent(source, chapter?.name);
    // console.log("Chapter Content:", chapterContent);

    if (isTopicsLoading || isChapterContentLoading) return <Loader message="Loading chapter details..." />;
    if (topicsError || chapterContentError) return <div className="text-center py-10 text-red-500">Error: {topicsError?.message || chapterContentError?.message}</div>;
    if (!chapter || !topic || !source) {
        return <div className="text-center py-10">Chapter or Topic not found.</div>;
    }

    const mcqCount = chapterContent?.mcqs.length || 0;
    const flashcardCount = chapterContent?.flashcards.length || 0;

    // For General topics, notes might be in a subcollection like Topics/{topicId}/ChapterNotes/{chapterId}
    // So, chapter.summaryNotes might not be directly available for General topics here.
    // A separate fetch for General notes might be needed if they are not pre-loaded with topics.
    // For now, we use what's available or default to "No notes available."
    const displayNotes = chapter.summaryNotes || "No summary notes available for this chapter yet.";

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-4xl font-extrabold text-slate-800 dark:text-slate-50">{chapter.name}</h1>
                <Link
                    to={`/admin/marrow/notes/edit/${topic.id}/${chapter.id}`}
                    state={{ source: source }} // Pass source for backend function
                    className="btn-neutral"
                >
                    Edit Notes
                </Link>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-lg">From Topic: <Link to="/" className="text-sky-600 hover:underline">{topic.name}</Link></p>

            <div className="card-base p-6">
                <h2 className="text-2xl font-bold mb-4">Summary Notes</h2>
                <div className="prose dark:prose-invert max-w-none">
                    <ReactMarkdown>{displayNotes}</ReactMarkdown>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card-base p-6">
                    <h2 className="text-2xl font-bold mb-4">Questions ({mcqCount})</h2>
                    {mcqCount > 0 ? (
                        <Link to={`/session/practice/${topic.id}-${chapter.id}-mcq`} className="btn-primary w-full">
                            Start Practice MCQs
                        </Link>
                    ) : (
                        <p className="text-slate-500">No MCQs available for this chapter.</p>
                    )}
                </div>

                <div className="card-base p-6">
                    <h2 className="text-2xl font-bold mb-4">Flashcards ({flashcardCount})</h2>
                    {flashcardCount > 0 ? (
                        <Link to={`/flashcards/${topic.id}/${chapter.id}`} className="btn-secondary w-full">
                            Start Flashcards
                        </Link>
                    ) : (
                        <p className="text-slate-500">No Flashcards available for this chapter.</p>
                    )}
                </div>
            </div>

            {/* Optionally display recent MCQs/Flashcards for this chapter directly */}
            {/* <div>
                <h2 className="text-2xl font-bold mb-4">Recent MCQs</h2>
                {chapterContent?.mcqs.slice(0, 5).map(mcq => (
                    <div key={mcq.id} className="mb-2 p-3 bg-white rounded-md shadow-sm">
                        <p>{mcq.question}</p>
                    </div>
                ))}
            </div> */}
        </div>
    );
};

export default ChapterDetailPage;