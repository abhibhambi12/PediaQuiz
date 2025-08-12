// FILE: workspaces/frontend/src/pages/BookmarksPage.tsx

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics'; // NEW: Import useTopics
import { getBookmarks } from '@/services/userDataService';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ, Flashcard, Topic, Chapter } from '@pediaquiz/types';
import { ChevronDownIcon } from '@/components/Icons';
import { getMcqsByIds } from '@/services/sessionService'; // Can reuse this
import { db } from '@/firebase'; // Needed for direct Firestore queries
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import clsx from 'clsx'; // NEW IMPORT for conditional styling
import { useSound } from '@/hooks/useSound'; // NEW IMPORT: useSound


// NEW: Helper function to get Flashcards by ID (similar to getMcqsByIds)
async function getFlashcardsByIds(flashcardIds: string[]): Promise<Flashcard[]> {
    if (!flashcardIds || flashcardIds.length === 0) return [];
    
    const allFlashcards: Flashcard[] = [];
    const chunkSize = 10; 

    for (let i = 0; i < flashcardIds.length; i += chunkSize) {
        const chunk = flashcardIds.slice(i, i + chunkSize);
        
        const flashcardQuery = query(collection(db, 'Flashcards'), where(documentId(), 'in', chunk), where('status', '==', 'approved'));
        const flashcardSnapshot = await getDocs(flashcardQuery);
        
        flashcardSnapshot.forEach(doc => allFlashcards.push({ id: doc.id, ...doc.data() } as Flashcard));
    }
    const flashcardMap = new Map(allFlashcards.map(fc => [fc.id, fc]));
    return flashcardIds.map(id => flashcardMap.get(id)).filter(Boolean) as Flashcard[];
}


const BookmarksPage: React.FC = () => {
    const { user } = useAuth();
    // REFACTORED: Use useTopics() instead of useData()
    const { data: topics, isLoading: areTopicsLoading } = useTopics();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const { playSound } = useSound(); // Use sound hook

    const { data: bookmarkIds, isLoading: areBookmarksLoading } = useQuery<string[]>({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        initialData: [],
    });

    // NEW: Fetch bookmarked content on demand using the retrieved IDs
    const { data: bookmarkedContent, isLoading: isBookmarkedContentLoading } = useQuery<(MCQ | Flashcard)[]>({
        queryKey: ['bookmarkedContent', bookmarkIds],
        queryFn: async () => {
            if (!bookmarkIds || bookmarkIds.length === 0) return [];

            const mcqs = await getMcqsByIds(bookmarkIds);
            const flashcards = await getFlashcardsByIds(bookmarkIds);
            
            return [...mcqs, ...flashcards];
        },
        enabled: !!bookmarkIds && bookmarkIds.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const groupedBookmarks = useMemo(() => {
        if (!topics || !bookmarkedContent || bookmarkedContent.length === 0) return [];

        const groups: Record<string, { topic: Topic; chapters: Record<string, { chapter: Chapter; items: (MCQ | Flashcard)[] }> }> = {};

        bookmarkedContent.forEach((item: MCQ | Flashcard) => {
            const topic = topics.find((t: Topic) => t.id === item.topicId);
            if (!topic) return;

            const chapter = topic.chapters.find((c: Chapter) => c.id === item.chapterId);
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
    }, [topics, bookmarkedContent]);

    const toggleTopic = (topicId: string) => {
        playSound('buttonClick');
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };
    
    const isLoading = areTopicsLoading || areBookmarksLoading || isBookmarkedContentLoading;

    if (isLoading) return <Loader message="Loading bookmarks..." />;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Your Bookmarks</h1>
            
            {groupedBookmarks.length === 0 ? (
                // --- UPDATED CLASSES: using card-base utility class ---
                <div className="text-center py-8 card-base">
                    <p className="text-neutral-500">You haven't bookmarked any items yet.</p>
                    <p className="text-sm text-neutral-400 mt-1">Click the bookmark icon during a session to save an item for review.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {groupedBookmarks.map(({ topic, chapters }) => {
                        const isExpanded = expandedTopics.has(topic.id);
                        return (
                            // --- UPDATED CLASSES: using card-base utility class ---
                            <div key={topic.id} className="card-base overflow-hidden">
                                <div 
                                    className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                                    onClick={() => toggleTopic(topic.id)}
                                >
                                    <div>
                                        <h3 className="font-bold text-lg text-neutral-800 dark:text-neutral-200">{topic.name}</h3>
                                        <p className="text-sm text-neutral-500 dark:text-neutral-400">{topic.source}</p>
                                    </div>
                                    <ChevronDownIcon className={clsx(`transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                                </div>
                                {isExpanded && (
                                    <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
                                        {Object.values(chapters).map(({ chapter, items }) => (
                                            <div key={chapter.id}>
                                                <h4 className="font-semibold text-md text-primary-600 dark:text-primary-400 mb-2">{chapter.name}</h4>
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