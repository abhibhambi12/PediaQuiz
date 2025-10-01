import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp, FieldPath } from "firebase-admin/firestore";
import { db } from "./firebaseAdmin";
import { ensureAuthenticated } from "./utils/auth";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS, XP_PER_CORRECT_MCQ, XP_PER_CORRECT_FLASHCARD, LEVEL_UP_THRESHOLD } from "./config";
import type { QuizSession, MCQ, ClientQuizResult, AttemptedMCQDocument, CreateCustomTestCallableData, CreateCustomTestCallableResponse, Goal, Notification, Attempt } from "@pediaquiz/types";

export const createSession = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { mode, mcqIds, flashcardIds } = request.data as { mode: QuizSession['mode'], mcqIds: string[], flashcardIds?: string[] };
    
    const sessionId = await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);
        const activeSessionId = userDoc.data()?.activeSessionId;

        if (activeSessionId) {
            const oldSessionRef = db.collection("quizSessions").doc(activeSessionId);
            transaction.update(oldSessionRef, { isFinished: true, completedAt: FieldValue.serverTimestamp() });
        }

        const newSessionRef = db.collection("quizSessions").doc();
        const newSession: QuizSession = {
            id: newSessionRef.id, userId, mode, mcqIds: mcqIds || [], flashcardIds: flashcardIds || [],
            itemOrder: [...(mcqIds || []), ...(flashcardIds || [])].sort(() => 0.5 - Math.random()),
            currentIndex: 0, answers: {}, isFinished: false,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000), // 24 hour expiry
        };
        transaction.set(newSessionRef, newSession);
        transaction.update(userRef, { activeSessionId: newSessionRef.id });
        return newSessionRef.id;
    });

    return { sessionId };
});

export const getSession = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { sessionId } = request.data as { sessionId: string };
    const sessionDoc = await db.collection("quizSessions").doc(sessionId).get();
    if (!sessionDoc.exists || sessionDoc.data()?.userId !== userId) {
        throw new HttpsError("not-found", "Session not found or you do not have permission to access it.");
    }
    return convertDocTimestamps(sessionDoc.data());
});

export const updateSession = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { sessionId, updates } = request.data as { sessionId: string, updates: Partial<QuizSession> };
    const sessionRef = db.collection("quizSessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists || sessionDoc.data()?.userId !== userId) {
        throw new HttpsError("not-found", "Session not found or permission denied.");
    }
    await sessionRef.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
});

export const finishSession = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { sessionId, answers } = request.data as { sessionId: string, answers: QuizSession['answers'] };
    
    const resultId = await db.runTransaction(async (transaction) => {
        const sessionRef = db.collection("quizSessions").doc(sessionId);
        const userRef = db.collection("users").doc(userId);
        const sessionDoc = await transaction.get(sessionRef);

        if (!sessionDoc.exists || sessionDoc.data()?.userId !== userId) throw new HttpsError("not-found", "Session not found.");
        
        const session = sessionDoc.data() as QuizSession;
        if (session.isFinished) {
            const existingResult = await db.collection('quizResults').where('sessionId', '==', sessionId).limit(1).get();
            if (!existingResult.empty) {
                return existingResult.docs[0].id;
            }
        }
        
        const mcqIdsInSession = session.itemOrder?.filter(id => session.mcqIds.includes(id)) || [];

        let score = 0;
        let xpEarned = 0;
        const results: ClientQuizResult['results'] = [];

        if (mcqIdsInSession.length > 0) {
            const mcqDocs = await db.collection('MasterMCQ').where(FieldPath.documentId(), 'in', mcqIdsInSession).get();
            const mcqsById = new Map(mcqDocs.docs.map(d => [d.id, d.data() as MCQ]));

            session.itemOrder?.forEach((itemId, index) => {
                const answer = answers[index];
                if (session.mcqIds.includes(itemId)) { // It's an MCQ
                    const mcq = mcqsById.get(itemId);
                    const selectedAnswer = answer?.selectedAnswer;
                    const correctAnswer = mcq ? (mcq.correctAnswer || mcq.options[mcq.answer.charCodeAt(0) - 65]) : '';
                    const isCorrect = mcq && selectedAnswer ? correctAnswer === selectedAnswer : false;
                    if (isCorrect) {
                        score++;
                        xpEarned += XP_PER_CORRECT_MCQ;
                    }
                    results.push({ mcqId: itemId, isCorrect, selectedAnswer: selectedAnswer || null, correctAnswer });
                }
            });
        }
        
        const resultRef = db.collection("quizResults").doc();
        const newResult: Omit<ClientQuizResult, 'id' | 'quizDate'> = {
            userId, sessionId, mode: session.mode,
            totalQuestions: mcqIdsInSession.length, score, results, xpEarned
        };
        transaction.set(resultRef, { ...newResult, id: resultRef.id, quizDate: FieldValue.serverTimestamp() });
        transaction.update(sessionRef, { isFinished: true, completedAt: FieldValue.serverTimestamp() });
        transaction.update(userRef, { activeSessionId: FieldValue.delete() });
        return resultRef.id;
    });
    
    return { success: true, resultId };
});

