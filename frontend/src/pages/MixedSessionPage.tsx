import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { addAttempt, addFlashcardAttempt, addQuizResult } from '@/services/apiService';
import { getMCQsByIds, getFlashcardsByIds } from '@/services/contentService';
import { SessionManager } from '@/services/sessionService';
import { MCQ, Flashcard, QuizSession, ConfidenceRating, ClientQuizResult as QuizResult } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import clsx from 'clsx';

type SessionItem = (MCQ | Flashcard) & { sessionType: 'mcq' | 'flashcard' };

const getCorrectAnswerText = (mcq: MCQ): string => mcq.correctAnswer || mcq.options[mcq.answer.charCodeAt(0) - 65];

const MixedSessionPage: React.FC = () => {
    const { mode = 'daily_grind', sessionId } = useParams<{ mode?: QuizSession['mode']; sessionId?: string; }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { appData } = useData();
    const queryClient = useQueryClient();
    const { addToast } = useToast();

    const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<QuizSession['answers']>({});
    const [isFlipped, setIsFlipped] = useState(false);
    const [sessionAttempts, setSessionAttempts] = useState<QuizResult['results']>([]);

    const { data: session, isLoading: isLoadingSession } = useQuery({ 
        queryKey: ['session', sessionId], 
        queryFn: () => SessionManager.getSession(sessionId!), 
        enabled: !!sessionId && !!user 
    });
    
    const addAttemptMutation = useMutation({ mutationFn: addAttempt, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attemptedMCQDocs'] }) });
    const addFlashcardAttemptMutation = useMutation({ mutationFn: addFlashcardAttempt });
    
    useEffect(() => {
        if (session && appData) {
            const mcqs = getMCQsByIds(appData, session.mcqIds);
            const flashcards = getFlashcardsByIds(appData, session.flashcardIds || []);
            const itemsMap = new Map<string, SessionItem>();
            mcqs.forEach(m => itemsMap.set(m.id, { ...m, sessionType: 'mcq' }));
            flashcards.forEach(f => itemsMap.set(f.id, { ...f, sessionType: 'flashcard' }));
            const orderedItems = (session.itemOrder || [...session.mcqIds, ...session.flashcardIds || []]).map(id => itemsMap.get(id)).filter((item): item is SessionItem => !!item);
            setSessionItems(orderedItems);
            setCurrentIndex(session.currentIndex || 0);
            setAnswers(session.answers || {});
        }
    }, [session, appData]);

    const currentItem = useMemo(() => sessionItems[currentIndex], [sessionItems, currentIndex]);
    
    const goToNext = useCallback(async () => {
        if (!sessionId) return;
        if (currentIndex < sessionItems.length - 1) {
            setIsFlipped(false);
            setCurrentIndex(i => i + 1);
            await SessionManager.updateSession(sessionId, { currentIndex: currentIndex + 1 });
        } else {
            await SessionManager.finishSession(sessionId, answers);
            addToast("Daily Grind Complete!", "success");
            const mcqAttempts = sessionAttempts.filter(a => a.selectedAnswer !== null);
            if (mcqAttempts.length > 0) {
                const score = mcqAttempts.filter(a => a.isCorrect).length;
                await addQuizResult({ mode: 'daily_grind', totalQuestions: mcqAttempts.length, score, results: mcqAttempts, sessionId });
            }
            navigate('/');
        }
    }, [currentIndex, sessionItems.length, navigate, addToast, sessionId, sessionAttempts, answers]);

    const handleAnswer = useCallback(async (answer: string | ConfidenceRating) => {
        if (!currentItem || !session || answers[currentIndex]) return;
        
        const newAnswers = {...answers, [currentIndex]: currentItem.sessionType === 'mcq' ? {selectedAnswer: answer as string} : {rating: answer as ConfidenceRating}};
        setAnswers(newAnswers);
        
        if (currentItem.sessionType === 'mcq') {
            const mcq = currentItem as MCQ;
            const isCorrect = answer === getCorrectAnswerText(mcq);
            setSessionAttempts(prev => [...prev, { mcqId: mcq.id, isCorrect, selectedAnswer: answer as string, correctAnswer: getCorrectAnswerText(mcq)}]);
            addAttemptMutation.mutate({ mcqId: mcq.id, isCorrect, selectedAnswer: answer as string, sessionId: session.id });
        } else {
            setSessionAttempts(prev => [...prev, { mcqId: currentItem.id, isCorrect: true, selectedAnswer: null, correctAnswer: '' }]); 
            addFlashcardAttemptMutation.mutate({ flashcardId: currentItem.id, rating: answer as ConfidenceRating, sessionId: session.id });
        }

        await SessionManager.updateSession(session.id, { answers: newAnswers });
        
        setTimeout(goToNext, currentItem.sessionType === 'mcq' ? 1200 : 200);
    }, [currentItem, session, answers, currentIndex, addAttemptMutation, addFlashcardAttemptMutation, goToNext]);


    if (isLoadingSession || !currentItem) return <Loader fullScreen message="Loading Daily Grind..." />;
    
    return (
        <div className="max-w-xl mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">{mode.replace(/_/g, ' ')} - {currentIndex + 1}/{sessionItems.length}</h2>
            
            {currentItem.sessionType === 'mcq' && (
                <div className="card-base p-6">
                    <p className="font-semibold mb-4 text-lg">{(currentItem as MCQ).question}</p>
                    <div className="space-y-3">
                        {(currentItem as MCQ).options.map((opt: string) => {
                            const correctAnswer = getCorrectAnswerText(currentItem as MCQ);
                            const isSelected = answers[currentIndex]?.selectedAnswer === opt;
                            const isCorrect = correctAnswer === opt;
                            const isAnswered = !!answers[currentIndex];
                            
                            return (
                                <button key={opt} onClick={() => handleAnswer(opt)} disabled={isAnswered}
                                    className={clsx("w-full text-left p-3 rounded-lg border", {
                                        'border-green-400 bg-green-100 dark:bg-green-900/30': isAnswered && isCorrect,
                                        'border-red-400 bg-red-100 dark:bg-red-900/30': isAnswered && isSelected && !isCorrect,
                                        'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700': !isAnswered || (isAnswered && !isSelected),
                                        'hover:bg-slate-100 dark:hover:bg-slate-600': !isAnswered
                                    })}>
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {currentItem.sessionType === 'flashcard' && (
                 <div className="relative h-80 w-full cursor-pointer [perspective:1000px]" onClick={() => !answers[currentIndex] && setIsFlipped(f => !f)}>
                    <div className={clsx("absolute h-full w-full rounded-xl shadow-lg transition-transform duration-500 [transform-style:preserve-3d]", (isFlipped || !!answers[currentIndex]) && "[transform:rotateY(180deg)]")}>
                        <div className="absolute h-full w-full bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center p-6 [backface-visibility:hidden]"><p className="text-xl">{(currentItem as Flashcard).front}</p></div>
                        <div className="absolute h-full w-full bg-sky-100 dark:bg-sky-900 rounded-xl flex items-center justify-center p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]"><p className="text-xl">{(currentItem as Flashcard).back}</p></div>
                    </div>
                </div>
            )}
            {(isFlipped || !!answers[currentIndex]) && currentItem.sessionType === 'flashcard' && !answers[currentIndex] && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                    <button onClick={() => handleAnswer('again')} className="btn-danger py-3">Again</button>
                    <button onClick={() => handleAnswer('hard')} className="btn-warning py-3">Hard</button>
                    <button onClick={() => handleAnswer('good')} className="btn-secondary py-3">Good</button>
                    <button onClick={() => handleAnswer('easy')} className="btn-success py-3">Easy</button>
                </div>
            )}
        </div>
    );
};

export default MixedSessionPage;