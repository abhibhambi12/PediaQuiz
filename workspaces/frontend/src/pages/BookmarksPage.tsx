import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics';
import { getBookmarks } from '@/services/userDataService';
import { getMcqsByIds, getFlashcardsByIds } from '@/services/firestoreService';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ, Flashcard, Topic, Chapter } from '@pediaquiz/types';
import { ChevronDownIcon } from '@/components/Icons';
import clsx from 'clsx';

const BookmarksPage: React.FC = () => {
    const { user } = useAuth();
    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const { data: bookmarkIds, isLoading: areBookmarksLoading, error: bookmarksError } = useQuery<{ mcq: string[], flashcard: string[] }>({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        staleTime: 1000 * 60 * 5,
    });

    const { data: bookmarkedContent, isLoading: isBookmarkedContentLoading, error: bookmarkedContentError } = useQuery<(MCQ | Flashcard)[]>({
        queryKey: ['bookmarkedContent', bookmarkIds?.mcq, bookmarkIds?.flashcard],
        queryFn: async () => {
            if (!bookmarkIds) return [];
            const [mcqs, flashcards] = await Promise.all([
                getMcqsByIds(bookmarkIds.mcq || []),
                getFlashcardsByIds(bookmarkIds.flashcard || []),
            ]);
            return [...mcqs, ...flashcards];
        },
        enabled: !!bookmarkIds,
        staleTime: 1000 * 60 * 5,
    });

    const groupedBookmarks = useMemo(() => {
        if (!topics || !bookmarkedContent || bookmarkedContent.length === 0) return [];
        const groups: Record<string, { topic: Topic; chapters: Record<string, { chapter: Chapter; items: (MCQ | Flashcard)[] }> }> = {};

        bookmarkedContent.forEach((item) => {
            const topic = topics.find(t => t.id === item.topicId);
            if (!topic) return;
            const chapter = topic.chapters.find(c => c.id === item.chapterId);
            if (!chapter) return;

            if (!groups[topic.id]) groups[topic.id] = { topic, chapters: {} };
            if (!groups[topic.id].chapters[chapter.id]) groups[topic.id].chapters[chapter.id] = { chapter, items: [] };
            groups[topic.id].chapters[chapter.id].items.push(item);
        });

        return Object.values(groups).sort((a,b) => a.topic.name.localeCompare(b.topic.name));
    }, [topics, bookmarkedContent]);

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };
    
    const isLoading = areTopicsLoading || areBookmarksLoading || isBookmarkedContentLoading;
    const error = topicsError || bookmarksError || bookmarkedContentError;

    if (isLoading) return <Loader message="Loading bookmarks..." />;
    if (error) return <div className="text-center py-10 text-red-500">Error: {error.message}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Your Bookmarks</h1>
            
            {groupedBookmarks.length === 0 ? (
                <div className="text-center py-8 card-base">
                    <p className="text-slate-500">You haven't bookmarked any items yet.</p>
                    <p className="text-sm text-slate-400 mt-1">Click the bookmark icon during a session to save an item for review.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {groupedBookmarks.map(({ topic, chapters }) => {
                        const isExpanded = expandedTopics.has(topic.id);
                        return (
                            <div key={topic.id} className="card-base overflow-hidden">
                                <button 
                                    className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                                    onClick={() => toggleTopic(topic.id)}
                                    aria-expanded={isExpanded}
                                >
                                    <div>
                                        <h3 className="font-bold text-lg text-neutral-800 dark:text-neutral-200">{topic.name}</h3>
                                        <p className="text-sm text-neutral-500 dark:text-neutral-400">{topic.source}</p>
                                    </div>
                                    <ChevronDownIcon className={clsx(`transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                                </button>
                                {isExpanded && (
                                    <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
                                        {Object.values(chapters).sort((a,b) => a.chapter.name.localeCompare(b.chapter.name)).map(({ chapter, items }) => (
                                            <div key={chapter.id}>
                                                <h4 className="font-semibold text-md text-primary-600 dark:text-primary-400 mb-2">{chapter.name}</h4>
                                                <div className="space-y-3">
                                                    {items.sort((a, b) => a.id.localeCompare(b.id)).map(item => <SearchResultItem key={item.id} item={item} />)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default BookmarksPage;