export const addAttempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { mcqId, isCorrect, selectedAnswer, sessionId, confidenceRating } = request.data as { mcqId: string, isCorrect: boolean, selectedAnswer: string | null, sessionId?: string, confidenceRating?: 'again' | 'hard' | 'good' | 'easy' };
    
    const userRef = db.collection('users').doc(userId);
    const attemptRef = userRef.collection('attemptedMCQs').doc(mcqId);
    let xpEarned = 0;
    
    const mcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    if (!mcqDoc.exists) throw new HttpsError('not-found', 'MCQ not found');
    const mcqData = mcqDoc.data() as MCQ;

    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        if(!userData) throw new HttpsError('not-found', 'User not found');
        
        const attemptDoc = await transaction.get(attemptRef);

        if (isCorrect) xpEarned = XP_PER_CORRECT_MCQ;

        let interval = 0, easeFactor = 2.5, repetitions = 0;
        if (attemptDoc.exists) {
            const data = attemptDoc.data()?.latestAttempt;
            interval = data?.interval || 0;
            easeFactor = data?.easeFactor || 2.5;
            repetitions = data?.repetitions || 0;
        }

        if (isCorrect) {
            repetitions++;
            if (repetitions === 1) interval = 1;
            else if (repetitions === 2) interval = 6;
            else interval = Math.round(interval * easeFactor);
            const quality = confidenceRating === 'easy' ? 5 : confidenceRating === 'good' ? 4 : 3;
            easeFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        } else {
            repetitions = 0;
            interval = 1;
            easeFactor -= 0.2;
        }
        easeFactor = Math.max(1.3, easeFactor);
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + interval);
        
        const newAttempt: Attempt = {
            mcqId, isCorrect, selectedAnswer, sessionId: sessionId || '', confidenceRating,
            timestamp: FieldValue.serverTimestamp(), userId, interval, easeFactor, repetitions,
            nextReviewDate: Timestamp.fromDate(nextReviewDate), lastAttempted: FieldValue.serverTimestamp(),
            topicId: mcqData.topicId, chapterId: mcqData.chapterId
        };
        
        transaction.set(attemptRef, { latestAttempt: newAttempt }, { merge: true });
        
        let currentXp = userData.xp || 0;
        let currentLevel = userData.level || 1;
        currentXp += xpEarned;

        while (currentXp >= currentLevel * LEVEL_UP_THRESHOLD) {
            currentXp -= currentLevel * LEVEL_UP_THRESHOLD;
            currentLevel++;
        }

        const today = new Date();
        today.setHours(0,0,0,0);
        const lastStudied = userData.lastStudiedDate?.toDate();
        if (!lastStudied || lastStudied.setHours(0,0,0,0) < today.getTime()) {
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            const newStreak = lastStudied && lastStudied.getTime() === yesterday.getTime() ? (userData.currentStreak || 0) + 1 : 1;
            transaction.update(userRef, { 
                xp: currentXp,
                level: currentLevel,
                currentStreak: newStreak,
                lastStudiedDate: FieldValue.serverTimestamp()
            });
        } else {
             transaction.update(userRef, { xp: currentXp, level: currentLevel });
        }
    });
    
    return { success: true, xpEarned };
});

