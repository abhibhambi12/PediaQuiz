// frontend/src/pages/TagQuestionsPage.tsx
// frontend/pages/TagQuestionsPage.tsx
import React, { useEffect, useState, useMemo } from 'react'; // Added useMemo
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuestionsByTag } from '../services/firestoreService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
// Direct type import
import { MCQ } from '@pediaquiz/types';

const TagQuestionsPage: React.FC = () => {
    const { tagName } = useParams<{ tagName: string }>();
    const { addToast } = useToast();

    // The queryFn getQuestionsByTag now handles normalizing the tag name to lowercase
    // before querying Firestore, addressing the case-sensitivity issue.
    const { data: questions, isLoading, error } = useQuery<MCQ[], Error>({
        queryKey: ['questionsByTag', tagName],
        queryFn: () => {
            if (!tagName) throw new Error("Tag name is missing.");
            return getQuestionsByTag(tagName);
        },
        enabled: !!tagName, // Only run the query if tagName is available
        staleTime: 1000 * 60 * 5, // Data considered stale after 5 minutes
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (error) {
            addToast(`Failed to load questions for tag "${tagName}": ${error.message}`, "error");
        }
    }, [error, addToast, tagName]);

    if (isLoading) {
        return <Loader message={`Loading questions for "${tagName}"...`} />;
    }

    if (error) {
        return <div className="p-6 text-center text-red-500">Error loading questions for this tag.</div>;
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Questions for Tag: "{tagName}"</h1>
            {questions && questions.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">No questions found for the tag "{tagName}".</p>
            ) : (
                <ul className="space-y-4">
                    {questions?.map((mcq) => (
                        <li key={mcq.id} className="card-base p-4">
                            <h2 className="font-medium text-lg text-slate-900 dark:text-slate-100 mb-2">{mcq.question}</h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Topic: {mcq.topicName || 'N/A'}, Chapter: {mcq.chapterName || 'N/A'}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {/* Ensure tags are displayed if they exist */}
                                {mcq.tags?.map((tag: string) => (
                                    <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            {/* Check if topicId and chapterId exist before linking */}
                            {mcq.topicId && mcq.chapterId && (
                                <Link
                                    to={`/chapters/${mcq.topicId}/${mcq.chapterId}`}
                                    className="text-sky-600 dark:text-sky-400 hover:underline text-sm mt-2 inline-block"
                                >
                                    View Chapter
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default TagQuestionsPage;