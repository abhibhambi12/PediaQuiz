import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getBookmarks } from '@/services/userDataService';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ, Flashcard, Topic, Chapter } from '@pediaquiz/types';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/Icons';
import { Link } from 'react-router-dom';

const BookmarksPage: React.FC = () => {
    const { user } = useAuth();
    const { data: appData, isLoading: isAppDataLoading } = useData();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const { data: bookmarkIds, isLoading: areBookmarksLoading } = useQuery({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        initialData: [],
    });

    const groupedBookmarks = useMemo(() => {
        if (!appData || !bookmarkIds || bookmarkIds.length === 0) return [];

        const bookmarkSet = new Set(bookmarkIds);
        const content = [...appData.mcqs, ...appData.flashcards];
        const bookmarkedContent = content.filter(item => bookmarkSet.has(item.id));

        const groups: Record<string, { topic: Topic; chapters: Record<string, { chapter: Chapter; items: (MCQ | Flashcard)[] }> }> = {};

        bookmarkedContent.forEach(item => {
            const topic = appData.topics.find(t => t.id === item.topicId);
            if (!topic) return;

            const chapter = topic.chapters.find(c => c.id === item.chapterId);
            if (!chapter) return;

            if (!groups[topic.id]) {
                groups[topic.id] = { topic, chapters: {} };
            }
            if (!groups[topic.id].chapters[chapter.id]) {
                groups[topic.id].chapters[chapter.id] = { chapter, items: [] };
            }
            groups[topic.id].chapters[chapter.id].items.push(item);
        });

        return Object.values(groups);
    }, [appData, bookmarkIds]);

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };
    
    const isLoading = isAppDataLoading || areBookmarksLoading;

    if (isLoading) return <Loader message="Loading bookmarks..." />;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Your Bookmarks</h1>
            
            {groupedBookmarks.length === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-lg shadow-md">
                    <p className="text-slate-500">You haven't bookmarked any items yet.</p>
                    <p className="text-sm text-slate-400 mt-1">Click the bookmark icon during a session to save an item for review.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {groupedBookmarks.map(({ topic, chapters }) => {
                        const isExpanded = expandedTopics.has(topic.id);
                        return (
                            <div key={topic.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
                                <div 
                                    className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                    onClick={() => toggleTopic(topic.id)}
                                >
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{topic.source}</p>
                                    </div>
                                    <ChevronDownIcon className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                                {isExpanded && (
                                    <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                        {Object.values(chapters).map(({ chapter, items }) => (
                                            <div key={chapter.id}>
                                                <h4 className="font-semibold text-md text-sky-600 dark:text-sky-400 mb-2">{chapter.name}</h4>
                                                <div className="space-y-3">
                                                    {items.map(item => <SearchResultItem key={item.id} item={item} />)}
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