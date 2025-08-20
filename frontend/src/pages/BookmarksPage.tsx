import React, { useState, useMemo, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics';
import { getBookmarks, toggleBookmark } from '@/services/userDataService';
import { getMCQsByIds, getFlashcardsByIds } from '@/services/firestoreService';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
// Using direct type imports from types package
import { MCQ, Flashcard, Topic, Chapter } from '@pediaquiz/types';
import { ChevronDownIcon } from '@heroicons/react/24/outline'; // Ensure ChevronDownIcon is imported
import { useToast } from '@/components/Toast';
import clsx from 'clsx';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { ToggleBookmarkCallableData } from '@pediaquiz/types'; // Explicitly importing ToggleBookmarkCallableData

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  type?: 'mcq' | 'flashcard' | 'chapter';
  topicId?: string;
  chapterId?: string;
}

const BookmarksPage: React.FC = () => {
  const { user } = useAuth();
  const { data: topics, isLoading: areTopicsLoading } = useTopics();
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const { addToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: bookmarkedIds, isLoading: areBookmarkIdsLoading } = useQuery<string[], Error>({
    queryKey: ['bookmarkedIds', user?.uid],
    queryFn: ({ queryKey }) => getBookmarks(queryKey[1] as string),
    enabled: !!user?.uid,
  });

  const { data: bookmarkedContent, isLoading: isBookmarkedContentLoading } = useQuery<(MCQ | Flashcard)[], Error>({
    queryKey: ['bookmarkedContent', bookmarkedIds],
    queryFn: async () => {
      if (!bookmarkedIds || bookmarkedIds.length === 0) return [];
      const mcqs = await getMCQsByIds(bookmarkedIds);
      const flashcards = await getFlashcardsByIds(bookmarkedIds);
      return [...mcqs, ...flashcards];
    },
    enabled: !!bookmarkedIds && bookmarkedIds.length > 0,
  });

  const toggleBookmarkMutation = useMutation<any, Error, ToggleBookmarkCallableData>({ // Explicitly type the mutation variables
    mutationFn: toggleBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarkedIds'] });
      addToast("Bookmark updated!", "success");
    },
    onError: (error) => {
      addToast(`Failed to update bookmark: ${error.message}`, "error");
    },
  });

  const groupedBookmarks = useMemo(() => {
    if (!topics || !bookmarkedContent) return [];
    // Define types for the accumulator and chapter object
    const groups: Record<string, { topic: Topic; chapters: Record<string, { chapter: Chapter; items: (MCQ | Flashcard)[] }> }> = {};
    bookmarkedContent.forEach((item: MCQ | Flashcard) => {
      const topic = topics.find((t: Topic) => t.id === item.topicId);
      if (!topic) return;
      // Ensure topic.chapters is treated as Chapter[] for consistency
      const chapter = (topic.chapters as Chapter[]).find((c: Chapter) => c.id === item.chapterId);
      if (!chapter) return;
      if (!groups[topic.id]) groups[topic.id] = { topic, chapters: {} };
      if (!groups[topic.id].chapters[chapter.id]) groups[topic.id].chapters[chapter.id] = { chapter, items: [] };
      groups[topic.id].chapters[chapter.id].items.push(item);
    });
    return Object.values(groups).sort((a, b) => a.topic.name.localeCompare(b.topic.name));
  }, [topics, bookmarkedContent]);

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => {
      const newSet = new Set(prev);
      newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
      return newSet;
    });
  };

  const handleResultSelect = useCallback((item: SearchResult) => {
    if (item.type === 'mcq' && item.topicId && item.chapterId) {
      navigate(`/chapters/${item.topicId}/${item.chapterId}`);
    } else if (item.type === 'flashcard' && item.topicId && item.chapterId) {
      navigate(`/flashcards/${item.topicId}/${item.chapterId}`);
    } else {
      addToast("Cannot navigate to this content type.", "info");
    }
  }, [navigate, addToast]);

  const isLoading = areTopicsLoading || areBookmarkIdsLoading || isBookmarkedContentLoading;

  if (isLoading) return <Loader message="Loading bookmarks..." />;
  if (!user) return <div className="text-center p-10 text-slate-500">Please log in to view your bookmarks.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">Your Bookmarks</h1>
      {groupedBookmarks.length === 0 ? (
        <div className="text-center py-8 card-base">
          <p className="text-slate-500 dark:text-slate-400">You haven't bookmarked any items yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedBookmarks.map(({ topic, chapters }) => {
            const isExpanded = expandedTopics.has(topic.id);
            return (
              <div key={topic.id} className="card-base overflow-hidden">
                <div
                  className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  onClick={() => toggleTopic(topic.id)}
                >
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Source: {topic.source}</p>
                  </div>
                  <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                </div>
                {isExpanded && (
                  <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                    {Object.values(chapters).sort((a, b) => a.chapter.name.localeCompare(b.chapter.name)).map(({ chapter, items }) => (
                      <div key={chapter.id}>
                        <h4 className="font-semibold text-md text-sky-600 dark:text-sky-400 mb-2">{chapter.name}</h4>
                        <div className="space-y-3">
                          {items.sort((a, b) => a.id.localeCompare(b.id)).map((item: MCQ | Flashcard) => {
                            const title = 'question' in item ? item.question : item.front;
                            const snippet = 'explanation' in item ? (item.explanation || '') : ('back' in item ? item.back : '');
                            return (
                              <SearchResultItem
                                key={item.id}
                                result={{ id: item.id, title, snippet, type: item.type, topicId: item.topicId, chapterId: item.chapterId }}
                                onSelect={handleResultSelect}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleBookmarkMutation.mutate({ contentId: item.id, contentType: item.type });
                                  }}
                                  className={clsx("p-2 rounded-full", bookmarkedIds?.includes(item.id) ? "text-amber-500" : "text-slate-400 hover:text-amber-400")}
                                  title="Toggle bookmark"
                                >
                                  {bookmarkedIds?.includes(item.id) ? <BookmarkSolidIcon className="h-5 w-5" /> : <BookmarkOutlineIcon className="h-5 w-5" />}
                                </button>
                              </SearchResultItem>
                            );
                          })}
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