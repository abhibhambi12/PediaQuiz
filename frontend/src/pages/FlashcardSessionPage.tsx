import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getFlashcards } from '../services/firestoreService';

const FlashcardSessionPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [flashcards, setFlashcards] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    useEffect(() => {
        if (id) {
            getFlashcards(id).then(setFlashcards).catch(console.error);
        }
    }, [id]);

    const handleNext = () => {
        setIsFlipped(false);
        setCurrentIndex((prev) => (prev + 1) % flashcards.length);
    };

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
    };

    if (!flashcards.length) {
        return <div>Loading...</div>;
    }

    const currentCard = flashcards[currentIndex];

    return (
        <div className="p-6 flex flex-col items-center">
            <h1 className="text-2xl font-bold mb-4">Flashcard Session</h1>
            <div
                className="p-6 bg-white rounded-lg shadow-lg w-full max-w-md cursor-pointer"
                onClick={handleFlip}
            >
                <p>{isFlipped ? currentCard.answer : currentCard.question}</p>
            </div>
            <button
                onClick={handleNext}
                className="mt-4 p-2 bg-blue-600 text-white rounded"
            >
                Next
            </button>
        </div>
    );
};

export default FlashcardSessionPage;