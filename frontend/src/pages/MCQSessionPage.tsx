import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getMCQs } from '../services/firestoreService';
import QuizTimerBar from '../components/QuizTimerBar';

const MCQSessionPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [mcqs, setMcqs] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            getMCQs(id).then(setMcqs).catch(console.error);
        }
    }, [id]);

    const handleAnswer = () => {
        // Handle answer submission logic
        setSelectedAnswer(null);
        setCurrentIndex((prev) => prev + 1);
    };

    if (!mcqs.length) {
        return <div>Loading...</div>;
    }

    const currentMCQ = mcqs[currentIndex];

    return (
        <div className="p-6">
            <QuizTimerBar duration={30} />
            <h2 className="text-xl font-semibold">{currentMCQ.question}</h2>
            <div className="mt-4">
                {currentMCQ.options.map((option: string, index: number) => (
                    <button
                        key={index}
                        onClick={() => setSelectedAnswer(option)}
                        className={`p-2 m-2 border rounded ${selectedAnswer === option ? 'bg-blue-200' : ''
                            }`}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <button
                onClick={handleAnswer}
                className="mt-4 p-2 bg-blue-600 text-white rounded"
                disabled={!selectedAnswer}
            >
                Submit
            </button>
        </div>
    );
};

export default MCQSessionPage;