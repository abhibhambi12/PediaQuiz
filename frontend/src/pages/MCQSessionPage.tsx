import React, a, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMCQsByIds } from '../services/firestoreService';
import { addAttempt } from '../services/userDataService';
import { SessionManager } from '../services/sessionService';
import QuizTimerBar from '../components/QuizTimerBar';
import Loader from '../components/Loader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import type { MCQ, QuizSession, ConfidenceRating } from '@pediaquiz/types';

const MCQSessionPage: React.FC = () => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const { user } = useAuth();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [session, setSession] = useState<QuizSession | null>(null);
    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showExplanation, setShowExplanation] = useState(false);

    useEffect(() => {
        if (!sessionId || !user?.uid) return;

        const loadSession = async () => {
            try {
                setIsLoading(true);
                const sessionData = await SessionManager.getSession(sessionId, user.uid);
                if (!sessionData) {
                    addToast("Quiz session not found or has expired.", "error");
                    navigate('/');
                    return;
                }
                setSession(sessionData);

                const mcqData = await getMCQsByIds(sessionData.mcqIds);
                if (mcqData.length === 0) {
                    addToast("Could not load questions for this session.", "error");
                    navigate('/');
                    return;
                }
                setMcqs(mcqData);
                setCurrentIndex(sessionData.currentIndex);
            } catch (error) {
                console.error("Failed to load session:", error);
                addToast("An error occurred while loading the session.", "error");
                navigate('/');
            } finally {
                setIsLoading(false);
            }
        };

        loadSession();
    }, [sessionId, user?.uid, navigate, addToast]);

    const handleSubmit = async () => {
        if (!selectedAnswer || !session || !user || isSubmitting) return;

        setIsSubmitting(true);
        setShowExplanation(true); // Show explanation immediately after submitting
    };

    const handleNextQuestion = async (confidence: ConfidenceRating) => {
        if (!selectedAnswer || !session || !user) return;

        const currentMCQ = mcqs[currentIndex];
        const isCorrect = selectedAnswer === currentMCQ.correctAnswer;

        try {
            await addAttempt({
                mcqId: currentMCQ.id,
                selectedAnswer,
                isCorrect,
                sessionId: session.id,
                confidenceRating: confidence
            });

            const nextIndex = currentIndex + 1;
            const isFinished = nextIndex >= mcqs.length;

            await SessionManager.updateSession(session.id, {
                currentIndex: nextIndex,
                isFinished: isFinished
            });

            if (isFinished) {
                addToast("Quiz complete!", "success");
                navigate(`/results/${session.id}`);
            } else {
                setCurrentIndex(nextIndex);
                setSelectedAnswer(null);
                setShowExplanation(false);
                setIsSubmitting(false);
            }
        } catch (error) {
            addToast("Failed to save your answer.", "error");
            setIsSubmitting(false);
        }
    };


    if (isLoading || !session || mcqs.length === 0) {
        return <Loader message="Loading quiz..." />;
    }

    const currentMCQ = mcqs[currentIndex];
    const isCorrect = selectedAnswer === currentMCQ.correctAnswer;

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto">
            <QuizTimerBar duration={120} onTimeUp={handleSubmit} isPaused={showExplanation} />
            <h2 className="text-xl font-semibold mb-4">{`Q${currentIndex + 1}: ${currentMCQ.question}`}</h2>

            <div className="space-y-3">
                {currentMCQ.options.map((option: string) => (
                    <button
                        key={option}
                        onClick={() => !showExplanation && setSelectedAnswer(option)}
                        disabled={showExplanation}
                        className={`block w-full text-left p-3 border-2 rounded-lg transition-all
                            ${showExplanation
                                ? (option === currentMCQ.correctAnswer ? 'border-green-500 bg-green-50' : (option === selectedAnswer ? 'border-red-500 bg-red-50' : 'border-slate-300'))
                                : (selectedAnswer === option ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-white hover:bg-slate-50')
                            }
                        `}
                    >
                        {option}
                    </button>
                ))}
            </div>

            {!showExplanation && (
                <button
                    onClick={handleSubmit}
                    className="mt-6 w-full p-3 bg-sky-600 text-white rounded-lg font-semibold hover:bg-sky-700 disabled:bg-slate-400"
                    disabled={!selectedAnswer}
                >
                    Submit
                </button>
            )}

            {showExplanation && (
                <div className="mt-6 p-4 rounded-lg animate-fade-in-up" style={{ backgroundColor: isCorrect ? '#f0fff4' : '#fff5f5' }}>
                    <h3 className="font-bold text-lg" style={{ color: isCorrect ? '#2f855a' : '#c53030' }}>
                        {isCorrect ? 'Correct!' : 'Incorrect'}
                    </h3>
                    <p className="mt-2 text-slate-700">{currentMCQ.explanation}</p>
                    <p className="mt-2 text-sm text-slate-500">How well did you know this?</p>
                    <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
                        <button onClick={() => handleNextQuestion('again')} className="p-2 bg-red-500 text-white rounded-lg">Again</button>
                        <button onClick={() => handleNextQuestion('hard')} className="p-2 bg-amber-500 text-white rounded-lg">Hard</button>
                        <button onClick={() => handleNextQuestion('good')} className="p-2 bg-sky-500 text-white rounded-lg">Good</button>
                        <button onClick={() => handleNextQuestion('easy')} className="p-2 bg-green-500 text-white rounded-lg">Easy</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MCQSessionPage;