export const addFlashcardAttempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { flashcardId, rating } = request.data as { flashcardId: string, rating: 'again' | 'hard' | 'good' | 'easy' };
    
    const userRef = db.collection('users').doc(userId);
    const attemptRef = userRef.collection('attemptedFlashcards').doc(flashcardId);
    const xpEarned = XP_PER_CORRECT_FLASHCARD;

    await db.runTransaction(async (transaction) => {
        transaction.set(attemptRef, { lastAttempt: { rating, timestamp: FieldValue.serverTimestamp() } }, { merge: true });
        transaction.update(userRef, { xp: FieldValue.increment(xpEarned) });
    });

    return { success: true, xpEarned };
});

export const toggleBookmark = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { contentId, contentType } = request.data as { contentId: string, contentType: 'mcq' | 'flashcard' };
    const userRef = db.collection('users').doc(userId);
    const fieldToUpdate = contentType === 'mcq' ? 'bookmarkedMcqs' : 'bookmarkedFlashcards';
    const userDoc = await userRef.get();
    const bookmarks = userDoc.data()?.[fieldToUpdate] || [];
    const isBookmarked = bookmarks.includes(contentId);
    await userRef.update({ [fieldToUpdate]: isBookmarked ? FieldValue.arrayRemove(contentId) : FieldValue.arrayUnion(contentId) });
    return { bookmarked: !isBookmarked };
});

export const createCustomTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<CreateCustomTestCallableData>): Promise<CreateCustomTestCallableResponse> => {
    ensureAuthenticated(request);
    const { questions: chapterIds, questionCount } = request.data;
    const MAX_QUESTIONS = 250;
    if (questionCount && questionCount > MAX_QUESTIONS) throw new HttpsError('invalid-argument', `The max number of questions is ${MAX_QUESTIONS}.`);
    
    let potentialMcqIds: string[] = [];
    if (chapterIds.length > 0) {
        const chunkSize = 30;
        for (let i = 0; i < chapterIds.length; i += chunkSize) {
            const chunk = chapterIds.slice(i, i + chunkSize);
            const mcqSnap = await db.collection('MasterMCQ').where('chapterId', 'in', chunk).where('status', '==', 'approved').select().get();
            mcqSnap.forEach(doc => potentialMcqIds.push(doc.id));
        }
    }
    const finalMcqIds = potentialMcqIds.sort(() => 0.5 - Math.random()).slice(0, questionCount);
    if (finalMcqIds.length === 0) throw new HttpsError('not-found', 'No approved questions found for the selected chapters.');
    
    const response = await createSession.run({ auth: request.auth, data: { mode: 'custom', mcqIds: finalMcqIds, flashcardIds: [] }, rawRequest: request.rawRequest });
    return { success: true, sessionId: response.sessionId };
});

export const getAttemptedMCQs = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const snap = await db.collection('users').doc(userId).collection('attemptedMCQs').get();
    const attempts: Record<string, AttemptedMCQDocument> = {};
    snap.forEach(doc => { attempts[doc.id] = doc.data() as AttemptedMCQDocument; });
    return convertDocTimestamps(attempts);
});

export const getQuizResults = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { limit = 10, startAfter } = request.data as { limit?: number, startAfter?: string };
    let query = db.collection('quizResults').where('userId', '==', userId).orderBy('quizDate', 'desc').limit(limit);
    if (startAfter) {
        const lastDoc = await db.collection('quizResults').doc(startAfter).get();
        if (lastDoc.exists) query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    const results = snap.docs.map(doc => convertDocTimestamps({ id: doc.id, ...doc.data() }));
    const lastVisible = snap.docs[snap.docs.length - 1]?.id || null;
    return { results, lastVisible };
});

