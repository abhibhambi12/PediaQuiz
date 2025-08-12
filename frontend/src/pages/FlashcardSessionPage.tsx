// frontend/src/pages/FlashcardSessionPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; // Corrected: Added necessary imports
import { Flashcard, ToggleBookmarkCallableData, DeleteContentItemCallableData } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { TrashIcon, BookmarkIcon } from '@/components/Icons';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useAuth } from '@/contexts/AuthContext';
import { deleteContentItem, toggleBookmark, getBookmarks } from '@/services/userDataService';
import { useToast } from '@/components/Toast';

const FlashcardSessionPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { data: appData, isLoading } = useData();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const { data: bookmarks } = useQuery<string[]>({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        initialData: [],
    });

    const deleteFlashcardMutation = useMutation<any, Error, DeleteContentItemCallableData>({
        mutationFn: deleteContentItem,
        onSuccess: () => {
            addToast("Flashcard deleted successfully.", "success");
            queryClient.invalidateQueries({ queryKey: ['appData'] });
            if (flashcards.length > 1) {
                setFlashcards(prev => prev.filter(fc => fc.id !== currentCard?.id));
                setCurrentCardIndex(prev => (prev >= flashcards.length - 1 ? 0 : prev));
            } else {
                setFlashcards([]);
            }
        },
        onError: (error) => addToast(`Error deleting flashcard: ${error.message}`, "error"),
    });

    const toggleBookmarkMutation = useMutation<any, Error, ToggleBookmarkCallableData>({
        mutationFn: toggleBookmark,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] }),
        onError: (error) => addToast(`Error toggling bookmark: ${error.message}`, "error"),
    });

    useEffect(() => {
        if (appData?.flashcards && topicId && chapterId) {
            const filteredFlashcards = appData.flashcards.filter((fc: Flashcard) => // Added type for fc
                fc.topicId === topicId && (chapterId === 'all' || fc.chapterId === chapterId)
            );
            setFlashcards(filteredFlashcards.sort(() => Math.random() - 0.5));
            setCurrentCardIndex(0);
            setIsFlipped(false);
        }
    }, [appData, topicId, chapterId]);
    
    const currentCard = useMemo(() => flashcards[currentCardIndex], [flashcards, currentCardIndex]);
    const isBookmarked = useMemo(() => !!(bookmarks && currentCard && bookmarks.includes(currentCard.id)), [bookmarks, currentCard]);

    const handleFlip = () => setIsFlipped(f => !f);

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
        if (!user?.isAdmin || !currentCard) return;
        deleteFlashcardMutation.mutate({ id: currentCard.id, type: 'flashcard', collectionName: 'Flashcards' });
        setIsDeleteModalOpen(false);
    };

    const handleToggleBookmark = () => {
        if (!currentCard) return;
        toggleBookmarkMutation.mutate({ contentId: currentCard.id, contentType: 'flashcard' });
    };

    if (isLoading || deleteFlashcardMutation.isPending || toggleBookmarkMutation.isPending) return <Loader message="Loading flashcards..." />;
    if (!appData && !isLoading) return <div className="text-center p-10 text-red-500">Error loading data.</div>;
    if (flashcards.length === 0 || !currentCard) { // Added check for currentCard
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
                        {user?.isAdmin && (
                            <button
                                onClick={() => setIsDeleteModalOpen(true)}
                                className="p-2 rounded-full text-slate-400 hover:text-red-500"
                                title="Delete Flashcard"
                            >
                                <TrashIcon />
                            </button>
                        )}
                        <button onClick={handleToggleBookmark} className={`p-2 rounded-full ${isBookmarked ? "text-amber-500 bg-amber-100 dark:bg-amber-800/50" : "text-slate-400 hover:text-amber-400"}`}><BookmarkIcon filled={isBookmarked} /></button>
                    </div>
                </div>
                
                <div className="relative h-80 w-full cursor-pointer" style={{ perspective: '1000px' }} onClick={handleFlip}>
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

                <div className="flex justify-between mt-6">
                    <button onClick={handlePrevious} disabled={flashcards.length <= 1} className="px-6 py-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600">Previous</button>
                    <button onClick={handleNext} disabled={flashcards.length <= 1} className="px-6 py-2 rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">Next</button>
                </div>
                <div className="text-center mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                    Card {currentCardIndex + 1} of {flashcards.length}
                </div>
            </div>
        </>
    );
};

export default FlashcardSessionPage;