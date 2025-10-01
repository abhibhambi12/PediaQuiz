import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/Toast';
import { generateQuickFireTest } from '@/services/aiService';
import { addAttempt, addQuizResult } from '@/services/apiService';
import { getMCQsByIds } from '@/services/contentService';
import Loader from '@/components/Loader';
import QuizTimerBar from '@/components/QuizTimerBar';
import { MCQ, ClientQuizResult } from '@pediaquiz/types';
import { useWindowSize } from 'react-use';
import Confetti from 'react-confetti';

const getCorrectAnswerText = (mcq: MCQ): string => mcq.correctAnswer || mcq.options[mcq.answer.charCodeAt(0) - 65];

const QuickFireGamePage: React.FC = () => {
    const { user } = useAuth();
    const { appData } = useData();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { width, height } = useWindowSize();
    const queryClient = useQueryClient();

    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [isGameEnded, setIsGameEnded] = useState(false);
    const [attempts, setAttempts] = useState<ClientQuizResult['results']>([]);
    const [showConfetti, setShowConfetti] = useState(false);

    const generateTestMutation = useMutation({
        mutationFn: () => generateQuickFireTest({ testSize: 15 }),
        onSuccess: (data) => {
            if (!data.data.mcqIds.length) { addToast("Could not generate a test.", "error"); navigate(-1); return; }
            const fetchedMcqs = getMCQsByIds(appData ?? undefined, data.data.mcqIds);
            setMcqs(fetchedMcqs);
        },
        onError: (error: any) => { addToast(`Failed to start game: ${error.message}`, "error"); navigate(-1); }
    });
    
    useEffect(() => {
        if (appData) {
            generateTestMutation.mutate();
        }
    }, [appData, generateTestMutation.mutate]);

    const handleGameEnd = useCallback(async () => {
        if (isGameEnded) return;
        setIsGameEnded(true);
        const finalScore = attempts.filter(a => a.isCorrect).length;
        if (attempts.length > 0) {
            await addQuizResult({ mode: 'quick_fire', totalQuestions: attempts.length, score: finalScore, results: attempts, durationSeconds: 60 });
            queryClient.invalidateQueries({ queryKey: ['userStats', user?.uid] });
        }
        if (finalScore > attempts.length / 2) setShowConfetti(true);
    }, [isGameEnded, attempts, queryClient, user?.uid, addQuizResult, navigate]);

    const handleSelectOption = useCallback(async (selectedOption: string) => {
        if (isGameEnded || !user) return;
        const mcq = mcqs[currentIndex];
        const isCorrect = selectedOption === getCorrectAnswerText(mcq);
        setAttempts(prev => [...prev, { mcqId: mcq.id, isCorrect, selectedAnswer: selectedOption, correctAnswer: getCorrectAnswerText(mcq) }]);
        addAttempt({ mcqId: mcq.id, isCorrect, selectedAnswer: selectedOption });
        if (isCorrect) setScore(s => s + 100);
        
        if (currentIndex < mcqs.length - 1) {
            setCurrentIndex(i => i + 1);
        } else {
            handleGameEnd();
        }
    }, [isGameEnded, mcqs, currentIndex, user, handleGameEnd, addAttempt]);

    const currentMcq = mcqs[currentIndex];
    if (generateTestMutation.isPending || !currentMcq) return <Loader fullScreen message="Preparing Quick Fire..." />;

    return (
        <div className="max-w-xl mx-auto p-4">
            {showConfetti && <Confetti width={width} height={height} recycle={false} onConfettiComplete={() => setShowConfetti(false)} />}
            <h1 className="text-xl font-bold">Quick Fire - Score: {score}</h1>
            {!isGameEnded ? (
                <>
                    <QuizTimerBar duration={60} onTimeUp={handleGameEnd} isPaused={false} />
                    <div className="card-base p-6">
                        <p className="font-semibold">{currentMcq.question}</p>
                        <div className="space-y-3 mt-4">
                            {currentMcq.options.map((option, idx) => (
                                <button key={idx} onClick={() => handleSelectOption(option)} className="w-full text-left p-4 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">
                                    {String.fromCharCode(65 + idx)}. {option}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <div className="mt-6 text-center card-base p-8">
                    <p className="text-2xl font-bold text-sky-600 mb-2">Game Over!</p>
                    <p className="text-xl">Final Score: {score}</p>
                    <button onClick={() => navigate('/')} className="btn-primary mt-4">Back to Home</button>
                </div>
            )}
        </div>
    );
};
export default QuickFireGamePage;