export const getQuizResultWithDetails = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { resultId } = request.data as { resultId: string };
    const resultDoc = await db.collection('quizResults').doc(resultId).get();
    if (!resultDoc.exists || resultDoc.data()?.userId !== userId) throw new HttpsError("not-found", "Result not found.");
    
    const quizResult = { id: resultDoc.id, ...resultDoc.data() } as ClientQuizResult;
    const mcqIds = quizResult.results.map(r => r.mcqId);
    let mcqs: MCQ[] = [];
    if (mcqIds.length > 0) {
        const mcqDocs = await db.collection('MasterMCQ').where(FieldPath.documentId(), 'in', mcqIds).get();
        mcqs = mcqDocs.docs.map(d => ({ id: d.id, ...d.data() } as MCQ));
    }
    return { quizResult: convertDocTimestamps(quizResult), mcqs: convertDocTimestamps(mcqs) };
});

export const submitOfflineQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const quizData = request.data as Omit<ClientQuizResult, 'id' | 'userId' | 'quizDate'>;
    const resultRef = db.collection('quizResults').doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, quizDate: FieldValue.serverTimestamp() });
    logger.info(`Submitted offline quiz result for user ${userId}. New result ID: ${resultRef.id}`);
    return { success: true, id: resultRef.id };
});

export const getGoals = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const snap = await db.collection('users').doc(userId).collection('goals').get();
    return snap.docs.map(doc => convertDocTimestamps(doc.data()));
});

export const setGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const goalData = request.data as Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'progress'>;
    const goalRef = db.collection('users').doc(userId).collection('goals').doc();
    const newGoal: Goal = {
        ...goalData,
        id: goalRef.id,
        userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        progress: 0,
        currentValue: 0,
    };
    await goalRef.set(newGoal);
    return { success: true, goalId: goalRef.id };
});

export const updateGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { id, ...updates } = request.data as Partial<Goal> & { id: string };
    const goalRef = db.collection('users').doc(userId).collection('goals').doc(id);
    await goalRef.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
    return { success: true };
});

export const deleteGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { goalId } = request.data as { goalId: string };
    await db.collection('users').doc(userId).collection('goals').doc(goalId).delete();
    return { success: true };
});

export const getUserStats = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const attemptsSnap = await db.collection('users').doc(userId).collection('attemptedMCQs').get();
    
    let total = 0;
    let correct = 0;
    const topicPerformance: Record<string, { total: number, correct: number, topic: string }> = {};

    for (const doc of attemptsSnap.docs) {
        const attempt = doc.data().latestAttempt;
        const mcqDoc = await db.collection('MasterMCQ').doc(doc.id).get();
        if (mcqDoc.exists) {
            const topic = mcqDoc.data()?.topicName || 'Unknown';
            if (!topicPerformance[topic]) topicPerformance[topic] = { total: 0, correct: 0, topic };
            topicPerformance[topic].total++;
            total++;
            if (attempt.isCorrect) {
                topicPerformance[topic].correct++;
                correct++;
            }
        }
    }

    return {
        overallStats: {
            attempted: total,
            correct: correct,
            accuracy: total > 0 ? (correct / total) * 100 : 0
        },
        topicPerformance: Object.values(topicPerformance).map(t => ({...t, accuracy: t.total > 0 ? (t.correct / t.total) * 100 : 0})).sort((a,b) => b.accuracy - a.accuracy)
    };
});

export const getNotifications = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const snap = await db.collection('users').doc(userId).collection('notifications').orderBy('timestamp', 'desc').limit(20).get();
    return { notifications: snap.docs.map(doc => convertDocTimestamps({ id: doc.id, ...doc.data() })) as Notification[] };
});

export const markNotificationAsRead = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { notificationId } = request.data as { notificationId: string };
    const notificationRef = db.collection('users').doc(userId).collection('notifications').doc(notificationId);
    await notificationRef.update({ read: true });
    return { success: true };
});