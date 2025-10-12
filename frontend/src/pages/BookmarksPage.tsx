import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toggleBookmark } from '@/services/apiService';
import { getMCQsByIds, getFlashcardsByIds } from '@/services/contentService';
import Loader from '@/components/Loader';
import { MCQ, Flashcard, Topic, Chapter } from '@pediaquiz/types';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/components/Toast';
import clsx from 'clsx';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { useNavigate } from 'react-router-dom';

const BookmarksPage: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const { appData, isLoadingData } = useData();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const { addToast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const bookmarkedMcqIds = user?.bookmarkedMcqs || [];
    const bookmarkedFlashcardIds = user?.bookmarkedFlashcards || [];

    const { data: bookmarkedContent, isLoading: isContentLoading } = useQuery({
        queryKey: ['bookmarkedContent', bookmarkedMcqIds, bookmarkedFlashcardIds],
        queryFn: async () => {
            const [mcqs, flashcards] = await Promise.all([
                getMCQsByIds(bookmarkedMcqIds),
                getFlashcardsByIds(bookmarkedFlashcardIds)
            ]);
            return [...mcqs, ...flashcards];
        },
        enabled: !!user && (bookmarkedMcqIds.length > 0 || bookmarkedFlashcardIds.length > 0),
    });

    const toggleBookmarkMutation = useMutation({
        mutationFn: toggleBookmark,
        onSuccess: async () => {
            await refreshUser();
            queryClient.invalidateQueries({ queryKey: ['bookmarkedContent'] });
            addToast("Bookmark removed!", "success");
        },
        onError: (error: any) => addToast(`Failed to update bookmark: ${error.message}`, "error"),
    });

    const groupedBookmarks = useMemo(() => {
        if (!appData?.topics || !bookmarkedContent) return [];
        const groups: Record<string, { topic: Topic; chapters: Record<string, { chapter: Chapter; items: (MCQ | Flashcard)[] }> }> = {};
        
        bookmarkedContent.forEach(item => {
            const topic = appData.topics.find(t => t.id === item.topicId);
            if (!topic) return;
            const chapter = Array.isArray(topic.chapters) ? topic.chapters.find(c => c.id === item.chapterId) : undefined;
            if (!chapter) return;

            if (!groups[topic.id]) groups[topic.id] = { topic, chapters: {} };
            if (!groups[topic.id].chapters[chapter.id]) groups[topic.id].chapters[chapter.id] = { chapter, items: [] };
            groups[topic.id].chapters[chapter.id].items.push(item);
        });
        return Object.values(groups).sort((a, b) => a.topic.name.localeCompare(b.topic.name));
    }, [appData, bookmarkedContent]);

    if (isLoadingData || isContentLoading) return <Loader fullScreen message="Loading bookmarks..." />;
    
    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold">Your Bookmarks</h1>
            {groupedBookmarks.length === 0 ? (
                <div className="text-center py-8 card-base"><p>You haven't bookmarked any items yet.</p></div>
            ) : (
                groupedBookmarks.map(({ topic, chapters }) => (
                    <div key={topic.id} className="card-base overflow-hidden">
                        <button className="w-full text-left p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-700/50" onClick={() => setExpandedTopics(p => { const n = new Set(p); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; })}>
                            <h3 className="font-bold text-lg">{topic.name}</h3>
                            <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform`, expandedTopics.has(topic.id) && 'rotate-180')} />
                        </button>
                        {expandedTopics.has(topic.id) && (
                            <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                {Object.values(chapters).sort((a, b) => a.chapter.name.localeCompare(b.chapter.name)).map(({ chapter, items }) => (
                                    <div key={chapter.id}>
                                        <h4 className="font-semibold text-sky-600 dark:text-sky-400 mb-2">{chapter.name}</h4>
                                        {items.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 mb-2">
                                                <p className="flex-1 cursor-pointer pr-2" onClick={() => navigate(item.type === 'mcq' ? `/chapters/${item.topicId}/${item.chapterId}` : `/flashcards/${item.topicId}/${item.chapterId}`)}>{item.type === 'mcq' ? item.question : item.front}</p>
                                                <button onClick={() => toggleBookmarkMutation.mutate({ contentId: item.id, contentType: item.type })} className="p-2 text-amber-500 hover:text-amber-400" aria-label="Remove bookmark">
                                                    <BookmarkSolidIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
};
export default BookmarksPage;