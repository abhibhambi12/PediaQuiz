import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTopics } from '@/hooks/useTopics';
import { useChapterContent } from '@/hooks/useChapterContent';
import { useToast } from '@/components/Toast';
import { deleteContentItem, toggleBookmark } from '@/services/userDataService';
import { addFlashcardAttempt } from '@/services/aiService';
import Loader from '@/components/Loader';
import { TrashIcon } from '@/components/Icons';
import ConfirmationModal from '@/components/ConfirmationModal';
import type { Flashcard, ToggleBookmarkCallableData, DeleteContentItemCallableData, Topic, Chapter, ConfidenceRating, AddFlashcardAttemptCallableData } from '@pediaquiz/types';
import clsx from 'clsx';
import { BookmarkIcon as OutlineBookmarkIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as SolidBookmarkIcon } from '@heroicons/react/24/solid';

const FlashcardSessionPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { user, userBookmarksQuery } = useAuth();
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const { data: topics, isLoading: areTopicsLoading, error: topicsError } = useTopics();
    const { data: chapterContent, isLoading: isContentLoading, error: contentError } = useChapterContent(chapterId);

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const { currentChapter } = useMemo(() => {
        const topic = topics?.find((t: Topic) => t.id === topicId);
        const chapter = topic?.chapters.find((c: Chapter) => c.id === chapterId);
        return { currentChapter: chapter };
    }, [topics, topicId, chapterId]);

    const addFlashcardAttemptMutation = useMutation<
        { success: boolean }, // Explicit return type for direct data return
        Error, // Error type
        AddFlashcardAttemptCallableData // Variables type
    >({
        mutationFn: (vars) => {
            if (!user) throw new Error("User not authenticated."); // Ensure user before mutation
            return addFlashcardAttempt(vars);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attemptedFlashcards', user?.uid] });
            // Invalidate chapter content to reflect updated counts if chapter has dynamic counts
            queryClient.invalidateQueries({ queryKey: ['chapterContent', chapterId] }); 
        },
        onError: (error: Error) => addToast(`Failed to record attempt: ${error.message}`, "danger"),
    });

    const deleteFlashcardMutation = useMutation<
        { success: boolean, message: string }, // Explicit return type for direct data return
        Error, // Error type
        DeleteContentItemCallableData // Variables type
    >({
        mutationFn: (data) => {
            if (!user?.isAdmin) throw new Error("Permission denied."); // Ensure admin before mutation
            return deleteContentItem(data);
        },
        onSuccess: () => {
            addToast("Flashcard deleted.", "success");
            queryClient.invalidateQueries({ queryKey: ['topics'] });
            queryClient.invalidateQueries({ queryKey: ['chapterContent', chapterId] });
            setIsFlipped(false);
            // After deletion, update local state to remove the card or navigate if no cards left
            setFlashcards(prev => prev.filter(fc => fc.id !== currentCard?.id));
            if (flashcards.length - 1 === 0) {
                // If no cards left, navigate back or show a message
                addToast("No more flashcards in this chapter.", "info");
                // navigate back? or to chapter detail page? Depends on desired UX
            } else {
                // Move to the next card, or stay on current if it was the last one
                setCurrentCardIndex(prev => Math.min(prev, flashcards.length - 2)); 
            }
        },
        onError: (error: Error) => addToast(`Error deleting flashcard: ${error.message}`, "danger"),
    });

    const toggleBookmarkMutation = useMutation<
        { bookmarked: boolean, bookmarks: string[] }, // Explicit return type for direct data return
        Error, // Error type
        ToggleBookmarkCallableData // Variables type
    >({
        mutationFn: (data) => {
            if (!user) throw new Error("User not authenticated."); // Ensure user before mutation
            return toggleBookmark(data);
        },
        onMutate: async (data: ToggleBookmarkCallableData) => {
            await queryClient.cancelQueries({ queryKey: ['bookmarks', user?.uid] });
            const previousBookmarks = queryClient.getQueryData<{ mcq: string[], flashcard: string[] }>(['bookmarks', user?.uid]);
            queryClient.setQueryData<{ mcq: string[], flashcard: string[] }>(['bookmarks', user?.uid], (old) => {
                if (!old) return { mcq: [], flashcard: [] };
                const bookmarked = old.flashcard || [];
                const isBookmarked = bookmarked.includes(data.contentId);
                const newBookmarks = isBookmarked ? bookmarked.filter(id => id !== data.contentId) : [...bookmarked, data.contentId];
                return { ...old, flashcard: newBookmarks };
            });
            return { previousBookmarks };
        },
        onError: (err, variables, context) => {
            if (context?.previousBookmarks) {
                queryClient.setQueryData(['bookmarks', user?.uid], context.previousBookmarks);
            }
            addToast("Failed to update bookmark.", "danger");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] });
        },
    });

    useEffect(() => {
        if (chapterContent?.flashcards) {
            setFlashcards(chapterContent.flashcards.sort(() => Math.random() - 0.5));
            setCurrentCardIndex(0);
            setIsFlipped(false);
        }
    }, [chapterContent]);
    
    const currentCard = useMemo(() => flashcards[currentCardIndex], [flashcards, currentCardIndex]);
    const isBookmarked = useMemo(() => !!(userBookmarksQuery.data?.flashcard && currentCard && userBookmarksQuery.data.flashcard.includes(currentCard.id)), [userBookmarksQuery.data, currentCard]);

    const handleFlip = () => setIsFlipped(f => !f);

    const handleConfidenceRating = (rating: ConfidenceRating) => {
        if (!currentCard || !user) return; // Ensure user exists before attempting to record
        addFlashcardAttemptMutation.mutate({ flashcardId: currentCard.id, rating });
        setIsFlipped(false);
        setTimeout(() => {
            if (currentCardIndex < flashcards.length - 1) {
                setCurrentCardIndex(prev => prev + 1);
            } else {
                addToast("You've reviewed all flashcards in this chapter!", "success");
                // Option to loop, go back to chapter page, or show statistics. For now, reset index.
                setCurrentCardIndex(0); 
                setFlashcards(prev => prev.sort(() => Math.random() - 0.5)); // Reshuffle for next round
            }
        }, 150);
    };

    const handleDeleteFlashcard = () => {
        if (!user?.isAdmin || !currentCard) {
            addToast("You do not have permission to delete flashcards or no card is selected.", "warning");
            return;
        }
        deleteFlashcardMutation.mutate({ id: currentCard.id, type: 'flashcard', collectionName: 'Flashcards' });
        setIsDeleteModalOpen(false);
    };

    const handleToggleBookmark = () => {
        if (!user || !currentCard) { // Ensure user exists
            addToast("Please log in to bookmark items.", "warning");
            return;
        }
        toggleBookmarkMutation.mutate({ contentId: currentCard.id, contentType: 'flashcard', action: isBookmarked ? 'remove' : 'add' });
    };

    const isLoading = areTopicsLoading || isContentLoading || !currentCard;
    if (isLoading) return <Loader message="Loading flashcards..." />;
    const error = topicsError || contentError;
    if (error) return <div className="text-center p-10 text-red-500">Error: {error.message}</div>;
    if (flashcards.length === 0) return <div className="text-center p-10">No flashcards found for this chapter.</div>;
    
    return (
        <>
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDeleteFlashcard} title="Delete Flashcard" message="Are you sure you want to permanently delete this flashcard? This action cannot be undone." confirmText="Delete" variant="danger" isLoading={deleteFlashcardMutation.isPending} />
            <div className="max-w-xl mx-auto p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Flashcards - {currentChapter?.name}</h2>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && (<button onClick={() => setIsDeleteModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-red-500" title="Delete Flashcard"><TrashIcon /></button>)}
                        <button onClick={handleToggleBookmark} disabled={toggleBookmarkMutation.isPending} className={clsx("p-2 rounded-full", isBookmarked ? "text-amber-500 bg-amber-100 dark:bg-amber-800/50" : "text-slate-400 hover:text-amber-400")}><SolidBookmarkIcon className={clsx("w-6 h-6", !isBookmarked && "hidden")} /><OutlineBookmarkIcon className={clsx("w-6 h-6", isBookmarked && "hidden")} /></button>
                    </div>
                </div>
                <div className="relative h-80 w-full cursor-pointer [perspective:1000px]" onClick={handleFlip}>
                    <div className="absolute h-full w-full rounded-xl shadow-lg transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="absolute h-full w-full bg-white dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center p-6 text-center [backface-visibility:hidden]">
                            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Question</h3>
                            <p className="mt-2 text-xl text-slate-800 dark:text-slate-200">{currentCard.front}</p>
                        </div>
                        <div className="absolute h-full w-full bg-sky-100 dark:bg-sky-900 rounded-xl flex flex-col items-center justify-center p-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                            <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Answer</h3>
                            <p className="mt-2 text-xl text-slate-800 dark:text-slate-200">{currentCard.back}</p>
                        </div>
                    </div>
                </div>

                {isFlipped ? (
                    <div className="flex justify-around mt-6 space-x-2 animate-fade-in-up">
                        <button onClick={() => handleConfidenceRating('again')} className="btn-danger flex-1 text-base">😥 Again</button>
                        <button onClick={() => handleConfidenceRating('hard')} className="btn-warning flex-1 text-base">😔 Hard</button>
                        <button onClick={() => handleConfidenceRating('good')} className="btn-primary flex-1 text-base">🙂 Good</button>
                        <button onClick={() => handleConfidenceRating('easy')} className="btn-success flex-1 text-base">🥳 Easy</button>
                    </div>
                ) : (
                    <button onClick={handleFlip} className="w-full btn-primary py-3 mt-6 text-lg">Flip Card</button>
                )}
                <div className="text-center mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">Card {currentCardIndex + 1} of {flashcards.length}</div>
            </div>
        </>
    );
};

export default FlashcardSessionPage;