// FILE: frontend/src/pages/FlashcardSessionPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext'; // IMPORTANT: Using useData for global appData
import { useToast } from '@/components/Toast';
import { deleteContentItem, toggleBookmark, getBookmarks } from '@/services/userDataService';
import { addFlashcardAttempt } from '@/services/aiService'; // NEW IMPORT: for flashcard spaced repetition
import Loader from '@/components/Loader';
import { TrashIcon, BookmarkIcon } from '@/components/Icons';
import ConfirmationModal from '@/components/ConfirmationModal';
import type { Flashcard, ToggleBookmarkCallableData, DeleteContentItemCallableData } from '@pediaquiz/types'; // FIXED: Ensure types are imported
import clsx from 'clsx'; // For conditional styling

// --- NEW TYPE: For flashcard confidence rating ---
type ConfidenceRating = 'again' | 'good' | 'easy';
// --- END NEW TYPE ---


const FlashcardSessionPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: appData, isLoading } = useData(); // IMPORTANT: Using useData for global appData
    const { user } = useAuth(); // user is now UserContextType
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const { data: bookmarks } = useQuery<string[]>({ // Explicitly typed
        queryKey: ['bookmarks', user?.uid], // FIXED: uid is now on UserContextType
        queryFn: () => getBookmarks(user!.uid), // FIXED: uid is now on UserContextType
        enabled: !!user,
        initialData: [],
    });

    // --- NEW MUTATION: for recording flashcard attempts/ratings ---
    const addFlashcardAttemptMutation = useMutation<any, Error, { flashcardId: string, rating: ConfidenceRating }>({
        mutationFn: (vars) => addFlashcardAttempt(vars),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attemptedFlashcards', user?.uid] }); // Invalidate if you add a query for attempted flashcards
            // No toast here to avoid interrupting flow, success is silent
        },
        onError: (error) => addToast(`Failed to record flashcard attempt: ${error.message}`, "error"),
    });
    // --- END NEW MUTATION ---

    const deleteFlashcardMutation = useMutation<any, Error, DeleteContentItemCallableData>({
        mutationFn: deleteContentItem,
        onSuccess: () => {
            addToast("Flashcard deleted successfully.", "success");
            queryClient.invalidateQueries({ queryKey: ['appData'] }); // Invalidate general app data
            // Update local state without refetching all appData
            if (flashcards.length > 1) {
                setFlashcards(prev => prev.filter((fc: Flashcard) => fc.id !== currentCard?.id)); // Explicitly typed
                setCurrentCardIndex(prev => (prev >= flashcards.length - 1 ? 0 : prev));
            } else {
                setFlashcards([]);
            }
        },
        onError: (error) => addToast(`Error deleting flashcard: ${error.message}`, "error"),
    });

    const toggleBookmarkMutation = useMutation<any, Error, ToggleBookmarkCallableData>({
        mutationFn: toggleBookmark,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] }), // FIXED: uid is on UserContextType
        onError: (error) => addToast(`Error toggling bookmark: ${error.message}`, "error"),
    });

    useEffect(() => {
        // IMPORTANT: Filters directly from appData.flashcards
        if (appData?.flashcards && topicId && chapterId) {
            const filteredFlashcards = appData.flashcards.filter((fc: Flashcard) => // Explicitly typed fc
                fc.topicId === topicId && (chapterId === 'all' || fc.chapterId === chapterId)
            );
            setFlashcards(filteredFlashcards.sort(() => Math.random() - 0.5));
            setCurrentCardIndex(0);
            setIsFlipped(false);
        }
    }, [appData, topicId, chapterId]); // DEPENDS ON appData
    
    const currentCard = useMemo(() => flashcards[currentCardIndex], [flashcards, currentCardIndex]);
    const isBookmarked = useMemo(() => !!(bookmarks && currentCard && bookmarks.includes(currentCard.id)), [bookmarks, currentCard]);

    const handleFlip = () => setIsFlipped(f => !f);

    // --- NEW FUNCTION: Handle confidence rating and advance card ---
    const handleConfidenceRating = (rating: ConfidenceRating) => {
        if (!currentCard) return;
        
        addFlashcardAttemptMutation.mutate({ flashcardId: currentCard.id, rating });

        setIsFlipped(false); // Flip back to question side
        // Advance to next card after a short delay for animation
        setTimeout(() => {
            setCurrentCardIndex(prev => (prev + 1) % flashcards.length);
        }, 150);
    };
    // --- END NEW FUNCTION ---

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentCardIndex(prev => (prev + 1) % flashcards.length);
        }, 150);
    };

    const handlePrevious = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentCardIndex(prev => (prev - 1 + flashcards.length) % flashcards.length);
        }, 150);
    };

    const handleDeleteFlashcard = () => {
        if (!user?.isAdmin || !currentCard) return; // FIXED: isAdmin is on UserContextType
        deleteFlashcardMutation.mutate({ id: currentCard.id, type: 'flashcard', collectionName: 'Flashcards' });
        setIsDeleteModalOpen(false);
    };

    const handleToggleBookmark = () => {
        if (!currentCard) return;
        toggleBookmarkMutation.mutate({ contentId: currentCard.id, contentType: 'flashcard' });
    };

    if (isLoading || deleteFlashcardMutation.isPending || toggleBookmarkMutation.isPending || addFlashcardAttemptMutation.isPending) return <Loader message="Loading flashcards..." />;
    if (!appData && !isLoading) return <div className="text-center p-10 text-red-500">Error loading data.</div>; // DEPENDS ON appData
    if (flashcards.length === 0 || !currentCard) {
        return <div className="text-center p-10">No flashcards found for this selection.</div>;
    }
    
    return (
        <>
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteFlashcard}
                title="Delete Flashcard"
                message="Are you sure you want to permanently delete this flashcard? This action cannot be undone."
                confirmText="Delete"
                variant="danger"
                isLoading={deleteFlashcardMutation.isPending}
            />

            <div className="max-w-xl mx-auto p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
                        Flashcards - {currentCard.chapterName}
                    </h2>
                    <div className="flex items-center space-x-2">
                        {user?.isAdmin && ( // FIXED: isAdmin is on UserContextType
                            <button
                                onClick={() => setIsDeleteModalOpen(true)}
                                className="p-2 rounded-full text-slate-400 hover:text-red-500"
                                title="Delete Flashcard"
                            >
                                <TrashIcon />
                            </button>
                        )}
                        <button onClick={handleToggleBookmark} className={clsx("p-2 rounded-full", isBookmarked ? "text-amber-500 bg-amber-100 dark:bg-amber-800/50" : "text-slate-400 hover:text-amber-400")}><BookmarkIcon filled={isBookmarked} /></button>
                    </div>
                </div>
                
                <div 
                    className="relative h-80 w-full cursor-pointer" 
                    style={{ perspective: '1000px' }} 
                    onClick={handleFlip}
                >
                    <div
                        className="absolute h-full w-full rounded-xl shadow-lg transition-transform duration-500 transform-style-preserve-3d"
                        style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                    >
                        {/* Front of the card */}
                        <div className="absolute h-full w-full bg-white dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center p-6 text-center backface-hidden">
                            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Question</h3>
                            <p className="mt-2 text-xl text-slate-800 dark:text-slate-200">{currentCard.front}</p>
                        </div>
                        {/* Back of the card */}
                        <div className="absolute h-full w-full bg-sky-100 dark:bg-sky-900 rounded-xl flex flex-col items-center justify-center p-6 text-center backface-hidden transform-rotate-y-180">
                            <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Answer</h3>
                            <p className="mt-2 text-xl text-slate-800 dark:text-slate-200">{currentCard.back}</p>
                        </div>
                    </div>
                </div>

                {/* --- NEW SECTION: Confidence Rating Buttons (shown only when flipped) --- */}
                {isFlipped && (
                    <div className="flex justify-around mt-6 space-x-2 animate-fade-in-up">
                        <button 
                            onClick={() => handleConfidenceRating('again')} 
                            className="px-6 py-2 rounded-md font-bold bg-red-500 text-white hover:bg-red-600 flex-1 text-lg" // Using btn-danger style
                        >
                            😥 Again
                        </button>
                        <button 
                            onClick={() => handleConfidenceRating('good')} 
                            className="px-6 py-2 rounded-md font-bold bg-amber-500 text-white hover:bg-amber-600 flex-1 text-lg" // Using btn-warning style
                        >
                            🤔 Good
                        </button>
                        <button 
                            onClick={() => handleConfidenceRating('easy')} 
                            className="px-6 py-2 rounded-md font-bold bg-green-500 text-white hover:bg-green-600 flex-1 text-lg" // Using btn-success style
                        >
                            🥳 Easy
                        </button>
                    </div>
                )}
                {/* --- END NEW SECTION --- */}

                {/* --- UPDATED: Conditionally render Flip button if not flipped --- */}
                {!isFlipped && (
                     <button 
                        onClick={handleFlip}
                        className="w-full px-6 py-3 mt-6 text-lg rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors" // Using btn-primary style
                    >
                        Flip Card
                    </button>
                )}
                {/* --- END UPDATED --- */}

                <div className="text-center mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                    Card {currentCardIndex + 1} of {flashcards.length}
                </div>
            </div>
        </>
    );
};

export default FlashcardSessionPage;