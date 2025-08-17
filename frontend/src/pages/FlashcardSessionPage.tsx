import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFlashcards } from '../services/firestoreService';
import { addFlashcardAttempt } from '../services/userDataService';
import Loader from '../components/Loader';
import { useToast } from '../components/Toast';
import type { Flashcard, ConfidenceRating } from '@pediaquiz/types';

const FlashcardSessionPage: React.FC = () => {
    const { chapterId } = useParams<{ topicId: string; chapterId: string }>(); // CORRECTED: Use chapterId
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!chapterId) {
            addToast("Chapter not specified.", "error");
            navigate('/');
            return;
        }

        const loadFlashcards = async () => {
            try {
                setIsLoading(true);
                const data = await getFlashcards(chapterId);
                if (data.length === 0) {
                    addToast("No flashcards found for this chapter.", "info");
                    navigate(-1);
                    return;
                }
                setFlashcards(data);
            } catch (error) {
                addToast("Failed to load flashcards.", "error");
            } finally {
                setIsLoading(false);
            }
        };
        loadFlashcards();
    }, [chapterId, navigate, addToast]);

    const handleRating = async (rating: ConfidenceRating) => {
        if (!flashcards[currentIndex]) return;

        try {
            await addFlashcardAttempt({
                flashcardId: flashcards[currentIndex].id,
                rating: rating
            });

            setIsFlipped(false); // Flip back to front for next card
            if (currentIndex < flashcards.length - 1) {
                setCurrentIndex(currentIndex + 1);
            } else {
                addToast("Flashcard session complete!", "success");
                navigate(-1);
            }
        } catch (error) {
            addToast("Could not save your progress.", "error");
        }
    };

    if (isLoading) {
        return <Loader message="Loading flashcards..." />;
    }

    if (flashcards.length === 0) {
        return <div className="p-6 text-center">No flashcards were found for this section.</div>
    }

    const currentCard = flashcards[currentIndex];

    return (
        <div className="p-4 flex flex-col items-center max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Flashcard Session ({currentIndex + 1}/{flashcards.length})</h1>
            <div
                className="w-full h-64 cursor-pointer"
                onClick={() => setIsFlipped(!isFlipped)}
                style={{ perspective: '1000px' }}
            >
                <div
                    className={`relative w-full h-full transition-transform duration-500`}
                    style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'none' }}
                >
                    <div className="absolute w-full h-full flex items-center justify-center p-6 bg-white rounded-lg shadow-lg" style={{ backfaceVisibility: 'hidden' }}>
                        <p className="text-center text-lg">{currentCard.front}</p>
                    </div>
                    <div className="absolute w-full h-full flex items-center justify-center p-6 bg-slate-100 rounded-lg shadow-lg" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                        <p className="text-center text-lg">{currentCard.back}</p>
                    </div>
                </div>
            </div>

            {!isFlipped ? (
                <button onClick={() => setIsFlipped(true)} className="mt-6 w-full max-w-md p-3 bg-sky-600 text-white rounded-lg font-semibold">
                    Show Answer
                </button>
            ) : (
                <div className="mt-6 w-full max-w-md animate-fade-in-up">
                    <p className="text-center text-sm text-slate-600 mb-2">How well did you recall this?</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        <button onClick={() => handleRating('again')} className="p-3 bg-red-500 text-white rounded-lg font-semibold">Again</button>
                        <button onClick={() => handleRating('hard')} className="p-3 bg-amber-500 text-white rounded-lg font-semibold">Hard</button>
                        <button onClick={() => handleRating('good')} className="p-3 bg-sky-500 text-white rounded-lg font-semibold">Good</button>
                        <button onClick={() => handleRating('easy')} className="p-3 bg-green-500 text-white rounded-lg font-semibold">Easy</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlashcardSessionPage;