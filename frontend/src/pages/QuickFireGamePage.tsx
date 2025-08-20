// frontend/src/pages/QuickFireGamePage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { generateQuickFireTest } from '@/services/aiService';
import { getMCQsByIds } from '@/services/firestoreService';
import { SessionManager } from '@/services/sessionService';
import { addAttempt, addQuizResult } from '@/services/userDataService';
import Loader from '@/components/Loader';
import QuizTimerBar from '@/components/QuizTimerBar';
// Direct type imports
import { MCQ, QuizSession, QuizResult } from '@pediaquiz/types';
import clsx from 'clsx';
import useWindowSize from 'react-use/lib/useWindowSize';
import Confetti from 'react-confetti';

const getCorrectAnswerText = (mcq: MCQ | undefined): string => {
    if (!mcq || !Array.isArray(mcq.options) || mcq.options.length === 0) return "";
    if (mcq.correctAnswer) return mcq.correctAnswer;
    if (mcq.answer && mcq.answer.length === 1 && mcq.answer.charCodeAt(0) >= 'A'.charCodeAt(0) && mcq.answer.charCodeAt(0) <= 'D'.charCodeAt(0)) {
        const correctIndex = mcq.answer.charCodeAt(0) - 'A'.charCodeAt(0);
        if (correctIndex >= 0 && correctIndex < mcq.options.length) return mcq.options[correctIndex];
    }
    return mcq.answer;
};

const QUICK_FIRE_DURATION_SECONDS = 60;
const QUESTION_COUNT = 10;
const BASE_XP_PER_CORRECT = 20;

const QuickFireGamePage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { width, height } = useWindowSize();

    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [xpEarned, setXpEarned] = useState(0);
    const [multiplier, setMultiplier] = useState(1);
    const [correctStreak, setCorrectStreak] = useState(0);
    const [isGameEnded, setIsGameEnded] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [currentSession, setCurrentSession] = useState<QuizSession | null>(null);

    const addAttemptMutation = useMutation({
        mutationFn: addAttempt,
        onError: (error: any) => console.error("Failed to record attempt:", error),
    });

    const addQuizResultMutation = useMutation({
        mutationFn: addQuizResult,
        onSuccess: (data) => console.log("Quick Fire result saved:", data.data.id),
        onError: (error: any) => addToast(`Failed to save Quick Fire results: ${error.message}`, "error"),
    });

    const generateTestMutation = useMutation({
        mutationFn: (size: number) => generateQuickFireTest({ testSize: size }),
        onSuccess: async (data) => {
            if (data.data.mcqIds.length === 0) {
                addToast("Could not generate Quick Fire test. Try again later!", "error");
                navigate(-1);
                return;
            }
            const fetchedMcqs = await getMCQsByIds(data.data.mcqIds);
            setMcqs(fetchedMcqs);
            // Create a new session for Quick Fire game
            const sessionId = await SessionManager.createSession(user!.uid, 'quick_fire', fetchedMcqs.map(m => m.id));
            const sessionData = await SessionManager.getSession(sessionId, user!.uid);
            setCurrentSession(sessionData);
            addToast("Quick Fire game started!", "success");
        },
        onError: (error: any) => {
            addToast(`Failed to start Quick Fire game: ${error.message}`, "error");
            navigate(-1);
        },
    });

    useEffect(() => {
        // Only generate test if user is logged in, no test is pending, mcqs are empty, and game hasn't ended
        if (user && !generateTestMutation.isPending && mcqs.length === 0 && !isGameEnded) {
            generateTestMutation.mutate(QUESTION_COUNT);
        }
    }, [user, mcqs.length, generateTestMutation, isGameEnded]);

    const currentMcq = useMemo(() => mcqs[currentQuestionIndex], [mcqs, currentQuestionIndex]);

    const handleGameEnd = useCallback(() => {
        if (isGameEnded) return; // Prevent multiple calls
        setIsGameEnded(true);
        addToast(`Quick Fire ended! Final Score: ${score} points, ${xpEarned} XP!`, "info", 3000);
        if (score > 0) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 5000);
        }
        // Save quiz result
        if (currentSession?.id) {
            // Mark session as finished
            SessionManager.updateSession(currentSession.id, { isFinished: true });
            const finalQuizResult: Omit<QuizResult, 'id' | 'userId' | 'quizDate'> = {
                sessionId: currentSession.id,
                mode: 'quick_fire',
                totalQuestions: mcqs.length, // Total questions shown in this game
                score: score, // The game score, not necessarily correct answer count
                durationSeconds: QUICK_FIRE_DURATION_SECONDS,
                topicIds: Array.from(new Set(mcqs.map(m => m.topicId))).filter(Boolean) as string[],
                chapterIds: Array.from(new Set(mcqs.map(m => m.chapterId))).filter(Boolean) as string[],
                mcqAttempts: [], // Quick Fire doesn't track individual MCQ correctness like regular quizzes
                xpEarned: xpEarned,
                streakBonus: 0, // Streak bonus handled by attempt callable directly
            };
            addQuizResultMutation.mutate(finalQuizResult);
        }
    }, [isGameEnded, score, xpEarned, addToast, currentSession, mcqs, addQuizResultMutation]);

    // This useEffect handles the timer lifecycle
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (currentSession && !isGameEnded) {
            const timeRemaining = (currentSession.expiresAt instanceof Date) ? Math.floor((currentSession.expiresAt.getTime() - Date.now()) / 1000) : QUICK_FIRE_DURATION_SECONDS;
            if (timeRemaining <= 0) {
                handleGameEnd();
                return;
            }
            timer = setTimeout(handleGameEnd, timeRemaining * 1000);
        }
        return () => clearTimeout(timer);
    }, [currentSession, isGameEnded, handleGameEnd]);


    const handleSelectOption = useCallback(async (selectedOption: string) => {
        if (isGameEnded || !currentMcq || !currentSession) return; // Prevent actions if game ended or no current MCQ

        const correctAnswerText = getCorrectAnswerText(currentMcq);
        const isCorrect = selectedOption === correctAnswerText;
        let currentXpGained = 0;

        if (isCorrect) {
            setCorrectStreak(prev => prev + 1);
            const points = 100 * multiplier;
            setScore(prev => prev + points);
            currentXpGained = BASE_XP_PER_CORRECT * multiplier;
            setXpEarned(prev => prev + currentXpGained);
            addToast(`Correct! +${points} points (+${currentXpGained} XP)`, "success", 1500);
            if ((correctStreak + 1) % 3 === 0) { // Every 3 correct answers increase multiplier
                setMultiplier(prev => prev + 1);
                addToast(`Multiplier x${multiplier + 1}!`, "info", 1500);
            }
        } else {
            setCorrectStreak(0);
            setMultiplier(1);
            addToast("Incorrect. Multiplier reset.", "error", 1500);
        }

        // Record attempt via callable function (backend handles XP/streak for attempts)
        await addAttemptMutation.mutateAsync({
            mcqId: currentMcq.id,
            isCorrect: isCorrect,
            selectedAnswer: selectedOption,
            sessionId: currentSession.id,
        });

        // Advance to next question or end game
        if (currentQuestionIndex < mcqs.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            handleGameEnd(); // No more questions
        }
    }, [isGameEnded, currentMcq, currentSession, currentQuestionIndex, mcqs.length, multiplier, correctStreak, addToast, addAttemptMutation, handleGameEnd]);

    if (generateTestMutation.isPending || !currentSession || !currentMcq) return <Loader message="Setting up Quick Fire..." />;

    const optionsArray = currentMcq.options || [];
    const timeRemainingInSession = currentSession.expiresAt instanceof Date ? Math.max(0, (currentSession.expiresAt.getTime() - Date.now()) / 1000) : QUICK_FIRE_DURATION_SECONDS;


    return (
        <div className="max-w-2xl mx-auto p-4">
            {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} gravity={0.15} />}
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-50">Quick Fire - Q. {currentQuestionIndex + 1}/{mcqs.length}</h1>
                <div className="text-right">
                    <p className="text-lg font-semibold text-sky-600 dark:text-sky-400">Score: {score}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Multiplier: x{multiplier}</p>
                </div>
            </div>
            <QuizTimerBar duration={QUICK_FIRE_DURATION_SECONDS} onTimeUp={handleGameEnd} isPaused={isGameEnded} />
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6">
                <p className="text-lg font-semibold mb-4 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{currentMcq.question}</p>
                <div className="space-y-3 mt-4">
                    {optionsArray.map((option, idx) => (
                        <button key={idx} onClick={() => handleSelectOption(option)} disabled={isGameEnded}
                            className={clsx("w-full text-left p-4 rounded-lg flex items-start transition-colors disabled:cursor-not-allowed", "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600")}>
                            <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span>
                            <span>{option}</span>
                        </button>
                    ))}
                </div>
            </div>
            {isGameEnded && (
                <div className="mt-6 text-center animate-pop-in">
                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mb-4">Game Over!</p>
                    <button onClick={() => navigate('/')} className="btn-primary px-6 py-3">Back to Home</button>
                </div>
            )}
        </div>
    );
};

export default QuickFireGamePage;