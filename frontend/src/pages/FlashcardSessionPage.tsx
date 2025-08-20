import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/Toast';
import { getBookmarks, getAttemptedFlashcards, toggleBookmark, deleteContentItem, addFlashcardAttempt } from '@/services/userDataService';
import { getChapterContent } from '@/services/firestoreService';
import Loader from '@/components/Loader';
// Using direct type imports from types package
import { Flashcard, ConfidenceRating, DeleteContentItemCallableData, ToggleBookmarkCallableData } from '@pediaquiz/types';
import clsx from 'clsx';
import { BookmarkIcon as BookmarkOutlineIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'; // Ensuring all icons are imported
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import ConfirmationModal from '@/components/ConfirmationModal';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp

const FlashcardSessionPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { user } = useAuth();
    const { appData, isLoadingData: isAppDataLoading } = useData();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const { data: bookmarkedIds, isLoading: areBookmarksLoading } = useQuery<string[], Error>({
        queryKey: ['bookmarkedIds', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user?.uid,
    });

    const { data: attemptedFlashcards, isLoading: areAttemptedFlashcardsLoading } = useQuery({
        queryKey: ['attemptedFlashcards', user?.uid],
        queryFn: () => getAttemptedFlashcards(user!.uid),
        enabled: !!user?.uid,
    });

    const { data: rawChapterFlashcards, isLoading: isLoadingRawChapterFlashcards } = useQuery<Flashcard[], Error>({
        queryKey: ['chapterFlashcardsRaw', chapterId],
        queryFn: async () => {
            if (!chapterId) return [];
            const { flashcards: fetchedFlashcards } = await getChapterContent(chapterId);
            return fetchedFlashcards;
        },
        enabled: !!chapterId,
    });

    const addFlashcardAttemptMutation = useMutation({
        mutationFn: (vars: { flashcardId: string, rating: ConfidenceRating }) => addFlashcardAttempt(vars),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attemptedFlashcards', user?.uid] });
            // Invalidate user data to reflect XP/Level/Streak updates from flashcard attempts
            queryClient.invalidateQueries({ queryKey: ['userProfile', user?.uid] });
        },
        onError: (error: any) => addToast(`Failed to record attempt: ${error.message}`, "error"),
    });

    const deleteFlashcardMutation = useMutation({
        mutationFn: (data: DeleteContentItemCallableData) => deleteContentItem(data),
        onSuccess: () => {
            addToast("Flashcard deleted successfully.", "success");
            // Invalidate query for raw chapter flashcards to reflect deletion
            queryClient.invalidateQueries({ queryKey: ['chapterFlashcardsRaw', chapterId] });
            // Potentially invalidate allTopics or appData if counts are affected
            queryClient.invalidateQueries({ queryKey: ['allTopics'] });
            queryClient.invalidateQueries({ queryKey: ['appData'] });
            // If the deleted flashcard was the only one or last one, navigate back
            if (flashcards.length === 1) {
                navigate(-1);
            } else {
                // If there are other flashcards, remove the current one and adjust index
                setFlashcards(prev => prev.filter(fc => fc.id !== currentCard?.id));
                setCurrentCardIndex(prev => Math.min(prev, flashcards.length - 2)); // Adjust index if current card was last
            }
        },
        onError: (error: any) => addToast(`Error deleting flashcard: ${error.message}`, "error"),
    });

    const toggleBookmarkMutation = useMutation({
        mutationFn: (data: ToggleBookmarkCallableData) => toggleBookmark(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bookmarkedIds', user?.uid] });
        },
        onError: (error: any) => addToast(`Error toggling bookmark: ${error.message}`, "error"),
    });

    useEffect(() => {
        if (!rawChapterFlashcards || !attemptedFlashcards) return;
        const sortedFlashcards = [...rawChapterFlashcards].sort((a, b) => {
            const attemptA = attemptedFlashcards[a.id];
            const attemptB = attemptedFlashcards[b.id];
            // Safely access and convert Timestamp to Date for comparison
            const dateAValue = attemptA?.nextReviewDate;
            const dateBValue = attemptB?.nextReviewDate;
            // Ensure proper conversion from Firestore Timestamp to JavaScript Date for comparison
            const dateA = dateAValue instanceof Timestamp ? dateAValue.toDate().getTime() : (dateAValue ? new Date(dateAValue as any).getTime() : 0);
            const dateB = dateBValue instanceof Timestamp ? dateBValue.toDate().getTime() : (dateBValue ? new Date(dateBValue as any).getTime() : 0);
            if (dateA !== dateB) return dateA - dateB;
            return Math.random() - 0.5;
        });
        setFlashcards(sortedFlashcards);
        setCurrentCardIndex(0);
        setIsFlipped(false);
    }, [rawChapterFlashcards, attemptedFlashcards]);

    const currentCard = useMemo(() => flashcards[currentCardIndex], [flashcards, currentCardIndex]);
    const isBookmarked = useMemo(() => !!(bookmarkedIds && currentCard && bookmarkedIds.includes(currentCard.id)), [bookmarkedIds, currentCard]);

    const handleFlip = useCallback(() => setIsFlipped(f => !f), []);

    const handleNext = useCallback(() => {
        setIsFlipped(false);
        // Add a small delay for flip animation to complete before changing card
        setTimeout(() => {
            if (currentCardIndex < flashcards.length - 1) {
                setCurrentCardIndex(prev => prev + 1);
            } else {
                addToast("Flashcard session complete!", "success");
                navigate(-1); // Navigate back to previous page
            }
        }, 150); // 150ms delay
    }, [currentCardIndex, flashcards.length, addToast, navigate]);

    const handleConfidenceRating = useCallback((rating: ConfidenceRating) => {
        if (!currentCard) return;
        addFlashcardAttemptMutation.mutate({ flashcardId: currentCard.id, rating });
        handleNext();
    }, [currentCard, addFlashcardAttemptMutation, handleNext]);

    const handlePrevious = useCallback(() => {
        setIsFlipped(false);
        // Add a small delay for flip animation to complete before changing card
        setTimeout(() => {
            if (currentCardIndex > 0) {
                setCurrentCardIndex(prev => prev - 1);
            }
        }, 150); // 150ms delay
    }, [currentCardIndex]);

    const handleDeleteFlashcard = () => {
        if (!user?.isAdmin || !currentCard) return;
        setIsDeleteModalOpen(true); // Open confirmation modal first
    };

    const handleConfirmDelete = () => {
        if (currentCard) {
            deleteFlashcardMutation.mutate({ id: currentCard.id, type: 'flashcard', collectionName: 'Flashcards' });
        }
    };

    const handleToggleBookmark = useCallback(() => {
        if (!currentCard) return;
        toggleBookmarkMutation.mutate({ contentId: currentCard.id, contentType: 'flashcard' });
    }, [currentCard, toggleBookmarkMutation]);

    if (isAppDataLoading || isLoadingRawChapterFlashcards || areBookmarksLoading || areAttemptedFlashcardsLoading) {
        return <Loader message="Loading flashcards..." />;
    }

    if (flashcards.length === 0) { // Check flashcards array explicitly after loading
        return <div className="text-center p-10 text-slate-700 dark:text-slate-300">No flashcards found for this chapter.</div>;
    }

    if (!currentCard) {
        // This case might happen briefly after deletion or at the very end of session
        return <Loader message="Finishing session..." />;
    }

    return (
        <>
            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete} title="Delete Flashcard" message="Are you sure you want to delete this flashcard permanently? This cannot be undone." variant="danger" isLoading={deleteFlashcardMutation.isPending} />
            <div className="max-w-xl mx-auto p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-50">{currentCard.chapterName}</h2>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && (<button onClick={handleDeleteFlashcard} className="p-2 rounded-full hover:text-red-500" title="Delete Flashcard"><TrashIcon className="h-6 w-6" /></button>)}
                        <button onClick={handleToggleBookmark} className={clsx("p-2 rounded-full", isBookmarked ? "text-amber-500" : "text-slate-400")} title="Toggle bookmark">{isBookmarked ? <BookmarkSolidIcon className="h-6 w-6" /> : <BookmarkOutlineIcon className="h-6 w-6" />}</button>
                    </div>
                </div>

                <div className="relative h-80 w-full cursor-pointer" style={{ perspective: '1000px' }} onClick={handleFlip}>
                    <div className="absolute h-full w-full rounded-xl shadow-lg transition-transform duration-500 transform-style-preserve-3d" style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        <div className="absolute h-full w-full bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center p-6 text-center backface-hidden">
                            <p className="text-xl text-slate-800 dark:text-slate-200">{currentCard.front}</p>
                        </div>
                        <div className="absolute h-full w-full bg-sky-100 dark:bg-sky-900 rounded-xl flex items-center justify-center p-6 text-center backface-hidden transform-rotate-y-180">
                            <p className="text-xl text-sky-800 dark:text-sky-200">{currentCard.back}</p>
                        </div>
                    </div>
                </div>

                {isFlipped && (
                    <div className="flex justify-around mt-6 space-x-2 animate-fade-in-up">
                        <button onClick={() => handleConfidenceRating('again')} className="btn-danger flex-1">Again</button>
                        <button onClick={() => handleConfidenceRating('hard')} className="btn-warning flex-1">Hard</button>
                        <button onClick={() => handleConfidenceRating('good')} className="btn-secondary flex-1">Good</button>
                        <button onClick={() => handleConfidenceRating('easy')} className="btn-success flex-1">Easy</button>
                    </div>
                )}

                <div className="flex justify-between items-center mt-6">
                    <button onClick={handlePrevious} disabled={currentCardIndex === 0} className="btn-neutral"><ChevronLeftIcon className="h-5 w-5 inline" /> Prev</button>
                    <span className="text-slate-700 dark:text-slate-300">{currentCardIndex + 1} / {flashcards.length}</span>
                    <button onClick={handleNext} className="btn-primary">Next <ChevronRightIcon className="h-5 w-5 inline" /></button>
                </div>
            </div>
        </>
    );
};

export default FlashcardSessionPage;